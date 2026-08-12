#!/usr/bin/env bash
#
# Build the complete site (CMS admin panel + public blog) into `dist-site/`.
# Shared by the local deploy script and the CI auto-deploy workflow.
set -euo pipefail

cd "$(dirname "$0")/.."

DIST="dist-site"

echo "Building the CMS bundle (pnpm via npx to ensure a supported version)..."
npx -y pnpm@latest build

echo "Assembling ${DIST}/..."
rm -rf "${DIST}"
mkdir -p "${DIST}/admin"

# Admin panel: host page, config and the IIFE bundle
cp admin/index.html "${DIST}/admin/index.html"
cp admin/config.yml "${DIST}/admin/config.yml"
cp package/dist/sveltia-cms.js "${DIST}/admin/sveltia-cms.js"

# Public blog: article list at the root, one page per article, and a 404 page
echo "Building the public blog from content/posts/..."
node scripts/build-blog.js

echo "Build complete. Output: ${DIST}/"
