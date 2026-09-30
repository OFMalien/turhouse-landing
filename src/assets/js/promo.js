/* Вікно акції (правило N6): один раз за сесію (sessionStorage), закриття хрестиком, Esc і кліком по підкладці,
   пастка фокуса, повернення фокуса. Показ через 6 секунд або коли прокручено 40% сторінки. */
(function () {
  var modal = document.getElementById('promo-modal');
  if (!modal) return;

  var dialog = modal.querySelector('.promo-modal__dialog');
  var closeBtn = modal.querySelector('.promo-modal__close');
  var root = document.documentElement;
  var KEY = modal.getAttribute('data-session-key') || 'th_promo_seen';
  var lastFocus = null;
  var done = false;
  var timer = null;

  function seen() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function isOpen() { return !modal.hidden; }

  function focusable() {
    return Array.prototype.slice.call(dialog.querySelectorAll('a[href], button:not([disabled])'));
  }

  function onKeydown(e) {
    if (!isOpen()) return;
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
    var active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open() {
    if (done || isOpen()) return;
    // Не перебиваємо відкрите мобільне меню.
    if (root.classList.contains('nav-open')) return;
    done = true;
    remember();
    cleanupTriggers();
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.classList.add('is-open');
    root.classList.add('modal-open');
    dialog.focus();
    document.addEventListener('keydown', onKeydown);
  }

  function close(returnFocus) {
    modal.classList.remove('is-open');
    modal.hidden = true;
    root.classList.remove('modal-open');
    document.removeEventListener('keydown', onKeydown);
    if (returnFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onScroll() {
    var max = document.body.scrollHeight - window.innerHeight;
    var reach = max > 0 ? window.scrollY / max : 0;
    if (reach > 0.4) open();
  }
  function cleanupTriggers() {
    clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
  }

  closeBtn.addEventListener('click', function () { close(true); });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(true); });
  // Кнопка акції й «Деталі акції»: закрити вікно, фокус не повертаємо (відкриється інша сторінка або якір).
  dialog.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (a) close(false);
  });

  // Для перевірки вручну: window.thPromoOpen() у консолі (працює і коли вікно вже показували).
  window.thPromoOpen = function () { done = false; open(); };

  // Уже бачили в цій сесії або прийшли на якір акції: не показуємо.
  if (seen() || window.location.hash === '#promo') { done = true; return; }

  timer = setTimeout(open, 6000);
  window.addEventListener('scroll', onScroll, { passive: true });
})();
