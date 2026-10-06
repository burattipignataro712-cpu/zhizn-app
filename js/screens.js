// Разделы из меню «Ещё»: платежи, цели, проекты и заказы, машина, разбор недели, расписание, шаблоны, импорт.
import * as S from './store.js';
import * as F from './forms.js';
import * as X from './forms-extra.js';
import { taskRow, dot } from './rows.js';
import { card, empty, kpi, seg, progress, navBtn } from './views.js';
import { readSheet } from './xlsx.js';
import { parseStatement, group, build } from './statement.js';
import { h, today, addDays, mondayOf, fmtDay, money, hrs, pct, daysBetween, parseNum } from './util.js';

const rerender = () => S.touch();
const nfmt = new Intl.NumberFormat('ru-RU');
const km = (n) => `${nfmt.format(Math.round(n))} км`;
const fmtLong = (d) => (d.slice(0, 4) === today().slice(0, 4) ? fmtDay(d) : `${fmtDay(d)} ${d.slice(0, 4)}`);

function subHead(title, ...right) {
  return h('header', { class: 'page-head' }, h('div', { class: 'head-main' }, h('a', { class: 'back', href: '#more', 'aria-label': 'Назад' }, '‹ Ещё'), h('h1', {}, title)), h('div', { class: 'head-actions' }, ...right));
}
const addBtn = (label, onClick) => h('button', { class: 'btn small primary', type: 'button', onClick }, label);

// ---- ПЛАТЕЖИ ----
export function subsView() {
  const t = today();
  const subs = S.get().subs;
  const view = h('div', { class: 'view' }, subHead('Платежи', addBtn('+ платёж', () => X.subForm(null))));
  const act = subs.filter((x) => x.active);
  const perMonth = act.reduce((a, x) => a + (x.every === 'month' ? x.amount : x.amount / 12), 0);
  view.append(h('div', { class: 'kpis' }, kpi('В месяц', money(perMonth)), kpi('В год', money(act.reduce((a, x) => a + S.yearCost(x), 0))), kpi('Активных', String(act.length))));
  const due = S.dueSubs(t);
  if (due.length) {
    view.append(
      card('Пора оплатить', due.map(({ sub, due: d }) => h('div', { class: 'row' }, h('span', { class: 'row-time' }, d < t ? fmtDay(d) : 'сегодня'), h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, sub.name), h('span', { class: 'row-sub' }, money(sub.amount))), h('button', { class: 'btn small primary', type: 'button', onClick: () => S.paySub(sub, d, t) }, 'Оплатил')))),
    );
  }
  if (!subs.length) {
    view.append(card(null, empty('Добавь регулярные платежи: VPN, связь, облако, страховку. Приложение напомнит в день платежа и посчитает, сколько они стоят в год.')));
    return view;
  }
  const list = subs
    .map((x) => ({ x, next: x.active ? S.nextDue(x, t) : null }))
    .sort((a, b) => (a.next || '9').localeCompare(b.next || '9'));
  view.append(
    card(
      'Все платежи',
      list.map(({ x, next }) =>
        h('div', { class: 'row' + (x.active ? '' : ' done') }, h('button', { class: 'row-main', type: 'button', onClick: () => X.subForm(x) }, h('span', { class: 'row-title' }, x.name), h('span', { class: 'row-sub' }, dot(S.area(x.area).color), x.every === 'month' ? `каждое ${x.day}-е число` : `раз в год, ${x.day}.${String(x.month).padStart(2, '0')}`, next ? ` · следующий ${fmtDay(next)}` : x.active ? '' : ' · не действует')), h('span', { class: 'row-value' }, money(x.amount))),
      ),
    ),
  );
  return view;
}

// ---- ЦЕЛИ ----
export function goalsView() {
  const goals = S.get().goals;
  const view = h('div', { class: 'view' }, subHead('Цели', addBtn('+ цель', () => X.goalForm(null))));
  if (!goals.length) {
    view.append(card(null, empty('Цель это число, к которому ты идёшь: 40 часов на курсовую, 30 000 ₽ дохода за месяц, 15 000 ₽ на ТО. Прогресс считается по твоим записям.')));
    return view;
  }
  const items = goals.map((g) => ({ g, p: S.goalProgress(g) })).sort((a, b) => a.p.done - b.p.done || (a.g.deadline || '9').localeCompare(b.g.deadline || '9'));
  for (const { g, p } of items) {
    const unit = g.type === 'hours' ? 'ч' : '₽';
    const fmt = (v) => (g.type === 'hours' ? hrs(v) : money(v));
    let pace = '';
    if (p.done) pace = 'Цель достигнута';
    else if (p.late) pace = `Срок прошёл ${fmtDay(g.deadline)}, осталось ${fmt(p.left)}`;
    else if (p.perDay != null) pace = `Осталось ${fmt(p.left)}, это ${g.type === 'hours' ? hrs(p.perDay) : money(p.perDay)} в день до ${fmtDay(g.deadline)}`;
    else pace = `Осталось ${fmt(p.left)}`;
    view.append(
      h(
        'section',
        { class: 'card' },
        h('button', { class: 'goal-head', type: 'button', onClick: () => X.goalForm(g) }, h('span', { class: 'goal-t' }, g.title), h('span', { class: 'goal-p' }, `${p.pct}%`)),
        progress(p.pct, p.done ? 'var(--ok)' : null, p.late),
        h('p', { class: 'muted' }, `${fmt(p.cur)} из ${fmt(g.target)} ${unit === 'ч' ? '' : ''}`.trim()),
        h('p', { class: p.late ? 'warn' : 'muted' }, pace),
        g.type === 'saved' ? h('button', { class: 'btn ghost', type: 'button', onClick: () => X.contribForm(g) }, '+ взнос') : null,
      ),
    );
  }
  return view;
}

// ---- ПРОЕКТЫ И ЗАКАЗЫ ----
function openProject(id) {
  const p = S.project(id);
  if (!p) return;
  const redo = () => openProject(id);
  const st = S.projectStats(id);
  const tasks = S.tasksOfProject(id).filter((t) => !t.repeat);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  F.openSheet(
    p.name,
    h('div', { class: 'kpis four' }, kpi('Время', hrs(st.hours)), kpi('Расходы', money(st.expense)), kpi('Доходы', money(st.income)), kpi('Задачи', `${st.done}/${st.total}`)),
    st.total ? progress(pct(st.done, st.total)) : null,
    p.deadline ? h('p', { class: p.deadline < today() && !p.done ? 'warn' : 'muted' }, `Срок: ${fmtDay(p.deadline)}`) : null,
    h('div', { class: 'quick two' }, h('button', { class: 'quick-btn', type: 'button', onClick: () => F.itemForm('task', null, { project: p.id, area: p.area, onDone: redo }) }, '+ этап'), h('button', { class: 'quick-btn', type: 'button', onClick: () => F.projectForm(p, p.area) }, 'Изменить')),
    open.length ? h('div', { class: 'group' }, h('h4', {}, 'Этапы в работе'), open.map((t) => taskRow(t, { showDate: true, onDone: redo }))) : null,
    done.length ? h('div', { class: 'group' }, h('h4', {}, 'Готово'), done.map((t) => taskRow(t, { showDate: true, onDone: redo }))) : null,
    !tasks.length ? empty('Разбей проект на этапы: каждый этап это задача со сроком. Тогда будет виден процент готовности.') : null,
  );
}

export function projectsView() {
  const st = S.get();
  const view = h('div', { class: 'view' }, subHead('Проекты и заказы'));
  const orders = st.projects.filter((p) => p.order);
  if (orders.length) {
    const rows = orders
      .map((p) => ({ p, s: S.projectStats(p.id) }))
      .sort((a, b) => a.p.done - b.p.done || (b.s.hours ? b.s.income / b.s.hours : 0) - (a.s.hours ? a.s.income / a.s.hours : 0));
    const totI = rows.reduce((a, r) => a + r.s.income, 0);
    const totH = rows.reduce((a, r) => a + r.s.hours, 0);
    view.append(
      card(
        'Заказы: сколько приносит час',
        h('div', { class: 'kpis' }, kpi('Получено', money(totI)), kpi('Часов', hrs(totH)), kpi('В среднем за час', totH ? money(totI / totH) : '-')),
        rows.map(({ p, s }) => {
          const rate = s.hours > 0 ? s.income / s.hours : null;
          const owed = p.price > s.income ? p.price - s.income : 0;
          return h('div', { class: 'row' + (p.done ? ' done' : '') }, h('button', { class: 'row-main', type: 'button', onClick: () => openProject(p.id) }, h('span', { class: 'row-title' }, p.name), h('span', { class: 'row-sub' }, `${hrs(s.hours)} · получено ${money(s.income)}${p.price ? ` из ${money(p.price)}` : ''}${owed && !p.done ? ` · ждёшь ${money(owed)}` : ''}`)), h('span', { class: 'row-value' }, rate != null ? `${money(rate)}/ч` : '-'));
        }),
      ),
    );
  }
  let any = false;
  for (const a of st.areas) {
    const list = S.projectsOf(a.id);
    if (!list.length) continue;
    any = true;
    view.append(
      card(
        a.name,
        list.map((p) => {
          const s = S.projectStats(p.id);
          return h('div', { class: 'proj' + (p.done ? ' done' : '') }, h('button', { class: 'proj-main', type: 'button', onClick: () => openProject(p.id) }, h('span', { class: 'row-title' }, dot(a.color), p.name, p.order ? h('span', { class: 'badge' }, 'заказ') : null), h('span', { class: 'row-sub' }, `${hrs(s.hours)} · ${money(s.expense)} расходов${p.deadline ? ` · срок ${fmtDay(p.deadline)}` : ''}${s.total ? ` · этапов ${s.done}/${s.total}` : ''}`)), s.total ? progress(pct(s.done, s.total), a.color) : null);
        }),
      ),
    );
  }
  if (!any) view.append(card(null, empty('Проектов пока нет. Они создаются в разделе «Ещё», блок «Области и проекты».')));
  return view;
}

// ---- МАШИНА ----
const TYPICAL = [
  { name: 'Масло двигателя и масляный фильтр', everyKm: 8000, everyMonths: 12 },
  { name: 'Воздушный фильтр', everyKm: 15000, everyMonths: 0 },
  { name: 'Салонный фильтр', everyKm: 0, everyMonths: 12 },
  { name: 'Тормозная жидкость', everyKm: 0, everyMonths: 24 },
  { name: 'Свечи зажигания', everyKm: 60000, everyMonths: 0 },
  { name: 'Масло в АКПП (частичная замена)', everyKm: 50000, everyMonths: 0 },
  { name: 'Ремень ГРМ', everyKm: 90000, everyMonths: 0 },
];

export function carView() {
  const car = S.get().car;
  const last = S.lastOdo();
  const kpd = S.kmPerDay();
  const cons = S.consumption();
  const costs = S.carCosts(90);
  const view = h('div', { class: 'view' }, subHead('Машина'));
  view.append(
    h(
      'section',
      { class: 'card hero-card' },
      h('span', { class: 'hero-sub' }, 'Пробег'),
      h('div', { class: 'odo' }, last ? km(last.km) : 'не указан'),
      last ? h('span', { class: 'muted' }, `на ${fmtDay(last.date)}`) : h('span', { class: 'muted' }, 'Впиши показание одометра, и приложение посчитает остальное'),
      h('div', { class: 'actions wrap' }, h('button', { class: 'btn primary', type: 'button', onClick: () => X.odoForm() }, 'Обновить пробег'), h('button', { class: 'btn ghost', type: 'button', onClick: () => X.fuelForm() }, 'Заправка')),
    ),
    h('div', { class: 'kpis' }, kpi('Км в день', kpd ? String(Math.round(kpd)) : '-'), kpi('Л на 100 км', cons ? (Math.round(cons * 10) / 10).toString().replace('.', ',') : '-'), kpi('₽ за км', costs.perKm ? (Math.round(costs.perKm * 10) / 10).toString().replace('.', ',') : '-')),
    h('p', { class: 'legend' }, `Расходы по области «${S.area(S.carArea()).name}» за 90 дней: ${money(costs.spent)}${costs.km ? `, проехано ${km(costs.km)}` : ''}. Расход топлива считается по заправкам, нужно хотя бы две.`),
  );

  const stats = car.items.map((i) => S.carStatus(i)).sort((a, b) => (a.urgency ?? 1e9) - (b.urgency ?? 1e9));
  const bodyRows = stats.map((st) => {
    const i = st.item;
    const bits = [];
    if (st.leftKm != null) bits.push(st.leftKm >= 0 ? `осталось ${km(st.leftKm)}` : `просрочено на ${km(-st.leftKm)}`);
    if (st.nextDate) bits.push(st.daysByDate >= 0 ? `до ${fmtLong(st.nextDate)}` : `просрочено с ${fmtLong(st.nextDate)}`);
    if (!bits.length) bits.push(i.lastKm == null && !i.lastDate ? 'нет данных о прошлой замене' : 'нужен пробег для расчёта');
    return h('div', { class: 'row svc ' + st.level }, h('button', { class: 'row-main', type: 'button', onClick: () => X.carItemForm(i) }, h('span', { class: 'row-title' }, i.name), h('span', { class: 'row-sub' }, bits.join(' · '))), h('button', { class: 'btn small ghost', type: 'button', onClick: () => X.serviceForm(i) }, 'Сделано'));
  });
  view.append(
    card(
      'Обслуживание',
      bodyRows,
      !car.items.length ? empty('Пунктов пока нет. Можно добавить типовой набор и поправить интервалы по сервисной книжке.') : null,
      h('div', { class: 'actions wrap' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => X.carItemForm(null) }, '+ пункт'), !car.items.length ? h('button', { class: 'btn ghost', type: 'button', onClick: () => (TYPICAL.forEach((x) => S.addCarItem({ ...x, lastKm: null, lastDate: '' })), F.toast('Добавлено')) }, 'Добавить типовые') : null),
    ),
  );
  if (car.fuel.length) {
    const rows = [...car.fuel].sort((a, b) => b.km - a.km).slice(0, 6);
    view.append(card('Последние заправки', rows.map((f) => h('div', { class: 'row' }, h('span', { class: 'row-time' }, fmtDay(f.date)), h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, `${String(f.liters).replace('.', ',')} л`), h('span', { class: 'row-sub' }, `${km(f.km)}${f.cost ? ` · ${money(f.cost)}` : ''}`)), h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Удалить заправку', onClick: () => confirm('Удалить заправку? Расход в учёте останется.') && S.removeFuel(f.id) }, '✕')))));
  }
  return view;
}

// ---- РАЗБОР НЕДЕЛИ ----
const reviewUi = { week: mondayOf(today()) };

export function reviewView() {
  const wk = reviewUi.week;
  const end = addDays(wk, 6);
  const prev = addDays(wk, -7);
  const view = h('div', { class: 'view' }, subHead('Разбор недели'));
  view.append(h('div', { class: 'range-bar' }, navBtn('Прошлая неделя', () => ((reviewUi.week = prev), rerender()), '‹'), h('button', { class: 'range-label', type: 'button', onClick: () => ((reviewUi.week = mondayOf(today())), rerender()) }, `${fmtDay(wk)} - ${fmtDay(end)}`), navBtn('Следующая неделя', () => ((reviewUi.week = addDays(wk, 7)), rerender()), '›')));
  const tot = S.totals(wk, end);
  const pt = S.totals(prev, addDays(prev, 6));
  const sum = (o, k) => Object.values(o).reduce((a, x) => a + x[k], 0);
  const H = sum(tot, 'hours');
  const E = sum(tot, 'expense');
  const I = sum(tot, 'income');
  const done = sum(tot, 'done');
  const open = sum(tot, 'open');
  const delta = (a, b, f) => (b > 0 ? `${a >= b ? '+' : '−'}${f(Math.abs(a - b))} к прошлой` : '');
  view.append(
    h('div', { class: 'kpis four' }, h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, hrs(H)), h('span', { class: 'kpi-l' }, `Время ${delta(H, sum(pt, 'hours'), hrs)}`)), h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, money(E)), h('span', { class: 'kpi-l' }, `Расходы ${delta(E, sum(pt, 'expense'), money)}`)), h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, money(I)), h('span', { class: 'kpi-l' }, `Доходы ${delta(I, sum(pt, 'income'), money)}`)), h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, `${done} из ${done + open}`), h('span', { class: 'kpi-l' }, 'Задач сделано'))),
  );
  const ms = S.get().moods.filter((m) => m.date >= wk && m.date <= end && m.mood > 0);
  if (ms.length) {
    const a = (k) => {
      const l = ms.filter((m) => m[k] > 0);
      return l.length ? (Math.round((l.reduce((x, m) => x + m[k], 0) / l.length) * 10) / 10).toString().replace('.', ',') : '-';
    };
    view.append(h('p', { class: 'muted' }, `Самочувствие за неделю: настроение ${a('mood')}, энергия ${a('energy')}, сон ${a('sleep')} ч.`));
  }
  const byH = S.get().areas.map((x) => ({ x, v: tot[x.id].hours })).sort((p, q) => q.v - p.v);
  if (H > 0) view.append(h('p', { class: 'muted' }, `Больше всего времени: ${byH.filter((r) => r.v > 0).slice(0, 3).map((r) => `${r.x.name} ${hrs(r.v)}`).join(', ')}.`));

  const cur = S.reviewOf(wk) || { win: '', block: '', change: '' };
  const vals = { win: cur.win, block: cur.block, change: cur.change };
  const area = (key, label, ph) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('textarea', { rows: '3', maxlength: '1000', placeholder: ph, value: vals[key], onInput: (e) => (vals[key] = e.target.value) }));
  view.append(
    card(
      'Твой разбор',
      area('win', 'Что получилось', 'Что за неделю было сделано хорошо'),
      area('block', 'Что мешало', 'Где потерял время, силы или деньги'),
      area('change', 'Что меняю на следующей неделе', 'Одно конкретное действие'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onClick: () => (S.saveReview(wk, vals), F.toast('Разбор сохранён')) }, 'Сохранить')),
    ),
  );
  const past = S.get().reviews.filter((r) => r.week !== wk && (r.win || r.block || r.change)).sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8);
  if (past.length) {
    view.append(
      card(
        'Прошлые разборы',
        past.map((r) => h('details', { class: 'past' }, h('summary', {}, `Неделя с ${fmtDay(r.week)}`), r.win ? h('p', {}, h('b', {}, 'Получилось: '), r.win) : null, r.block ? h('p', {}, h('b', {}, 'Мешало: '), r.block) : null, r.change ? h('p', {}, h('b', {}, 'Менял: '), r.change) : null)),
      ),
    );
  }
  return view;
}

// ---- РАСПИСАНИЕ ----
export function scheduleView() {
  const st = S.get();
  const t = today();
  const par = S.parityOf(t);
  const view = h('div', { class: 'view' }, subHead('Расписание', addBtn('+ пара', () => X.lessonForm(null))));
  view.append(
    card(
      'Недели',
      h('p', { class: 'row-title' }, par ? `Сейчас ${par === 'odd' ? 'нечётная' : 'чётная'} неделя` : 'Чётность недель не задана'),
      st.term.start || st.term.end ? h('p', { class: 'muted' }, `Семестр: ${st.term.start ? fmtDay(st.term.start) : '...'} - ${st.term.end ? fmtDay(st.term.end) : '...'}`) : null,
      h('button', { class: 'btn ghost', type: 'button', onClick: () => X.termForm() }, par ? 'Изменить' : 'Задать'),
    ),
  );
  if (!st.lessons.length) {
    view.append(card(null, empty('Пар пока нет. Добавь предмет и отметь, на какой неделе он идёт: на каждой, только нечётной или только чётной. В календаре и на экране «Сегодня» они появятся сами.')));
    return view;
  }
  for (let d = 0; d < 7; d++) {
    const list = st.lessons.filter((l) => l.day === d).sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
    if (!list.length) continue;
    view.append(
      card(
        X.DAYS[d],
        list.map((l) => h('div', { class: 'row' }, h('span', { class: 'row-time' }, l.start || '-'), h('button', { class: 'row-main', type: 'button', onClick: () => X.lessonForm(l) }, h('span', { class: 'row-title' }, l.title), h('span', { class: 'row-sub' }, dot(S.area(l.area).color), { all: 'каждая неделя', odd: 'нечётная', even: 'чётная' }[l.week], l.end ? ` · до ${l.end}` : '', l.room ? ` · ${l.room}` : '')))),
      ),
    );
  }
  return view;
}

// ---- ШАБЛОНЫ ----
export function templatesView() {
  const list = S.get().templates;
  const view = h('div', { class: 'view' }, subHead('Шаблоны'));
  view.append(h('p', { class: 'muted' }, 'Шаблон это запись в одно нажатие: например «Бензин 2 000 ₽». Кнопки шаблонов стоят на экране «Сегодня». Чтобы создать шаблон, при добавлении записи включи «Сохранить как шаблон».'));
  if (!list.length) {
    view.append(card(null, empty('Шаблонов пока нет.')));
    return view;
  }
  view.append(
    card(
      null,
      list.map((tp) => h('div', { class: 'row' }, h('span', { class: 'row-time' }, F.KIND_LABEL[tp.kind].toLowerCase()), h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, tp.label), h('span', { class: 'row-sub' }, dot(S.area(tp.area).color), S.area(tp.area).name, tp.amount ? ` · ${money(tp.amount)}` : '', tp.hours ? ` · ${hrs(tp.hours)}` : '')), h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Удалить шаблон', onClick: () => S.removeTemplate(tp.id) }, '✕'))),
    ),
  );
  return view;
}

// ---- ИМПОРТ ВЫПИСКИ ----
const imp = { groups: null, error: '', name: '', limit: 30, range: null, bad: 0 };

export function importView() {
  const view = h('div', { class: 'view' }, subHead('Импорт выписки'));
  const file = h('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    imp.error = '';
    try {
      const rows = await readSheet(await f.arrayBuffer());
      const { ops, bad } = parseStatement(rows);
      if (!ops.length) throw new Error('В файле не нашлось операций.');
      imp.groups = group(ops, S.rules(), S.get().meta.lastArea);
      imp.name = f.name;
      imp.bad = bad;
      imp.limit = 30;
      const dates = ops.map((o) => o.date).sort();
      imp.range = [dates[0], dates[dates.length - 1]];
    } catch (e) {
      imp.groups = null;
      imp.error = e && e.message ? e.message : 'Не получилось прочитать файл.';
    }
    rerender();
  });

  if (!imp.groups) {
    view.append(
      card(
        'Как это работает',
        h('p', { class: 'muted' }, 'Выбери выписку из банка в формате .xlsx. Файл читается прямо на телефоне и никуда не отправляется. Операции собираются в группы по получателю или магазину: ты один раз решаешь про группу, и дальше приложение помнит.'),
        h('p', { class: 'muted' }, 'Переводы между своими счетами, на брокерский счёт и обычные переводы по умолчанию не считаются: их ты отметишь сам. Повторная загрузка того же файла дубли не создаст.'),
        imp.error ? h('p', { class: 'warn' }, imp.error) : null,
        h('button', { class: 'btn primary', type: 'button', onClick: () => file.click() }, 'Выбрать файл выписки'),
        file,
      ),
    );
    return view;
  }

  const { recs } = build(imp.groups);
  const fresh = recs.filter((r) => !S.hasExt(r.ext));
  const known = recs.length - fresh.length;
  const exp = fresh.filter((r) => r.kind === 'expense').reduce((a, r) => a + r.amount, 0);
  const inc = fresh.filter((r) => r.kind === 'income').reduce((a, r) => a + r.amount, 0);
  view.append(
    h('p', { class: 'muted' }, `${imp.name}: ${fmtDay(imp.range[0])} - ${fmtDay(imp.range[1])}, групп: ${imp.groups.length}.`),
    h('div', { class: 'kpis' }, kpi('Операций к записи', String(fresh.length)), kpi('Расходы', money(exp)), kpi('Доходы', money(inc))),
    known ? h('p', { class: 'legend' }, `Уже есть в приложении и будут пропущены: ${known}.`) : '',
    h('div', { class: 'actions' },h('button', { class: 'btn ghost', type: 'button', onClick: () => ((imp.groups = null), rerender()) }, 'Другой файл'), h('button', { class: 'btn primary', type: 'button', disabled: !fresh.length, onClick: () => {
      const { recs: all, newRules } = build(imp.groups);
      const added = S.importRecords(all, newRules);
      imp.groups = null;
      F.toast(`Записано операций: ${added}`);
      location.hash = '#stats';
    } }, `Записать ${fresh.length}`)),
  );

  const area = S.get().areas;
  const shown = imp.groups.slice(0, imp.limit);
  view.append(
    card(
      'Группы, самые крупные сверху',
      shown.map((g) => {
        const sel = h('select', { 'aria-label': 'Область', onChange: (e) => ((g.area = e.target.value), rerender()) }, area.map((a) => h('option', { value: a.id }, a.name)));
        sel.value = g.area;
        return h(
          'div',
          { class: 'imp-row' + (g.count ? ' on' : '') },
          h('div', { class: 'imp-top' }, h('span', { class: 'imp-l' }, g.label), h('span', { class: 'imp-s' }, g.out && g.inc ? `−${money(g.out)} / +${money(g.inc)}` : g.out ? `−${money(g.out)}` : `+${money(g.inc)}`)),
          h('div', { class: 'imp-bot' }, h('span', { class: 'row-sub' }, `${g.ops.length} оп.${g.known ? ' · правило запомнено' : ''}`), h('div', { class: 'imp-ctl' }, g.count ? sel : null, h('button', { type: 'button', class: 'chip' + (g.count ? ' on' : ''), onClick: () => ((g.count = !g.count), rerender()) }, g.count ? 'Считать' : 'Пропуск'))),
        );
      }),
      imp.groups.length > imp.limit ? h('button', { class: 'btn ghost', type: 'button', onClick: () => ((imp.limit += 60), rerender()) }, `Показать ещё (${imp.groups.length - imp.limit})`) : null,
    ),
  );
  return view;
}

export const PAGES = { subs: subsView, goals: goalsView, projects: projectsView, car: carView, review: reviewView, schedule: scheduleView, templates: templatesView, import: importView };
