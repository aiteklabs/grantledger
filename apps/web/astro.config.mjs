import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://grantledger.eu",
  output: "server",
  adapter: cloudflare({ imageService: "passthrough" }),
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
    routing: { prefixDefaultLocale: false },
  },
  trailingSlash: "never",
});
