// Экраны: Сегодня, План, Год, Анализ (цифры и карта), Ещё.
import * as S from './store.js';
import * as F from './forms.js';
import { taskRow, eventRow, recordRow, dot } from './rows.js';
import {
  h, s, today, parse, ymd, addDays, mondayOf, monthStart, monthEnd, MONTHS, MONTHS_SHORT, WD_SHORT, cap,
  fmtDay, fmtDayFull, fmtShort, isWeekend, money, hrs, pct, daysBetween,
} from './util.js';

export const ui = {
  plan: { tab: 'week', week: mondayOf(today()) },
  cal: { year: new Date().getFullYear(), month: null },
  stats: { tab: 'numbers', period: 'week', anchor: today(), metric: 'hours' },
  mapSel: null,
};

// ---- общие кусочки ----
const card = (title, ...kids) => h('section', { class: 'card' }, title ? h('h3', {}, title) : null, ...kids);
const empty = (text) => h('p', { class: 'empty' }, text);
const pageHead = (title, ...right) => h('header', { class: 'page-head' }, h('h1', {}, title), h('div', { class: 'head-actions' }, ...right));
const navBtn = (label, onClick, text) => h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, onClick }, text);
function seg(options, value, onChange) {
  return h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { type: 'button', class: 'seg-btn' + (v === value ? ' on' : ''), onClick: () => onChange(v) }, l)));
}
const rerender = () => S.touch();

// ---- СЕГОДНЯ ----
export function todayView() {
  const t = today();
  const late = S.overdue(t);
  const events = S.eventsOn(t);
  const tasks = S.tasksOn(t);
  const recs = S.recordsOn(t);
  const spent = recs.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
  const hours = recs.filter((r) => r.type === 'time').reduce((a, r) => a + r.hours, 0);
  const d = parse(t);
  const doneN = tasks.filter((x) => x.done).length;

  const view = h('div', { class: 'view' }, pageHead(cap(fmtDayFull(t))));

  const c = S.counts();
  const lastExport = S.get().meta.lastExport;
  const total = c.tasks + c.events + c.money + c.time;
  if (total > 20 && (!lastExport || daysBetween(lastExport, t) > 14)) {
    view.append(h('div', { class: 'banner' }, 'Копии данных давно не было. Данные лежат только в этом телефоне. ', h('a', { href: '#more' }, 'Сделать копию')));
  }

  view.append(
    h(
      'div',
      { class: 'quick' },
      ['expense', 'time', 'task', 'event'].map((k) => h('button', { type: 'button', class: 'quick-btn', onClick: () => F.itemForm(k, null, { date: t }) }, '+ ' + F.KIND_LABEL[k].toLowerCase())),
    ),
    h(
      'div',
      { class: 'kpis' },
      kpi('Потрачено', money(spent)),
      kpi('Время', hrs(hours)),
      kpi('Задачи', tasks.length ? `${doneN} из ${tasks.length}` : '0'),
    ),
  );

  if (late.length) {
    view.append(
      card(
        `Просрочено: ${late.length}`,
        late.map((x) => taskRow(x, { showDate: true })),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => S.rescheduleOverdue(t) }, 'Перенести всё на сегодня'),
      ),
    );
  }
  view.append(
    card('План на сегодня', events.map((e) => eventRow(e)), tasks.map((x) => taskRow(x)), !events.length && !tasks.length ? empty('На сегодня ничего не запланировано.') : null),
  );
  if (recs.length) view.append(card('Записи за сегодня', recs.map((r) => recordRow(r))));
  return view;
}
const kpi = (label, value) => h('div', { class: 'kpi' }, h('span', { class: 'kpi-v' }, value), h('span', { class: 'kpi-l' }, label));

// ---- ДЕНЬ (шторка) ----
export function openDay(date) {
  const redo = () => openDay(date);
  const events = S.eventsOn(date);
  const tasks = S.tasksOn(date);
  const recs = S.recordsOn(date);
  const adds = ['task', 'event', 'expense', 'time'].map((k) => h('button', { type: 'button', class: 'quick-btn', onClick: () => F.itemForm(k, null, { date, onDone: redo }) }, '+ ' + F.KIND_LABEL[k].toLowerCase()));
  F.openSheet(
    cap(fmtDayFull(date)),
    h('div', { class: 'quick' }, adds),
    events.length ? h('div', { class: 'group' }, h('h4', {}, 'События'), events.map((e) => eventRow(e, { onDone: redo }))) : null,
    tasks.length ? h('div', { class: 'group' }, h('h4', {}, 'Задачи'), tasks.map((x) => taskRow(x, { onDone: redo }))) : null,
    recs.length ? h('div', { class: 'group' }, h('h4', {}, 'Записи'), recs.map((r) => recordRow(r, { onDone: redo }))) : null,
    !events.length && !tasks.length && !recs.length ? empty('В этот день пока пусто.') : null,
  );
}

// ---- ПЛАН ----
export function planView() {
  const p = ui.plan;
  const t = today();
  const view = h(
    'div',
    { class: 'view' },
    pageHead('План'),
    seg([['week', 'Неделя'], ['inbox', 'Без даты']], p.tab, (v) => ((p.tab = v), rerender())),
  );

  if (p.tab === 'inbox') {
    const list = S.inbox();
    view.append(
      card(
        'Задачи без срока',
        list.map((x) => taskRow(x)),
        !list.length ? empty('Пусто. Всё, что не привязано к дате, попадает сюда.') : null,
        h('button', { class: 'btn ghost', type: 'button', onClick: () => F.itemForm('task', null, { noDate: true }) }, '+ задача без срока'),
      ),
    );
    return view;
  }

  const end = addDays(p.week, 6);
  view.append(
    h(
      'div',
      { class: 'range-bar' },
      navBtn('Прошлая неделя', () => ((p.week = addDays(p.week, -7)), rerender()), '‹'),
      h('button', { class: 'range-label', type: 'button', onClick: () => ((p.week = mondayOf(t)), rerender()) }, `${fmtDay(p.week)} - ${fmtDay(end)}`),
      navBtn('Следующая неделя', () => ((p.week = addDays(p.week, 7)), rerender()), '›'),
    ),
  );
  if (p.week === mondayOf(t)) {
    const late = S.overdue(t);
    if (late.length) view.append(card(`Просрочено: ${late.length}`, late.map((x) => taskRow(x, { showDate: true })), h('button', { class: 'btn ghost', type: 'button', onClick: () => S.rescheduleOverdue(t) }, 'Перенести всё на сегодня')));
  }
  for (let i = 0; i < 7; i++) {
    const d = addDays(p.week, i);
    const ev = S.eventsOn(d);
    const tk = S.tasksOn(d);
    view.append(
      h(
        'section',
        { class: 'card day-card' + (d === t ? ' is-today' : '') },
        h('div', { class: 'day-head' }, h('h3', {}, cap(fmtShort(d)) + ' ' + parse(d).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Добавить на этот день', onClick: () => F.itemForm('task', null, { date: d }) }, '+')),
        ev.map((e) => eventRow(e)),
        tk.map((x) => taskRow(x)),
        !ev.length && !tk.length ? h('p', { class: 'empty small' }, 'Свободно') : null,
      ),
    );
  }
  return view;
}

// ---- ГОД ----
export function yearView() {
  const c = ui.cal;
  const t = today();
  const view = h('div', { class: 'view' });
  const title = c.month == null ? String(c.year) : `${cap(MONTHS[c.month])} ${c.year}`;
  const step = (dir) => {
    if (c.month == null) c.year += dir;
    else {
      c.month += dir;
      if (c.month < 0) ((c.month = 11), c.year--);
      if (c.month > 11) ((c.month = 0), c.year++);
    }
    rerender();
  };
  view.append(
    pageHead('Календарь'),
    h(
      'div',
      { class: 'range-bar' },
      navBtn('Назад', () => step(-1), '‹'),
      h('button', { class: 'range-label', type: 'button', onClick: () => ((c.year = new Date().getFullYear()), (c.month = c.month == null ? null : new Date().getMonth()), rerender()) }, title),
      navBtn('Вперёд', () => step(1), '›'),
    ),
  );
  if (c.month != null) view.append(h('button', { class: 'btn ghost', type: 'button', onClick: () => ((c.month = null), rerender()) }, 'Показать весь год'));

  if (c.month == null) {
    view.append(h('p', { class: 'legend' }, 'Цвет клетки: загрузка дня. Точки: события по областям. Квадрат: есть открытые задачи. Нажми на день или на название месяца.'));
    view.append(h('div', { class: 'year-grid' }, MONTHS.map((_, m) => monthCard(c.year, m, false, t))));
  } else {
    view.append(monthCard(c.year, c.month, true, t));
  }
  return view;
}

function monthCard(y, m, big, t) {
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const grid = h('div', { class: 'mgrid' + (big ? ' big' : '') }, WD_SHORT.map((w) => h('span', { class: 'wd' }, big ? w : w[0])));
  for (let i = 0; i < lead; i++) grid.append(h('span', { class: 'blank' }));
  for (let day = 1; day <= days; day++) {
    const d = ymd(new Date(y, m, day));
    const ev = S.eventsOn(d);
    const open = S.tasksOn(d).filter((x) => !x.done).length;
    const load = ev.length + open;
    const level = load === 0 ? 0 : load === 1 ? 1 : load <= 3 ? 2 : 3;
    const colors = [...new Set(ev.map((e) => S.area(e.area).color))].slice(0, 3);
    const cell = h(
      'button',
      { type: 'button', class: `day l${level}` + (d === t ? ' today' : '') + (isWeekend(d) ? ' weekend' : ''), 'aria-label': fmtDayFull(d), onClick: () => openDay(d) },
      h('span', { class: 'dn' }, String(day)),
      big
        ? ev.slice(0, 2).map((e) => h('span', { class: 'chip-ev', style: { background: S.area(e.area).color } }, e.title))
        : h('span', { class: 'marks' }, colors.map((c) => h('i', { style: { background: c } })), open ? h('b', {}) : null),
      big && ev.length > 2 ? h('span', { class: 'more-ev' }, `+${ev.length - 2}`) : null,
      big && open ? h('span', { class: 'open-n' }, `${open} зад.`) : null,
    );
    grid.append(cell);
  }
  if (big) return grid;
  return h('div', { class: 'month' }, h('button', { class: 'month-title', type: 'button', onClick: () => ((ui.cal.month = m), rerender()) }, MONTHS[m]), grid);
}

// ---- АНАЛИЗ ----
function periodRange() {
  const { period, anchor } = ui.stats;
  const d = parse(anchor);
  if (period === 'week') {
    const f = mondayOf(anchor);
    const to = addDays(f, 6);
    return { from: f, to, label: `${fmtDay(f)} - ${fmtDay(to)}`, bucket: 'day' };
  }
  if (period === 'month') {
    return { from: monthStart(d.getFullYear(), d.getMonth()), to: monthEnd(d.getFullYear(), d.getMonth()), label: `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`, bucket: 'day' };
  }
  return { from: monthStart(d.getFullYear(), 0), to: monthEnd(d.getFullYear(), 11), label: String(d.getFullYear()), bucket: 'month' };
}
function shiftPeriod(dir) {
  const st = ui.stats;
  const d = parse(st.anchor);
  if (st.period === 'week') st.anchor = addDays(st.anchor, 7 * dir);
  else if (st.period === 'month') st.anchor = ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  else st.anchor = ymd(new Date(d.getFullYear() + dir, 0, 1));
  rerender();
}

export function statsView() {
  const st = ui.stats;
  const r = periodRange();
  const view = h(
    'div',
    { class: 'view' },
    pageHead('Анализ'),
    seg([['numbers', 'Цифры'], ['map', 'Карта связей']], st.tab, (v) => ((st.tab = v), rerender())),
    seg([['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год']], st.period, (v) => ((st.period = v), (st.anchor = today()), rerender())),
    h('div', { class: 'range-bar' }, navBtn('Назад', () => shiftPeriod(-1), '‹'), h('button', { class: 'range-label', type: 'button', onClick: () => ((st.anchor = today()), rerender()) }, r.label), navBtn('Вперёд', () => shiftPeriod(1), '›')),
  );
  const tot = S.totals(r.from, r.to);
  const areas = S.get().areas;
  const sum = (k) => areas.reduce((a, x) => a + tot[x.id][k], 0);
  const H = sum('hours');
  const E = sum('expense');
  const I = sum('income');
  if (H === 0 && E === 0 && I === 0 && sum('done') + sum('open') === 0) {
    view.append(card(null, empty('За этот период нет записей. Добавь время, расходы или задачи кнопкой +, и здесь появятся цифры.')));
    return view;
  }
  if (st.tab === 'map') {
    view.append(...mapSections(r, tot, H, E, I));
    return view;
  }

  view.append(
    h('div', { class: 'kpis four' }, kpi('Расходы', money(E)), kpi('Доходы', money(I)), kpi('Баланс', (I - E >= 0 ? '+' : '−') + money(Math.abs(I - E))), kpi('Время', hrs(H))),
    card('Куда уходит время', barList(areas.map((a) => ({ a, v: tot[a.id].hours })), (v) => hrs(v), H)),
    card('Куда уходят деньги', barList(areas.map((a) => ({ a, v: tot[a.id].expense })), (v) => money(v), E)),
  );
  // динамика
  const series = S.series(r.from, r.to, r.bucket, st.metric);
  const keys = [];
  if (r.bucket === 'month') for (let m = 0; m < 12; m++) keys.push(`${r.from.slice(0, 4)}-${String(m + 1).padStart(2, '0')}`);
  else for (let d = r.from; d <= r.to; d = addDays(d, 1)) keys.push(d);
  const max = Math.max(1e-9, ...keys.map((k) => series.get(k) || 0));
  const bars = keys.map((k, i) => {
    const v = series.get(k) || 0;
    const label = r.bucket === 'month' ? MONTHS_SHORT[i][0] : keys.length <= 7 ? WD_SHORT[i] : (i + 1) % 5 === 0 || i === 0 ? String(parse(k).getDate()) : '';
    return h('div', { class: 'bar-col', title: st.metric === 'hours' ? hrs(v) : money(v) }, h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill ' + st.metric, style: { height: `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%` } })), h('span', { class: 'bar-lbl' }, label));
  });
  view.append(card('Динамика', seg([['hours', 'Часы'], ['expense', 'Расходы']], st.metric, (v) => ((st.metric = v), rerender())), h('div', { class: 'bars' + (keys.length > 14 ? ' dense' : '') }, bars)));
  const done = sum('done');
  const open = sum('open');
  view.append(card('Задачи со сроком в периоде', h('p', { class: 'big-line' }, `${done} сделано, ${open} открыто` + (done + open ? ` (${pct(done, done + open)}% выполнено)` : '')), sum('overdue') ? h('p', { class: 'warn' }, `Просрочено: ${sum('overdue')}`) : null));
  return view;
}

function barList(rows, fmt, total) {
  const sorted = rows.filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  if (!sorted.length) return empty('Нет данных.');
  const max = sorted[0].v;
  return h(
    'div',
    { class: 'bar-list' },
    sorted.map(({ a, v }) =>
      h('div', { class: 'bl-row' }, h('div', { class: 'bl-top' }, h('span', {}, dot(a.color), a.name), h('span', { class: 'bl-val' }, `${fmt(v)} · ${pct(v, total)}%`)), h('div', { class: 'bl-track' }, h('div', { class: 'bl-fill', style: { width: `${(v / max) * 100}%`, background: a.color } }))),
    ),
  );
}

// ---- КАРТА СВЯЗЕЙ ----
function mapSections(r, tot, H, E, I) {
  const st = S.get();
  const areas = st.areas;
  const pt = S.projectTotals(r.from, r.to);
  const W = 480;
  const C = W / 2;
  const R = 118;
  const RP = 188;
  const timeP = { x: C - 28, y: C };
  const moneyP = { x: C + 28, y: C };
  const svg = s('svg', { viewBox: `0 0 ${W} ${W}`, class: 'map', role: 'img', 'aria-label': 'Карта связей: время и деньги по областям и проектам' });
  const edges = s('g', {});
  const nodes = s('g', {});
  const pos = {};
  areas.forEach((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / areas.length;
    pos[a.id] = { x: C + R * Math.cos(ang), y: C + R * Math.sin(ang), ang };
  });
  const T = tot;
  const share = (a) => {
    const hs = H ? T[a.id].hours / H : 0;
    const es = E ? T[a.id].expense / E : 0;
    return { hs, es, both: H && E ? (hs + es) / 2 : hs || es };
  };
  areas.forEach((a) => {
    const p = pos[a.id];
    const sh = share(a);
    if (sh.hs > 0) edges.append(s('line', { x1: timeP.x, y1: timeP.y, x2: p.x, y2: p.y, class: 'edge time', 'stroke-width': (1.5 + sh.hs * 12).toFixed(1) }));
    if (sh.es > 0) edges.append(s('line', { x1: moneyP.x, y1: moneyP.y, x2: p.x, y2: p.y, class: 'edge money', 'stroke-width': (1.5 + sh.es * 12).toFixed(1) }));
    // проекты вокруг области
    const score = (id) => (H ? (pt[id]?.hours || 0) / H : 0) + (E ? (pt[id]?.expense || 0) / E : 0);
    const projs = S.projectsOf(a.id).filter((pr) => score(pr.id) > 0).sort((x, y) => score(y.id) - score(x.id)).slice(0, 3);
    projs.forEach((pr, j) => {
      const off = (j - (projs.length - 1) / 2) * 0.44;
      const x = C + RP * Math.cos(p.ang + off);
      const y = C + RP * Math.sin(p.ang + off);
      const rad = 5 + 10 * Math.sqrt(Math.min(1, score(pr.id)));
      edges.append(s('line', { x1: p.x, y1: p.y, x2: x, y2: y, class: 'edge proj' }));
      nodes.append(s('g', {}, s('circle', { cx: x, cy: y, r: rad.toFixed(1), fill: a.color, opacity: '0.55' }), s('text', { x, y: y + rad + 10, class: 'lbl small', 'text-anchor': 'middle' }, pr.name.length > 12 ? pr.name.slice(0, 11) + '…' : pr.name)));
    });
  });
  areas.forEach((a) => {
    const p = pos[a.id];
    const rad = 14 + 22 * Math.sqrt(share(a).both);
    const g = s('g', { class: 'node' + (ui.mapSel === a.id ? ' sel' : ''), tabindex: '0', role: 'button', 'aria-label': a.name, onClick: () => ((ui.mapSel = ui.mapSel === a.id ? null : a.id), rerender()) }, s('circle', { cx: p.x, cy: p.y, r: rad.toFixed(1), fill: a.color }), s('text', { x: p.x, y: p.y + rad + 13, class: 'lbl', 'text-anchor': 'middle' }, a.name));
    nodes.append(g);
  });
  nodes.append(
    s('g', {}, s('circle', { cx: timeP.x, cy: timeP.y, r: 25, class: 'res time' }), s('text', { x: timeP.x, y: timeP.y + 4, class: 'res-lbl', 'text-anchor': 'middle' }, 'Время')),
    s('g', {}, s('circle', { cx: moneyP.x, cy: moneyP.y, r: 25, class: 'res money' }), s('text', { x: moneyP.x, y: moneyP.y + 4, class: 'res-lbl', 'text-anchor': 'middle' }, 'Деньги')),
  );
  svg.append(edges, nodes);

  const out = [card(null, h('div', { class: 'map-wrap' }, svg), h('p', { class: 'legend' }, 'Размер области: доля времени и расходов. Толщина линии к центру: сколько времени (синяя) и денег (зелёная) она берёт. Мелкие круги: главные проекты. Нажми на область, чтобы увидеть детали.'))];

  if (ui.mapSel && areas.some((a) => a.id === ui.mapSel)) {
    const a = S.area(ui.mapSel);
    const t = T[a.id];
    out.push(card(a.name, h('div', { class: 'kpis four' }, kpi('Время', hrs(t.hours)), kpi('Расходы', money(t.expense)), kpi('Доходы', money(t.income)), kpi('Задачи', `${t.done}/${t.done + t.open}`)), t.overdue ? h('p', { class: 'warn' }, `Просрочено задач: ${t.overdue}`) : null));
  }

  // выводы из цифр
  const notes = [];
  const byH = [...areas].sort((x, y) => T[y.id].hours - T[x.id].hours);
  const byE = [...areas].sort((x, y) => T[y.id].expense - T[x.id].expense);
  if (H > 0) notes.push(`Больше всего времени уходит на «${byH[0].name}»: ${hrs(T[byH[0].id].hours)}, ${pct(T[byH[0].id].hours, H)}% всех записанных часов.`);
  if (E > 0) notes.push(`Больше всего денег уходит на «${byE[0].name}»: ${money(T[byE[0].id].expense)}, ${pct(T[byE[0].id].expense, E)}% расходов.`);
  for (const a of areas) {
    const t = T[a.id];
    if (t.income > 0 && t.hours > 0) notes.push(`«${a.name}» приносит ${money(t.income / t.hours)} дохода за час записанного времени.`);
    if (t.expense > 0 && t.hours === 0 && t.income === 0) notes.push(`«${a.name}»: деньги уходят, а времени и дохода не записано. Проверь, нет ли пропуска в записях.`);
  }
  if (H > 0) {
    const quiet = areas.filter((a) => T[a.id].hours === 0 && T[a.id].open + T[a.id].done + T[a.id].expense === 0).map((a) => a.name);
    if (quiet.length) notes.push(`Совсем без записей за период: ${quiet.join(', ')}.`);
  }
  const late = areas.filter((a) => T[a.id].overdue > 0).map((a) => `${a.name} (${T[a.id].overdue})`);
  if (late.length) notes.push(`Просроченные задачи по областям: ${late.join(', ')}.`);
  const topProj = Object.entries(pt).map(([id, v]) => ({ p: S.project(id), v })).filter((x) => x.p).sort((x, y) => y.v.hours - x.v.hours)[0];
  if (topProj && topProj.v.hours > 0) notes.push(`Главный проект по времени: «${topProj.p.name}», ${hrs(topProj.v.hours)}.`);
  out.push(card('Что видно по цифрам', notes.length ? h('ul', { class: 'notes' }, notes.map((n) => h('li', {}, n))) : empty('Пока мало данных для выводов.')));
  out.push(card('Разбор с Claude', h('p', { class: 'muted' }, 'Скопируй сводку за период и вставь в чат. Там можно спросить, что менять.'), h('button', { class: 'btn primary', type: 'button', onClick: () => summarySheet(r.from, r.to) }, 'Сводка для Claude')));
  return out;
}

function summarySheet(from, to) {
  const text = S.summaryText(from, to);
  const ta = h('textarea', { class: 'summary', readonly: true, rows: '14' });
  ta.value = text;
  F.openSheet(
    'Сводка для Claude',
    ta,
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              F.toast('Скопировано');
            } catch (e) {
              ta.select();
              F.toast('Выдели и скопируй вручную');
            }
          },
        },
        'Скопировать',
      ),
    ),
  );
}

// ---- ЕЩЁ ----
export function moreView() {
  const st = S.get();
  const view = h('div', { class: 'view' }, pageHead('Ещё'));

  // области и проекты
  const areaBlocks = st.areas.map((a) =>
    h(
      'div',
      { class: 'area-block' },
      h('div', { class: 'row' }, dot(a.color), h('button', { class: 'row-main', type: 'button', onClick: () => F.areaForm(a) }, h('span', { class: 'row-title' }, a.name)), h('button', { class: 'btn small ghost', type: 'button', onClick: () => F.projectForm(null, a.id) }, '+ проект')),
      S.projectsOf(a.id).map((p) => h('div', { class: 'row indent' }, h('button', { class: 'row-main', type: 'button', onClick: () => F.projectForm(p, a.id) }, h('span', { class: 'row-title' }, p.name)))),
    ),
  );
  view.append(card('Области и проекты', areaBlocks, h('button', { class: 'btn ghost', type: 'button', onClick: () => F.areaForm(null) }, '+ новая область')));

  // сводка
  const t = today();
  const wk = mondayOf(t);
  view.append(card('Сводка для разбора', h('p', { class: 'muted' }, 'Текст с цифрами за неделю, чтобы вставить в чат с Claude.'), h('button', { class: 'btn ghost', type: 'button', onClick: () => summarySheet(wk, addDays(wk, 6)) }, 'Сводка за эту неделю')));

  // данные
  const c = S.counts();
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      const next = S.normalize(raw);
      const n = next.tasks.length + next.events.length + next.money.length + next.time.length;
      if (confirm(`В файле записей: ${n}. Заменить ими все текущие данные?`)) {
        S.replaceAll(raw);
        F.toast('Данные загружены');
      }
    } catch (e) {
      alert('Не получилось прочитать файл. Нужен JSON, который сделало это приложение.');
    }
  });
  view.append(
    card(
      'Данные',
      h('p', { class: 'muted' }, `Задач: ${c.tasks}, событий: ${c.events}, денежных записей: ${c.money}, записей времени: ${c.time}.`),
      h('p', { class: 'muted' }, `Последняя копия: ${st.meta.lastExport ? fmtDay(st.meta.lastExport) : 'ещё не делал'}. Данные хранятся только в браузере этого телефона. Если очистить данные сайта, они пропадут, поэтому делай копию.`),
      h(
        'div',
        { class: 'actions wrap' },
        h('button', { class: 'btn primary', type: 'button', onClick: exportData }, 'Скачать копию'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => file.click() }, 'Загрузить копию'),
        file,
      ),
      S.didSaveFail() ? h('p', { class: 'warn' }, 'Не удалось сохранить данные в память браузера. Сделай копию сейчас.') : null,
    ),
  );

  // оформление и опасная зона
  view.append(
    card('Оформление', seg([['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']], st.meta.theme, (v) => S.setMeta({ theme: v }))),
    card(
      'Опасная зона',
      h(
        'button',
        {
          class: 'btn danger',
          type: 'button',
          onClick: () => {
            if (confirm('Удалить все данные приложения на этом телефоне? Это нельзя отменить.') && confirm('Точно удалить? Копию ты сделал?')) {
              S.reset();
              F.toast('Всё очищено');
            }
          },
        },
        'Стереть все данные',
      ),
    ),
  );
  return view;
}

function exportData() {
  const blob = new Blob([JSON.stringify(S.get(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `zhizn-${today()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  S.setMeta({ lastExport: today() });
  F.toast('Копия скачана');
}
