#!/usr/bin/env bash
# Публікація превью: збірка preview -> перевірка -> гілка gh-pages превью-репозиторію.
# Бойовий репозиторій OFMalien/turhouse-landing цим скриптом не чіпається (push лише у PREVIEW_REPO).
# Використання: scripts/publish-preview.sh [--dry-run]
#   --dry-run  зібрати і перевірити, нічого не публікувати.
set -euo pipefail

PREVIEW_REPO="OFMalien/turhouse-multipage-preview"
PREVIEW_URL="https://ofmalien.github.io/turhouse-multipage-preview/"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

SRC="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SRC"

# Node встановлений через nvm і може бути відсутній у PATH неінтерактивної оболонки.
if ! command -v node >/dev/null 2>&1; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1 || true)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi
command -v node >/dev/null 2>&1 || { echo "Node.js не знайдено" >&2; exit 1; }
GH="$(command -v gh 2>/dev/null || echo "$HOME/.local/bin/gh")"

echo "==> Збірка preview"
rm -rf _site
ELEVENTY_ENV=preview npx eleventy

echo "==> Перевірка _site"
node scripts/check-output.mjs preview

if [ "$DRY_RUN" = "1" ]; then
  echo "==> --dry-run: перевірку пройдено, публікацію пропущено"
  exit 0
fi

[ -x "$GH" ] || { echo "gh не знайдено ($GH)" >&2; exit 1; }
REMOTE_URL="https://github.com/${PREVIEW_REPO}.git"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Клон превью-репозиторію ($PREVIEW_REPO)"
git clone --quiet "$REMOTE_URL" "$WORK/repo"
cd "$WORK/repo"

# Охорона: публікуємо тільки у превью-репозиторій.
ORIGIN="$(git remote get-url origin)"
[ "$ORIGIN" = "$REMOTE_URL" ] || { echo "Невірний remote: $ORIGIN" >&2; exit 1; }
case "$ORIGIN" in *turhouse-landing*) echo "Відмова: це бойовий репозиторій" >&2; exit 1;; esac

# Гілка gh-pages заміщується вмістом _site повністю (orphan, без історії превью).
git checkout --quiet --orphan gh-pages
git rm -rf --quiet . 2>/dev/null || true
cp -R "$SRC/_site/." .
git config user.name "OFMalien"
git config user.email "ofmalien@github.com"
git add -A
git commit --quiet -m "Превью $(date '+%Y-%m-%d %H:%M'), збірка з $(git -C "$SRC" rev-parse --short HEAD)"

echo "==> Push у gh-pages"
git -c credential.helper= -c "credential.helper=!$GH auth git-credential" push --quiet --force origin gh-pages

echo "==> Готово. Превью: $PREVIEW_URL"
echo "    Pages збирається до пари хвилин після push."
