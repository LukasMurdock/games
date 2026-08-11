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
            driveDyno: resolve(import.meta.dirname, "drive/labs/dyno/index.html"),
            driveManeuverLab: resolve(import.meta.dirname, "drive/labs/maneuvers/index.html"),
            driveSoundtrackLab: resolve(import.meta.dirname, "drive/labs/soundtrack/index.html"),
            legacyDyno: resolve(import.meta.dirname, "dyno/index.html"),
            legacyManeuverLab: resolve(import.meta.dirname, "maneuver-lab/index.html"),
            networkTest: resolve(import.meta.dirname, "network-test/index.html"),
          },
        },
      },
    },
  },
});
