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

/* Галерея номерів: перемикання вкладок (Стандарт, Напівлюкс, Люкс) і карусель фото. */
(function () {
  var tablist = document.querySelector('.gallery-tabs');
  if (!tablist) return;

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.gallery-panel'));

  function activateTab(tab, setFocus) {
    var targetId = tab.getAttribute('aria-controls');
    tabs.forEach(function (t) {
      var selected = t === tab;
      t.setAttribute('aria-selected', selected ? 'true' : 'false');
      t.classList.toggle('is-active', selected);
    });
    panels.forEach(function (p) {
      var match = p.id === targetId;
      if (match) {
        p.removeAttribute('hidden');
        p.classList.add('is-active');
        var vp = p.querySelector('.gallery-carousel__viewport');
        if (vp) vp.scrollTo({ left: 0, behavior: 'instant' });
      } else {
        p.setAttribute('hidden', '');
        p.classList.remove('is-active');
      }
    });
    if (setFocus) tab.focus();
  }

  tablist.addEventListener('click', function (e) {
    var tab = e.target.closest ? e.target.closest('[role="tab"]') : null;
    if (tab) activateTab(tab, false);
  });

  tablist.addEventListener('keydown', function (e) {
    var idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      var next = (idx + 1) % tabs.length;
      activateTab(tabs[next], true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = (idx - 1 + tabs.length) % tabs.length;
      activateTab(tabs[prev], true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      activateTab(tabs[0], true);
    } else if (e.key === 'End') {
      e.preventDefault();
      activateTab(tabs[tabs.length - 1], true);
    }
  });

  // Каруселі всередині панелей
  var carousels = document.querySelectorAll('[data-carousel]');
  carousels.forEach(function (carousel) {
    var vp = carousel.querySelector('.gallery-carousel__viewport');
    var track = carousel.querySelector('[data-carousel-track]');
    var prevBtn = carousel.querySelector('[data-carousel-prev]');
    var nextBtn = carousel.querySelector('[data-carousel-next]');
    var panel = carousel.closest('.gallery-panel') || carousel;
    var dotsContainer = panel.querySelector('[data-carousel-dots]');
    var dots = dotsContainer ? Array.prototype.slice.call(dotsContainer.querySelectorAll('.carousel-dot')) : [];
    var currentEl = panel.querySelector('[data-carousel-current]');
    var slides = track ? Array.prototype.slice.call(track.children) : [];

    if (!vp || slides.length <= 1) return;

    function getActiveIndex() {
      var scrollLeft = vp.scrollLeft;
      var slideWidth = vp.clientWidth;
      if (!slideWidth) return 0;
      var index = Math.round(scrollLeft / slideWidth);
      return Math.max(0, Math.min(index, slides.length - 1));
    }

    function updateUI() {
      var idx = getActiveIndex();
      if (currentEl) currentEl.textContent = String(idx + 1);
      dots.forEach(function (d, i) {
        d.classList.toggle('is-active', i === idx);
      });
    }

    function scrollToIndex(idx) {
      var target = Math.max(0, Math.min(idx, slides.length - 1));
      var slideWidth = vp.clientWidth;
      vp.scrollTo({ left: target * slideWidth, behavior: 'smooth' });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        var idx = getActiveIndex();
        var target = idx > 0 ? idx - 1 : slides.length - 1;
        scrollToIndex(target);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var idx = getActiveIndex();
        var target = idx < slides.length - 1 ? idx + 1 : 0;
        scrollToIndex(target);
      });
    }

    if (dotsContainer) {
      dotsContainer.addEventListener('click', function (e) {
        var dot = e.target.closest ? e.target.closest('.carousel-dot') : null;
        if (dot) {
          var dotIdx = dots.indexOf(dot);
          if (dotIdx !== -1) scrollToIndex(dotIdx);
        }
      });
    }

    var scrollTimer;
    vp.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(updateUI, 50);
    }, { passive: true });
  });
})();
