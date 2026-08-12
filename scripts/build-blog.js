#!/usr/bin/env node
/**
 * Build the public blog from the articles in `content/posts/`.
 *
 * The CMS publishes each article as a Markdown file with YAML frontmatter (title, date,
 * description) and the `body` field as the file body. This script renders them into a static
 * blog: the article list at the site root, one page per article under `posts/`, and a styled
 * 404 page. Output goes to `dist-site/`.
 *
 * Usage: node scripts/build-blog.js.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
import { parse as parseYAML } from 'yaml';

const CONTENT_DIR = 'content/posts';
const OUT_DIR = 'dist-site';
const SLUG_REGEX = /^[\w-]+$/;
const SITE_NAME = 'Hermanos del Agua';
const SITE_TAGLINE = 'Cinco hermanos defendiendo el agua en Elqui, Chile.';
const MAIN_SITE_URL = 'https://hermanosdelagua.cl';

/**
 * Parse the frontmatter and body of a CMS Markdown article.
 * @param {string} content Raw file content.
 * @returns {{ data: Record<string, any>, body: string } | undefined} Parsed article, or
 * `undefined` if the file is not a frontmatter Markdown file.
 */
const parseArticle = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return undefined;
  }

  let data = {};

  try {
    data = parseYAML(match[1]) ?? {};
  } catch {
    // Ignore articles with malformed frontmatter instead of breaking the whole build
    return undefined;
  }

  return { data, body: match[2].trim() };
};

/**
 * Escape a string for safe use inside HTML.
 * @param {unknown} value Value to escape.
 * @returns {string} Escaped string.
 */
const escapeHTML = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Format a date in Spanish.
 * @param {unknown} value Date value (ISO string or timestamp).
 * @param {'long' | 'short'} [style] Month style.
 * @returns {string} Formatted date.
 */
const formatDate = (value, style = 'long') => {
  const date = new Date(/** @type {string} */ (value));

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es-CL', {
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
  }).format(date);
};

/**
 * Base page layout with the shared header, navigation and footer.
 * @param {object} args Arguments.
 * @param {string} args.title Page title.
 * @param {string} args.content Page content.
 * @param {string} [args.description] Meta description.
 * @returns {string} Complete HTML document.
 */
const layout = ({ title, content, description }) => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index, follow" />
    <meta name="theme-color" content="#0a1628" />
    <meta name="description" content="${escapeHTML(description ?? SITE_TAGLINE)}" />
    <meta property="og:title" content="${escapeHTML(title)}" />
    <meta property="og:description" content="${escapeHTML(description ?? SITE_TAGLINE)}" />
    <meta property="og:type" content="website" />
    <title>${escapeHTML(title)}</title>
    <style>
      :root {
        --navy: #0a1628;
        --blue: #2e86ab;
        --green: #00bfa5;
        --amber: #f18f01;
        --cream: #fafaf6;
        --ink: #2d2d2d;
        --gray: #6b7280;
        --line: #e5e1d8;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        font-family: 'Georgia', 'Times New Roman', serif;
        background: var(--cream);
        color: var(--ink);
        line-height: 1.7;
        -webkit-font-smoothing: antialiased;
      }

      img {
        max-width: 100%;
        height: auto;
        display: block;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .nav {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.8rem 1.5rem;
        background: rgba(10, 22, 40, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.85rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      .nav-logo {
        color: #fff;
        font-weight: 700;
        font-size: 1rem;
        letter-spacing: 1px;
      }

      .nav-logo span {
        color: var(--green);
      }

      .nav-links {
        display: flex;
        gap: 1.5rem;
      }

      .nav-links a {
        color: rgba(255, 255, 255, 0.65);
        font-size: 0.8rem;
        letter-spacing: 1px;
        text-transform: uppercase;
        transition: color 0.2s;
      }

      .nav-links a:hover,
      .nav-links a.active {
        color: var(--green);
      }

      @media (max-width: 599px) {
        .nav {
          padding: 0.7rem 1rem;
        }

        .nav-links {
          gap: 1rem;
        }

        .nav-links a {
          font-size: 0.7rem;
        }
      }

      .hero {
        padding: 7.5rem 1.5rem 3.5rem;
        background:
          radial-gradient(ellipse at 20% 0%, rgba(46, 134, 171, 0.25) 0%, transparent 55%),
          radial-gradient(ellipse at 80% 100%, rgba(0, 191, 165, 0.14) 0%, transparent 50%),
          var(--navy);
        color: #fff;
        text-align: center;
      }

      .hero .kicker {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.75rem;
        letter-spacing: 4px;
        text-transform: uppercase;
        color: var(--amber);
        margin-bottom: 1rem;
      }

      .hero h1 {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: clamp(2rem, 7vw, 3.6rem);
        letter-spacing: 3px;
        margin-bottom: 0.75rem;
      }

      .hero .tagline {
        color: var(--green);
        font-style: italic;
        font-size: clamp(1rem, 2.5vw, 1.25rem);
      }

      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 3rem 1.5rem 4rem;
      }

      .articles h2 {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.8rem;
        letter-spacing: 3px;
        text-transform: uppercase;
        color: var(--gray);
        margin-bottom: 2rem;
      }

      .article {
        display: block;
        padding: 1.75rem 0;
        border-bottom: 1px solid var(--line);
        transition: padding-left 0.25s ease;
      }

      .article:hover {
        padding-left: 0.75rem;
      }

      .article time {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.78rem;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--gray);
      }

      .article h3 {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 1.45rem;
        margin: 0.4rem 0 0.5rem;
        line-height: 1.3;
        transition: color 0.2s;
      }

      .article:hover h3 {
        color: var(--blue);
      }

      .article p {
        color: #555;
        font-size: 0.98rem;
      }

      .article .more {
        display: inline-block;
        margin-top: 0.75rem;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.78rem;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--green);
      }

      .empty {
        text-align: center;
        padding: 4rem 1rem;
        color: var(--gray);
        font-style: italic;
      }

      .article-page header {
        margin-bottom: 2.5rem;
      }

      .article-page .back {
        display: inline-block;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.78rem;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--gray);
        margin-bottom: 2rem;
        transition: color 0.2s;
      }

      .article-page .back:hover {
        color: var(--green);
      }

      .article-page h1 {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: clamp(1.7rem, 5vw, 2.4rem);
        line-height: 1.25;
        margin-bottom: 0.75rem;
      }

      .article-page time {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 0.8rem;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--gray);
      }

      .article-page .lede {
        margin-top: 1.25rem;
        font-size: 1.15rem;
        font-style: italic;
        color: #555;
        border-left: 3px solid var(--green);
        padding-left: 1rem;
      }

      .article-body {
        font-size: 1.05rem;
      }

      .article-body h2,
      .article-body h3 {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        margin: 2rem 0 0.75rem;
        line-height: 1.3;
      }

      .article-body h2 {
        font-size: 1.4rem;
      }

      .article-body h3 {
        font-size: 1.15rem;
      }

      .article-body p {
        margin-bottom: 1.25rem;
      }

      .article-body a {
        color: var(--blue);
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .article-body a:hover {
        color: var(--green);
      }

      .article-body blockquote {
        margin: 1.5rem 0;
        padding: 0.75rem 1.25rem;
        border-left: 3px solid var(--amber);
        background: #f3efe6;
        font-style: italic;
        color: #555;
      }

      .article-body ul,
      .article-body ol {
        margin: 0 0 1.25rem 1.5rem;
      }

      .article-body li {
        margin-bottom: 0.4rem;
      }

      .article-body code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.9em;
        background: #f3efe6;
        padding: 0.15em 0.4em;
        border-radius: 4px;
      }

      .article-body pre {
        margin: 1.5rem 0;
        padding: 1rem 1.25rem;
        background: var(--navy);
        color: #e5e7eb;
        border-radius: 8px;
        overflow-x: auto;
      }

      .article-body pre code {
        background: none;
        padding: 0;
      }

      .article-body img {
        border-radius: 8px;
        margin: 1.5rem 0;
      }

      .article-body hr {
        border: none;
        border-top: 1px solid var(--line);
        margin: 2.5rem 0;
      }

      footer {
        background: var(--navy);
        color: rgba(255, 255, 255, 0.55);
        text-align: center;
        padding: 2.5rem 1.5rem;
        font-size: 0.85rem;
      }

      footer .brand {
        color: #fff;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-weight: 700;
        letter-spacing: 1px;
        margin-bottom: 0.5rem;
      }

      footer .brand span {
        color: var(--green);
      }

      footer a {
        color: var(--green);
      }

      footer a:hover {
        color: var(--amber);
      }

      .not-found {
        text-align: center;
        padding: 6rem 1.5rem;
      }

      .not-found h1 {
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 3rem;
        color: var(--blue);
        margin-bottom: 1rem;
      }
    </style>
  </head>
  <body>
    <nav class="nav">
      <a class="nav-logo" href="/">Hermanos <span>del Agua</span></a>
      <div class="nav-links">
        <a href="/" class="active">Artículos</a>
        <a href="${MAIN_SITE_URL}" target="_blank" rel="noopener">Sitio</a>
        <a href="/admin/">Panel</a>
      </div>
    </nav>
    ${content}
    <footer>
      <div class="brand">Hermanos <span>del Agua</span></div>
      <p>${escapeHTML(SITE_TAGLINE)}</p>
      <p>
        Artículos escritos desde el <a href="/admin/">panel del CMS</a> ·
        <a href="${MAIN_SITE_URL}" target="_blank" rel="noopener">hermanosdelagua.cl</a>
      </p>
    </footer>
  </body>
</html>`;

/**
 * Read all articles from the content directory.
 * @returns {Promise<Array<{ slug: string, title: string, date: string, description: string,
 * body: string, bodyHTML: string }>>} Articles sorted by date, newest first.
 */
const readArticles = async () => {
  if (!existsSync(CONTENT_DIR)) {
    return [];
  }

  const files = (await readdir(CONTENT_DIR)).filter(
    (name) => name.endsWith('.md') && SLUG_REGEX.test(name.replace(/\.md$/, '')),
  );

  const articles = (
    await Promise.all(
      files.map(async (name) => {
        const content = await readFile(path.join(CONTENT_DIR, name), 'utf-8');
        const parsed = parseArticle(content);

        if (!parsed) {
          // Skip files that are not valid CMS articles
          return undefined;
        }

        return {
          slug: name.replace(/\.md$/, ''),
          title: String(parsed.data.title ?? 'Sin título'),
          date: String(parsed.data.date ?? ''),
          description: String(parsed.data.description ?? ''),
          body: parsed.body,
        };
      }),
    )
  ).filter((article) => article);

  return articles
    .sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();

      return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
    })
    .map((article) => ({
      ...article,
      bodyHTML: DOMPurify.sanitize(marked.parse(article.body)),
    }));
};

await mkdir(OUT_DIR, { recursive: true });
await mkdir(path.join(OUT_DIR, 'posts'), { recursive: true });

const articles = await readArticles();

// Listado de artículos (portada)
const listItems = articles.length
  ? articles
      .map(
        (article) => `
      <a class="article" href="/posts/${article.slug}/">
        <time datetime="${escapeHTML(article.date)}">${escapeHTML(formatDate(article.date, 'short'))}</time>
        <h3>${escapeHTML(article.title)}</h3>
        ${article.description ? `<p>${escapeHTML(article.description)}</p>` : ''}
        <span class="more">Leer artículo →</span>
      </a>`,
      )
      .join('\n')
  : '<div class="empty">Aún no hay artículos publicados. Vuelve pronto.</div>';

const homeContent = `
  <header class="hero">
    <div class="kicker">Crónicas y reflexiones</div>
    <h1>${escapeHTML(SITE_NAME)}</h1>
    <p class="tagline">${escapeHTML(SITE_TAGLINE)}</p>
  </header>
  <main class="articles">
    <h2>Artículos</h2>
    ${listItems}
  </main>`;

await writeFile(
  path.join(OUT_DIR, 'index.html'),
  layout({ title: `${SITE_NAME} — Artículos`, content: homeContent }),
);

// Páginas de artículo
await Promise.all(
  articles.map(async (article) => {
    const content = `
  <main class="article-page">
    <a class="back" href="/">← Todos los artículos</a>
    <header>
      <h1>${escapeHTML(article.title)}</h1>
      <time datetime="${escapeHTML(article.date)}">${escapeHTML(formatDate(article.date))}</time>
      ${article.description ? `<p class="lede">${escapeHTML(article.description)}</p>` : ''}
    </header>
    <article class="article-body">
      ${article.bodyHTML}
    </article>
  </main>`;

    const dir = path.join(OUT_DIR, 'posts', article.slug);

    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'index.html'),
      layout({
        title: `${article.title} — ${SITE_NAME}`,
        content,
        description: article.description,
      }),
    );
  }),
);

// Página 404
const notFoundContent = `
  <main class="not-found">
    <h1>404</h1>
    <p>La página que buscas no existe.</p>
    <p><a class="back" href="/">← Volver a los artículos</a></p>
  </main>`;

await writeFile(
  path.join(OUT_DIR, '404.html'),
  layout({ title: `Página no encontrada — ${SITE_NAME}`, content: notFoundContent }),
);

// eslint-disable-next-line no-console
console.log(`Blog generado: ${articles.length} artículo(s) → ${OUT_DIR}/`);
