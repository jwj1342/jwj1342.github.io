import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const publications = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/publications' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /** Full venue name, shown on the publications page. */
    venue: z.string(),
    /** Short badge, e.g. "ACM MM 2025". */
    badge: z.string(),
    preprint: z.boolean().default(false),
    /** DOI as OpenAlex lists it (lower case); used to look up the citation count. */
    doi: z.string().optional(),
    authors: z.array(z.string()),
    links: z
      .object({
        paper: z.url().optional(),
        pdf: z.url().optional(),
        project: z.url().optional(),
        code: z.url().optional(),
      })
      .default({}),
    /** Show on the homepage under "Selected research". */
    featured: z.boolean().default(false),
    featuredOrder: z.number().default(99),
    image: z.string().optional(),
    imageWidth: z.number().optional(),
    imageHeight: z.number().optional(),
    summary: z.string().optional(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    lang: z.enum(['en', 'zh']).default('en'),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

/** Machine translations of blog posts, written by `npm run translate`. */
const blogI18n = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog-i18n' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    lang: z.enum(['en', 'zh']),
    sourceHash: z.string(),
    model: z.string().optional(),
    locked: z.boolean().default(false),
  }),
});

export const collections = { publications, blog, blogI18n };
