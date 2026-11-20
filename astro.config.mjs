import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://wenjia.me',
  integrations: [mdx(), sitemap()],
  vite: {
    // Keep CSS readable by older phones: without this the build rewrites media queries
    // into the newer range syntax, which Safari before 16.4 ignores.
    build: { cssTarget: ['safari14', 'chrome90', 'firefox90'] },
  },
  markdown: {
    // Unified (remark/rehype) pipeline, needed for the math plugins.
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      wrap: false,
    },
  },
});
