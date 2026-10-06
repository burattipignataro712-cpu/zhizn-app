// Формы разделов: платежи, цели, расписание, машина.
import * as S from './store.js';
import { simpleForm, closeSheet } from './forms.js';
import { today, parseNum, uid } from './util.js';

const needPos = (v, what = 'Сумма') => (parseNum(v) > 0 ? '' : `${what} должна быть больше нуля.`);

// ---- платежи ----
export function subForm(sub) {
  const st = S.get();
  simpleForm({
    title: sub ? 'Платёж' : 'Новый платёж',
    values: { name: sub?.name || '', amount: sub ? String(sub.amount) : '', every: sub?.every || 'month', day: sub ? String(sub.day) : String(new Date().getDate()), month: sub ? String(sub.month) : String(new Date().getMonth() + 1), area: sub?.area || st.meta.lastArea, project: sub?.project || '', active: sub ? sub.active : true },
    fields: [
      { key: 'name', label: 'Название', type: 'text', max: 60, placeholder: 'Например: VPN' },
      { key: 'amount', label: 'Сумма, ₽', type: 'num' },
      { key: 'every', label: 'Как часто', type: 'chips', options: [['month', 'Раз в месяц', ''], ['year', 'Раз в год', '']] },
      { key: 'day', label: 'День месяца (1-31)', type: 'num', max: 2 },
      { key: 'month', label: 'Месяц (1-12)', type: 'num', max: 2, when: (v) => v.every === 'year' },
      { key: 'area', label: 'Область', type: 'area' },
      { key: 'project', label: 'Проект', type: 'project' },
      { key: 'active', label: 'Действует', type: 'check' },
    ],
    onSave: (v) => {
      if (!v.name.trim()) return 'Напиши название.';
      const e = needPos(v.amount);
      if (e) return e;
      const day = Math.round(parseNum(v.day));
      if (!(day >= 1 && day <= 31)) return 'День: число от 1 до 31.';
      const month = Math.round(parseNum(v.month));
      if (v.every === 'year' && !(month >= 1 && month <= 12)) return 'Месяц: число от 1 до 12.';
      const data = { name: v.name.trim().slice(0, 60), amount: parseNum(v.amount), every: v.every, day, month: month >= 1 && month <= 12 ? month : 1, area: v.area, project: v.project, active: !!v.active, start: sub?.start || '' };
      if (sub) Object.assign(sub, data), S.commit();
      else (st.subs.push({ ...data, id: uid() }), S.commit());
    },
    onDelete: sub
      ? () => {
          if (confirm('Удалить платёж? Уже внесённые расходы останутся.')) {
            st.subs = st.subs.filter((x) => x.id !== sub.id);
            S.commit();
            closeSheet();
          }
        }
      : null,
  });
}

// ---- цели ----
export function goalForm(g) {
  const st = S.get();
  const unit = { hours: 'часов', income: '₽', saved: '₽' };
  simpleForm({
    title: g ? 'Цель' : 'Новая цель',
    values: { title: g?.title || '', type: g?.type || 'hours', target: g ? String(g.target) : '', area: g?.area ?? '', project: g?.project || '', from: g?.from || today(), deadline: g?.deadline || '' },
    fields: [
      { key: 'title', label: 'Что хочу', type: 'text', max: 80, placeholder: 'Например: 40 часов на курсовую' },
      { key: 'type', label: 'Как считать', type: 'chips', options: [['hours', 'Часы по записям', ''], ['income', 'Доход по записям', ''], ['saved', 'Копить вручную', '']] },
      { key: 'target', label: 'Сколько нужно (часов или рублей)', type: 'num' },
      { key: 'area', label: 'Область (для часов и дохода)', type: 'area', optional: true, when: (v) => v.type !== 'saved' },
      { key: 'project', label: 'Проект (необязательно)', type: 'project', when: (v) => v.type !== 'saved' },
      { key: 'from', label: 'Считать с даты', type: 'date', when: (v) => v.type !== 'saved' },
      { key: 'deadline', label: 'Срок (необязательно)', type: 'date' },
    ],
    onSave: (v) => {
      if (!v.title.trim()) return 'Напиши, что хочешь.';
      const e = needPos(v.target, 'Цель');
      if (e) return e;
      const data = { title: v.title.trim().slice(0, 80), type: v.type, target: parseNum(v.target), area: v.type === 'saved' ? '' : v.area, project: v.type === 'saved' ? '' : v.project, from: v.from || today(), deadline: v.deadline || '' };
      if (g) Object.assign(g, data), S.commit();
      else (st.goals.push({ ...data, id: uid(), contrib: [] }), S.commit());
    },
    onDelete: g
      ? () => {
          if (confirm('Удалить цель?')) {
            st.goals = st.goals.filter((x) => x.id !== g.id);
            S.commit();
            closeSheet();
          }
        }
      : null,
    hint: g ? `Единица: ${unit[g.type]}.` : null,
  });
}

export function contribForm(g) {
  simpleForm({
    title: `Взнос: ${g.title}`,
    values: { amount: '', date: today() },
    fields: [
      { key: 'amount', label: 'Сколько отложил, ₽ (минус, чтобы снять)', type: 'num' },
      { key: 'date', label: 'Дата', type: 'date' },
    ],
    onSave: (v) => {
      const n = parseNum(v.amount);
      if (!Number.isFinite(n) || n === 0) return 'Впиши сумму.';
      if (!v.date) return 'Выбери дату.';
      S.addContrib(g.id, v.date, n);
    },
  });
}

// ---- расписание ----
export const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export function lessonForm(l) {
  const st = S.get();
  simpleForm({
    title: l ? 'Пара' : 'Новая пара',
    values: { title: l?.title || '', day: String(l?.day ?? 0), start: l?.start || '', end: l?.end || '', room: l?.room || '', week: l?.week || 'all', area: l?.area || st.meta.lastArea },
    fields: [
      { key: 'title', label: 'Предмет', type: 'text', max: 80 },
      { key: 'day', label: 'День недели', type: 'chips', options: DAYS.map((d, i) => [String(i), d.slice(0, 2), '']) },
      { key: 'start', label: 'Начало', type: 'time' },
      { key: 'end', label: 'Конец', type: 'time' },
      { key: 'room', label: 'Аудитория (необязательно)', type: 'text', max: 30 },
      { key: 'week', label: 'Какие недели', type: 'chips', options: [['all', 'Каждая', ''], ['odd', 'Нечётная', ''], ['even', 'Чётная', '']] },
      { key: 'area', label: 'Область', type: 'area' },
    ],
    onSave: (v) => {
      if (!v.title.trim()) return 'Напиши предмет.';
      const data = { title: v.title.trim().slice(0, 80), day: Number(v.day), start: v.start, end: v.end, room: v.room.trim(), week: v.week, area: v.area };
      if (l) S.updateLesson(l.id, data);
      else S.addLesson(data);
    },
    onDelete: l
      ? () => {
          if (confirm('Удалить пару?')) {
            S.removeLesson(l.id);
            closeSheet();
          }
        }
      : null,
  });
}

export function termForm() {
  const t = S.get().term;
  const cur = S.parityOf(today()) || 'odd';
  simpleForm({
    title: 'Семестр и чётность недель',
    values: { parity: cur, start: t.start, end: t.end },
    hint: 'Скажи, какая неделя сейчас. Остальные недели приложение посчитает само.',
    fields: [
      { key: 'parity', label: 'Эта неделя', type: 'chips', options: [['odd', 'Нечётная', ''], ['even', 'Чётная', '']] },
      { key: 'start', label: 'Начало семестра (необязательно)', type: 'date' },
      { key: 'end', label: 'Конец семестра (необязательно)', type: 'date' },
    ],
    onSave: (v) => {
      if (v.start && v.end && v.end < v.start) return 'Конец раньше начала.';
      S.setTerm({ anchor: today(), parity: v.parity, start: v.start || '', end: v.end || '' });
    },
  });
}

// ---- машина ----
export function odoForm() {
  const last = S.lastOdo();
  simpleForm({
    title: 'Пробег',
    values: { km: last ? String(last.km) : '', date: today() },
    fields: [
      { key: 'km', label: 'Показание одометра, км', type: 'num', max: 7 },
      { key: 'date', label: 'Дата', type: 'date' },
    ],
    onSave: (v) => {
      const km = parseNum(v.km);
      if (!(km > 0)) return 'Впиши пробег.';
      if (last && km < last.km && v.date >= last.date) return `Пробег меньше прошлого (${last.km} км).`;
      S.addOdo(v.date, km);
    },
  });
}

export function fuelForm() {
  const last = S.lastOdo();
  simpleForm({
    title: 'Заправка',
    values: { date: today(), km: last ? String(last.km) : '', liters: '', cost: '' },
    hint: 'Лучше заправлять до полного бака: так расход на 100 км считается точнее.',
    fields: [
      { key: 'km', label: 'Пробег, км', type: 'num', max: 7 },
      { key: 'liters', label: 'Литров', type: 'num' },
      { key: 'cost', label: 'Стоимость, ₽', type: 'num' },
      { key: 'date', label: 'Дата', type: 'date' },
    ],
    onSave: (v) => {
      const km = parseNum(v.km);
      const liters = parseNum(v.liters);
      if (!(km > 0)) return 'Впиши пробег.';
      if (!(liters > 0)) return 'Впиши литры.';
      if (!v.date) return 'Выбери дату.';
      S.addFuel({ date: v.date, km, liters, cost: Math.max(0, parseNum(v.cost) || 0) });
    },
  });
}

export function serviceForm(item) {
  const last = S.lastOdo();
  simpleForm({
    title: `Сделано: ${item.name}`,
    values: { date: today(), km: last ? String(last.km) : '', cost: '' },
    fields: [
      { key: 'date', label: 'Дата', type: 'date' },
      { key: 'km', label: 'Пробег, км', type: 'num', max: 7 },
      { key: 'cost', label: 'Сколько стоило, ₽ (необязательно)', type: 'num' },
    ],
    onSave: (v) => {
      const km = parseNum(v.km);
      if (!(km > 0)) return 'Впиши пробег.';
      if (!v.date) return 'Выбери дату.';
      S.logService(item.id, { date: v.date, km, cost: Math.max(0, parseNum(v.cost) || 0), note: item.name });
    },
  });
}

export function carItemForm(item) {
  simpleForm({
    title: item ? 'Пункт обслуживания' : 'Новый пункт',
    values: { name: item?.name || '', everyKm: item?.everyKm ? String(item.everyKm) : '', everyMonths: item?.everyMonths ? String(item.everyMonths) : '', lastKm: item?.lastKm != null ? String(item.lastKm) : '', lastDate: item?.lastDate || '' },
    hint: 'Хватит одного условия: по пробегу, по времени или оба сразу.',
    fields: [
      { key: 'name', label: 'Что менять или проверять', type: 'text', max: 60, placeholder: 'Например: масло двигателя' },
      { key: 'everyKm', label: 'Каждые, км (необязательно)', type: 'num' },
      { key: 'everyMonths', label: 'Каждые, месяцев (необязательно)', type: 'num' },
      { key: 'lastKm', label: 'Когда делали: пробег, км', type: 'num', max: 7 },
      { key: 'lastDate', label: 'Когда делали: дата', type: 'date' },
    ],
    onSave: (v) => {
      if (!v.name.trim()) return 'Напиши название.';
      const everyKm = Math.max(0, Math.round(parseNum(v.everyKm) || 0));
      const everyMonths = Math.max(0, Math.round(parseNum(v.everyMonths) || 0));
      if (!everyKm && !everyMonths) return 'Укажи интервал по пробегу или по времени.';
      const lk = parseNum(v.lastKm);
      const data = { name: v.name.trim().slice(0, 60), everyKm, everyMonths, lastKm: v.lastKm !== '' && lk > 0 ? Math.round(lk) : null, lastDate: v.lastDate || '' };
      if (item) S.updateCarItem(item.id, data);
      else S.addCarItem(data);
    },
    onDelete: item
      ? () => {
          if (confirm('Удалить пункт?')) {
            S.removeCarItem(item.id);
            closeSheet();
          }
        }
      : null,
  });
}
