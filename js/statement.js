// Разбор банковской выписки: строки таблицы превращаются в группы по получателю.
// Чистая логика без DOM, чтобы её можно было проверять отдельно.

const clean = (s) => String(s ?? '').replace(/ /g, ' ').trim();
const parseAmount = (s) => Number(clean(s).replace(/\s/g, '').replace(',', '.'));
const toIso = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(clean(s));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Фрагменты, по которым узнаём колонки, не завися от их порядка.
const HEAD = { date: 'дата операции', code: 'код', desc: 'описание', sum: 'сумма' };

// Коды видов торговых точек (MCC) -> подсказка для области.
const MCC_HINT = { 5541: 'car', 5542: 'car', 5531: 'car', 5532: 'car', 7523: 'car', 7538: 'car', 5814: 'home', 5812: 'home', 5411: 'home', 5499: 'home', 5912: 'health', 7997: 'health', 7941: 'health' };

export function parseStatement(rows) {
  const hi = rows.findIndex((r) => r && r.some((c) => clean(c).toLowerCase() === HEAD.date));
  if (hi < 0) throw new Error('Не нашёл строку с заголовками. Нужна выписка со столбцом «Дата операции».');
  const col = {};
  rows[hi].forEach((c, i) => {
    const t = clean(c).toLowerCase();
    if (t === HEAD.date) col.date = i;
    else if (t === HEAD.code) col.code = i;
    else if (t === HEAD.desc) col.desc = i;
    else if (t.startsWith(HEAD.sum)) col.sum = i;
  });
  if (col.date == null || col.desc == null || col.sum == null) throw new Error('В выписке нет столбцов даты, описания или суммы.');

  const ops = [];
  const seen = new Map();
  let bad = 0;
  for (const r of rows.slice(hi + 1)) {
    if (!r) continue;
    const date = toIso(r[col.date]);
    if (!date) continue;
    const amount = parseAmount(r[col.sum]);
    if (!Number.isFinite(amount) || amount === 0) {
      bad++;
      continue;
    }
    const desc = clean(r[col.desc]);
    const code = col.code != null ? clean(r[col.code]) : '';
    let ext = code ? `${code}|${date}|${amount}` : `${date}|${amount}|${desc.replace(/\s/g, '').slice(0, 24)}`;
    const n = (seen.get(ext) || 0) + 1;
    seen.set(ext, n);
    if (n > 1) ext += `#${n}`;
    ops.push({ date, amount, desc, ext, ...classify(desc, amount) });
  }
  return { ops, bad };
}

// Определяет вид операции и ключ группы (кому/где).
export function classify(desc, amount = 0) {
  const d = desc.replace(/\s+/g, ' ');
  const low = d.toLowerCase();
  if (low.startsWith('внутрибанковский перевод между счетами')) return { type: 'internal', key: 'Перевод между своими счетами', label: 'Перевод между своими счетами', def: 'skip' };
  if (low.startsWith('пополнение брокерского') || low.includes('инвесткопилк')) return { type: 'broker', key: 'Брокерский счёт и инвесткопилка', label: 'Брокерский счёт и инвесткопилка', def: 'skip' };
  if (low.includes('cashback')) return { type: 'cashback', key: 'Кэшбэк', label: 'Кэшбэк', def: 'skip' };
  if (low.startsWith('набор привилегий')) return { type: 'fee', key: 'Подписка банка (набор привилегий)', label: 'Подписка банка (набор привилегий)', def: 'count' };
  if (low.startsWith('возврат средств по дог')) return { type: 'refund', key: 'Возврат средств по договору', label: 'Возврат средств по договору', def: 'skip' };
  if (low.includes('/atm ') || low.includes('/atm')) return { type: 'atm', key: 'Банкомат', label: 'Банкомат (снятие и взнос)', def: 'skip' };

  if (low.startsWith('операция по карте')) {
    const place = /место совершения операции:\s*([^,]+(?:,[^,]*?)?)\s*,\s*MCC:\s*(\d+)/i.exec(d);
    let name = 'Покупка по карте';
    let mcc = '';
    if (place) {
      const parts = place[1].split('/');
      name = parts[parts.length - 1].trim() || name;
      mcc = place[2];
    }
    return { type: 'card', key: `Карта: ${name}`.slice(0, 100), label: name, mcc, hint: MCC_HINT[mcc] || '', def: 'count' };
  }

  const qr = /платеж\s+\S+\s+в\s+(.+?)\s+через/i.exec(d);
  if (low.includes('исходящий платеж qr') && qr) return { type: 'qr', key: `Оплата QR: ${qr[1]}`.slice(0, 100), label: qr[1], def: 'count' };

  if (low.includes('возвраты к физику')) return { type: 'sbp-refund', key: 'Возврат по СБП', label: 'Возврат по СБП', def: 'count' };
  if (low.includes('перевод по номеру телефона в сбербанк')) {
    const who = /от отправителя\s+(.+?)\.\s/i.exec(d);
    const name = who ? who[1] : 'Сбербанк';
    return { type: 'transfer', key: `Перевод из Сбербанка от ${name}`.slice(0, 100), label: `Из Сбербанка от ${name}`, def: 'skip' };
  }
  if (low.includes('перевод другому клиенту альфа')) {
    const who = /(?:клиенту|от клиента)\s+(.+?)(?:\s+по номеру|\.\s|\.$)/i.exec(d);
    const name = who ? who[1].trim() : 'клиент Альфа-Банка';
    return { type: 'transfer', key: `Перевод: ${name}`.slice(0, 100), label: `Перевод: ${name}`, def: 'skip' };
  }
  if (low.includes('перевод по сбп')) {
    const to = /на\s+(\+[\d\s()\-]+)/i.exec(d);
    const digits = to ? to[1].replace(/\D/g, '') : '';
    if (!digits) {
      const w = amount < 0 ? 'Исходящие переводы по СБП (разные)' : 'Входящие переводы по СБП (от разных людей)';
      return { type: 'transfer', key: w, label: w, def: 'skip' };
    }
    const name = `по СБП на номер ...${digits.slice(-4)}`;
    return { type: 'transfer', key: `Перевод ${name}`, label: `Перевод ${name}`, def: 'skip' };
  }
  const short = d.replace(/\d{5,}/g, '#').slice(0, 60);
  return { type: 'other', key: `Прочее: ${short}`, label: short, def: 'skip' };
}

// Группы по ключу, с суммами и применением сохранённых правил.
export function group(ops, rules, defaultArea) {
  const map = new Map();
  for (const o of ops) {
    let g = map.get(o.key);
    if (!g) {
      const r = rules[o.key];
      g = { key: o.key, label: o.label, type: o.type, ops: [], out: 0, inc: 0, count: !r ? o.def === 'count' : !r.skip, area: (r && r.area) || o.hint || defaultArea, known: !!r };
      map.set(o.key, g);
    }
    g.ops.push(o);
    if (o.amount < 0) g.out += -o.amount;
    else g.inc += o.amount;
  }
  return [...map.values()].sort((a, b) => b.out + b.inc - (a.out + a.inc));
}

// Что получится в приложении при текущих настройках групп.
export function build(groups) {
  const recs = [];
  const newRules = {};
  for (const g of groups) {
    newRules[g.key] = { skip: !g.count, area: g.area };
    if (!g.count) continue;
    for (const o of g.ops) recs.push({ date: o.date, kind: o.amount < 0 ? 'expense' : 'income', amount: Math.abs(o.amount), note: g.label, area: g.area, ext: o.ext });
  }
  return { recs, newRules };
}
