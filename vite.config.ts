import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            drive: resolve(import.meta.dirname, "index.html"),
            dyno: resolve(import.meta.dirname, "dyno/index.html"),
            networkTest: resolve(import.meta.dirname, "network-test/index.html"),
          },
        },
      },
    },
  },
});
