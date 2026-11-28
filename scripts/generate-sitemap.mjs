// Regenerates public/sitemap.xml from the live Firestore blogPosts collection.
// Runs automatically before every build (see "prebuild" in package.json), so a
// new article appears in the sitemap on the next deploy with no manual edit.
//
// How it works: the blog lives in Firestore, not in this repo, so the script
// queries the public Firestore REST API for published posts. Blog posts are
// publicly readable (firestore.rules allows read when published == true), and
// the query filters on published == true, which is what the rules require.
// It uses the same public web API key the frontend already ships in
// firebase-applet-config.json. No service account, no billing, no secrets.
//
// Fail-safe by design: if the fetch fails, returns zero posts, or anything
// unexpected happens, the script prints a warning and exits 0 WITHOUT
// touching the existing sitemap.xml, so a network hiccup can never break a
// deploy. The old sitemap simply stays in place until the next successful run.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'firebase-applet-config.json');
const SITEMAP_PATH = join(ROOT, 'public', 'sitemap.xml');
const SITE = 'https://downmyvid.com';

// Static pages and their lastmod dates, kept from the hand-built sitemap.
// "/" and "/blog" get the newest article date instead (set below).
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: null }, // newest article
  { path: '/x-video-downloader', lastmod: '2026-11-18', changefreq: 'monthly', priority: '0.9' },
  { path: '/instagram-video-downloader', lastmod: '2026-11-18', changefreq: 'monthly', priority: '0.9' },
  { path: '/facebook-video-downloader', lastmod: '2026-11-18', changefreq: 'monthly', priority: '0.9' },
  { path: '/tiktok-downloader', lastmod: '2026-11-21', changefreq: 'monthly', priority: '0.9' },
  { path: '/threads-downloader', lastmod: '2026-11-21', changefreq: 'monthly', priority: '0.9' },
  { path: '/guides', lastmod: '2026-11-18', changefreq: 'monthly', priority: '0.7' },
  { path: '/blog', changefreq: 'weekly', priority: '0.8', lastmod: null }, // newest article
  { path: '/terms', lastmod: '2026-11-26', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', lastmod: '2026-11-26', changefreq: 'monthly', priority: '0.5' },
];

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function fetchPublishedPosts(config) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${config.projectId}` +
    `/databases/${config.firestoreDatabaseId}/documents:runQuery?key=${config.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'blogPosts' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'published' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Firestore query failed: HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Firestore query returned an unexpected shape');
  const posts = [];
  for (const row of rows) {
    const doc = row.document;
    if (!doc || !doc.fields) continue;
    const slug = doc.fields.slug?.stringValue ?? '';
    if (!SLUG_RE.test(slug)) continue;
    const publishedAt = doc.fields.publishedAt?.stringValue ?? doc.fields.publishedAt?.timestampValue ?? doc.updateTime ?? '';
    if (typeof publishedAt !== 'string' || publishedAt.length < 10) continue;
    posts.push({ slug, publishedAt, lastmod: publishedAt.slice(0, 10) });
  }
  // Dedupe by slug, keep the newest lastmod if a slug ever appears twice.
  const bySlug = new Map();
  for (const post of posts) {
    const existing = bySlug.get(post.slug);
    if (!existing || post.publishedAt > existing.publishedAt) bySlug.set(post.slug, post);
  }
  // Sort by full publish timestamp, so same-day articles stay in publish order.
  return [...bySlug.values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

function buildSitemap(posts) {
  const newest = posts.length ? posts[posts.length - 1].lastmod : new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<!-- Generated ${today} by scripts/generate-sitemap.mjs: ${STATIC_PAGES.length} static pages + ${posts.length} articles = ${STATIC_PAGES.length + posts.length} URLs. -->`,
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const page of STATIC_PAGES) {
    const lastmod = page.lastmod ?? newest;
    lines.push(
      '  <url>',
      `    <loc>${SITE}${escapeXml(page.path)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>${page.changefreq}</changefreq>`,
      `    <priority>${page.priority}</priority>`,
      '  </url>',
    );
  }
  for (const post of posts) {
    lines.push(
      '  <url>',
      `    <loc>${SITE}/blog/${escapeXml(post.slug)}</loc>`,
      `    <lastmod>${post.lastmod}</lastmod>`,
      '    <changefreq>monthly</changefreq>',
      '    <priority>0.7</priority>',
      '  </url>',
    );
  }
  lines.push('</urlset>');
  return lines.join('\n') + '\n';
}

async function main() {
  let config;
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[sitemap] Could not read ${CONFIG_PATH}: ${err.message}. Keeping existing sitemap.`);
    return;
  }
  if (!config.projectId || !config.apiKey || !config.firestoreDatabaseId) {
    console.warn('[sitemap] Firebase config is missing projectId, apiKey or firestoreDatabaseId. Keeping existing sitemap.');
    return;
  }
  let posts;
  try {
    posts = await fetchPublishedPosts(config);
  } catch (err) {
    console.warn(`[sitemap] Could not fetch published posts: ${err.message}. Keeping existing sitemap.`);
    return;
  }
  if (posts.length === 0) {
    console.warn('[sitemap] Firestore returned zero published posts, which looks like a bad read. Keeping existing sitemap.');
    return;
  }
  const xml = buildSitemap(posts);
  if (existsSync(SITEMAP_PATH) && readFileSync(SITEMAP_PATH, 'utf8') === xml) {
    console.log(`[sitemap] Unchanged: ${STATIC_PAGES.length + posts.length} URLs (${posts.length} articles).`);
    return;
  }
  writeFileSync(SITEMAP_PATH, xml, 'utf8');
  console.log(`[sitemap] Wrote ${SITEMAP_PATH}: ${STATIC_PAGES.length + posts.length} URLs (${posts.length} articles).`);
}

await main();
