/**
 * Arweave content proxy — fetches content from gateways server-side
 * and serves it with proper Content-Type: text/html.
 * This prevents browsers from downloading the file.
 */
const https = require('https');

const gateways = [
  { url: 'https://turbo-gateway.com', label: 'Turbo (instant)' },
  { url: 'https://arweave.net', label: 'Arweave' }
];

function mountViewer(app) {
  app.get('/view/:txId', async (req, res) => {
    const { txId } = req.params;
    if (!txId || !/^[a-zA-Z0-9_-]{43}$/.test(txId)) {
      return res.status(400).send('Invalid transaction ID');
    }

    // Try each gateway, proxying the content server-side
    let lastError = null;
    for (const gw of gateways) {
      try {
        const body = await fetchWithTimeout(`${gw.url}/${txId}`, 15000);
        if (body && body.length > 100) {
          // Serve the content directly with correct content-type
          // Inject a small banner at the top
          const banner = buildBanner(txId, gw.url, gw.label);
          const injected = body.includes('</body>')
            ? body.replace('</body>', banner + '\n</body>')
            : banner + '\n' + body;
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.set('X-Arweave-Gateway', gw.label);
          res.set('X-Arweave-TxId', txId);
          return res.send(injected);
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    // All gateways failed — show pending page
    res.status(404).send(buildPending(txId, lastError));
  });
}

function buildBanner(txId, gatewayUrl, gatewayLabel) {
  return `<!-- proxied via ${gatewayLabel} -->
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            background:#f0fdf4;border-bottom:1px solid #bbf7d0;
            padding:0.5rem 1rem;font-size:0.85rem;color:#166534;
            display:flex;align-items:center;gap:0.5rem;
            position:sticky;top:0;z-index:100;
            flex-wrap:wrap">
  <span>⚡</span>
  <span>Served via <a href="${gatewayUrl}/${txId}" style="color:#166534;font-weight:500" target="_blank">${gatewayLabel}</a></span>
  <code style="font-size:0.75rem;color:#888;flex:1">${txId}</code>
  <a href="/news/" style="border:1px solid #bbf7d0;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem;color:#166534;text-decoration:none">✕ Back to blog</a>
</div>`;
}

function buildPending(txId, error) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Arweave — pending</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 3rem 1rem; text-align: center; color: #333; }
    h2 { margin-bottom: 1rem; }
    p { color: #666; margin-bottom: 0.5rem; line-height: 1.5; }
    a { color: #2563eb; }
    .txid { font-family: monospace; font-size: 0.85rem; color: #888; word-break: break-all; margin: 1rem 0; padding: 0.5rem; background: #f5f5f5; border-radius: 4px; }
  </style>
</head>
<body>
  <h2>⏳ Content not yet available</h2>
  <p>This data has been uploaded but hasn't reached the gateway yet.</p>
  <p>Bundled Arweave uploads typically confirm within minutes to hours.</p>
  ${error ? `<p style="font-size:0.8rem;color:#999">${error}</p>` : ''}
  <div class="txid">${txId}</div>
  <p><a href="/news/">← Back to blog</a></p>
</body>
</html>`;
}

function fetchWithTimeout(url, ms) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: ms }, res => {
      // Follow redirects manually (up to 3)
      let redirects = 0;
      function handle(res) {
        if ((res.statusCode >= 300 && res.statusCode < 400) && res.headers.location && redirects < 3) {
          redirects++;
          const followUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          https.get(followUrl, { timeout: ms }, handle).on('error', reject);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 400 && data.length > 100) {
            resolve(data);
          } else {
            reject(new Error(`Status ${res.statusCode}, ${data.length} bytes`));
          }
        });
      }
      handle(res);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = { mountViewer };
