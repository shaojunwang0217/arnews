# The Repository 📰

**Censorship-resistant news blog** powered by [Arweave](https://arweave.org) permaweb storage.

Articles are stored **permanently** on Arweave — immutable, uncensorable, and independently verifiable. The frontend serves them as a normal website with RSS, sitemap, and full Google indexing support.

**[→ Live Site](https://claw.sgcondo.app/news/)**

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Write in    │ ──▶ │  Node.js    │ ──▶ │  Visitors    │
│  Markdown    │     │  Express    │     │  (www site)  │
└──────┬───────┘     │  + EJS      │     └──────────────┘
       │             └──────┬──────┘
       ▼                    │
┌──────────────┐            │
│  Arweave     │ ◀──────────┘
│  (Turbo)     │  (deploy script uploads
│  permaweb    │   each post as text/html)
└──────────────┘
```

### Censorship Resistance

Every article published to the blog is **also uploaded to Arweave** — a decentralized storage network where data lives forever for a one-time fee.

| Scenario | What happens |
|---|---|
| VPS seized | Content still at `arweave.net/{txid}` |
| Domain blocked | Deploy frontend elsewhere, same data |
| DNS seized | Readers access via ArNS/permaweb gateway |
| Data rot | Arweave endowment pays for perpetual storage |

## Quick Start

### Prerequisites

- Node.js 18+
- An [Arweave wallet](https://arweave.app) (browser-generated JWK keyfile)
- Turbo credits (buy with credit card at [turbo.ar.io](https://turbo.ar.io))

### Setup

```bash
git clone https://github.com/shaojunwang0217/arnews.git
cd arnews
npm install
```

### Creating a Post

```bash
node scripts/new-post.js "My New Article" --tags news,tutorial
```

This creates a Markdown file at `posts/my-new-article.md`. Edit it, then set `published: true` in the frontmatter and in `posts/index.json`.

### Running Locally

```bash
node server.js
# → http://localhost:3005
```

### Deploying to Arweave

```bash
# Copy your wallet keyfile to the server
cp ~/Downloads/arweave-keyfile.json /root/arweave-wallet.json

# Deploy all unpublished posts
node scripts/deploy.js

# Check status
node scripts/deploy.js --status
```

## Production Setup (systemd + Caddy)

### systemd Service

```bash
cp arnews.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now arnews
```

### Caddy Reverse Proxy

```caddyfile
handle_path /news/* {
    reverse_proxy 127.0.0.1:3005
}
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Storage** | [Arweave](https://arweave.org) via [Turbo SDK](https://github.com/ardriveapp/turbo-sdk) |
| **Upload** | [@ardrive/turbo-sdk](https://www.npmjs.com/package/@ardrive/turbo-sdk) — credit card top-up |
| **Frontend** | Node.js, Express, EJS, server-side rendered |
| **Content** | Markdown + YAML frontmatter, rendered with [marked](https://marked.js.org/) |
| **Syndication** | RSS 2.0, Atom, sitemap.xml |
| **Proxy** | Caddy with automatic HTTPS |
| **Service** | systemd (auto-restart) |

## Scripts

| Command | Description |
|---|---|
| `node scripts/new-post.js "Title"` | Scaffold a new post |
| `node scripts/deploy.js` | Deploy all unpublished posts to Arweave |
| `node scripts/deploy.js --status` | Show deployment status |
| `node scripts/deploy.js --topup` | Instructions for buying credits |
| `node scripts/deploy.js <slug>` | Deploy a specific post |
| `node scripts/setup-wallet.js` | Generate a new Arweave wallet |
| `node scripts/check-tx.js` | Verify Arweave transaction status |

## License

MIT
