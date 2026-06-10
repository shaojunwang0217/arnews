#!/usr/bin/env node
/**
 * Generate an Arweave wallet and optionally create a Turbo top-up checkout link.
 *
 * Usage:
 *   node scripts/setup-wallet.js              # generate wallet only
 *   node scripts/setup-wallet.js --topup 5    # generate + create $5 checkout link
 */
const fs = require('fs');
const crypto = require('crypto');

const config = require('../config');
const walletPath = config.arweave.walletPath;

async function main() {
  const args = process.argv.slice(2);
  const topupAmount = args.includes('--topup') ? parseFloat(args[args.indexOf('--topup') + 1]) || 5 : 0;

  // Check if wallet already exists
  if (fs.existsSync(walletPath)) {
    console.log('⚠ Wallet already exists at', walletPath);
    const existing = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    const addr = await getAddress(existing);
    console.log('  Address:', addr);
    if (topupAmount > 0) {
      await createCheckout(addr, topupAmount);
    }
    return;
  }

  // Generate RSA-PSS 4096-bit key (Arweave standard)
  console.log('🔑 Generating Arweave wallet (RSA 4096-bit)...');
  
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  // Export the JWK (JSON Web Key) format
  const jwk = await rsaToJwk(privateKey, publicKey);
  
  // Save to wallet path
  fs.writeFileSync(walletPath, JSON.stringify(jwk, null, 2));
  console.log('✓ Wallet saved to', walletPath);

  const addr = await getAddress(jwk);
  console.log('  Address:', addr);
  console.log('  🔐 IMPORTANT: Back this file up somewhere safe!');
  console.log(`     cp ${walletPath} ~/arweave-backup-$(date +%Y%m%d).json\n`);

  if (topupAmount > 0) {
    await createCheckout(addr, topupAmount);
  }
}

async function createCheckout(owner, amount) {
  console.log(`\n💳 Creating $${amount} Turbo checkout...`);
  
  try {
    const { TurboFactory, ArweaveSigner, USD } = require('@ardrive/turbo-sdk');
    const wallet = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    const signer = new ArweaveSigner(wallet);
    const turbo = TurboFactory.authenticated({ signer });
    
    const session = await turbo.createCheckoutSession({
      amount: USD(amount),
      owner
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  💳 Open this link to pay:`);
    console.log(`  ${session.url}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Amount: $${amount} USD`);
    console.log(`  Credits: ${(session.winc / 1e12).toFixed(2)} GiB worth`);
    console.log(`  (enough for ~${Math.floor(session.winc / 50000)} blog posts)\n`);
  } catch (err) {
    console.log('Could not create checkout. Top up manually at https://turbo.ar.io/');
    console.log('Error:', err.message);
  }
}

// ─── JWK conversion helpers ─────────────────────────────────────

async function rsaToJwk(privateKeyDer, publicKeyDer) {
  // Parse ASN.1 DER to extract RSA parameters
  // This is a simplified approach using Node's built-in crypto
  
  // Export the key in JWK format via crypto's export of the key object
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const publicKey = crypto.createPublicKey({
    key: publicKeyDer,
    format: 'der',
    type: 'spki'
  });

  // Export as JWK
  const jwkPriv = privateKey.export({ format: 'jwk' });
  const jwkPub = publicKey.export({ format: 'jwk' });

  // Arweave expects specific field names
  return {
    kty: 'RSA',
    n: jwkPriv.n,
    e: jwkPriv.e || 'AQAB',
    d: jwkPriv.d,
    p: jwkPriv.p,
    q: jwkPriv.q,
    dp: jwkPriv.dp,
    dq: jwkPriv.dq,
    qi: jwkPriv.qi
  };
}

async function getAddress(jwk) {
  const n = jwk.n;
  const buf = Buffer.from(n, 'base64url');
  const hash = crypto.createHash('sha256').update(buf).digest();
  return hash.toString('base64url');
}

main().catch(console.error);
