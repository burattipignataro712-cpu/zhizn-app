// Строки списков: задача, событие, запись о деньгах или времени, платёж.
import * as S from './store.js';
import { itemForm } from './forms.js';
import { h, fmtDay, money, hrs } from './util.js';

export const dot = (color) => h('span', { class: 'dot', style: { background: color } });

function sub(item, extra) {
  const a = S.area(item.area);
  const p = item.project ? S.project(item.project) : null;
  return h('span', { class: 'row-sub' }, dot(a.color), a.name, p ? ` · ${p.name}` : '', extra ? ` · ${extra}` : '');
}

const REPEAT_LABEL = { daily: 'каждый день', weekly: 'каждую неделю', monthly: 'каждый месяц' };

export function taskRow(t, { showDate = false, onDone } = {}) {
  const extra = t.repeat ? REPEAT_LABEL[t.repeat] : showDate && t.date ? fmtDay(t.date) : '';
  return h(
    'div',
    { class: 'row' + (t.done ? ' done' : '') },
    h('button', { class: 'check' + (t.done ? ' on' : ''), type: 'button', 'aria-label': t.done ? 'Вернуть в работу' : 'Отметить выполненной', onClick: () => S.toggleTask(t.id, t.occ) }, t.done ? '✓' : ''),
    h('button', { class: 'row-main', type: 'button', onClick: () => itemForm('task', t, { onDone }) }, h('span', { class: 'row-title' }, t.title), sub(t, extra)),
    t.prio ? h('span', { class: 'badge' }, 'важно') : null,
  );
}

export function eventRow(e, { onDone } = {}) {
  const extra = e.lesson ? [e.end ? `до ${e.end}` : '', e.room].filter(Boolean).join(', ') : e.repeat ? REPEAT_LABEL[e.repeat] : e.endDate ? `до ${fmtDay(e.endDate)}` : '';
  const open = () => (e.lesson ? (location.hash = '#schedule') : itemForm('event', e, { onDone }));
  return h('div', { class: 'row' }, h('span', { class: 'row-time' }, e.time || 'весь день'), h('button', { class: 'row-main', type: 'button', onClick: open }, h('span', { class: 'row-title' }, e.title), sub(e, extra)));
}

export function recordRow(r, { onDone } = {}) {
  const label = r.note || { expense: 'Расход', income: 'Доход', time: 'Время' }[r.type];
  const value = r.type === 'time' ? hrs(r.hours) : (r.type === 'income' ? '+' : '−') + money(r.amount);
  return h(
    'div',
    { class: 'row' },
    h('span', { class: 'row-time ' + r.type }, { expense: 'расход', income: 'доход', time: 'время' }[r.type]),
    h('button', { class: 'row-main', type: 'button', onClick: () => itemForm(r.type, r, { onDone }) }, h('span', { class: 'row-title' }, label), sub(r)),
    h('span', { class: 'row-value ' + r.type }, value),
  );
}

// Платёж, который пора внести: кнопка «Оплатил» создаёт расход.
export function dueRow(sb, due, date) {
  const late = due < date;
  return h(
    'div',
    { class: 'row' },
    h('span', { class: 'row-time' }, late ? fmtDay(due) : 'сегодня'),
    h('div', { class: 'row-main' }, h('span', { class: 'row-title' }, sb.name), sub(sb, money(sb.amount))),
    h('button', { class: 'btn small primary', type: 'button', onClick: () => S.paySub(sb, due, date) }, 'Оплатил'),
  );
}
