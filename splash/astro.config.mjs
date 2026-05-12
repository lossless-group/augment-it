// @ts-check
import { defineConfig } from 'astro/config';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';

// Splash for augment-it.
// Hosted on GitHub Pages from lossless-group/augment-it.
// Live URL: https://lossless-group.github.io/augment-it/
//
// If a custom domain is added later, set `site` to that domain and `base` to '/'.
export default defineConfig({
  site: 'https://lossless-group.github.io',
  base: '/augment-it/',
  trailingSlash: 'ignore',

  integrations: [
    pagefind(),
    sitemap({
      filter: (page) =>
        !page.includes('/llms.txt') &&
        !page.includes('/llms-full.txt') &&
        !page.endsWith('/404/') &&
        !page.endsWith('/404'),
    }),
  ],

  build: {
    format: 'directory',
  },
});
