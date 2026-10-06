/* Мобільне меню: відкриття, закриття (Esc, хрестик, перехід за посиланням), пастка фокуса,
   повернення фокуса на кнопку, блокування прокрутки сторінки. */
(function () {
  var root = document.documentElement;
  var toggle = document.querySelector('.nav-toggle');
  var drawer = document.getElementById('nav-drawer');
  if (!toggle || !drawer) return;

  var closeBtn = drawer.querySelector('.drawer-close');
  var desktop = window.matchMedia('(min-width: 1280px)');

  function focusable() {
    return Array.prototype.slice.call(drawer.querySelectorAll('a[href], button:not([disabled])'));
  }

  function open() {
    drawer.removeAttribute('inert');
    drawer.classList.add('is-open');
    root.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function close(returnFocus) {
    drawer.classList.remove('is-open');
    drawer.setAttribute('inert', '');
    root.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown);
    if (returnFocus) toggle.focus();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'Tab') return;
    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  toggle.addEventListener('click', open);
  closeBtn.addEventListener('click', function () { close(true); });
  // Перехід за посиланням у меню: закрити, не повертаючи фокус (сторінка зміниться або прокрутиться до якоря).
  drawer.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (a) close(false);
  });
  // Якщо вікно розширили до десктопу, меню закриваємо.
  var onResize = function (e) { if (e.matches && drawer.classList.contains('is-open')) close(false); };
  if (desktop.addEventListener) desktop.addEventListener('change', onResize);
  else if (desktop.addListener) desktop.addListener(onResize);
})();

/* Шапка над фото першого екрана темнішає, коли прокручено 70% висоти екрана (як на боєвому лендингу). */
(function () {
  var header = document.querySelector('.has-hero-overlay .site-header');
  if (!header) return;
  function update() {
    header.classList.toggle('is-scrolled', window.scrollY > window.innerHeight * 0.7);
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();
