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
            home: resolve(import.meta.dirname, "index.html"),
            drive: resolve(import.meta.dirname, "drive/index.html"),
            dyno: resolve(import.meta.dirname, "dyno/index.html"),
            maneuverLab: resolve(import.meta.dirname, "maneuver-lab/index.html"),
            networkTest: resolve(import.meta.dirname, "network-test/index.html"),
          },
        },
      },
    },
  },
});
