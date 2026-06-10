/**
 * Upload endpoint — accepts image/video files, stores locally AND uploads to Arweave via Turbo.
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { TurboFactory, ArweaveSigner } = require('@ardrive/turbo-sdk');
const config = require('./config');

const UPLOAD_DIR = path.join(config.paths.public, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Track uploaded files locally
const REGISTRY_PATH = path.join(__dirname, 'data', 'uploads.json');
let uploadRegistry = { files: [] };
if (fs.existsSync(REGISTRY_PATH)) {
  try { uploadRegistry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); } catch {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/ogg',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'application/pdf'
];

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported type: ' + file.mimetype));
  }
});

function mountUpload(app) {
  // ─── Upload form page ──────────────────────────────────────────
  app.get('/upload', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Upload — The Repository</title>
<link rel="stylesheet" href="/news/styles.css">
<style>
.upload-page{max-width:600px;margin:0 auto;padding:2rem 1rem}
form{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:1.5rem}
input[type="file"]{display:block;margin-bottom:1rem;padding:0.5rem;border:1px solid var(--border);border-radius:4px;width:100%}
button{background:var(--accent);color:white;border:none;padding:0.6rem 1.2rem;border-radius:6px;font-size:0.95rem;cursor:pointer;width:100%}
button:hover{background:var(--accent-hover)}
button:disabled{opacity:0.6}
.preview{margin-top:1.5rem;padding:1rem;background:#f8f7f4;border-radius:6px;display:none}
.preview img,.preview video{max-width:100%;max-height:300px;border-radius:4px}
.preview code{display:block;background:#1e1e2e;color:#cdd6f4;padding:0.75rem;border-radius:4px;margin-top:0.5rem;font-size:0.85rem;word-break:break-all}
.preview .label{font-size:0.85rem;color:#666;margin-top:0.75rem;margin-bottom:0.25rem}
</style></head>
<body>
<header class="site-header"><div class="container">
<a href="/news/" class="no-underline"><h1>The Repository</h1></a>
<p class="subtitle">Upload images, video, audio for your posts</p>
<nav><a href="/news/">Back to blog</a> · <a href="/news/price">Pricing</a></nav>
</div></header>
<div class="upload-page">
<form id="f" enctype="multipart/form-data">
<input type="file" id="fileInput" name="file" required>
<button type="submit" id="btn">Upload to Arweave</button>
</form>
<div class="preview" id="preview">
<div id="mediaPreview"></div>
<div class="label">Embed in markdown:</div>
<code id="embedCode"></code>
<div class="label">Local URL:</div>
<code id="directUrl" style="margin-top:0.25rem"></code>
<p id="copied" style="color:var(--arweave-fg);font-size:0.85rem;margin-top:0.25rem"></p>
</div>
</div>
<script>
document.getElementById('f').onsubmit=async(e)=>{
e.preventDefault();const fd=new FormData();
fd.append('file',document.getElementById('fileInput').files[0]);
const btn=document.getElementById('btn');btn.textContent='Uploading...';btn.disabled=true;
try{
const r=await fetch('/news/api/upload',{method:'POST',body:fd});
const d=await r.json();if(!r.ok){alert('Error: '+d.error);return;}
const p=document.getElementById('preview');p.style.display='block';
const m=document.getElementById('mediaPreview');
if(d.type.startsWith('video/')) m.innerHTML='<video controls src="/news/uploads/'+d.filename+'"></video>';
else if(d.type.startsWith('image/')) m.innerHTML='<img src="/news/uploads/'+d.filename+'">';
else if(d.type.startsWith('audio/')) m.innerHTML='<audio controls src="/news/uploads/'+d.filename+'"></audio>';
else m.innerHTML='<p>File uploaded: '+d.filename+'</p>';
document.getElementById('embedCode').textContent=d.markdown;
document.getElementById('directUrl').textContent='/news/view/'+d.id;
}catch(e){alert('Failed: '+e.message)}
btn.textContent='Upload to Arweave';btn.disabled=false;
};
</script>
</body></html>`);
  });

  // ─── Upload API ────────────────────────────────────────────────
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file' });

      const file = req.file;
      const filePath = file.path;
      const mimeType = file.mimetype;
      const fileName = file.filename;
      const fileSize = file.size;

      let arweaveId = null;

      // Upload to Arweave via Turbo if wallet exists
      const walletPath = config.arweave.walletPath;
      if (fs.existsSync(walletPath)) {
        try {
          const jwk = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
          const signer = new ArweaveSigner(jwk);
          const turbo = TurboFactory.authenticated({ signer });
          const fileStats = fs.statSync(filePath);
          const result = await turbo.uploadFile({
            fileStreamFactory: () => fs.createReadStream(filePath),
            fileSizeFactory: () => fileStats.size,
            tags: [
              { name: 'Content-Type', value: mimeType },
              { name: 'App-Name', value: 'The-Repository' }
            ]
          });
          arweaveId = result.id;
        } catch (err) {
          console.log('Arweave upload failed (local copy saved):', err.message);
        }
      }

      // Save to local registry
      const entry = {
        id: arweaveId || fileName.replace(/\.[^.]+$/, ''),
        filename: fileName,
        localPath: '/news/uploads/' + fileName,
        type: mimeType,
        size: fileSize,
        arweaveTxId: arweaveId,
        uploadedAt: new Date().toISOString()
      };
      uploadRegistry.files.push(entry);
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(uploadRegistry, null, 2));

      // Build markdown embed
      const viewUrl = arweaveId ? '/news/view/' + arweaveId : '/news/uploads/' + fileName;
      let markdown;
      if (mimeType.startsWith('image/')) {
        markdown = '![' + fileName + '](' + viewUrl + ')';
      } else if (mimeType.startsWith('video/')) {
        markdown = '<video controls width="100%"><source src="' + viewUrl + '" type="' + mimeType + '"></video>';
      } else if (mimeType.startsWith('audio/')) {
        markdown = '<audio controls src="' + viewUrl + '"></audio>';
      } else {
        markdown = '[' + fileName + '](' + viewUrl + ')';
      }

      res.json({
        id: arweaveId || entry.id,
        filename: fileName,
        type: mimeType,
        size: fileSize,
        arweaveTxId: arweaveId,
        markdown: markdown,
        url: viewUrl,
        arweaveUrl: arweaveId ? 'https://arweave.net/' + arweaveId : null
      });

    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Price endpoint ────────────────────────────────────────────
  app.get('/price', async (req, res) => {
    try {
      let balance = null;
      let estimates = {
        '100 KB image': '~$0.01',
        '1 MB image': '~$0.03',
        '10 MB video clip': '~$0.29',
        '1 GiB video': '~$29.44'
      };

      // Try to get real-time authenticated pricing
      const walletPath = config.arweave.walletPath;
      if (fs.existsSync(walletPath)) {
        try {
          const jwk = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
          const signer = new ArweaveSigner(jwk);
          const turbo = TurboFactory.authenticated({ signer });
          const bal = await turbo.getBalance();
          const cost100KB = await turbo.getFiatEstimateForBytes({ byteCount: 100 * 1024, currency: 'usd' });
          const cost1MB = await turbo.getFiatEstimateForBytes({ byteCount: 1024 * 1024, currency: 'usd' });

          const winc = BigInt(bal.winc);
          balance = {
            winc: bal.winc,
            usdValue: '$5 (previous top-up)',
            images100KB: Math.floor(Number(winc) / Number(cost100KB.winc)),
            images1MB: Math.floor(Number(winc) / Number(cost1MB.winc))
          };
          estimates = {
            '100 KB image': { usd: cost100KB.amount, winc: cost100KB.winc },
            '1 MB image': { usd: cost1MB.amount, winc: cost1MB.winc }
          };
        } catch (err) {
          console.log('[price] auth error:', err.message);
        }
      }

      res.json({
        usdPerGiB: '~$29.44',
        notes: 'Turbo bundled pricing. Upload via Turbo bundles transactions for efficiency.',
        estimates: estimates,
        yourBalance: balance,
        topUpLink: 'https://turbo.ar.io/'
      });

    } catch (err) {
      console.error('[price] error:', err);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { mountUpload };
