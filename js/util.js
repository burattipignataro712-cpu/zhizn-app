// Даты (строки YYYY-MM-DD в местном времени), форматирование и мелкие помощники DOM.

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => ymd(new Date());
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const mondayOf = (s) => {
  const d = parse(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
};
export const monthStart = (y, m) => ymd(new Date(y, m, 1));
export const monthEnd = (y, m) => ymd(new Date(y, m + 1, 0));

export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WD = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const WD_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const wdIdx = (d) => (d.getDay() + 6) % 7;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtDay = (s) => {
  const d = parse(s);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};
export const fmtDayFull = (s) => {
  const d = parse(s);
  return `${WD[wdIdx(d)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};
export const fmtShort = (s) => {
  const d = parse(s);
  return `${WD_SHORT[wdIdx(d)]} ${d.getDate()}`;
};
export const isWeekend = (s) => wdIdx(parse(s)) >= 5;

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
export const money = (n) => `${nf.format(Math.round(n))} ₽`;
export const hrs = (x) => `${(Math.round(x * 100) / 100).toString().replace('.', ',')} ч`;
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const parseNum = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Весь пользовательский текст попадает в DOM только через textContent: так импортированный файл не выполнит код.
function setProps(el, props) {
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false || k === 'value') continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') for (const p in v) el.style.setProperty(p, v[p]);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}
function append(el, kids) {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) setProps(el, props);
  append(el, kids);
  if (props && props.value != null) el.value = props.value;
  return el;
}
export function s(tag, props, ...kids) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (props) setProps(el, props);
  append(el, kids);
  return el;
}
