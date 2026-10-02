/* Аналітика кліків (dataLayer і Meta Pixel). Схема подій взята з живого лендингу (коміт 19854f5, ANALYTICS_AUDIT.md): імена подій, параметри
   і значення placement не змінюємо, щоб не розірвати історію в GTM і GA4. Нове проти живого сайту:
   - page_location, item_name, item_category, item_variant, value у події booking_click (беруться з data-атрибутів кнопки броні);
   - Meta Pixel ViewContent на сторінках об'єктів (номери, котеджі, Барн-хаус, баня) за контекстом сторінки page_context;
   - phone_number береться з самого посилання tel:, а не з тексту скрипта.
   Місце кліку (placement) = data-placement найближчого предка. Сам скрипт нічого не зберігає і нічого не вантажить: тільки dataLayer.push і fbq.
   InitiateCheckout це проксі-конверсія (клік по броні, а не бронь: бронь відбувається на go.bookmenow.pro). */
(function () {
  'use strict';

  var dataLayer = (window.dataLayer = window.dataLayer || []);
  var PROMO_PLACEMENTS = { promo_modal_weekend: true, promo_section_weekend: true };
  var OBJECT_CATEGORIES = ['rooms', 'cottages', 'barn', 'banya'];

  // Піксель вантажить тег GTM, а GTM стартує при першій дії або через кілька секунд після load: подія кліку може випередити fbq.
  // Тоді подія чекає в черзі (до 20 секунд, перевірка раз на 250 мс) і відправляється, коли fbq з'явиться. Без пікселя (превью) черга просто згасає.
  var pixelQueue = [];
  var pixelTimer = null;
  var pixelTries = 0;
  function sendPixel(name, params) {
    try { window.fbq('track', name, params); } catch (err) { /* помилка пікселя не ламає сайт */ }
  }
  function flushPixel() {
    if (typeof window.fbq === 'function') {
      while (pixelQueue.length) { var item = pixelQueue.shift(); sendPixel(item[0], item[1]); }
      pixelTimer = null;
      return;
    }
    if (++pixelTries < 80) pixelTimer = setTimeout(flushPixel, 250);
    else { pixelQueue = []; pixelTimer = null; }
  }
  function pixel(name, params) {
    if (typeof window.fbq === 'function' && !pixelQueue.length) { sendPixel(name, params); return; }
    pixelQueue.push([name, params]);
    if (!pixelTimer) { pixelTries = 0; pixelTimer = setTimeout(flushPixel, 250); }
  }

  function placementOf(el) {
    var holder = el.closest('[data-placement]');
    return holder ? holder.getAttribute('data-placement') : 'general';
  }

  function textOf(el) {
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function bookingItem(link) {
    var out = {};
    var name = link.getAttribute('data-item-name');
    var category = link.getAttribute('data-item-category');
    var variant = link.getAttribute('data-item-variant');
    var value = Number(link.getAttribute('data-value'));
    if (name) out.item_name = name;
    if (category) out.item_category = category;
    if (variant) out.item_variant = variant;
    if (value > 0) out.value = value;
    return out;
  }

  function onClick(e) {
    var link = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!link) return;
    var href = (link.getAttribute('href') || '').trim();
    if (!href) return;

    var placement = placementOf(link);
    var text = textOf(link);

    // 1. Бронювання в BookmeNow
    if (href.indexOf('go.bookmenow.pro') !== -1) {
      var item = bookingItem(link);
      var booking = {
        event: 'booking_click',
        event_category: 'ecommerce',
        event_action: 'click_bookmenow',
        event_label: placement + ' | ' + text,
        placement: placement,
        link_url: href,
        page_location: window.location.pathname,
        item_name: undefined // dataLayer v2 пам'ятає минулі значення: скидаємо, якщо bookingItem не дасть назви (так само в подіях нижче)
      };
      for (var k in item) booking[k] = item[k];
      dataLayer.push(booking);
      dataLayer.push({ event: 'Bron_online_ga4', placement: placement }); // сумісність з тегом GTM попередньої агенції
      var checkout = { content_name: item.item_name || 'BookmeNow Booking', content_category: placement, currency: 'UAH' };
      if (item.value) checkout.value = item.value;
      pixel('InitiateCheckout', checkout);
      return;
    }

    // 2. Телефон
    if (href.indexOf('tel:') === 0) {
      var isPromoCall = !!PROMO_PLACEMENTS[placement];
      dataLayer.push({
        event: isPromoCall ? 'promo_booking_click' : 'tel_click',
        event_category: isPromoCall ? 'promotion' : 'contact',
        event_action: isPromoCall ? 'call_promo_booking' : 'click_phone',
        event_label: placement + ' | ' + text,
        placement: placement,
        phone_number: href.replace(/^tel:/, ''),
        link_url: href,
        item_name: undefined
      });
      dataLayer.push({ event: 'click_tel', placement: placement });
      dataLayer.push({ event: 'Click_tel_ga4', placement: placement });
      if (isPromoCall) pixel('Lead', { content_name: 'Знижка у будні Booking Call', content_category: placement, currency: 'UAH' });
      else pixel('Contact', { content_name: 'Phone Call', content_category: placement });
      return;
    }

    // 3. Instagram. Профіль: instagram_click. Direct (ig.me): instagram_direct_click, і кнопки акції теж (як на живому лендингу, відповідь Макса на питання 31).
    if (href.indexOf('instagram.com') !== -1 || href.indexOf('ig.me/') !== -1) {
      var isDirect = href.indexOf('ig.me/') !== -1;
      dataLayer.push({
        event: isDirect ? 'instagram_direct_click' : 'instagram_click',
        event_category: 'social',
        event_action: 'click_instagram',
        event_label: placement + ' | ' + text,
        placement: placement,
        link_url: href,
        item_name: undefined
      });
      dataLayer.push({ event: 'Click_inst_ga4', placement: placement });
      pixel('Contact', { content_name: isDirect ? 'Instagram Direct Message' : 'Instagram Profile View', content_category: placement });
      return;
    }

    // 4. Маршрут і карти
    if (href.indexOf('google.com/maps') !== -1 || href.indexOf('waze.com') !== -1) {
      dataLayer.push({
        event: 'map_route_click',
        event_category: 'navigation',
        event_action: 'get_directions',
        event_label: placement + ' | ' + (href.indexOf('waze') !== -1 ? 'waze' : 'google_maps'),
        placement: placement,
        link_url: href,
        item_name: undefined
      });
      pixel('FindLocation', { content_name: 'Route Directions', content_category: placement });
    }
  }

  // Клік ловимо на етапі занурення (true), як на живому сайті: подія записується до переходу за посиланням
  document.addEventListener('click', onClick, true);

  // ViewContent для Meta Pixel на сторінках об'єктів: один раз за сторінку, чекає появи fbq у черзі вище.
  function viewContent() {
    var ctx = null;
    for (var i = 0; i < dataLayer.length; i++) {
      if (dataLayer[i] && dataLayer[i].event === 'page_context') { ctx = dataLayer[i]; break; }
    }
    if (!ctx || OBJECT_CATEGORIES.indexOf(ctx.item_category) === -1) return;
    var params = { content_type: 'product', content_category: ctx.item_category, content_ids: ctx.content_ids || [], currency: 'UAH' };
    var from = parseInt(String(ctx.price_range || '').split('-')[0], 10);
    if (from > 0) params.value = from;
    pixel('ViewContent', params);
  }
  viewContent();
})();
