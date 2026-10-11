// Все данные приложения. Хранятся в localStorage телефона, наружу никуда не уходят.
import { uid, today, addDays, daysBetween, parse, ymd, mondayOf, fmtDay, fmtDayFull, hrs, money, pct } from './util.js';

const KEY = 'zhizn.v1';

export const PALETTE = ['#5b6ee1', '#2e9e6b', '#d9822b', '#a064d6', '#d6504f', '#1ea0b5', '#c4528f', '#7a8b2e'];
const DEFAULT_AREAS = [
  { id: 'study', name: 'Учёба', color: PALETTE[0] },
  { id: 'work', name: 'Заработок', color: PALETTE[1] },
  { id: 'car', name: 'Машина', color: PALETTE[2] },
  { id: 'home', name: 'Быт', color: PALETTE[3] },
  { id: 'health', name: 'Здоровье', color: PALETTE[4] },
];

const COLL = { task: 'tasks', event: 'events', expense: 'money', income: 'money', time: 'time' };
const REPEATS = ['', 'daily', 'weekly', 'monthly'];
export const KINDS = Object.keys(COLL);

function fresh() {
  return {
    v: 2,
    areas: DEFAULT_AREAS.map((a) => ({ ...a })),
    projects: [],
    tasks: [],
    events: [],
    money: [],
    time: [],
    subs: [],
    goals: [],
    templates: [],
    moods: [],
    reviews: [],
    lessons: [],
    car: { odo: [], items: [], fuel: [] },
    rules: {},
    term: { anchor: '', parity: 'odd', start: '', end: '' },
    meta: { theme: 'auto', lastArea: 'study', lastKind: 'expense', lastExport: '' },
  };
}

// ---- проверка формы данных (и при загрузке, и при импорте файла) ----
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dt = (v) => (typeof v === 'string' && DATE.test(v) ? v : null);
const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const hhmm = (v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');

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
  const optArea = (v) => (areaIds.has(v) ? v : '');

  const projects = arr('projects').map((p) => ({
    id: id(p.id),
    name: str(p.name, 60) || 'Без названия',
    area: fixArea(p.area),
    deadline: dt(p.deadline) || '',
    order: !!p.order,
    price: Math.max(0, num(p.price)),
    done: !!p.done,
  }));
  const projIds = new Set(projects.map((p) => p.id));
  const fixProj = (v) => (projIds.has(v) ? v : '');

  const tasks = arr('tasks')
    .filter((t) => str(t.title).trim())
    .map((t) => {
      const date = dt(t.date);
      const repeat = date && REPEATS.includes(t.repeat) ? t.repeat : '';
      return {
        id: id(t.id),
        title: str(t.title, 120),
        date,
        area: fixArea(t.area),
        project: fixProj(t.project),
        prio: t.prio ? 1 : 0,
        done: !!t.done,
        doneAt: dt(t.doneAt) || '',
        repeat,
        until: repeat ? dt(t.until) : null,
        doneDates: Array.isArray(t.doneDates) ? t.doneDates.map(dt).filter(Boolean).slice(-400) : [],
      };
    });

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
        time: hhmm(e.time),
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
      ext: str(m.ext, 60),
      sub: str(m.sub, 40),
      dueFor: dt(m.dueFor) || '',
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

  const subs = arr('subs')
    .filter((s) => str(s.name).trim() && num(s.amount) > 0)
    .map((s) => ({
      id: id(s.id),
      name: str(s.name, 60),
      amount: num(s.amount),
      every: s.every === 'year' ? 'year' : 'month',
      day: int(s.day, 1, 31, 1),
      month: int(s.month, 1, 12, 1),
      area: fixArea(s.area),
      project: fixProj(s.project),
      active: s.active !== false,
      start: dt(s.start) || '',
    }));

  const goals = arr('goals')
    .filter((g) => str(g.title).trim() && num(g.target) > 0)
    .map((g) => ({
      id: id(g.id),
      title: str(g.title, 80),
      type: ['hours', 'income', 'saved'].includes(g.type) ? g.type : 'hours',
      target: num(g.target),
      area: optArea(g.area),
      project: fixProj(g.project),
      from: dt(g.from) || today(),
      deadline: dt(g.deadline) || '',
      contrib: Array.isArray(g.contrib)
        ? g.contrib.filter((c) => c && dt(c.date) && num(c.amount) !== 0).map((c) => ({ date: dt(c.date), amount: num(c.amount) })).slice(-500)
        : [],
    }));

  const templates = arr('templates')
    .filter((t) => KINDS.includes(t.kind) && str(t.label).trim())
    .map((t) => ({
      id: id(t.id),
      kind: t.kind,
      label: str(t.label, 30),
      area: fixArea(t.area),
      project: fixProj(t.project),
      amount: Math.max(0, num(t.amount)),
      hours: Math.max(0, num(t.hours)),
      note: str(t.note, 120),
    }));

  const byDate = new Map();
  for (const m of arr('moods')) {
    const d = dt(m.date);
    if (d) byDate.set(d, { date: d, mood: int(m.mood, 0, 5, 0), energy: int(m.energy, 0, 5, 0), sleep: Math.min(14, Math.max(0, num(m.sleep))) });
  }
  const moods = [...byDate.values()];

  const revBy = new Map();
  for (const x of arr('reviews')) {
    const w = dt(x.week);
    if (w) revBy.set(w, { week: w, win: str(x.win, 1000), block: str(x.block, 1000), change: str(x.change, 1000) });
  }
  const reviews = [...revBy.values()];

  const lessons = arr('lessons')
    .filter((l) => str(l.title).trim())
    .map((l) => ({
      id: id(l.id),
      title: str(l.title, 80),
      day: int(l.day, 0, 6, 0),
      start: hhmm(l.start),
      end: hhmm(l.end),
      room: str(l.room, 30),
      week: ['all', 'odd', 'even'].includes(l.week) ? l.week : 'all',
      area: fixArea(l.area),
    }));

  const c = r.car && typeof r.car === 'object' ? r.car : {};
  const carArr = (k) => (Array.isArray(c[k]) ? c[k].filter((x) => x && typeof x === 'object') : []);
  const car = {
    odo: carArr('odo').filter((o) => dt(o.date) && num(o.km) > 0).map((o) => ({ id: id(o.id), date: dt(o.date), km: Math.round(num(o.km)) })),
    items: carArr('items')
      .filter((i) => str(i.name).trim())
      .map((i) => ({
        id: id(i.id),
        name: str(i.name, 60),
        everyKm: Math.max(0, Math.round(num(i.everyKm))),
        everyMonths: Math.max(0, Math.round(num(i.everyMonths))),
        lastKm: i.lastKm == null || i.lastKm === '' ? null : Math.round(num(i.lastKm)),
        lastDate: dt(i.lastDate) || '',
      })),
    fuel: carArr('fuel').filter((f) => dt(f.date) && num(f.liters) > 0 && num(f.km) > 0).map((f) => ({ id: id(f.id), date: dt(f.date), km: Math.round(num(f.km)), liters: num(f.liters), cost: Math.max(0, num(f.cost)) })),
  };

  const rules = {};
  if (r.rules && typeof r.rules === 'object') {
    for (const k of Object.keys(r.rules).slice(0, 3000)) {
      const v = r.rules[k];
      if (v && typeof v === 'object') rules[k.slice(0, 120)] = { skip: !!v.skip, area: optArea(v.area) };
    }
  }

  const t0 = r.term && typeof r.term === 'object' ? r.term : {};
  const term = { anchor: dt(t0.anchor) || '', parity: t0.parity === 'even' ? 'even' : 'odd', start: dt(t0.start) || '', end: dt(t0.end) || '' };

  const m = r.meta && typeof r.meta === 'object' ? r.meta : {};
  const meta = {
    theme: ['auto', 'light', 'dark'].includes(m.theme) ? m.theme : 'auto',
    lastArea: fixArea(m.lastArea),
    lastKind: KINDS.includes(m.lastKind) ? m.lastKind : 'expense',
    lastExport: dt(m.lastExport) || '',
  };

  return { v: 2, areas, projects, tasks, events, money: moneyList, time: timeList, subs, goals, templates, moods, reviews, lessons, car, rules, term, meta };
}

// ---- хранение ----
let state = load();
let saveFailed = false;
const subs_ = new Set();

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
  subs_.forEach((fn) => fn());
}
export function subscribe(fn) {
  subs_.add(fn);
  return () => subs_.delete(fn);
}
export const get = () => state;
export const didSaveFail = () => saveFailed;
export { commit };

// ---- справочники ----
export const area = (id) => state.areas.find((a) => a.id === id) || { id, name: '?', color: '#888888' };
export const project = (id) => state.projects.find((p) => p.id === id) || null;
export const projectsOf = (areaId) => state.projects.filter((p) => p.area === areaId);
export const carArea = () => (state.areas.find((a) => a.id === 'car') || state.areas.find((a) => /машин/i.test(a.name)) || { id: state.meta.lastArea }).id;

export function addArea(name, color) {
  state.areas.push({ id: uid(), name: name.trim().slice(0, 40), color });
  commit();
}
export function updateArea(id, patch) {
  const a = state.areas.find((x) => x.id === id);
  if (a) Object.assign(a, patch);
  commit();
}
export function addProject(data) {
  const p = normalize({ areas: state.areas, projects: [{ ...data, id: uid() }] }).projects[0];
  state.projects.push(p);
  commit();
  return p;
}
export function updateProject(id, patch) {
  const p = state.projects.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  commit();
}
export function removeProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  for (const k of ['tasks', 'events', 'money', 'time', 'subs', 'goals']) for (const r of state[k]) if (r.project === id) r.project = '';
  commit();
}
export function setMeta(patch) {
  Object.assign(state.meta, patch);
  commit();
}

// ---- записи ----
export function add(kind, data, { quiet = false } = {}) {
  const item = { ...data, id: uid() };
  if (kind === 'expense' || kind === 'income') item.kind = kind;
  if (kind === 'task') Object.assign(item, { repeat: item.repeat || '', until: item.until || null, doneDates: [] });
  state[COLL[kind]].push(item);
  if (!quiet) {
    state.meta.lastArea = item.area;
    state.meta.lastKind = kind;
  }
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
export function toggleTask(id, occ) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  if (t.repeat && occ) {
    const i = t.doneDates.indexOf(occ);
    if (i >= 0) t.doneDates.splice(i, 1);
    else t.doneDates.push(occ);
  } else {
    t.done = !t.done;
    t.doneAt = t.done ? today() : '';
  }
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

// Дописать задачи из файла, не трогая остальные данные. Формат файла:
// { "tasks": [ { "title": "...", "date": "2026-10-13" или пусто, "area": "Учёба" (имя или id области), "prio": 1 } ] }
// Задача с тем же названием среди открытых уже есть: пропускается.
export function mergeTasks(raw) {
  const list = raw && Array.isArray(raw.tasks) ? raw.tasks : [];
  const byName = new Map(state.areas.map((a) => [a.name.trim().toLowerCase(), a.id]));
  const ids = new Set(state.areas.map((a) => a.id));
  const prepared = list
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const a = typeof t.area === 'string' ? t.area.trim() : '';
      const area = ids.has(a) ? a : byName.get(a.toLowerCase()) || state.meta.lastArea || state.areas[0].id;
      return { title: t.title, date: t.date, area, prio: t.prio, done: !!t.done, project: '' };
    });
  // normalize проверяет и обрезает поля так же, как при обычной загрузке
  const clean = normalize({ areas: state.areas, projects: [], tasks: prepared }).tasks;
  const open = new Set(state.tasks.filter((t) => !t.done).map((t) => t.title.trim().toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const t of clean) {
    const key = t.title.trim().toLowerCase();
    if (open.has(key)) {
      skipped++;
      continue;
    }
    open.add(key);
    state.tasks.push({ ...t, id: uid() });
    added++;
  }
  if (added) commit();
  return { added, skipped, total: list.length };
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

// ---- повторы, расписание, выборки по дням ----
const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99');

function hits(e, d) {
  if (d < e.date) return false;
  if (!e.repeat) return d <= (e.endDate || e.date);
  if (e.until && d > e.until) return false;
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekly') return daysBetween(e.date, d) % 7 === 0;
  return parse(e.date).getDate() === parse(d).getDate();
}

export function parityOf(d) {
  const t = state.term;
  if (!t.anchor) return null;
  const w = Math.round(daysBetween(mondayOf(t.anchor), mondayOf(d)) / 7);
  const same = ((w % 2) + 2) % 2 === 0;
  return same ? t.parity : t.parity === 'odd' ? 'even' : 'odd';
}
export function lessonsOn(d) {
  if (!state.lessons.length) return [];
  const t = state.term;
  if ((t.start && d < t.start) || (t.end && d > t.end)) return [];
  const idx = (parse(d).getDay() + 6) % 7;
  const p = parityOf(d);
  return state.lessons
    .filter((l) => l.day === idx && (l.week === 'all' || (p && l.week === p)))
    .map((l) => ({ id: 'lesson:' + l.id, lesson: true, lessonId: l.id, title: l.title, date: d, time: l.start, end: l.end, room: l.room, area: l.area, project: '', repeat: '' }));
}

export const eventsOn = (d) => [...state.events.filter((e) => hits(e, d)), ...lessonsOn(d)].sort(byTime);

export function tasksOn(d) {
  const out = [];
  for (const t of state.tasks) {
    if (!t.repeat) {
      if (t.date === d) out.push(t);
    } else if (hits(t, d)) out.push({ ...t, occ: d, done: t.doneDates.includes(d) });
  }
  return out.sort((a, b) => a.done - b.done || b.prio - a.prio);
}
export const overdue = (d) => state.tasks.filter((t) => !t.repeat && !t.done && t.date && t.date < d).sort((a, b) => a.date.localeCompare(b.date));
export const inbox = () => state.tasks.filter((t) => !t.date).sort((a, b) => a.done - b.done || b.prio - a.prio);
export const tasksOfProject = (pid) => state.tasks.filter((t) => t.project === pid);

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
    if (!t.date || !out[t.area]) continue;
    if (!t.repeat) {
      if (!inR(t.date, from, to)) continue;
      if (t.done) out[t.area].done++;
      else {
        out[t.area].open++;
        if (t.date < t0) out[t.area].overdue++;
      }
    } else {
      const end = to < addDays(t0, 0) ? to : t0; // будущие повторы не считаем
      for (let d = from < t.date ? t.date : from; d <= end; d = addDays(d, 1)) {
        if (!hits(t, d)) continue;
        if (t.doneDates.includes(d)) out[t.area].done++;
        else out[t.area].open++;
      }
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
export function projectStats(pid) {
  const o = { hours: 0, expense: 0, income: 0, done: 0, total: 0 };
  for (const x of state.time) if (x.project === pid) o.hours += x.hours;
  for (const m of state.money) if (m.project === pid) o[m.kind] += m.amount;
  for (const t of state.tasks) if (t.project === pid && !t.repeat) (o.total++, t.done && o.done++);
  return o;
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

// ---- платежи и подписки ----
export function dueOn(sub, d) {
  if (!sub.active || (sub.start && d < sub.start)) return false;
  const x = parse(d);
  const dim = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  if (x.getDate() !== Math.min(sub.day, dim)) return false;
  return sub.every === 'month' || x.getMonth() + 1 === sub.month;
}
export function nextDue(sub, from) {
  for (let i = 0; i <= 400; i++) {
    const d = addDays(from, i);
    if (dueOn(sub, d)) return d;
  }
  return null;
}
export const isPaid = (sub, due) => state.money.some((m) => m.sub === sub.id && m.dueFor === due);
export function dueSubs(d, lookback = 5) {
  const out = [];
  for (let i = 0; i <= lookback; i++) {
    const day = addDays(d, -i);
    for (const s of state.subs) if (dueOn(s, day) && !isPaid(s, day)) out.push({ sub: s, due: day });
  }
  return out;
}
export const subsOn = (d) => state.subs.filter((s) => dueOn(s, d));
export function paySub(sub, due, date) {
  add('expense', { date, amount: sub.amount, note: sub.name, area: sub.area, project: sub.project, sub: sub.id, dueFor: due }, { quiet: true });
}
export const yearCost = (sub) => (sub.every === 'month' ? sub.amount * 12 : sub.amount);

// ---- цели ----
export function goalProgress(g) {
  const t0 = today();
  let cur = 0;
  const ok = (x) => x.date >= g.from && (!g.area || x.area === g.area) && (!g.project || x.project === g.project);
  if (g.type === 'hours') for (const x of state.time) if (ok(x)) cur += x.hours;
  if (g.type === 'income') for (const m of state.money) if (m.kind === 'income' && ok(m)) cur += m.amount;
  if (g.type === 'saved') for (const c of g.contrib) cur += c.amount;
  const left = Math.max(0, g.target - cur);
  const days = g.deadline ? daysBetween(t0, g.deadline) + 1 : null;
  return { cur, left, pct: Math.min(100, Math.round((cur / g.target) * 100)), perDay: days != null && days > 0 ? left / days : null, days, late: !!g.deadline && g.deadline < t0 && left > 0, done: left === 0 };
}
export function addContrib(id, date, amount) {
  const g = state.goals.find((x) => x.id === id);
  if (g) g.contrib.push({ date, amount });
  commit();
}

// ---- шаблоны ----
export function addTemplate(t) {
  state.templates.push({ ...t, id: uid() });
  commit();
}
export function removeTemplate(id) {
  state.templates = state.templates.filter((t) => t.id !== id);
  commit();
}
export function applyTemplate(t, date) {
  const base = { area: t.area, project: t.project, date };
  if (t.kind === 'task') add('task', { ...base, title: t.label, prio: 0, done: false, doneAt: '' });
  else if (t.kind === 'time') add('time', { ...base, hours: t.hours, note: t.note || t.label });
  else add(t.kind, { ...base, amount: t.amount, note: t.note || t.label });
}

// ---- самочувствие ----
export const moodOn = (d) => state.moods.find((m) => m.date === d) || null;
export function setMood(d, patch) {
  let m = moodOn(d);
  if (!m) {
    m = { date: d, mood: 0, energy: 0, sleep: 0 };
    state.moods.push(m);
  }
  Object.assign(m, patch);
  commit();
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const f1 = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

// Что совпадает с хорошим самочувствием. Это совпадения, а не доказанные причины.
export function moodInsights(days = 90) {
  const to = today();
  const from = addDays(to, -days + 1);
  const ms = state.moods.filter((m) => m.date >= from && m.mood > 0);
  const lines = [];
  if (ms.length < 10) return { n: ms.length, lines, avg: ms.length ? avg(ms.map((m) => m.mood)) : null };
  const hoursBy = new Map();
  for (const x of state.time) if (x.date >= from) hoursBy.set(x.date + '|' + x.area, (hoursBy.get(x.date + '|' + x.area) || 0) + x.hours);
  for (const a of state.areas) {
    const A = ms.filter((m) => (hoursBy.get(m.date + '|' + a.id) || 0) >= 1);
    const B = ms.filter((m) => (hoursBy.get(m.date + '|' + a.id) || 0) < 1);
    if (A.length >= 4 && B.length >= 4) {
      const d = avg(A.map((m) => m.mood)) - avg(B.map((m) => m.mood));
      if (Math.abs(d) >= 0.4) lines.push({ diff: d, text: `В дни со временем на «${a.name}» (от 1 ч) настроение в среднем ${f1(avg(A.map((m) => m.mood)))}, в остальные дни ${f1(avg(B.map((m) => m.mood)))}.` });
    }
  }
  const sl = ms.filter((m) => m.sleep > 0);
  const good = sl.filter((m) => m.sleep >= 7);
  const bad = sl.filter((m) => m.sleep < 7);
  if (good.length >= 4 && bad.length >= 4) {
    const withE = (arr) => arr.filter((m) => m.energy > 0);
    const ge = withE(good);
    const be = withE(bad);
    if (ge.length >= 3 && be.length >= 3) lines.push({ diff: avg(ge.map((m) => m.energy)) - avg(be.map((m) => m.energy)), text: `После сна от 7 часов энергия в среднем ${f1(avg(ge.map((m) => m.energy)))}, после меньшего сна ${f1(avg(be.map((m) => m.energy)))}.` });
    const d = avg(good.map((m) => m.mood)) - avg(bad.map((m) => m.mood));
    if (Math.abs(d) >= 0.4) lines.push({ diff: d, text: `Настроение после сна от 7 часов ${f1(avg(good.map((m) => m.mood)))}, после меньшего сна ${f1(avg(bad.map((m) => m.mood)))}.` });
  }
  lines.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return { n: ms.length, lines: lines.map((l) => l.text), avg: avg(ms.map((m) => m.mood)) };
}

// ---- разбор недели ----
export const reviewOf = (week) => state.reviews.find((r) => r.week === week) || null;
export function saveReview(week, patch) {
  let r = reviewOf(week);
  if (!r) {
    r = { week, win: '', block: '', change: '' };
    state.reviews.push(r);
  }
  Object.assign(r, patch);
  commit();
}

// ---- расписание ----
export function setTerm(patch) {
  Object.assign(state.term, patch);
  commit();
}
export function addLesson(l) {
  state.lessons.push({ ...l, id: uid() });
  commit();
}
export function updateLesson(id, patch) {
  const l = state.lessons.find((x) => x.id === id);
  if (l) Object.assign(l, patch);
  commit();
}
export function removeLesson(id) {
  state.lessons = state.lessons.filter((x) => x.id !== id);
  commit();
}

// ---- машина ----
const addMonths = (s, n) => {
  const d = parse(s);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return ymd(t);
};
const odoSorted = () => [...state.car.odo].sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
export const lastOdo = () => odoSorted().pop() || null;
export function kmPerDay() {
  const s = odoSorted();
  if (s.length < 2) return null;
  const last = s[s.length - 1];
  const first = s.find((p) => p.date >= addDays(last.date, -120)) || s[0];
  const span = daysBetween(first.date, last.date);
  return span >= 7 && last.km > first.km ? (last.km - first.km) / span : null;
}
export function addOdo(date, km) {
  state.car.odo.push({ id: uid(), date, km: Math.round(km) });
  commit();
}
export function carStatus(item) {
  const cur = lastOdo();
  const kpd = kmPerDay();
  const t0 = today();
  const leftKm = item.everyKm && item.lastKm != null && cur ? item.lastKm + item.everyKm - cur.km : null;
  const daysByKm = leftKm != null && kpd ? leftKm / kpd : leftKm != null && leftKm <= 0 ? 0 : null;
  const nextDate = item.everyMonths && item.lastDate ? addMonths(item.lastDate, item.everyMonths) : null;
  const daysByDate = nextDate ? daysBetween(t0, nextDate) : null;
  const known = [daysByKm, daysByDate].filter((x) => x != null);
  const urgency = known.length ? Math.min(...known) : null;
  const level = urgency == null ? 'nodata' : urgency < 0 ? 'over' : urgency <= 30 ? 'soon' : 'ok';
  return { item, leftKm, nextDate, daysByDate, daysByKm, urgency, level };
}
export function logService(itemId, { date, km, cost, note }) {
  const it = state.car.items.find((i) => i.id === itemId);
  if (!it) return;
  it.lastKm = Math.round(km);
  it.lastDate = date;
  state.car.odo.push({ id: uid(), date, km: Math.round(km) });
  if (cost > 0) add('expense', { date, amount: cost, note: note || it.name, area: carArea(), project: '' }, { quiet: true });
  commit();
}
export function addFuel({ date, km, liters, cost }) {
  state.car.fuel.push({ id: uid(), date, km: Math.round(km), liters, cost });
  state.car.odo.push({ id: uid(), date, km: Math.round(km) });
  if (cost > 0) add('expense', { date, amount: cost, note: `Бензин ${String(liters).replace('.', ',')} л`, area: carArea(), project: '' }, { quiet: true });
  commit();
}
export function addCarItem(i) {
  state.car.items.push({ ...i, id: uid() });
  commit();
}
export function updateCarItem(id, patch) {
  const it = state.car.items.find((x) => x.id === id);
  if (it) Object.assign(it, patch);
  commit();
}
export function removeCarItem(id) {
  state.car.items = state.car.items.filter((x) => x.id !== id);
  commit();
}
export function removeFuel(id) {
  state.car.fuel = state.car.fuel.filter((x) => x.id !== id);
  commit();
}
export function consumption() {
  const f = [...state.car.fuel].sort((a, b) => a.km - b.km);
  if (f.length < 2) return null;
  const dist = f[f.length - 1].km - f[0].km;
  if (dist < 100) return null;
  const liters = f.slice(1).reduce((a, x) => a + x.liters, 0);
  return (liters / dist) * 100;
}
export function carCosts(days = 90) {
  const to = today();
  const from = addDays(to, -days + 1);
  const ca = carArea();
  let spent = 0;
  for (const m of state.money) if (m.kind === 'expense' && m.area === ca && inR(m.date, from, to)) spent += m.amount;
  const s = odoSorted().filter((p) => p.date >= from);
  const km = s.length >= 2 ? s[s.length - 1].km - s[0].km : 0;
  return { spent, km, perKm: km > 0 ? spent / km : null, days };
}

// ---- импорт выписки ----
export const rules = () => state.rules;
export function importRecords(list, newRules) {
  const have = new Set(state.money.map((m) => m.ext).filter(Boolean));
  let added = 0;
  for (const r of list) {
    if (r.ext && have.has(r.ext)) continue;
    state.money.push({ id: uid(), kind: r.kind, date: r.date, amount: r.amount, note: r.note.slice(0, 120), area: r.area, project: '', ext: r.ext || '', sub: '', dueFor: '' });
    added++;
  }
  Object.assign(state.rules, newRules);
  commit();
  return added;
}
export const hasExt = (ext) => state.money.some((m) => m.ext === ext);

// ---- сводка для чата ----
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
    lines.push(`- ${a.name}: время ${hrs(t.hours)} (${pct(t.hours, sumH)}%), расходы ${money(t.expense)}, доходы ${money(t.income)}, задач сделано ${t.done}, открыто ${t.open}, просрочено ${t.overdue}`);
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
  const ms = state.moods.filter((m) => m.date >= from && m.date <= to && m.mood > 0);
  if (ms.length) {
    const en = ms.filter((m) => m.energy > 0);
    const sl = ms.filter((m) => m.sleep > 0);
    lines.push('', `Самочувствие (дней с отметкой ${ms.length}): настроение ${f1(avg(ms.map((m) => m.mood)))} из 5` + (en.length ? `, энергия ${f1(avg(en.map((m) => m.energy)))}` : '') + (sl.length ? `, сон ${f1(avg(sl.map((m) => m.sleep)))} ч` : '') + '.');
  }
  const gl = state.goals.map((g) => ({ g, p: goalProgress(g) })).filter((x) => !x.p.done);
  if (gl.length) lines.push('', 'Цели:', ...gl.map(({ g, p }) => `- ${g.title}: ${p.pct}%${g.deadline ? `, срок ${fmtDay(g.deadline)}` : ''}${p.late ? ' (срок прошёл)' : ''}`));
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
