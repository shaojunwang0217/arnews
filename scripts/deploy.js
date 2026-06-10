#!/usr/bin/env node
/**
 * Deploy blog posts to Arweave via Turbo (AR.IO).
 *
 * Usage:
 *   node scripts/deploy.js              # deploy all unpublished posts
 *   node scripts/deploy.js hello-world  # deploy a specific post
 *   node scripts/deploy.js --status     # show deploy status
 *   node scripts/deploy.js --topup      # open a Stripe checkout to buy credits
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fm = require('front-matter');
const { marked } = require('marked');
const { TurboFactory, ArweaveSigner, USD } = require('@ardrive/turbo-sdk');
const crypto = require('crypto');

const config = require('../config');

async function main() {
  const args = process.argv.slice(2);
  const registryPath = config.paths.registry;
  let registry = { posts: [] };
  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  }

  // ─── Top-up mode ──────────────────────────────────────────────
  if (args.includes('--topup')) {
    console.log('\n💳 Turbo Credit Top-Up\n');
    console.log('Go to https://turbo.ar.io/ and sign in with your Arweave wallet.');
    console.log('You can top up with credit card via Stripe — no crypto needed.\n');
    return;
  }

  // ─── Status mode (no wallet needed) ───────────────────────────
  if (args.includes('--status')) {
    console.log('📊 Post Deployment Status:\n');
    registry.posts.forEach(p => {
      const status = p.arweaveTxId
        ? `✓ deployed → arweave.net/${p.arweaveTxId}`
        : '○ pending';
      console.log(`  ${status}`);
      console.log(`    ${p.title} (${p.slug})\n`);
    });
    return;
  }

  // ─── Load wallet ──────────────────────────────────────────────
  const walletPath = config.arweave.walletPath;
  let jwk;

  if (fs.existsSync(walletPath)) {
    jwk = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    console.log('✓ Wallet loaded from', walletPath);
    const addr = await getAddress(jwk);
    console.log('  Address:', addr);
  } else {
    console.log('\n⚠ No Arweave wallet found at', walletPath);
    console.log('\n  Quick setup:');
    console.log('  1. Go to https://arweave.app/ — generates a wallet in your browser');
    console.log('  2. Download the keyfile JSON');
    console.log('  3. Copy it to the VPS:');
    console.log('     scp /path/to/keyfile.json root@91.98.169.109:/root/arweave-wallet.json');
    console.log('  4. Top up credits at https://turbo.ar.io/ (credit card accepted)');
    console.log('  5. Run this script again\n');
    process.exit(0);
  }

  // ─── Connect to Turbo ──────────────────────────────────────────
  let turbo;
  try {
    const signer = new ArweaveSigner(jwk);
    turbo = TurboFactory.authenticated({ signer });
    console.log('✓ Connected to Turbo (AR.IO)\n');
  } catch (err) {
    console.error('✗ Failed to connect to Turbo:', err.message);
    process.exit(1);
  }

  // ─── Determine which posts to deploy ──────────────────────────
  let targetSlugs;
  const specificSlug = args[0];
  if (specificSlug && !specificSlug.startsWith('--')) {
    targetSlugs = [specificSlug];
    console.log(`📝 Deploying: ${specificSlug}\n`);
  } else {
    targetSlugs = registry.posts
      .filter(p => !p.arweaveTxId)
      .map(p => p.slug);
    console.log(`📝 Deploying ${targetSlugs.length} unpublished post(s)\n`);
  }

  if (targetSlugs.length === 0) {
    console.log('✓ Nothing to deploy!');
    return;
  }

  // ─── Deploy each post ──────────────────────────────────────────
  for (const slug of targetSlugs) {
    const mdPath = path.join(config.paths.posts, slug + '.md');
    if (!fs.existsSync(mdPath)) {
      console.log(`  ⚠ Post not found: ${slug}.md — skipping`);
      continue;
    }

    const raw = fs.readFileSync(mdPath, 'utf-8');
    const parsed = fm(raw);
    const htmlBody = marked.parse(parsed.body);
    const meta = parsed.attributes;

    // Build full HTML document with immutable-styling
    const txidPlaceholder = 'arweave.net/{TXID}';
    const fullHtml = `<!DOCTYPE html>
<html lang="${meta.language || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description || '')}">
  <meta name="author" content="${escapeHtml(meta.author || '')}">
  <meta name="date" content="${meta.date || ''}">
  ${(meta.tags || []).map(t => `<meta name="keywords" content="${escapeHtml(t)}">`).join('\n  ')}
  <meta property="og:title" content="${escapeHtml(meta.title)}">
  <meta property="og:description" content="${escapeHtml(meta.description || '')}">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${meta.date || ''}">
  <meta name="twitter:card" content="summary">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; line-height: 1.7; color: #1a1a1a; }
    h1 { font-size: 2rem; line-height: 1.2; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    a { color: #0066cc; }
    img { max-width: 100%; height: auto; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    .permalink { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.85rem; color: #888; }
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(meta.title)}</h1>
    <div class="meta">
      ${meta.date || ''}${meta.author ? ` · by ${escapeHtml(meta.author)}` : ''}
      ${meta.tags?.length ? ` · ${meta.tags.map(t => escapeHtml(t)).join(', ')}` : ''}
    </div>
    ${htmlBody}
  </article>
  <div class="permalink">
    <p>🔒 Permanently stored on the Arweave permaweb.</p>
    <p><a href="https://${txidPlaceholder}">View on Arweave</a></p>
  </div>
</body>
</html>`;

    // Tags for indexing/discovery
    const tags = [
      { name: 'Content-Type', value: 'text/html' },
      { name: 'App-Name', value: 'The-Repository' },
      { name: 'Title', value: meta.title },
      { name: 'Slug', value: slug },
      { name: 'Date', value: meta.date || '' },
      { name: 'Author', value: meta.author || '' },
      ...(meta.tags || []).map(t => ({ name: 'Tag', value: t }))
    ];
    if (meta.description) {
      tags.push({ name: 'Description', value: meta.description });
    }

    console.log(`  Uploading "${meta.title}"…`);

    try {
      const result = await turbo.upload({
        data: fullHtml,
        tags
      });

      const txId = result.id;
      console.log(`  ✓ Deployed! tx: ${txId}`);
      console.log(`    https://arweave.net/${txId}`);

      // Update registry with txid
      const entry = registry.posts.find(p => p.slug === slug);
      if (entry) {
        entry.arweaveTxId = txId;
        entry.deployedAt = new Date().toISOString();
      }
      saveRegistry(registry);

    } catch (err) {
      console.error(`  ✗ Failed to upload "${meta.title}": ${err.message}`);
      if (err.message.includes('balance') || err.message.includes('credits') || err.message.includes('insufficient')) {
        console.log('\n  ⚠ Looks like you need to top up credits.');
        console.log('  Run: arnews-deploy --topup');
        console.log('  Or visit: https://turbo.ar.io/\n');
      }
    }
  }

  console.log('\n✓ Done!');
}

function saveRegistry(registry) {
  fs.writeFileSync(config.paths.registry, JSON.stringify(registry, null, 2));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getAddress(jwk) {
  // Compute Arweave address from JWK (n modulus, base64url encoded)
  const n = jwk.n;
  const buf = Buffer.from(n, 'base64url');
  const hash = crypto.createHash('sha256').update(buf).digest();
  return hash.toString('base64url');
}

main().catch(console.error);
