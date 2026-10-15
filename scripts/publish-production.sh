#!/usr/bin/env bash
# Викладка нового сайту на бойовий репозиторій: повна перевірка -> production-збірка -> гілка gh-pages.
# Скрипт НЕ перемикає джерело GitHub Pages і НЕ чіпає гілку main: живий сайт до перемикання показує старий лендинг.
# Перемикання і відкат - окремими командами (RELEASE_Multipage.md у папці клієнта).
# Використання:
#   scripts/publish-production.sh            перевірити все і зібрати, нічого не публікувати (за замовчуванням)
#   scripts/publish-production.sh --publish  те саме + push збірки в gh-pages бойового репозиторію (тільки за командою Макса «викладай»)
set -euo pipefail

PROD_REPO="OFMalien/turhouse-landing"
BRANCH="feature/eleventy-multipage"
PUBLISH=0
[ "${1:-}" = "--publish" ] && PUBLISH=1

SRC="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SRC"

if ! command -v node >/dev/null 2>&1; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1 || true)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "Node.js не знайдено" >&2; exit 1; }
GH="$(command -v gh 2>/dev/null || echo "$HOME/.local/bin/gh")"

# Збираємо тільки з чистої гілки нового сайту: у gh-pages має потрапити те, що закомічено.
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { echo "Потрібна гілка $BRANCH" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Є незакомічені зміни, спершу коміт" >&2; exit 1; }

echo "==> Перевірки превью-збірки"
rm -rf _site
ELEVENTY_ENV=preview npx eleventy --quiet
for c in output site images content tracking weight; do node "scripts/check-$c.mjs" preview; done
node scripts/check-pages.mjs preview --strict
node scripts/check-html.mjs
node scripts/check-data.mjs
node scripts/photos.mjs check
node scripts/check-contrast.mjs

echo "==> Production-збірка і її перевірки"
rm -rf _site
ELEVENTY_ENV=production npx eleventy --quiet
node scripts/check-output.mjs production
node scripts/check-jsonld.mjs production
[ "$(cat _site/CNAME)" = "turhouse.com.ua" ] || { echo "У збірці немає CNAME turhouse.com.ua" >&2; exit 1; }
[ -f _site/.nojekyll ] || { echo "У збірці немає .nojekyll" >&2; exit 1; }

BUILD_FROM="$(git rev-parse --short HEAD)"
if [ "$PUBLISH" = "0" ]; then
  echo "==> Перевірку пройдено, збірка з $BUILD_FROM у _site. Публікацію пропущено (потрібен --publish)."
  exit 0
fi

[ -x "$GH" ] || { echo "gh не знайдено ($GH)" >&2; exit 1; }
REMOTE_URL="https://github.com/${PROD_REPO}.git"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Клон $PROD_REPO"
git clone --quiet --no-checkout "$REMOTE_URL" "$WORK/repo"
cd "$WORK/repo"
[ "$(git remote get-url origin)" = "$REMOTE_URL" ] || { echo "Невірний remote" >&2; exit 1; }

# gh-pages зберігає історію збірок (без force-push): попередню версію нового сайту можна повернути комітом.
if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git checkout --quiet -b gh-pages origin/gh-pages
else
  git checkout --quiet --orphan gh-pages
fi
git rm -rf --quiet . 2>/dev/null || true
cp -R "$SRC/_site/." .
git config user.name "OFMalien"
git config user.email "ofmalien@github.com"
git add -A
if git diff --cached --quiet; then
  echo "==> gh-pages вже містить цю збірку, push не потрібен"
  exit 0
fi
git commit --quiet -m "Збірка нового сайту з $BUILD_FROM ($(date '+%Y-%m-%d %H:%M'))"

echo "==> Push у gh-pages (main і джерело Pages не змінюються)"
git -c credential.helper= -c "credential.helper=!$GH auth git-credential" push --quiet origin gh-pages
echo "==> Готово. Живий сайт досі зі старого лендингу. Перемикання - за RELEASE_Multipage.md."
