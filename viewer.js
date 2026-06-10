/**
 * Arweave content proxy — fetches content from gateways server-side.
 * - HTML: injects a small banner, serves as text/html
 * - Images/Video/Audio: serves raw bytes with correct MIME (auto-sniffed if needed)
 * - Falls back: arweave.net first, then turbo-gateway.com
 * 
 * Turbo gateway always returns Content-Type: text/plain regardless of content.
 * This module auto-detects binary types by inspecting magic bytes.
 */
const https = require('https');

const gateways = [
  { url: 'https://arweave.net', label: 'Arweave' },
  { url: 'https://turbo-gateway.com', label: 'Turbo (instant)' }
];

// Magic byte detectors for binary content (turbo-gateway always returns text/plain)
function sniffContentType(body) {
  if (!body || body.length < 4) return null;
  
  const b0 = body[0], b1 = body[1], b2 = body[2], b3 = body[3];

  // Images
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'image/jpeg';
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return 'image/png';
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'image/gif';
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return 'image/webp'; // RIFF...WEBP
  if (b0 === 0x42 && b1 === 0x4D) return 'image/bmp';

  // Video
  if (b0 === 0x00 && b1 === 0x00 && b2 === 0x00 && (b3 === 0x18 || b3 === 0x1C || b3 === 0x20)) {
    // MP4: starts with ftyp box
    if (body.length > 8) {
      const ftyp = body.slice(4, 8).toString();
      if (ftyp === 'ftyp') return 'video/mp4';
    }
  }
  if (b0 === 0x1A && b1 === 0x45 && b2 === 0xDF && b3 === 0xA3) return 'video/webm'; // EBML/WebM
  if (b0 === 0x00 && b1 === 0x00 && b2 === 0x01 && b3 === 0xBA) return 'video/mpeg';

  // Audio
  if (b0 === 0x49 && b1 === 0x44 && b2 === 0x33) return 'audio/mpeg'; // ID3 tag
  if (b0 === 0xFF && (b1 & 0xF0) === 0xF0) return 'audio/mpeg'; // MPEG sync
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return 'audio/wav'; // RIFF...WAVE
  
  // PDF
  if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return 'application/pdf';

  return null;
}

function mountViewer(app) {
  app.get('/view/:txId', async (req, res) => {
    const { txId } = req.params;
    if (!txId || !/^[a-zA-Z0-9_-]{43}$/.test(txId)) {
      return res.status(400).send('Invalid transaction ID');
    }

    let lastError = null;
    for (const gw of gateways) {
      try {
        const result = await fetchWithHeaders(`${gw.url}/${txId}`, 15000);
        if (result && result.body && result.body.length > 100) {
          return serveContent(res, txId, result.body, result.contentType, gw);
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    res.status(404).send(buildPending(txId, lastError));
  });
}

function serveContent(res, txId, body, declaredType, gw) {
  const sniffed = sniffContentType(body);
  const actualType = sniffed || declaredType || 'application/octet-stream';

  const banner = buildBanner(txId, gw.url, gw.label);
  res.set('X-Arweave-Gateway', gw.label);
  res.set('X-Arweave-TxId', txId);

  // Images: wrap in an HTML page so browser always renders
  if (sniffed === 'image/jpeg' || sniffed === 'image/png' || sniffed === 'image/gif' ||
      sniffed === 'image/webp' || sniffed === 'image/bmp' ||
      actualType.startsWith('image/')) {
    const b64 = body.toString('base64');
    const dataUri = 'data:' + actualType + ';base64,' + b64;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Arweave Image — ${txId.slice(0, 12)}…</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1a1a1a;text-align:center}img{max-width:100%;max-height:calc(100vh - 50px)}.bar{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0fdf4;border-bottom:1px solid #bbf7d0;padding:0.5rem 1rem;font-size:0.85rem;color:#166534;display:flex;align-items:center;gap:0.5rem;position:sticky;top:0;z-index:100;flex-wrap:wrap}.bar a{color:#166534;font-weight:500}.bar .close{margin-left:auto;border:1px solid #bbf7d0;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem;color:#166534;text-decoration:none}.bar .close:hover{background:#dcfce7}</style></head><body>${banner}<img src="${dataUri}" alt="Arweave content"></body></html>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  // Video/Audio: wrap in HTML with player + banner
  if (sniffed || actualType.startsWith('video/') || actualType.startsWith('audio/') || actualType === 'application/pdf') {
    const b64 = body.toString('base64');
    const dataUri = 'data:' + actualType + ';base64,' + b64;
    let mediaTag;
    if (actualType.startsWith('video/')) {
      mediaTag = '<video controls style="max-width:100%;max-height:calc(100vh - 50px)"><source src="' + dataUri + '" type="' + actualType + '"></video>';
    } else if (actualType.startsWith('audio/')) {
      mediaTag = '<audio controls src="' + dataUri + '"></audio>';
    } else {
      mediaTag = '<embed src="' + dataUri + '" type="' + actualType + '" style="width:100%;height:calc(100vh - 50px)">';
    }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Arweave Media — ${txId.slice(0, 12)}…</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1a1a1a;text-align:center;padding-top:1rem}.bar{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0fdf4;border-bottom:1px solid #bbf7d0;padding:0.5rem 1rem;font-size:0.85rem;color:#166534;display:flex;align-items:center;gap:0.5rem;position:sticky;top:0;z-index:100;flex-wrap:wrap}.bar a{color:#166534;font-weight:500}.bar .close{margin-left:auto;border:1px solid #bbf7d0;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem;color:#166534;text-decoration:none}.bar .close:hover{background:#dcfce7}</style></head><body>${banner}<div style="padding:1rem">${mediaTag}</div></body></html>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  // Text/HTML: inject banner into the content
  const strBody = body.toString('utf-8');
  const injected = strBody.includes('</body>')
    ? strBody.replace('</body>', banner + '\n</body>')
    : banner + '\n' + strBody;
  res.set('Content-Type', 'text/html; charset=utf-8');
  return res.send(injected);
}

function buildBanner(txId, gatewayUrl, gatewayLabel) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            background:#f0fdf4;border-bottom:1px solid #bbf7d0;
            padding:0.5rem 1rem;font-size:0.85rem;color:#166534;
            display:flex;align-items:center;gap:0.5rem;
            position:sticky;top:0;z-index:100;flex-wrap:wrap">
  <span>⚡</span>
  <span>Served via <a href="${gatewayUrl}/${txId}" style="color:#166534;font-weight:500" target="_blank">${gatewayLabel}</a></span>
  <code style="font-size:0.75rem;color:#888;flex:1">${txId}</code>
  <a href="/news/" style="border:1px solid #bbf7d0;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem;color:#166534;text-decoration:none">✕ Back</a>
</div>`;
}

function buildPending(txId, error) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Arweave — pending</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:3rem 1rem;text-align:center;color:#333}
h2{margin-bottom:1rem}p{color:#666;margin-bottom:0.5rem;line-height:1.5}a{color:#2563eb}
.txid{font-family:monospace;font-size:0.85rem;color:#888;word-break:break-all;margin:1rem 0;padding:0.5rem;background:#f5f5f5;border-radius:4px}
</style></head>
<body>
  <h2>⏳ Content not yet available</h2>
  <p>This data has been uploaded but hasn't reached a gateway yet.</p>
  <p>Bundled Arweave uploads typically confirm within minutes to hours.</p>
  ${error ? `<p style="font-size:0.8rem;color:#999">${error}</p>` : ''}
  <div class="txid">${txId}</div>
  <p><a href="/news/">← Back to blog</a></p>
</body>
</html>`;
}

function fetchWithHeaders(url, ms) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: ms }, res => {
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
        const contentType = res.headers['content-type'] || 'text/plain';
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 400 && body.length > 100) {
            resolve({ body, contentType });
          } else {
            reject(new Error(`Status ${res.statusCode}, ${body.length} bytes`));
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
