---
title: "Hello, Permaweb — Why This Blog Exists"
slug: hello-permaweb
date: 2026-06-10
author: Shaojun Wang
tags: [arweave, censorship, freedom, decentralization]
description: "Introducing The Repository — a news blog built on Arweave for permanent, uncensorable storage."
published: true
---

The internet was supposed to be decentralized. Instead, we got five platforms controlling what billions of people read.

This blog is a small experiment in fixing that.

## The Problem

Every time you publish online today, you're renting space. Your words exist at the pleasure of:

- A hosting provider who can terminate your account
- A CMS platform that can unpublish your content
- A government that can demand takedowns
- A domain registrar that can seize your name
- A social network that can shadowban your reach

Even if you're careful, your content lives on someone else's machine, governed by someone else's terms of service. When push comes to shove, that matters.

## The Solution

This blog stores every single article on the **Arweave permaweb** — a decentralized storage network where you pay once and your data lives forever.

Here's what that means in practice:

1. **Immutable** — once published, no one can edit or delete your article. Not even you
2. **Censorship-resistant** — there's no central server to take down. The content exists on thousands of nodes worldwide
3. **Permanent** — storage is pre-funded in perpetuity using Arweave's endowment model
4. **Self-sovereign** — your content is controlled by a cryptographic key, not a corporation

## How This Blog Works

The tech stack is deliberately simple:

- **Storage:** Arweave — each article uploaded as an `text/html` transaction with metadata tags
- **Frontend:** A lightweight Node.js server that reads from Arweave and renders the blog
- **Discovery:** RSS, Atom, sitemap.xml — old-school syndication
- **Fallback:** If this domain disappears, every article is still accessible at `arweave.net/{txid}`

## The Trade-offs

I want to be honest about the limitations:

- **Speed:** Arweave reads aren't instant. The blog uses a caching layer for performance
- **Cost:** Uploading costs AR tokens. Minimal (cents per article), but requires acquiring crypto
- **Editing:** You can't edit a published article. You can upload a new version with an "update" reference
- **Complexity:** It's not WordPress. Writing requires markdown and a CLI command

## Why I'm Doing This

I believe the future of journalism includes **permanent storage as a fundamental right**. Every news organization should have an immutable archive. Every whistleblower should have a venue. Every community should have a record that can't be erased.

This blog is my contribution to that future.

---

*This article is permanently stored on Arweave. The transaction ID will appear here once deployed.*
