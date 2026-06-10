#!/usr/bin/env node
/**
 * Check deploy status and verify Arweave transactions.
 * 
 * Usage: node scripts/check-tx.js
 */
const fs = require('fs');
const https = require('https');

const config = require('../config');
const gateway = config.arweave.gateway;

async function main() {
  const registry = JSON.parse(fs.readFileSync(config.paths.registry, 'utf-8'));

  console.log('📋 Checking deployment status...\n');

  for (const post of registry.posts) {
    const txId = post.arweaveTxId;
    if (!txId) {
      console.log(`  ○ ${post.title} — not yet deployed`);
      continue;
    }

    // Check via GraphQL
    console.log(`  🔍 ${post.title}`);
    console.log(`     tx: ${txId}`);

    try {
      const result = await graphql(`{
        transaction(id: "${txId}") {
          id
          block { height timestamp }
          tags { name value }
        }
      }`);

      const tx = result?.data?.transaction;
      if (tx) {
        const block = tx.block;
        const title = tx.tags?.find(t => t.name === 'Title')?.value || '?';
        console.log(`     ✅ On-chain! Block: ${block?.height || 'pending'}`);
        console.log(`     Title tag: ${title}`);
        console.log(`     https://arweave.net/${txId}`);
      } else {
        console.log(`     ⏳ Bundled, awaiting Arweave confirmation...`);
        console.log(`     (This is normal — bundled uploads post in batches)`);
      }
    } catch (err) {
      console.log(`     ❓ Error checking: ${err.message}`);
    }
    console.log('');
  }

  console.log('💡 Data usually appears on arweave.net within minutes to hours.');
  console.log('   Once confirmed, the blog will show "View on Arweave" links.');
}

function graphql(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const req = https.request(`${gateway}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

main().catch(console.error);
