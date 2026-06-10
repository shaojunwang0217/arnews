#!/usr/bin/env node
/**
 * Scaffold a new blog post.
 *
 * Usage:
 *   node scripts/new-post.js "My Post Title" [--tags tag1,tag2]
 *
 * Or interactive:
 *   node scripts/new-post.js
 */
const fs = require('fs');
const path = require('path');

const config = require('../config');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function main() {
  const title = process.argv[2];
  if (!title) {
    console.log('Usage: node scripts/new-post.js "Your Post Title" [--tags tag1,tag2]');
    process.exit(1);
  }

  const tagsIdx = process.argv.indexOf('--tags');
  const tags = tagsIdx >= 0 ? process.argv[tagsIdx + 1]?.split(',').map(t => t.trim()) : [];

  const slug = slugify(title);
  const date = new Date().toISOString().split('T')[0];
  const filePath = path.join(config.paths.posts, slug + '.md');

  if (fs.existsSync(filePath)) {
    console.log(`⚠ Post already exists: ${filePath}`);
    process.exit(1);
  }

  const content = `---
title: "${title}"
slug: ${slug}
date: ${date}
author: ${config.site.author}
tags: ${tags.length ? `[${tags.map(t => `"${t}"`).join(', ')}]` : '[]'}
description: "A short description for search engines and social previews (max ~160 chars)"
published: false
---

Write your post here. Markdown is supported.

## Section heading

Paragraph text with **bold**, *italic*, \`code\`, and [links](https://example.com).

> Blockquotes for emphasis.

### Code blocks

\`\`\`javascript
console.log('Hello, Arweave!');
\`\`\`

---

*Published on ${date} · Permanently stored on Arweave*
`;

  fs.writeFileSync(filePath, content, 'utf-8');

  // Also add to registry
  const registryPath = config.paths.registry;
  let registry = { posts: [] };
  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  }

  registry.posts.unshift({
    slug,
    title,
    date,
    author: config.site.author,
    tags,
    description: '',
    published: false,
    arweaveTxId: null
  });

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

  console.log(`✓ Created: ${filePath}`);
  console.log(`  Published: ${date}`);
  console.log(`  Tags: ${tags.join(', ') || '(none)'}`);
  console.log('  Status: draft (set published:true to make it live)');
}

main();
