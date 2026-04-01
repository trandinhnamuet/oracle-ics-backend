#!/usr/bin/env bash
set -euo pipefail

# Simple deploy script for Ubuntu
# Steps: git pull <branch>, install deps if lockfile present, run build, pm2 restart <folder-name>
# Usage: ./deploy-ubuntu.sh [branch] [build-cmd] [pm2-name]
# Defaults: branch=current git branch, build-cmd="npm run build", pm2-name=current folder name

BRANCH=${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")}
BUILD_CMD=${2:-"npm run build"}
PM2_NAME=${3:-$(basename "$PWD")}

echo "Deploy starting: app='${PM2_NAME}' branch='${BRANCH}' build='${BUILD_CMD}'"

if ! command -v git >/dev/null 2>&1; then
  echo "git command not found; aborting"
  exit 1
fi

# Pull latest
echo "Fetching and pulling latest from origin/${BRANCH}..."
git fetch origin "${BRANCH}" --quiet || true
# try to checkout branch if present locally
git checkout "${BRANCH}" 2>/dev/null || true
git pull origin "${BRANCH}"

# Install deps if lockfile found
if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
  echo "Detected pnpm-lock.yaml -> running pnpm install"
  pnpm install --prefer-offline --no-audit --silent || pnpm install
elif [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then
  echo "Detected package-lock.json -> running npm ci"
  npm ci --silent || npm install --silent
elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
  echo "Detected yarn.lock -> running yarn install"
  yarn install --silent
fi

# Build
echo "Running build command: ${BUILD_CMD}"
eval "${BUILD_CMD}"

# Restart pm2
if command -v pm2 >/dev/null 2>&1; then
  if pm2 list | grep -qE "[[:space:]]${PM2_NAME}[[:space:]]"; then
    echo "Restarting pm2 process '${PM2_NAME}'"
    pm2 restart "${PM2_NAME}"
  else
    echo "PM2 process '${PM2_NAME}' not found — attempting to start via 'npm start'"
    if [ -f package.json ] && grep -q '"start"' package.json; then
      pm2 start npm --name "${PM2_NAME}" -- start
    else
      echo "No 'start' script found in package.json, cannot start with pm2 automatically"
    fi
  fi
else
  echo "pm2 not installed or not in PATH. Please install pm2 globally: 'npm i -g pm2'"
  exit 1
fi

echo "Deploy finished."
