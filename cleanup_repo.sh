#!/usr/bin/env bash
# cleanup_repo.sh — clean up the Aakar git repo (delete obsolete files), commit and push.
#
# Run it from the ROOT of your local clone, after you have copied the new files in yourself
# (app/index.html and the tutorials .json):
#
#     bash cleanup_repo.sh [--dry-run] [--aggressive] [--sync-root-index] [--yes] [--no-push]
#
#   --dry-run          list what would be deleted, change nothing
#   --aggressive       ALSO delete src/ (stale readable copies), root occt/ and kernel/dist/ (build output)
#   --sync-root-index  copy app/index.html over the root index.html (GitHub Pages copy; it is usually older)
#   --yes              do not ask for confirmation
#   --no-push          commit locally only
#
# Safety: a backup tag (backup-before-cleanup-<time>) is created and pushed BEFORE anything is deleted.
# Restore anything with:   git checkout <tag> -- <path>
set -euo pipefail
DRY=0; AGG=0; SYNC=0; YES=0; PUSH=1
for a in "$@"; do case "$a" in
  --dry-run) DRY=1;; --aggressive) AGG=1;; --sync-root-index) SYNC=1;; --yes) YES=1;; --no-push) PUSH=0;;
  -h|--help) sed -n 2,17p "${BASH_SOURCE[0]}"; exit 0;; *) echo "Unknown option $a"; exit 2;; esac; done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Run this inside your Aakar git clone."; exit 1; }
cd "$(git rev-parse --show-toplevel)"
[ -f app/index.html ] || { echo "app/index.html not found - copy the new index.html into app/ first."; exit 1; }
VER="$(grep -o '<title>Aakar [0-9.]*' app/index.html | head -1 | sed 's/<title>Aakar //')"
BR="$(git rev-parse --abbrev-ref HEAD)"
echo "== Repo: $(pwd)   branch: $BR   app version: ${VER:-unknown}"

DEL_SAFE=(
  "files"                                  # old 8.10/8.12 duplicate snapshot of app/, main.js, tests ...
  "camtab"                                 # 8.15.1 follow-up (own 2.8 MB index.html + patch script)
  "Py Patch"                               # one-off patch / test scripts used to build earlier versions
  "patches"                                # sketch-tools patch fragment (already inside the app)
  "0001-Aakar-8.12-UI-styles-merged-workspaces.patch"
  "0002-Make-OpenCascade-available-in-the-desktop-build.patch"
  "0003-NURBS-add-G3-continuity.patch"
  "0004-Exact-kernel-add-SMLib-engine.patch"
  "PUSH_INSTRUCTIONS.txt"                  # outdated 8.11 upload notes
  "README_KERNEL_PUSH.txt"                 # outdated 8.11 upload notes
  "build-windows.yml"                      # stray copy; the real one is .github/workflows/build-windows.yml
  "kernel-tests.yml"                       # stray copy; the real one is .github/workflows/kernel-tests.yml
  "app/RELEASE_NOTES_8.13.0.md"
  "tools/build-8.14.0.bat"
  "tools/build-8.14.0.js"
  "docs/WHATS_NEW_8_10.md"
  "docs/WHATS_NEW_8_12.md"
)
DEL_AGG=( "src" "occt" "kernel/dist" )     # addons/ is kept on purpose: tests/ loads it
DEL=("${DEL_SAFE[@]}"); [ $AGG -eq 1 ] && DEL+=("${DEL_AGG[@]}")
# old tutorials folder is removed only when you put a newer tutorials file next to the app
if ls app/*utorial*.json >/dev/null 2>&1 && [ -d Aakar_Tutorials ]; then DEL+=("Aakar_Tutorials"); fi

echo; echo "== PLAN"
for p in "${DEL[@]}"; do if [ -e "$p" ]; then echo "  DELETE   $p"; else echo "  (absent) $p"; fi; done
[ $SYNC -eq 1 ] && echo "  REPLACE  index.html  <- app/index.html"
echo "  UPDATE   .gitignore (node_modules, dist, downloaded occt-wasm files)"
[ -f package.json ] && [ -n "$VER" ] && echo "  UPDATE   package.json version -> $VER (test.js checks it matches the app)"
[ $DRY -eq 1 ] && { echo; echo "Dry run - nothing changed."; exit 0; }
if [ $YES -ne 1 ]; then read -r -p "Proceed? A backup tag is created first. Type yes: " ans; [ "$ans" = "yes" ] || { echo Aborted.; exit 1; }; fi

TAG="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
git add -A; git diff --cached --quiet || git commit -q -m "Add new app / tutorials before cleanup"
git tag "$TAG"; [ $PUSH -eq 1 ] && git push -q origin "$TAG" && echo "== Backup tag pushed: $TAG"

for p in "${DEL[@]}"; do git rm -r -q --ignore-unmatch -- "$p"; rm -rf -- "./$p" 2>/dev/null || true; done
[ $SYNC -eq 1 ] && cp app/index.html index.html
if [ -f package.json ] && [ -n "$VER" ] && command -v node >/dev/null; then
  node -e "const fs=require('fs');let s=fs.readFileSync('package.json','utf8');s=s.replace(/\"version\":\s*\"[^\"]*\"/,'\"version\": \"$VER\"');fs.writeFileSync('package.json',s)"
  [ -f package-lock.json ] && node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('package-lock.json','utf8'));j.version='$VER';if(j.packages&&j.packages[''])j.packages[''].version='$VER';fs.writeFileSync('package-lock.json',JSON.stringify(j,null,2)+'\n')}catch(e){}"
fi
touch .gitignore
for l in "node_modules/" "dist/" "*.log" ".DS_Store" "app/occt/occt-wasm.js" "app/occt/occt-wasm.wasm" "app/occt/occt-wasm-manifest.json"; do grep -qxF "$l" .gitignore || echo "$l" >> .gitignore; done

git add -A
if git diff --cached --quiet; then echo "Nothing more to commit."; exit 0; fi
git commit -q -m "Clean up repo: remove obsolete snapshots, applied patches, stray duplicates and one-off scripts"
git show --stat --oneline HEAD | tail -n 12 | cut -c1-110
if [ $PUSH -eq 1 ]; then git push origin "$BR" && echo "== Pushed. Undo any deletion with: git checkout $TAG -- <path>"; else echo "== Committed locally (not pushed)."; fi
