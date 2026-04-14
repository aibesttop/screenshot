import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

const SITE = process.env.SITE_URL ?? "https://snaplink.io";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    sitemap(),
  ],
  build: {
    format: "directory",
  },
});
