/**
 * Arweave viewer proxy — serves gateway content with correct HTML headers
 * so it renders in the browser instead of downloading.
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

    // Try each gateway in order
    for (const gw of gateways) {
      try {
        const body = await fetchWithTimeout(`${gw.url}/${txId}`, 10000);
        if (body && body.length > 100) {
          return res.send(wrapHtml(txId, gw, body));
        }
      } catch { /* try next */ }
    }

    // All gateways failed
    return res.status(404).send(wrapError(txId));
  });
}

function wrapHtml(txId, gw, content) {
  const shortId = txId.slice(0, 16) + '…';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Arweave — ${shortId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .bar {
      background: #f0fdf4; border-bottom: 1px solid #bbf7d0;
      padding: 0.5rem 1rem; font-size: 0.85rem; color: #166534;
      display: flex; align-items: center; gap: 0.5rem;
      position: sticky; top: 0; z-index: 100;
    }
    .bar a { color: #166534; font-weight: 500; }
    .bar a:hover { text-decoration: underline; }
    .bar .close {
      margin-left: auto; border: 1px solid #bbf7d0;
      padding: 0.25rem 0.6rem; border-radius: 4px;
      font-size: 0.8rem; color: #166534; text-decoration: none;
    }
    .bar .close:hover { background: #dcfce7; }
    iframe { width: 100%; height: calc(100vh - 36px); border: none; }
  </style>
</head>
<body>
  <div class="bar">
    ⚡ Served via <a href="${gw.url}/${txId}" target="_blank">${gw.label}</a>
    <span style="color:#888;font-size:0.8rem">${txId}</span>
    <a href="/news/" class="close">✕ Back to blog</a>
  </div>
  <iframe src="${gw.url}/${txId}" title="Arweave content"></iframe>
</body>
</html>`;
}

function wrapError(txId) {
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
    .txid { font-family: monospace; font-size: 0.85rem; color: #888; word-break: break-all; margin: 1rem 0; }
  </style>
</head>
<body>
  <h2>⏳ Content pending</h2>
  <p>This data has been uploaded but hasn't reached a gateway yet.</p>
  <p>Bundled Arweave uploads typically confirm within minutes to hours.</p>
  <div class="txid">${txId}</div>
  <p><a href="/news/">← Back to blog</a></p>
</body>
</html>`;
}

function fetchWithTimeout(url, ms) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: ms }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400 && data.length > 100) {
          resolve(data);
        } else {
          reject(new Error(`Status ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = { mountViewer };
