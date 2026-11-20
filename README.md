# wenjia.me

Personal site of Wenjia Jiang: homepage, publications, blog and photo wall.
Built with [Astro](https://astro.build), deployed to Cloudflare Workers as static assets.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run check      # type and template check
npm run build      # production build into dist/
```

Requires Node 22.12 or newer.

## Edit content

| What | Where |
| --- | --- |
| Name, headline, links | `src/data/site.ts` |
| Homepage intro paragraph | `src/pages/index.astro` |
| Publications | `src/content/publications/*.md` (set `featured: true` to show one on the homepage) |
| Blog posts | `src/content/blog/*.md` or `.mdx` |
| Misc page | `src/content/pages/misc.md` (plain Markdown) |
| Career timeline (homepage) | `src/data/career.ts` |
| Life achievements (Misc) | `src/data/achievements.ts`; icons in `src/data/pixel-icons.ts` |
| Footprints globe (Misc) | `src/data/footprints.ts`: one entry per place (name, coordinates, year, kind, note, optional photo) |
| Pop Cat (chat in the corner) | `src/data/popcat.ts`: model, one-tap questions, extra facts, pronouns |
| CV | `public/files/CV_Wenjia_Jiang.pdf` (keep the file name; it is linked from outside) |

### Write a blog post

Create `src/content/blog/my-post.md`:

```md
---
title: My post
description: One sentence for the list page and link previews.
date: 2026-12-01
lang: en        # or zh
tags: [agents]
draft: true     # visible in `npm run dev` only; remove to publish
---

Markdown here. Code blocks, tables and LaTeX math ($inline$ and $$display$$) work.
```

### Translate posts (中文 ↔ English)

Write each post once, in either language, and set `lang: zh` or `lang: en`. Then run:

```bash
npm run translate                 # every post that is new or has changed
npm run translate -- my-post      # just one post
npm run translate -- --force      # redo even if the source is unchanged
```

This writes the other-language version to `src/content/blog-i18n/` using Cloudflare
Workers AI (it reuses your `npx wrangler login`). Readers switch with the 中文 / EN control
on the blog; the site remembers their choice. A post without a translation is simply shown
in its own language.

Translations are plain Markdown: review them, fix anything that reads badly, and commit.
Add `locked: true` to a translation's front matter to stop the script from overwriting
your edits when the source post changes.

### Add photos

Photos live in the R2 bucket `wenjia-photos` (served from `photos.wenjia.me`), not in Git.

```bash
npm run photos:add -- ~/Pictures/some-folder --title "Optional caption"
npm run photos:add -- photo.jpg --dry-run    # process only, upload nothing
npm run photos:remove -- <id>                # take one down (ids are in src/data/photos.json)
npm run photos:remove -- --title "Placeholder"   # take down every photo with that caption
```

The script makes a thumbnail and a large WebP, strips location data, uploads both, and
records each photo in `src/data/photos.json`. Commit that file and deploy.
Uploading needs `npx wrangler login` once.

### Pop Cat

The cat in the bottom-right corner opens a chat with a small language model that runs in
the visitor's own browser (WebLLM on WebGPU). There is no server and no API key. Nothing
is downloaded until the visitor sends a first question; the weights (about 430 MB) then
come from our own R2 bucket at `models.wenjia.me` and stay in that browser's cache, so
each visitor downloads them once. Phones and tablets can be given a different model
(`phoneModel`); at present it is the same one.

What the cat knows is generated at build time from the site's own data
(`src/pages/chat-profile.json.ts`), so editing your career, papers or achievements updates
the cat too.

To change the model, pick ids from WebLLM's model list, copy them to the bucket, then set
them in `src/data/popcat.ts`:

```bash
npm run model:mirror -- <model id> <fallback model id>
```

To try a model without copying or editing anything, open a page with
`?popcat-model=<WebLLM model id>` added to its address (it is then fetched from Hugging Face).

## Deploy

Pushing to `master` on GitHub deploys the site: Cloudflare (Workers Builds, set up on the
Worker under Settings > Builds) checks out the commit, runs `npm run build`, then
`npx wrangler deploy`. The Node version it builds with is the one in `.nvmrc`.

To deploy from your own computer instead, without waiting for a push:

```bash
npm run deploy     # astro build && wrangler deploy
```

This publishes to https://wenjia.me straight away. To try a change on a separate address
first, without touching the live site:

```bash
npm run build && npx wrangler versions upload --preview-alias try
```

and open `https://try-wenjia-me.<account>.workers.dev`. `www.wenjia.me` is redirected to
`wenjia.me` by a redirect rule on the Cloudflare zone.

Old Jekyll URLs are redirected by `public/_redirects`. The previous Jekyll site is kept on
the `legacy-jekyll` branch.

The old address https://jwj1342.github.io is served by GitHub Pages from the
`github-pages-redirect` branch, which holds only two pages that send visitors to the same
address on wenjia.me.
