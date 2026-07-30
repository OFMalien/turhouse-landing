# Tur House - лендинг: деплой і передача

**Статус на 30.07.2026 (обновлено):** Макс посмотрел preview в стиле Amrit Palace (`index-amrit-preview.html`, parchment/saffron палитра, Cormorant Garamond + Manrope), подтвердил «заменяй», затем отдельным сообщением попросил «деплой». Оба шага теперь выполнять целиком - ШАГ 0-4.

**Важное открытие при подготовке промпта:** в `landing/.git` уже есть коммит `TurHouse landing page initial deploy` (29.07.2026 15:29, автор OFMalien) и настроен remote `origin = https://github.com/OFMalien/turhouse-landing.git`, ветка main синхронизирована с origin/main - то есть эта папка уже была запушена в GitHub в отдельной сессии Code, о которой не осталось записи в этой памяти/mozg. Значит репозиторий создавать заново НЕ нужно, только push поверх существующего. Включён ли уже GitHub Pages - не подтверждено: пытался проверить `https://ofmalien.github.io/turhouse-landing/` через web_fetch из Cowork дважды, оба раза таймаут без ответа - не смог подтвердить ни живой сайт, ни его отсутствие. Проверка и, если нужно, включение Pages - в ШАГ 3 ниже, силами Code (там есть настоящий терминал/curl/gh).

Файлы лежат в `Business_Brain/турхаус/landing/`: `index.html` (текущий боевой файл, палитра Botanical Garden - будет заменён), `index-amrit-preview.html` (новый вариант, подтверждён Максом 30.07.2026), `robots.txt`, `sitemap.xml`, `img/` (все фото настоящие, с IG-профиля @tur_house_ и сайта turhouse.com.ua).

Это только промпт и факты - файлы сайта из Cowork не трогаю. Правки и коммиты вносит Claude Code.

## 0. SEO - что уже сделано в HTML (проверять, не переделывать)

Уже внутри `index-amrit-preview.html` (будущий index.html после ШАГ 0 ниже): title, meta description, canonical, Open Graph + Twitter Card, JSON-LD `LodgingBusiness` (адрес, телефон, цены, рейтинг) и `FAQPage`, `robots.txt` + `sitemap.xml`, семантические h1/h2/h3, alt-текст с ценой на всех фото, `loading="lazy"`, сжатые картинки, явный `meta name="robots"`. Не хватает одной вещи - аналитики (счётчиков). Промпт ниже закрывает это плюс саму замену файла.

## 1. Промпт для Claude Code (замена стиля + аналитика, один заход)

Скопируй целиком в сессию Claude Code с доступом к терминалу и git:

```
Работай с папкой Business_Brain/турхаус/landing/ - это боевой лендинг Tur House.

ШАГ 0. Замена стиля на Amrit Palace (подтверждено Максом 30.07.2026 - "заменяй").
index-amrit-preview.html - новый боевой вариант, index.html - старый (Botanical Garden), его заменяем.
Выполни:
  cd Business_Brain/турхаус/landing/
  git rm index.html
  git mv index-amrit-preview.html index.html
  git add -A
  git commit -m "Restyle landing: Amrit Palace design system (replaces Botanical Garden)"
Старая версия остаётся в git-истории (git show HEAD~1:index.html) - отдельно архивировать не нужно.

ШАГ 1. Аналитика.
На живом сайте turhouse.com.ua уже установлены счётчики - у нового лендинга должны быть ТЕ ЖЕ ID, иначе Facebook-аудитория ретаргетинга и история GA4 обнулятся:
- Google Tag Manager: GTM-PRF3SNG и GTM-T97JFZCZ (два контейнера, оба уже есть на текущем сайте)
- GA4 Measurement ID: G-RWX7MNNYCQ (скорее всего срабатывает через сами GTM-контейнеры - отдельный gtag.js добавлять не нужно, иначе будет двойной счёт визитов)
- Meta Pixel: 690535919525806

Вставь стандартный multi-container GTM-сниппет:

В <head>, как можно выше (сразу после <meta charset>):
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PRF3SNG');</script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-T97JFZCZ');</script>
<!-- End Google Tag Manager -->

Сразу после открывающего <body>:
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PRF3SNG"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T97JFZCZ"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->

ШАГ 2. SEO-довеска.
Уже сделано в файле (проверь, что осталось после ШАГ 0, не добавляй повторно): <meta name="robots" content="index, follow">
Остальное (description, canonical, OG, JSON-LD, robots.txt, sitemap.xml) уже готово - не дублировать и не переписывать.

ШАГ 3. Деплой на GitHub Pages - репозиторий уже существует, НЕ создавай новый.
В .git уже настроен remote origin = https://github.com/OFMalien/turhouse-landing.git, ветка main, есть более ранний коммит "TurHouse landing page initial deploy" (29.07.2026) - то есть эта папка уже пушилась раньше. Поэтому:
1. НЕ создавай новый репозиторий и не переинициализируй git - используй существующий.
2. После коммита из ШАГ 0-2: git push origin main
3. Проверь, включён ли уже GitHub Pages для этого репо: gh api repos/OFMalien/turhouse-landing/pages (если gh авторизован) или зайди в Settings -> Pages в браузере.
   - Если уже включён - просто забери html_url оттуда.
   - Если не включён - включи: Settings -> Pages -> Source: Deploy from branch -> main -> /(root).
4. Ожидаемый URL: https://ofmalien.github.io/turhouse-landing/ - я (Cowork) пытался проверить его вживую дважды, оба раза таймаут без ответа, не смог подтвердить жив он или нет. Проверь сам.

ШАГ 4. Проверка.
1. curl -I по финальному URL и по каждой картинке в img/ - подтверди, что всё отдаёт 200.
2. curl -s по финальному URL | grep -c "GTM-PRF3SNG" и то же для GTM-T97JFZCZ - подтверди, что оба сниппета реально попали в отданный HTML (не только в исходник).
3. Пришли мне финальный URL и результат обеих проверок.
```

## 2. Что аналитика не закрывает кодом (это не в промпте выше, руками)

- **Индексация в Google - это не только код.** `robots.txt`/`sitemap.xml`/meta robots открывают дорогу, но саму индексацию запускает подача через Google Search Console: добавить домен как Property, подтвердить владение (DNS-запись или meta-тег from Search Console), отправить `sitemap.xml` во вкладке Sitemaps. Это делается в браузере на аккаунте клиента - Claude Code это не сделает, а я без доступа к его Google-аккаунту тоже.
- **GTM-контейнеры сами по себе - только доставщик.** Что именно теги GTM-PRF3SNG и GTM-T97JFZCZ шлют в GA4/Pixel, настроено внутри интерфейса Tag Manager (тут я не смотрел, доступа нет) - после деплоя стоит открыть GTM в Preview-режиме и проверить, что событие PageView реально долетает с нового домена.

## 3. Важно до показа клиенту

- **CTA "Перевірити вільні дати" ведёт на реальный BookmeNow клиента**: `https://go.bookmenow.pro/t/turhouse` (взят прямо с кнопки на turhouse.com.ua, проверен вживую 29.07.2026). Если клиент сменит систему бронирования - поменять во всех 3 местах (hero, sticky-cta, футер-кнопка).
- **canonical и og:image указывают на `https://turhouse.com.ua/`** - расчёт на то, что это боевая замена текущего сайта. Если сначала показываешь через GitHub Pages (промежуточный домен) - это нормально для демонстрации, но перед реальной публикацией по промежуточному адресу для чужого трафика (не для показа клиенту) стоит либо поменять canonical на реальный адрес хостинга, либо сразу заводить на домен клиента.
- Проверь на телефоне: первый экран без скролла, кнопка бронирования открывает BookmeNow, `tel:` открывает звонилку, липкая кнопка внизу не перекрывает контент, ссылки на Instagram и Google Карты открываются без логина.

## 4. Расхождения с аудитом, которые нашлись при сборе (важно)

- Аудит (`маркетинговый аудит(точка ноль).md`, п. 3 и 10.1) называет как P1-проблему: "відповідей власника немає (0 із 142)". При живом заходе в Google Карты 29.07.2026 увидел минимум 2 ответа владельца на отзывы (Вікторії Обручевої и Andy Andy), помеченные "Изменено 3 недели назад" - то есть примерно с 8 июля 2026, ДО даты аудита (28.07.2026). Стоит перепроверить перед тем, как показывать клиенту цифру "0 из 142" как жёсткий факт.
- Аудит (п. 2 и 7) называет Facebook Pixel ID **548259214495555**. При живом просмотре исходного кода turhouse.com.ua 29.07.2026 этого ID на странице нет вообще - реально установлен **690535919525806**. Похоже на опечатку или устаревшие данные в аудите. Для нового лендинга и для любых будущих кампаний ретаргетинга ориентироваться на реальный ID (690535919525806), не на тот, что в файле аудита - и стоит поправить сам файл аудита, если он ещё пойдёт клиенту в этом виде.

## 5. Список незакрытого (не стыд, а прайс следующего этапа)

- Только 3 карточки в галерее (великий будинок, банний ретрит, котеджі) + одно hero-фото. Нет отдельного кадра номеров (Стандарт/Напівлюкс/Люкс) - в IG есть пост с таким кадром, но не попал в подборку по времени; можно добить отдельным заходом.
- Фото котеджа (`cottage.jpg`) - атмосферное, с боке и авторской стрелкой из Reels клиента, не чистый предметный кадр. Для боевой версии можно заменить на более прямой кадр котеджа, если найдётся в новых постах.
- У Барн Хауса (8-12 осіб) до сих пор нет фиксированной цены - ни на сайте, ни в IG, ни в аудите. Лендинг честно показывает "за запитом", но это открытый вопрос к самому клиенту, не только к сайту.
- Блок отзывов - только 2 живые цитаты с Google (по 5/5). Можно расширить, когда будет время читать все 142.
- Домен: сайт живёт на промежуточном GitHub Pages адресе, пока клиент не даст доступ к DNS turhouse.com.ua. Подключение своего домена - отдельный пункт для допродажи, не включён в первую цену молча.
- Фото офиса/ресепшена и команды - в подборке нет, в IG на момент сбора тоже не нашлось явного кадра.
- Индексация в Google Search Console и проверка тегов в GTM Preview - руками, после деплоя (см. п. 2 выше).
