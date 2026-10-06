// Каркас: навигация по вкладкам и разделам, перерисовка при изменении данных, тема, офлайн-режим.
import * as S from './store.js';
import * as V from './views.js';
import { PAGES } from './screens.js';
import * as F from './forms.js';
import { h, s } from './util.js';

const ICONS = {
  today: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12l3 3 5-6',
  plan: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  year: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  stats: 'M5 20V11 M12 20V4 M19 20v-6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
};
const TABS = [
  { id: 'today', label: 'Сегодня', view: V.todayView },
  { id: 'plan', label: 'План', view: V.planView },
  { id: 'year', label: 'Год', view: V.yearView },
  { id: 'stats', label: 'Анализ', view: V.statsView },
  { id: 'more', label: 'Ещё', view: V.moreView },
];

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let shown = null;

const routeFromHash = () => {
  const id = location.hash.slice(1);
  if (PAGES[id]) return { id, tab: 'more', view: PAGES[id] };
  const t = TABS.find((x) => x.id === id) || TABS[0];
  return { id: t.id, tab: t.id, view: t.view };
};

function applyTheme() {
  const t = S.get().meta.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function render() {
  const r = routeFromHash();
  const y = window.scrollY;
  const same = shown === r.id;
  let view;
  try {
    view = r.view();
  } catch (e) {
    console.error(e);
    view = h('div', { class: 'view' }, h('p', { class: 'warn' }, 'Этот экран не открылся из-за ошибки. Остальные работают, данные не тронуты.'), h('a', { href: '#today' }, 'На главный экран'));
  }
  if (S.didSaveFail()) view.prepend(h('div', { class: 'banner bad' }, 'Данные не сохраняются: память браузера недоступна или заполнена. Сделай копию в разделе «Ещё».'));
  app.replaceChildren(view);
  nav.replaceChildren(
    ...TABS.map((x) =>
      h('a', { href: '#' + x.id, class: 'nav-item' + (x.id === r.tab ? ' on' : ''), 'aria-current': x.id === r.tab ? 'page' : null }, s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: ICONS[x.id] })), h('span', {}, x.label)),
    ),
  );
  window.scrollTo(0, same ? y : 0);
  shown = r.id;
  applyTheme();
}

S.subscribe(render);
window.addEventListener('hashchange', render);
window.addEventListener('popstate', () => {
  // закрытие шторки кнопкой «назад» не должно перерисовывать вкладку
  if (shown !== routeFromHash().id) render();
});

document.getElementById('fab').addEventListener('click', () => F.itemForm(S.get().meta.lastKind, null));

render();

// Ярлыки с главного экрана: ?add=expense и т.п.
const want = new URLSearchParams(location.search).get('add');
if (want) {
  history.replaceState(null, '', location.pathname + location.hash);
  if (['task', 'event', 'expense', 'income', 'time'].includes(want)) F.itemForm(want, null);
}

try {
  navigator.storage?.persist?.();
} catch (e) {
  /* не критично */
}

if ('serviceWorker' in navigator) {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!local || location.search.includes('sw')) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
