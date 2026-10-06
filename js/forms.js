// Нижняя шторка и формы: добавление и правка задач, событий, расходов, доходов, времени.
import * as S from './store.js';
import { h, today, addDays, parseNum } from './util.js';

// ---- шторка ----
let root = null;
let panel = null;
let isOpen = false;
let skipPop = false;

function ensure() {
  if (root) return;
  panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  root = h('div', { class: 'sheet-root', hidden: true }, h('div', { class: 'sheet-backdrop', onClick: closeSheet }), panel);
  document.body.append(root);
  window.addEventListener('popstate', () => {
    if (skipPop) {
      skipPop = false;
      return;
    }
    if (isOpen) hide();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeSheet();
  });
}
function hide() {
  isOpen = false;
  root.hidden = true;
  document.body.classList.remove('noscroll');
}
export function openSheet(title, ...content) {
  ensure();
  const body = h('div', { class: 'sheet-body' }, ...content);
  panel.replaceChildren(
    h('div', { class: 'sheet-grip' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть', onClick: closeSheet }, '✕')),
    body,
  );
  if (!isOpen) {
    isOpen = true;
    root.hidden = false;
    document.body.classList.add('noscroll');
    history.pushState({ sheet: true }, '');
  }
  return body;
}
export function closeSheet() {
  if (!isOpen) return;
  hide();
  if (history.state && history.state.sheet) {
    skipPop = true;
    history.back();
  }
}

let toastTimer = 0;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---- мелкие элементы форм ----
export const field = (label, input, extra) => h('label', { class: 'field' + (extra ? ' ' + extra : '') }, h('span', { class: 'field-label' }, label), input);
export const chip = (label, active, onClick, color) =>
  h('button', { type: 'button', class: 'chip' + (active ? ' on' : ''), onClick }, color ? h('span', { class: 'dot', style: { background: color } }) : null, label);

export const KIND_LABEL = { task: 'Задача', event: 'Событие', expense: 'Расход', income: 'Доход', time: 'Время' };
const REPEAT_OPTIONS = [['', 'Не повторять'], ['daily', 'Каждый день'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц']];

// ---- универсальная форма по описанию полей ----
// fields: {key,label,type: text|num|date|time|select|chips|area|project|check|textarea, options, when, placeholder, optional}
export function simpleForm({ title, fields, values, onSave, onDelete, saveLabel = 'Сохранить', hint }) {
  const vals = { ...values };
  const err = h('div', { class: 'form-err', role: 'alert' });
  const form = h('form', { class: 'form', novalidate: true });
  const wraps = [];
  const refresh = () => wraps.forEach(({ f, el }) => (el.hidden = f.when ? !f.when(vals) : false));
  const projects = [];
  const fillProjects = () =>
    projects.forEach(({ f, sel }) => {
      const aid = vals[f.areaKey || 'area'];
      const list = aid ? S.projectsOf(aid) : S.get().projects;
      sel.replaceChildren(h('option', { value: '' }, 'Без проекта'), ...list.map((p) => h('option', { value: p.id }, p.name)));
      if (!list.some((p) => p.id === vals[f.key])) vals[f.key] = '';
      sel.value = vals[f.key];
    });

  if (hint) form.append(h('p', { class: 'muted' }, hint));
  for (const f of fields) {
    let el;
    const t = f.type;
    if (t === 'text' || t === 'num' || t === 'date' || t === 'time') {
      const input = h('input', { type: t === 'date' || t === 'time' ? t : 'text', inputmode: t === 'num' ? 'decimal' : null, maxlength: f.max || 120, placeholder: f.placeholder, value: vals[f.key] ?? '', onInput: (e) => ((vals[f.key] = e.target.value), refresh()) });
      el = field(f.label, input);
    } else if (t === 'textarea') {
      const ta = h('textarea', { rows: String(f.rows || 3), maxlength: f.max || 1000, placeholder: f.placeholder, value: vals[f.key] ?? '', onInput: (e) => (vals[f.key] = e.target.value) });
      el = field(f.label, ta);
    } else if (t === 'select') {
      const sel = h('select', { onChange: (e) => ((vals[f.key] = e.target.value), refresh()) }, f.options.map(([v, l]) => h('option', { value: v }, l)));
      sel.value = vals[f.key] ?? f.options[0][0];
      el = field(f.label, sel);
    } else if (t === 'chips' || t === 'area') {
      const opts = t === 'area' ? [...(f.optional ? [['', 'Все области', '']] : []), ...S.get().areas.map((a) => [a.id, a.name, a.color])] : f.options;
      const row = h('div', { class: 'chips' });
      const draw = () =>
        row.replaceChildren(
          ...opts.map(([v, l, c]) =>
            chip(l, vals[f.key] === v, () => {
              vals[f.key] = v;
              draw();
              if (t === 'area') fillProjects();
              refresh();
            }, c),
          ),
        );
      draw();
      el = h('div', { class: 'field' }, h('span', { class: 'field-label' }, f.label), row);
    } else if (t === 'project') {
      const sel = h('select', { onChange: (e) => (vals[f.key] = e.target.value) });
      projects.push({ f, sel });
      el = field(f.label, sel);
    } else if (t === 'check') {
      const b = chip(f.label, !!vals[f.key], () => {
        vals[f.key] = !vals[f.key];
        b.classList.toggle('on', !!vals[f.key]);
        refresh();
      });
      el = h('div', { class: 'chips' }, b);
    }
    wraps.push({ f, el });
    form.append(el);
  }
  fillProjects();
  refresh();
  form.append(err);
  const actions = h('div', { class: 'actions' });
  if (onDelete) actions.append(h('button', { type: 'button', class: 'btn danger', onClick: () => onDelete() }, 'Удалить'));
  actions.append(h('button', { type: 'submit', class: 'btn primary' }, saveLabel));
  form.append(actions);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = onSave(vals);
    if (typeof r === 'string' && r) err.textContent = r;
    else closeSheet();
  });
  openSheet(title, form);
  const first = form.querySelector('input[type=text]');
  if (first && !values?._noFocus) setTimeout(() => first.focus(), 60);
}

// ---- основная форма записи ----
export function itemForm(kind, item, opts = {}) {
  const st = S.get();
  const editing = !!item;
  const vals = {
    kind,
    title: item?.title || '',
    note: item?.note || '',
    date: item ? item.date || '' : opts.noDate ? '' : opts.date || today(),
    endDate: item?.endDate || '',
    time: item?.time || '',
    repeat: item?.repeat || '',
    until: item?.until || '',
    amount: item?.amount ? String(item.amount) : '',
    hours: item?.hours ? String(item.hours) : '',
    area: item?.area || opts.area || st.meta.lastArea,
    project: item?.project || opts.project || '',
    prio: !!item?.prio,
    tpl: false,
  };
  if (!st.areas.some((a) => a.id === vals.area)) vals.area = st.areas[0].id;

  const done = () => {
    if (opts.onDone) opts.onDone();
    else closeSheet();
  };

  function draw() {
    const k = vals.kind;
    const err = h('div', { class: 'form-err', role: 'alert' });
    const form = h('form', { class: 'form', novalidate: true });

    if (!editing) {
      form.append(
        h(
          'div',
          { class: 'seg seg-wrap' },
          Object.keys(KIND_LABEL).map((key) =>
            h(
              'button',
              {
                type: 'button',
                class: 'seg-btn' + (key === k ? ' on' : ''),
                onClick: () => {
                  vals.kind = key;
                  draw();
                },
              },
              KIND_LABEL[key],
            ),
          ),
        ),
      );
    }

    if (k === 'task' || k === 'event') {
      form.append(field(k === 'task' ? 'Что сделать' : 'Название', h('input', { type: 'text', maxlength: 120, value: vals.title, placeholder: k === 'task' ? 'Например: сдать отчёт' : 'Например: консультация', onInput: (e) => (vals.title = e.target.value) })));
    }
    if (k === 'expense' || k === 'income') {
      form.append(
        field('Сумма, ₽', h('input', { type: 'text', inputmode: 'decimal', value: vals.amount, placeholder: '0', onInput: (e) => (vals.amount = e.target.value) })),
        field(k === 'expense' ? 'На что' : 'Откуда', h('input', { type: 'text', maxlength: 120, value: vals.note, placeholder: k === 'expense' ? 'Например: бензин' : 'Например: заказ', onInput: (e) => (vals.note = e.target.value) })),
      );
    }
    if (k === 'time') {
      const hoursInput = h('input', { type: 'text', inputmode: 'decimal', value: vals.hours, placeholder: '0', onInput: (e) => (vals.hours = e.target.value) });
      form.append(
        field('Часы', hoursInput),
        h('div', { class: 'chips' }, ['0.5', '1', '1.5', '2', '3', '4'].map((x) => chip(x.replace('.', ','), false, () => ((vals.hours = x), (hoursInput.value = x))))),
        field('Чем занимался', h('input', { type: 'text', maxlength: 120, value: vals.note, placeholder: 'Например: курсовая', onInput: (e) => (vals.note = e.target.value) })),
      );
    }

    // дата
    const dateInput = h('input', { type: 'date', value: vals.date, onInput: (e) => ((vals.date = e.target.value), syncRepeat()) });
    const forward = k === 'task' || k === 'event';
    const quick = [chip('Сегодня', false, () => setDate(today())), chip(forward ? 'Завтра' : 'Вчера', false, () => setDate(addDays(today(), forward ? 1 : -1)))];
    if (k === 'task') quick.push(chip('Без даты', false, () => setDate('')));
    function setDate(d) {
      vals.date = d;
      dateInput.value = d;
      syncRepeat();
    }
    form.append(field(k === 'task' ? 'Срок' : 'Дата', dateInput), h('div', { class: 'chips' }, quick));

    // повторы
    let syncRepeat = () => {};
    if (k === 'event' || k === 'task') {
      const untilWrap = field('Повторять до (необязательно)', h('input', { type: 'date', value: vals.until, onInput: (e) => (vals.until = e.target.value) }));
      const endWrap = field('Последний день (если несколько дней)', h('input', { type: 'date', value: vals.endDate, onInput: (e) => (vals.endDate = e.target.value) }));
      const repeatSel = h('select', { onChange: (e) => ((vals.repeat = e.target.value), syncRepeat()) }, REPEAT_OPTIONS.map(([v, l]) => h('option', { value: v }, l)));
      const repeatWrap = field('Повтор', repeatSel);
      repeatSel.value = vals.repeat;
      syncRepeat = () => {
        const can = k === 'event' || !!vals.date;
        repeatWrap.hidden = !can;
        if (!can) vals.repeat = '';
        untilWrap.hidden = !vals.repeat;
        endWrap.hidden = k !== 'event' || !!vals.repeat;
      };
      if (k === 'event') form.append(field('Время (необязательно)', h('input', { type: 'time', value: vals.time, onInput: (e) => (vals.time = e.target.value) })));
      form.append(repeatWrap, untilWrap, endWrap);
      if (k === 'task') {
        form.append(
          h(
            'div',
            { class: 'chips' },
            chip('Важная', vals.prio, function () {
              vals.prio = !vals.prio;
              this.classList.toggle('on', vals.prio);
            }),
          ),
        );
      }
      syncRepeat();
    }

    // область и проект
    const projSel = h('select', { onChange: (e) => (vals.project = e.target.value) });
    const fillProjects = () => {
      projSel.replaceChildren(h('option', { value: '' }, 'Без проекта'), ...S.projectsOf(vals.area).map((p) => h('option', { value: p.id }, p.name)));
      if (!S.projectsOf(vals.area).some((p) => p.id === vals.project)) vals.project = '';
      projSel.value = vals.project;
    };
    const areaRow = h('div', { class: 'chips' });
    const drawAreas = () =>
      areaRow.replaceChildren(
        ...st.areas.map((a) =>
          chip(a.name, a.id === vals.area, () => {
            vals.area = a.id;
            drawAreas();
            fillProjects();
          }, a.color),
        ),
      );
    drawAreas();
    fillProjects();
    form.append(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Область'), areaRow), field('Проект', projSel));

    if (!editing) {
      form.append(
        h(
          'div',
          { class: 'chips' },
          chip('Сохранить как шаблон', vals.tpl, function () {
            vals.tpl = !vals.tpl;
            this.classList.toggle('on', vals.tpl);
          }),
        ),
      );
    }

    form.append(err);
    const actions = h('div', { class: 'actions' });
    if (editing) {
      actions.append(
        h(
          'button',
          {
            type: 'button',
            class: 'btn danger',
            onClick: () => {
              if (confirm('Удалить запись?')) {
                S.remove(item.kind || kind, item.id);
                done();
              }
            },
          },
          'Удалить',
        ),
      );
    }
    actions.append(h('button', { type: 'submit', class: 'btn primary' }, 'Сохранить'));
    form.append(actions);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = validate();
      if (msg) {
        err.textContent = msg;
        return;
      }
      save();
    });

    const body = openSheet(editing ? `Изменить: ${KIND_LABEL[k].toLowerCase()}` : 'Добавить', form);
    if (!editing) {
      const first = form.querySelector('input[type=text]');
      if (first) setTimeout(() => first.focus(), 60);
    }
    body.scrollTop = 0;
  }

  function validate() {
    const k = vals.kind;
    if ((k === 'task' || k === 'event') && !vals.title.trim()) return 'Напиши название.';
    if (k !== 'task' && !vals.date) return 'Выбери дату.';
    if ((k === 'expense' || k === 'income') && !(parseNum(vals.amount) > 0)) return 'Сумма должна быть больше нуля.';
    if (k === 'time') {
      const x = parseNum(vals.hours);
      if (!(x > 0) || x > 24) return 'Часы: число от 0 до 24.';
    }
    if ((k === 'event' || k === 'task') && vals.repeat && vals.until && vals.until < vals.date) return 'Повтор до даты раньше начала.';
    return '';
  }

  function save() {
    const k = vals.kind;
    const base = { area: vals.area, project: vals.project };
    let data;
    if (k === 'task') {
      data = { ...base, title: vals.title.trim(), date: vals.date || null, prio: vals.prio ? 1 : 0, repeat: vals.date ? vals.repeat : '', until: vals.date && vals.repeat && vals.until ? vals.until : null };
      if (!editing) Object.assign(data, { done: false, doneAt: '' });
    } else if (k === 'event')
      data = {
        ...base,
        title: vals.title.trim(),
        date: vals.date,
        endDate: !vals.repeat && vals.endDate && vals.endDate > vals.date ? vals.endDate : null,
        time: vals.time,
        repeat: vals.repeat,
        until: vals.repeat && vals.until ? vals.until : null,
      };
    else if (k === 'time') data = { ...base, date: vals.date, hours: parseNum(vals.hours), note: vals.note.trim() };
    else data = { ...base, date: vals.date, amount: parseNum(vals.amount), note: vals.note.trim() };

    if (editing) S.update(item.kind || kind, item.id, data);
    else {
      S.add(k, data);
      if (vals.tpl) {
        const label = (vals.note || vals.title || KIND_LABEL[k]).trim().slice(0, 30);
        S.addTemplate({ kind: k, label, area: vals.area, project: vals.project, amount: k === 'expense' || k === 'income' ? parseNum(vals.amount) : 0, hours: k === 'time' ? parseNum(vals.hours) : 0, note: (vals.note || '').trim() });
      }
    }
    toast('Сохранено');
    done();
  }

  draw();
}

// ---- области и проекты ----
export function areaForm(a) {
  simpleForm({
    title: a ? 'Область' : 'Новая область',
    values: { name: a?.name || '', color: a?.color || S.PALETTE[S.get().areas.length % S.PALETTE.length] },
    fields: [
      { key: 'name', label: 'Название области', type: 'text', max: 40 },
      { key: 'color', label: 'Цвет', type: 'chips', options: S.PALETTE.map((c) => [c, '', c]) },
    ],
    onSave: (v) => {
      if (!v.name.trim()) return 'Напиши название.';
      if (a) S.updateArea(a.id, { name: v.name.trim().slice(0, 40), color: v.color });
      else S.addArea(v.name, v.color);
    },
  });
}

export function projectForm(p, areaId) {
  simpleForm({
    title: p ? 'Проект' : 'Новый проект',
    values: { name: p?.name || '', deadline: p?.deadline || '', order: !!p?.order, price: p?.price ? String(p.price) : '', done: !!p?.done },
    fields: [
      { key: 'name', label: 'Название проекта', type: 'text', max: 60 },
      { key: 'deadline', label: 'Срок (необязательно)', type: 'date' },
      { key: 'order', label: 'Это заказ (считать доход за час)', type: 'check' },
      { key: 'price', label: 'Сумма по договору, ₽ (необязательно)', type: 'num', when: (v) => v.order },
      { key: 'done', label: 'Завершён', type: 'check' },
    ],
    onSave: (v) => {
      if (!v.name.trim()) return 'Напиши название.';
      const data = { name: v.name.trim().slice(0, 60), deadline: v.deadline || '', order: !!v.order, price: v.order ? Math.max(0, parseNum(v.price) || 0) : 0, done: !!v.done };
      if (p) S.updateProject(p.id, data);
      else S.addProject({ ...data, area: areaId });
    },
    onDelete: p
      ? () => {
          if (confirm('Удалить проект? Записи останутся, но без проекта.')) {
            S.removeProject(p.id);
            closeSheet();
          }
        }
      : null,
  });
}
