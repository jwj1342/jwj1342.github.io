---
title: "How this site was built"
description: "From a Jekyll template to Astro and Cloudflare: what the site is made of now, and a few problems along the way."
lang: en
# Translated by Claude, not by scripts/translate.mjs. `npm run translate` will redo it when
# the Chinese post changes; add "locked: true" to keep this version instead.
sourceHash: aaf1ec097a60332f
model: "claude"
---

This site used to be a Jekyll academic template hosted on GitHub Pages, at `jwj1342.github.io`. I have now rewritten all of it: the pages are built with Astro, the hosting is on Cloudflare, and the domain is wenjia.me. The whole thing was done together with Claude Code. This post records what the site is made of now, and a few problems I ran into along the way.

## The overall structure

The site is static at heart: the build produces a set of HTML, CSS and JS files, and those files are what a visitor receives. Only two addresses, both under `/api/`, run any code.

```text
visitor → wenjia.me
           ├─ /, /blog/, ...    static files
           ├─ /api/log          Worker → D1 (the visitor log)
           ├─ /api/visitors     Worker → D1 (data for the visitor map)
           ├─ photos.wenjia.me  R2 (photos)
           └─ models.wenjia.me  R2 (Pop Cat's model weights)
```

## The pages

The pages are written in [Astro](https://astro.build) and come out as static HTML, with no React or Vue. Publications and blog posts are Markdown files, each kind with an agreed set of fields; a wrong field makes the build fail with an error. Math is set with KaTeX and code is highlighted with Shiki.

The styles are hand-written CSS, without Tailwind. The colours come from Monet's *Impression, Sunrise*: the teal of the harbour is the main colour, and the orange of the sun appears in only a few places. The light and dark themes share one set of variable names, each with its own values.

## Large files stay out of Git

Photos and model weights live in Cloudflare R2 buckets; the repository only records where they are.

Adding photos is one command: a script makes a thumbnail and a large view as WebP files, strips the location data, uploads both to R2, and writes each photo's size and main colour into a JSON file. The originals are never uploaded and never enter the repository.

## The cat in the corner

Pop Cat, in the bottom-right corner, is a small language model that runs in the visitor's own browser: Qwen3.5 0.8B, through [WebLLM](https://webllm.mlc.ai) and WebGPU. Inference goes through no server and needs no API key. The weights, about 430 MB, are downloaded only when a visitor asks a first question, and then stay in the browser's cache.

The weights are served from my own R2 bucket and not from the default Hugging Face address, because the latter cannot be reached from mainland China.

What the cat knows about me is not written by hand. At build time a script puts the site's career, publications and achievements together into a profile, so when I edit my career the cat is updated too.

## The globe

The Misc page has a globe marking the places I have been. The first version used a dot-matrix style library, which draws coastlines as small dots and looks blurry when zoomed in. I then switched to drawing it myself on a canvas: d3-geo for the projection, and Natural Earth vector data for coastlines and borders, so it stays sharp at any zoom.

For a while after the rewrite, the globe was a plain disc with no land. The script reads its colours from CSS variables, and the page still had the old version's variable names; the new ones were not defined. Giving a canvas an empty colour value raises no error. It simply keeps the previous colour, so the land, the sea and the lines were all the same colour.

## The visitor map and the log

At the bottom of the homepage there is a visitor map. Behind it are a very small Worker and a D1 database: each page reports to `/api/log` once when it opens, and the Worker reads the visitor's city from the request information Cloudflare provides and writes it to the database. No IP address is stored, no cookie is set, and the location is only as precise as the city.

The questions Pop Cat receives, and its answers, are logged too, so that I can see what people ask. The chat box says so. The model runs locally, but the questions are recorded, and visitors should be told that.

The API needs a rate limit. I used Cloudflare's built-in rate limiting, set to 60 requests a minute per visitor, and then tested it: 150 concurrent requests all went through; then 300 more over half a minute, of which only 8 were refused. The reason is that each Cloudflare machine keeps its own count.

I did not stack stricter limits on top. I took a different approach: once a day the Worker checks the database, and if it is more than 80% full, or an abnormal number of log lines were written in a day, it sends me an email, and I export and clean up. For a personal site that is enough, and it is easier to maintain.

## Deployment

The code is on [GitHub](https://github.com/jwj1342/jwj1342.github.io). After a push to `master`, Cloudflare pulls the code, builds it and publishes it by itself; it is live in about a minute.

The old address, `jwj1342.github.io`, still works. GitHub Pages cannot be configured to send 301 redirects, so I have it publish a very small branch holding just two pages, whose job is to take the visitor to the same path on wenjia.me:

```html
<script>
  location.replace('https://wenjia.me' + location.pathname + location.search + location.hash);
</script>
```

One of the two pages is `404.html`. No address of the old site exists in the new branch, so every one of them lands on this page and is taken to the new site. Once there, old publication links are matched to their new pages by a table of redirects.

## What it uses

- Pages: Astro, TypeScript, hand-written CSS, KaTeX, Shiki
- Maps: canvas, d3-geo, Natural Earth vector data
- Chat: WebLLM, WebGPU, Qwen3.5 0.8B
- Cloudflare: Workers (static files and the two API addresses), D1, R2, Workers Builds, Workers AI (for translating blog posts)

The English version of this post was translated by Claude. The site also has a translation script that can produce the other-language version of each post; readers switch above the post.
