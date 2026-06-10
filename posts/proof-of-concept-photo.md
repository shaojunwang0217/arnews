---
title: "Proof of Concept: Photos on the Permaweb"
slug: proof-of-concept-photo
date: 2026-06-10
author: Shaojun Wang
tags: [arweave, proof-of-concept, photo, permaweb]
description: "Successfully uploaded and permanently stored a photo on Arweave. This proves our censorship-resistant blog works for rich media."
published: true
---

## It Works.

We uploaded a photo — and it's now permanently stored on the Arweave permaweb. You're seeing it right here in this blog post, served from our local cache. But the original lives on Arweave, immutable and uncensorable, for good.

![Enzo Front](/news/uploads/1781082897872-ccds2v.jpg)

## The Proof

Every photo uploaded to this blog is sent to the Arweave network via [Turbo](https://turbo.ar.io/). Once uploaded, it receives a permanent transaction ID (txid) that exists forever on the permaweb.

**This photo's txid:** `2XkieYvUj48640gCp9CoJUZzTR8rWwtJMQS5OUVFO4E`

Click the link below to view it directly on the Arweave gateway:

👉 **[View on Arweave](/news/view/2XkieYvUj48640gCp9CoJUZzTR8rWwtJMQS5OUVFO4E)**

Even if this website disappears tomorrow, that txid will still resolve on any Arweave gateway. The file cannot be deleted, edited, or censored.

## Why This Matters

For a censorship-resistant news blog, photos are critical:

- 📸 **Journalistic evidence** — can't be scrubbed from the internet
- 🖼️ **Infographics** — permanently referenceable
- 🎬 **Video clips** — same mechanism, larger files
- 🔗 **Permanent URLs** — share links that never rot

The cost for this 665KB photo: **~$0.01** in Turbo credits.

## How It Works

```
Upload photo → POST /news/api/upload → file stored locally
                                     → uploaded to Arweave via Turbo
                                     → returns a permanent txid
                                     → blog post embeds it with markdown
                                     → viewer proxy serves it inline
```

All of this happens automatically when you use the [upload page](/news/upload).

## What's Next

- Embedding multiple images in a single post
- Video clips with inline playback from Arweave
- Galleries and photo essays
- Fully automated deploy pipeline (post + media together)

---

*This image is permanently stored on Arweave. Transaction ID: 2XkieYvUj48640gCp9CoJUZzTR8rWwtJMQS5OUVFO4E*
