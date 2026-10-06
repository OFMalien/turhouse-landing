/* Карта «Як дістатися»: Google Карта вантажиться тільки після натискання кнопки (немає запитів до Google і сторонніх cookie до кліку).
   Адреса і підпис беруться з data-атрибутів контейнера, скрипт нічого не вигадує. */
(function () {
  var box = document.getElementById('map-box');
  var btn = document.getElementById('map-load');
  if (!box || !btn) return;

  btn.addEventListener('click', function () {
    var src = box.getAttribute('data-src');
    if (!src || box.classList.contains('is-loaded')) return;
    var frame = document.createElement('iframe');
    frame.className = 'map-box__frame';
    frame.src = src;
    frame.title = box.getAttribute('data-title') || '';
    frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    box.appendChild(frame);
    box.classList.add('is-loaded');
    btn.setAttribute('aria-expanded', 'true');
    btn.hidden = true;
    frame.focus();
  });
})();
