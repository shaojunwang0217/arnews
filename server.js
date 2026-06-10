const express = require('express');
const fs = require('fs');
const path = require('path');
const fm = require('front-matter');
const { marked } = require('marked');
const config = require('./config');

const app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(config.paths.public));

// ─── Helpers ─────────────────────────────────────────────────────

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(config.paths.registry, 'utf-8'));
  } catch { return { posts: [] }; }
}

function loadPost(slug) {
  const mdPath = path.join(config.paths.posts, slug + '.md');
  if (!fs.existsSync(mdPath)) return null;
  const raw = fs.readFileSync(mdPath, 'utf-8');
  const parsed = fm(raw);
  const html = marked.parse(parsed.body);
  return { ...parsed.attributes, slug, body: parsed.body, html };
}

function getAllPosts() {
  const registry = loadRegistry();
  return registry.posts
    .filter(p => p.published !== false)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  return new Date(dateStr).toUTCString();
}

function postUrl(slug) {
  return config.site.url + '/' + slug;
}

// ─── Routes ──────────────────────────────────────────────────────

// Homepage
app.get('/', (req, res) => {
  const posts = getAllPosts();
  res.render('index', {
    site: config.site,
    posts: posts.map(p => ({
      ...p,
      url: postUrl(p.slug),
      excerpt: p.description || p.body?.substring(0, 200).replace(/\n/g, ' ') + '…'
    })),
    path: req.path
  });
});

// Sitemap (before slug catch-all)
app.get('/sitemap.xml', (req, res) => {
  const posts = getAllPosts();
  const urls = [
    { loc: config.site.url + '/', priority: '1.0', changefreq: 'daily' },
    ...posts.map(p => ({
      loc: postUrl(p.slug),
      lastmod: p.date,
      priority: '0.8',
      changefreq: 'monthly'
    }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.map(u => `
  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('')}
</urlset>`;
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

// Health check (before slug catch-all)
app.get('/health', (req, res) => {
  const posts = getAllPosts();
  res.json({
    status: 'ok',
    posts: posts.length,
    publishedOnArweave: posts.filter(p => p.arweaveTxId).length
  });
});

// RSS feed
app.get('/feed/rss.xml', (req, res) => {
  const posts = getAllPosts().slice(0, 50);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.site.title)}</title>
    <link>${escapeXml(config.site.url)}</link>
    <description>${escapeXml(config.site.description)}</description>
    <language>${escapeXml(config.site.language)}</language>
    <lastBuildDate>${formatDate(new Date().toISOString())}</lastBuildDate>
    <atom:link href="${escapeXml(config.site.url)}/feed/rss.xml" rel="self" type="application/rss+xml"/>
    ${posts.map(p => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(postUrl(p.slug))}</link>
      <guid isPermaLink="true">${escapeXml(postUrl(p.slug))}</guid>
      <pubDate>${formatDate(p.date)}</pubDate>
      <description>${escapeXml(p.description || '')}</description>
      <author>${escapeXml(p.author || config.site.author)}</author>
      ${(p.tags || []).map(t => `<category>${escapeXml(t)}</category>`).join('\n      ')}
    </item>`).join('\n    ')}
  </channel>
</rss>`;
  res.set('Content-Type', 'application/rss+xml; charset=utf-8');
  res.send(xml);
});

// Atom feed
app.get('/feed/atom.xml', (req, res) => {
  const posts = getAllPosts().slice(0, 50);
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(config.site.title)}</title>
  <subtitle>${escapeXml(config.site.subtitle)}</subtitle>
  <link href="${escapeXml(config.site.url)}" rel="alternate"/>
  <link href="${escapeXml(config.site.url)}/feed/atom.xml" rel="self"/>
  <id>${escapeXml(config.site.url)}/</id>
  <updated>${formatDate(posts[0]?.date || new Date().toISOString())}</updated>
  <author><name>${escapeXml(config.site.author)}</name></author>
  ${posts.map(p => `
  <entry>
    <title>${escapeXml(p.title)}</title>
    <link href="${escapeXml(postUrl(p.slug))}" rel="alternate"/>
    <id>${escapeXml(postUrl(p.slug))}</id>
    <updated>${formatDate(p.date)}</updated>
    <published>${formatDate(p.date)}</published>
    <summary>${escapeXml(p.description || '')}</summary>
    <content type="html"><![CDATA[${loadPost(p.slug)?.html || ''}]]></content>
    <author><name>${escapeXml(p.author || config.site.author)}</name></author>
    ${(p.tags || []).map(t => `<category term="${escapeXml(t)}"/>`).join('\n    ')}
  </entry>`).join('\n  ')}
</feed>`;
  res.set('Content-Type', 'application/atom+xml; charset=utf-8');
  res.send(atom);
});

// Single post (catch-all — keep last route)
app.get('/:slug', (req, res) => {
  const post = loadPost(req.params.slug);
  if (!post || post.published === false) return res.status(404).send('Not found');

  const registry = loadRegistry();
  const entry = registry.posts.find(p => p.slug === req.params.slug);

  res.render('post', {
    site: config.site,
    post: {
      ...post,
      url: postUrl(post.slug),
      arweaveTxId: entry?.arweaveTxId || null,
      arweaveUrl: entry?.arweaveTxId ? `https://arweave.net/${entry.arweaveTxId}` : null
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`📰 ${config.site.title} running on port ${config.port}`);
  console.log(`   ${config.site.url}`);
});
