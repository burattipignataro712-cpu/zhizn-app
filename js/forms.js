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
const field = (label, input, extra) => h('label', { class: 'field' + (extra ? ' ' + extra : '') }, h('span', { class: 'field-label' }, label), input);
const chip = (label, active, onClick, color) =>
  h('button', { type: 'button', class: 'chip' + (active ? ' on' : ''), onClick }, color ? h('span', { class: 'dot', style: { background: color } }) : null, label);

export const KIND_LABEL = { task: 'Задача', event: 'Событие', expense: 'Расход', income: 'Доход', time: 'Время' };

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
    area: item?.area || st.meta.lastArea,
    project: item?.project || '',
    prio: !!item?.prio,
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

    // главное поле
    if (k === 'task' || k === 'event') {
      form.append(
        field(k === 'task' ? 'Что сделать' : 'Название', h('input', { type: 'text', maxlength: 120, value: vals.title, placeholder: k === 'task' ? 'Например: сдать отчёт' : 'Например: пара по логистике', onInput: (e) => (vals.title = e.target.value) })),
      );
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
        h(
          'div',
          { class: 'chips' },
          ['0.5', '1', '1.5', '2', '3', '4'].map((x) =>
            chip(x.replace('.', ','), false, () => {
              vals.hours = x;
              hoursInput.value = x;
            }),
          ),
        ),
        field('Чем занимался', h('input', { type: 'text', maxlength: 120, value: vals.note, placeholder: 'Например: курсовая', onInput: (e) => (vals.note = e.target.value) })),
      );
    }

    // дата
    const dateInput = h('input', { type: 'date', value: vals.date, onInput: (e) => (vals.date = e.target.value) });
    const quick = [chip('Сегодня', false, () => setDate(today())), chip(k === 'task' || k === 'event' ? 'Завтра' : 'Вчера', false, () => setDate(addDays(today(), k === 'task' || k === 'event' ? 1 : -1)))];
    if (k === 'task') quick.push(chip('Без даты', false, () => setDate('')));
    function setDate(d) {
      vals.date = d;
      dateInput.value = d;
    }
    form.append(field(k === 'task' ? 'Срок' : 'Дата', dateInput), h('div', { class: 'chips' }, quick));

    // особое для события
    if (k === 'event') {
      const untilWrap = field('Повторять до (необязательно)', h('input', { type: 'date', value: vals.until, onInput: (e) => (vals.until = e.target.value) }));
      const endWrap = field('Последний день (если несколько дней)', h('input', { type: 'date', value: vals.endDate, onInput: (e) => (vals.endDate = e.target.value) }));
      const sync = () => {
        untilWrap.hidden = !vals.repeat;
        endWrap.hidden = !!vals.repeat;
      };
      const repeatSel = h(
        'select',
        {
          value: vals.repeat,
          onChange: (e) => {
            vals.repeat = e.target.value;
            sync();
          },
        },
        [['', 'Не повторять'], ['daily', 'Каждый день'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц']].map(([v, l]) => h('option', { value: v }, l)),
      );
      repeatSel.value = vals.repeat;
      form.append(
        field('Время (необязательно)', h('input', { type: 'time', value: vals.time, onInput: (e) => (vals.time = e.target.value) })),
        field('Повтор', repeatSel),
        untilWrap,
        endWrap,
      );
      sync();
    }
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
    if (k === 'event' && vals.repeat && vals.until && vals.until < vals.date) return 'Повтор до даты раньше начала.';
    return '';
  }

  function save() {
    const k = vals.kind;
    const base = { area: vals.area, project: vals.project };
    let data;
    if (k === 'task') data = { ...base, title: vals.title.trim(), date: vals.date || null, prio: vals.prio ? 1 : 0, done: item?.done || false, doneAt: item?.doneAt || '' };
    else if (k === 'event')
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
    else S.add(k, data);
    toast('Сохранено');
    done();
  }

  draw();
}

// ---- области и проекты ----
export function areaForm(a) {
  const val = { name: a?.name || '', color: a?.color || S.PALETTE[S.get().areas.length % S.PALETTE.length] };
  const err = h('div', { class: 'form-err', role: 'alert' });
  const colors = h('div', { class: 'chips' });
  const drawColors = () =>
    colors.replaceChildren(
      ...S.PALETTE.map((c) =>
        h('button', { type: 'button', class: 'swatch' + (c === val.color ? ' on' : ''), 'aria-label': c, style: { background: c }, onClick: () => ((val.color = c), drawColors()) }),
      ),
    );
  drawColors();
  const form = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        if (!val.name.trim()) {
          err.textContent = 'Напиши название.';
          return;
        }
        if (a) S.updateArea(a.id, { name: val.name.trim().slice(0, 40), color: val.color });
        else S.addArea(val.name, val.color);
        closeSheet();
      },
    },
    field('Название области', h('input', { type: 'text', maxlength: 40, value: val.name, onInput: (e) => (val.name = e.target.value) })),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Цвет'), colors),
    err,
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Сохранить')),
  );
  openSheet(a ? 'Область' : 'Новая область', form);
}

export function projectForm(p, areaId) {
  const val = { name: p?.name || '' };
  const err = h('div', { class: 'form-err', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        if (!val.name.trim()) {
          err.textContent = 'Напиши название.';
          return;
        }
        if (p) S.updateProject(p.id, { name: val.name.trim().slice(0, 60) });
        else S.addProject(val.name, areaId);
        closeSheet();
      },
    },
    field('Название проекта', h('input', { type: 'text', maxlength: 60, value: val.name, onInput: (e) => (val.name = e.target.value) })),
    err,
    h(
      'div',
      { class: 'actions' },
      p
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn danger',
              onClick: () => {
                if (confirm('Удалить проект? Записи останутся, но без проекта.')) {
                  S.removeProject(p.id);
                  closeSheet();
                }
              },
            },
            'Удалить',
          )
        : null,
      h('button', { type: 'submit', class: 'btn primary' }, 'Сохранить'),
    ),
  );
  openSheet(p ? 'Проект' : 'Новый проект', form);
  if (!p) setTimeout(() => form.querySelector('input')?.focus(), 60);
}
