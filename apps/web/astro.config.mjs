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
  // The cross-site form check moves to src/middleware.ts: the OAuth token and registration endpoints and the MCP
  // endpoint are called by other origins by design, every other form keeps the check.
  security: { checkOrigin: false },
});
