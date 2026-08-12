#!/usr/bin/env bash
#
# Build the site and deploy it to Cloudflare Pages.
#
# Usage:
#   scripts/deploy-site.sh [project-name]
#
# Requires: wrangler authenticated (`wrangler login`), Node 22.12+.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT_NAME="${1:-hermanos-del-agua-cms}"

bash scripts/build-site.sh

# Create the Pages project if it doesn't exist yet (ignore the "already exists" error)
echo "Ensuring the Pages project ${PROJECT_NAME} exists..."
wrangler pages project create "${PROJECT_NAME}" --production-branch main > /dev/null 2>&1 || true

echo "Deploying to Cloudflare Pages (${PROJECT_NAME})..."

# In CI the checkout is detached, so allow the branch to be passed explicitly
BRANCH_FLAG=''

if [ -n "${PAGES_BRANCH:-}" ]; then
  BRANCH_FLAG="--branch ${PAGES_BRANCH}"
fi

wrangler pages deploy "dist-site" --project-name "${PROJECT_NAME}" --commit-dirty=true ${BRANCH_FLAG}

echo "Done. Blog: https://${PROJECT_NAME}.pages.dev/ | Admin panel: https://${PROJECT_NAME}.pages.dev/admin/"
