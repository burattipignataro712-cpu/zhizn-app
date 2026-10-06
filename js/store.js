// Все данные приложения. Хранятся в localStorage телефона, наружу никуда не уходят.
import { uid, today, addDays, daysBetween, parse, fmtDay, fmtDayFull, hrs, money, pct } from './util.js';

const KEY = 'zhizn.v1';

export const PALETTE = ['#4f7cff', '#2fa36b', '#e08a1e', '#9a6bd6', '#d9534f', '#14a3b8', '#c2569a', '#7a8b2e'];
const DEFAULT_AREAS = [
  { id: 'study', name: 'Учёба', color: PALETTE[0] },
  { id: 'work', name: 'Заработок', color: PALETTE[1] },
  { id: 'car', name: 'Машина', color: PALETTE[2] },
  { id: 'home', name: 'Быт', color: PALETTE[3] },
  { id: 'health', name: 'Здоровье', color: PALETTE[4] },
];

const COLL = { task: 'tasks', event: 'events', expense: 'money', income: 'money', time: 'time' };
const REPEATS = ['', 'daily', 'weekly', 'monthly'];

function fresh() {
  return {
    v: 1,
    areas: DEFAULT_AREAS.map((a) => ({ ...a })),
    projects: [],
    tasks: [],
    events: [],
    money: [],
    time: [],
    meta: { theme: 'auto', lastArea: 'study', lastKind: 'expense', lastExport: '' },
  };
}

// ---- проверка формы данных (и при загрузке, и при импорте файла) ----
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dt = (v) => (typeof v === 'string' && DATE.test(v) ? v : null);

export function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const arr = (k) => (Array.isArray(r[k]) ? r[k].filter((x) => x && typeof x === 'object') : []);
  const seen = new Set();
  const id = (v) => {
    let x = str(v, 40);
    if (!x || seen.has(x)) x = uid();
    seen.add(x);
    return x;
  };

  const areas = arr('areas').map((a) => ({
    id: id(a.id),
    name: str(a.name, 40) || 'Без названия',
    color: /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : '#888888',
  }));
  if (!areas.length) areas.push(...DEFAULT_AREAS.map((a) => ({ ...a })));
  const areaIds = new Set(areas.map((a) => a.id));
  const fixArea = (v) => (areaIds.has(v) ? v : areas[0].id);

  const projects = arr('projects').map((p) => ({ id: id(p.id), name: str(p.name, 60) || 'Без названия', area: fixArea(p.area) }));
  const projIds = new Set(projects.map((p) => p.id));
  const fixProj = (v) => (projIds.has(v) ? v : '');

  const tasks = arr('tasks')
    .filter((t) => str(t.title).trim())
    .map((t) => ({
      id: id(t.id),
      title: str(t.title, 120),
      date: dt(t.date),
      area: fixArea(t.area),
      project: fixProj(t.project),
      prio: t.prio ? 1 : 0,
      done: !!t.done,
      doneAt: dt(t.doneAt) || '',
    }));

  const events = arr('events')
    .filter((e) => dt(e.date) && str(e.title).trim())
    .map((e) => {
      const date = dt(e.date);
      const end = dt(e.endDate);
      const repeat = REPEATS.includes(e.repeat) ? e.repeat : '';
      return {
        id: id(e.id),
        title: str(e.title, 120),
        date,
        endDate: end && end > date && !repeat ? end : null,
        time: /^\d{2}:\d{2}$/.test(e.time) ? e.time : '',
        repeat,
        until: repeat ? dt(e.until) : null,
        area: fixArea(e.area),
        project: fixProj(e.project),
      };
    });

  const moneyList = arr('money')
    .filter((m) => dt(m.date) && num(m.amount) > 0 && (m.kind === 'expense' || m.kind === 'income'))
    .map((m) => ({
      id: id(m.id),
      kind: m.kind,
      date: dt(m.date),
      amount: num(m.amount),
      note: str(m.note, 120),
      area: fixArea(m.area),
      project: fixProj(m.project),
    }));

  const timeList = arr('time')
    .filter((x) => dt(x.date) && num(x.hours) > 0)
    .map((x) => ({
      id: id(x.id),
      date: dt(x.date),
      hours: num(x.hours),
      note: str(x.note, 120),
      area: fixArea(x.area),
      project: fixProj(x.project),
    }));

  const m = r.meta && typeof r.meta === 'object' ? r.meta : {};
  const meta = {
    theme: ['auto', 'light', 'dark'].includes(m.theme) ? m.theme : 'auto',
    lastArea: fixArea(m.lastArea),
    lastKind: Object.keys(COLL).includes(m.lastKind) ? m.lastKind : 'expense',
    lastExport: dt(m.lastExport) || '',
  };

  return { v: 1, areas, projects, tasks, events, money: moneyList, time: timeList, meta };
}

// ---- хранение ----
let state = load();
let saveFailed = false;
const subs = new Set();

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    // Битые данные не затираем: сохраняем копию рядом.
    try {
      if (raw) localStorage.setItem(KEY + '.broken', raw);
    } catch (e2) {
      /* память недоступна */
    }
  }
  return fresh();
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch (e) {
    saveFailed = true;
  }
}
function commit() {
  save();
  touch();
}
export function touch() {
  subs.forEach((fn) => fn());
}
export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
export const get = () => state;
export const didSaveFail = () => saveFailed;

// ---- справочники ----
export const area = (id) => state.areas.find((a) => a.id === id) || { id, name: '?', color: '#888888' };
export const project = (id) => state.projects.find((p) => p.id === id) || null;
export const projectsOf = (areaId) => state.projects.filter((p) => p.area === areaId);

export function addArea(name, color) {
  state.areas.push({ id: uid(), name: name.trim().slice(0, 40), color });
  commit();
}
export function updateArea(id, patch) {
  const a = state.areas.find((x) => x.id === id);
  if (a) Object.assign(a, patch);
  commit();
}
export function addProject(name, areaId) {
  state.projects.push({ id: uid(), name: name.trim().slice(0, 60), area: areaId });
  commit();
}
export function updateProject(id, patch) {
  const p = state.projects.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  commit();
}
export function removeProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  for (const k of ['tasks', 'events', 'money', 'time']) for (const r of state[k]) if (r.project === id) r.project = '';
  commit();
}
export function setMeta(patch) {
  Object.assign(state.meta, patch);
  commit();
}

// ---- записи ----
export function add(kind, data) {
  const item = { ...data, id: uid() };
  if (kind === 'expense' || kind === 'income') item.kind = kind;
  state[COLL[kind]].push(item);
  state.meta.lastArea = item.area;
  state.meta.lastKind = kind;
  commit();
  return item;
}
export function update(kind, id, patch) {
  const it = state[COLL[kind]].find((x) => x.id === id);
  if (!it) return;
  Object.assign(it, patch);
  if (patch.area) state.meta.lastArea = patch.area;
  commit();
}
export function remove(kind, id) {
  state[COLL[kind]] = state[COLL[kind]].filter((x) => x.id !== id);
  commit();
}
export function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? today() : '';
  commit();
}
export function rescheduleOverdue(to) {
  for (const t of overdue(to)) t.date = to;
  commit();
}
export function replaceAll(raw) {
  state = normalize(raw);
  commit();
}
export function reset() {
  state = fresh();
  commit();
}
export const counts = () => ({
  tasks: state.tasks.length,
  events: state.events.length,
  money: state.money.length,
  time: state.time.length,
});

// ---- выборки ----
const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99');

function eventHits(e, d) {
  if (d < e.date) return false;
  if (!e.repeat) return d <= (e.endDate || e.date);
  if (e.until && d > e.until) return false;
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekly') return daysBetween(e.date, d) % 7 === 0;
  return parse(e.date).getDate() === parse(d).getDate();
}
export const eventsOn = (d) => state.events.filter((e) => eventHits(e, d)).sort(byTime);
export const tasksOn = (d) => state.tasks.filter((t) => t.date === d).sort((a, b) => a.done - b.done || b.prio - a.prio);
export const overdue = (d) => state.tasks.filter((t) => !t.done && t.date && t.date < d).sort((a, b) => a.date.localeCompare(b.date));
export const inbox = () => state.tasks.filter((t) => !t.date).sort((a, b) => a.done - b.done || b.prio - a.prio);

export function recordsOn(d) {
  return [
    ...state.money.filter((m) => m.date === d).map((m) => ({ ...m, type: m.kind })),
    ...state.time.filter((x) => x.date === d).map((x) => ({ ...x, type: 'time' })),
  ];
}

const inR = (d, from, to) => d >= from && d <= to;

export function totals(from, to) {
  const out = Object.fromEntries(state.areas.map((a) => [a.id, { hours: 0, expense: 0, income: 0, done: 0, open: 0, overdue: 0 }]));
  const t0 = today();
  for (const x of state.time) if (inR(x.date, from, to) && out[x.area]) out[x.area].hours += x.hours;
  for (const m of state.money) if (inR(m.date, from, to) && out[m.area]) out[m.area][m.kind] += m.amount;
  for (const t of state.tasks) {
    if (!t.date || !inR(t.date, from, to) || !out[t.area]) continue;
    if (t.done) out[t.area].done++;
    else {
      out[t.area].open++;
      if (t.date < t0) out[t.area].overdue++;
    }
  }
  return out;
}

export function projectTotals(from, to) {
  const out = {};
  const slot = (id) => (out[id] ||= { hours: 0, expense: 0, income: 0 });
  for (const x of state.time) if (x.project && inR(x.date, from, to)) slot(x.project).hours += x.hours;
  for (const m of state.money) if (m.project && inR(m.date, from, to)) slot(m.project)[m.kind] += m.amount;
  return out;
}

// Суммы по корзинам для столбиков: ключ дня или месяца.
export function series(from, to, bucket, metric) {
  const map = new Map();
  const keyOf = (d) => (bucket === 'month' ? d.slice(0, 7) : d);
  const put = (d, v) => map.set(keyOf(d), (map.get(keyOf(d)) || 0) + v);
  if (metric === 'hours') {
    for (const x of state.time) if (inR(x.date, from, to)) put(x.date, x.hours);
  } else {
    for (const m of state.money) if (m.kind === 'expense' && inR(m.date, from, to)) put(m.date, m.amount);
  }
  return map;
}

// Текст для вставки в чат с Claude: сжатая картина периода.
export function summaryText(from, to) {
  const tot = totals(from, to);
  const lines = [`Сводка по жизни за ${fmtDay(from)} - ${fmtDay(to)}.`, ''];
  let sumH = 0;
  let sumE = 0;
  let sumI = 0;
  for (const a of state.areas) {
    sumH += tot[a.id].hours;
    sumE += tot[a.id].expense;
    sumI += tot[a.id].income;
  }
  lines.push(`Итого: время ${hrs(sumH)}, расходы ${money(sumE)}, доходы ${money(sumI)}.`, '', 'По областям:');
  for (const a of state.areas) {
    const t = tot[a.id];
    lines.push(
      `- ${a.name}: время ${hrs(t.hours)} (${pct(t.hours, sumH)}%), расходы ${money(t.expense)}, доходы ${money(t.income)}, задач сделано ${t.done}, открыто ${t.open}, просрочено ${t.overdue}`,
    );
  }
  const pt = projectTotals(from, to);
  const top = Object.entries(pt)
    .map(([pid, v]) => ({ p: project(pid), v }))
    .filter((x) => x.p)
    .sort((a, b) => b.v.hours + b.v.expense / 1000 - (a.v.hours + a.v.expense / 1000))
    .slice(0, 5);
  if (top.length) {
    lines.push('', 'Главные проекты:');
    for (const { p, v } of top) lines.push(`- ${p.name} (${area(p.area).name}): время ${hrs(v.hours)}, расходы ${money(v.expense)}, доходы ${money(v.income)}`);
  }
  const t0 = today();
  const soon = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(t0, i);
    for (const e of eventsOn(d)) soon.push(`- ${fmtDayFull(d)}${e.time ? ' ' + e.time : ''}: ${e.title} (${area(e.area).name})`);
  }
  if (soon.length) lines.push('', 'События на ближайшие 7 дней:', ...soon);
  const late = overdue(t0);
  if (late.length) lines.push('', `Просроченные задачи (${late.length}):`, ...late.slice(0, 10).map((t) => `- ${t.title} (${area(t.area).name}, срок ${fmtDay(t.date)})`));
  lines.push('', 'Помоги разобраться: что здесь забирает больше всего ресурсов, где перекос и что стоит поменять на следующей неделе.');
  return lines.join('\n');
}
