# Deployment GuideThis repository is a self-hosted fork of [Sveltia CMS](https://sveltiacms.app). The CMS admin

panel is deployed to Cloudflare Pages and authenticates editors through GitHub OAuth, handled by the [Sveltia CMS Authenticator](https://github.com/sveltia/sveltia-cms-auth) Cloudflare Worker.

- Public blog: `https://hermanos-del-agua-cms.pages.dev/`
- Admin panel: `https://hermanos-del-agua-cms.pages.dev/admin/`
- Auth worker: `https://sveltia-cms-auth.devfanatic.workers.dev`

## Architecture

```
Editors ──> hermanos-del-agua-cms.pages.dev/admin/  (static site, direct upload)
                 │
                 ├── admin/index.html     (host page, loads sveltia-cms.js)
                 ├── admin/sveltia-cms.js (built IIFE bundle)
                 └── admin/config.yml     (backend, collections)
                          │
                          ▼
              sveltia-cms-auth.devfanatic.workers.dev  (OAuth proxy)
                          │
                          ▼
                   github.com  ──>  content/posts/ in this repository
```

Articles written by editors are committed to `content/posts/` in this repository by the CMS. The public blog is generated from those files by `scripts/build-blog.js` (Markdown + YAML frontmatter rendered with `marked`, sanitized with `isomorphic-dompurify`).

**To publish new articles to the blog:** pull the latest `content/posts/` from the repository, then run the deploy script:

```bash
git pull
scripts/deploy-site.sh
```

## Automatic deployment

A GitHub Actions workflow (`.github/workflows/deploy-blog.yml`) deploys the blog automatically on every push to `main` that touches `content/`, `admin/`, `scripts/`, the workflow itself, or the package files. Since the CMS commits articles directly to `content/posts/`, **a published article is deployed without running anything manually**.

The workflow builds the site (`scripts/build-site.sh`) and uploads it with `cloudflare/wrangler-action`. It needs two things configured once:

1. Create a Cloudflare API token: <https://dash.cloudflare.com/profile/api-tokens> — use the **Edit Cloudflare Workers** template (it covers Pages deployments too), or a custom token with **Account → Cloudflare Pages → Edit** and **Account → Workers Scripts → Edit**.
2. Add it as a repository secret named `CLOUDFLARE_API_TOKEN` in <https://github.com/devfanatic-2026/hermanos-del-agua-cms/settings/secrets/actions>. The account ID is already hardcoded in the workflow.

Article-only commits skip the full test suite (`tests.yml` ignores `content/**`).

## Deploying the site

Prerequisites: Node 22.12+, `wrangler login`.

```bash
scripts/deploy-site.sh          # deploys to hermanos-del-agua-cms
scripts/deploy-site.sh other    # deploys to another project name
```

The script builds the bundle with `pnpm` (via `npx pnpm@latest`), assembles `dist-site/` (host page, config and bundle), creates the Pages project if needed, and uploads it with `wrangler pages deploy`. The output directory is `dist-site/` and the root URL redirects to `/admin/`.

## Deploying the auth worker

The worker was deployed from a clone of `https://github.com/sveltia/sveltia-cms-auth`. To redeploy (e.g. after updating it):

```bash
git clone https://github.com/sveltia/sveltia-cms-auth
cd sveltia-cms-auth
# Add the ALLOWED_DOMAINS variable (matches the site_id the CMS sends):
#   [vars]
#   ALLOWED_DOMAINS = "hermanos-del-agua-cms.pages.dev"
wrangler deploy
```

Then set the secrets (values come from the GitHub OAuth app):

```bash
echo "<CLIENT_ID>" | wrangler secret put GITHUB_CLIENT_ID
echo "<CLIENT_SECRET>" | wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

The GitHub OAuth app must have its **Authorization callback URL** set to `https://sveltia-cms-auth.devfanatic.workers.dev/callback`. Editors only need read/write access to this repository on GitHub to sign in and publish articles.

`admin/config.yml` points at the worker with `backend.base_url`.

## Notes

- **Publishing**: editors publish directly to `main` (simple workflow). Multi-user concurrency is not officially supported by Sveltia CMS — coordinate to avoid merge conflicts.
- **GitHub Actions**: the repository CI (`tests.yml`) runs on every push, including article commits made by the CMS. Keep it green.
- **Cloudflare Pages git integration**: not used. Deployments are direct uploads from `scripts/deploy-site.sh`.
