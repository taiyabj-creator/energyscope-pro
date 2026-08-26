import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Nitro's vite integration disables Vite's native public/ copy for the
// client environment (nitro:env sets `copyPublicDir ??= false`) and only
// copies public assets late, after vite-plugin-pwa has already needed them.
// It also snapshots public assets (size/etag) into the server bundle while
// the final service worker generation is still pending. Force the native
// early copy and restrict SW generation to the client build so sw.js exists,
// complete and stable, before Nitro scans .output/public.
function clientPublicCopy(): Plugin {
  return {
    name: "energyscope:client-copy-public",
    configEnvironment(name, config) {
      if (config.consumer === "client") {
        config.build ??= {};
        config.build.copyPublicDir = true;
      }
    },
  };
}

const vitePWAs: Plugin[] = VitePWA({
  outDir: ".output/public",
  registerType: "autoUpdate",

  includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],

  manifest: {
    name: "EnergyScope Pro",
    short_name: "EnergyScope",
    description: "Professional Solar Monitoring Dashboard",

    theme_color: "#0f172a",
    background_color: "#0f172a",

    display: "standalone",
    orientation: "portrait",

    start_url: "/",
    scope: "/",

    icons: [
      {
        src: "pwa-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "pwa-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "pwa-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  },

  workbox: {
    globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
    navigateFallback: null,
    // Load Web Push handlers inside the generated service worker
    // (public/push-handlers.js is copied verbatim to the build output).
    importScripts: ["/push-handlers.js"],
  },

  devOptions: {
    // Dev-mode generateSW runs Workbox against an empty <root>/dev-dist
    // folder and crashes ("Couldn't find configuration for either
    // precaching or runtime caching"). Production builds are unaffected
    // by this flag - they always emit the full PWA into .output/public.
    enabled: false,
  },
}).map((plugin) => {
  // Only the build plugin generates the service worker; the others must
  // stay global so virtual:pwa-register resolves in every environment.
  if (plugin.name === "vite-plugin-pwa:build") {
    plugin.applyToEnvironment = (environment) => environment.name === "client";
  }
  return plugin;
});

const config: UserConfig = {
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  server: {
    host: "0.0.0.0",
  },

  plugins: [
    clientPublicCopy(),
    tsconfigPaths(),

    tailwindcss(),

    tanstackStart({
      server: {
        entry: "server",
      },
    }),

    nitro({
      preset: "node-server",
      routeRules: {
        "/api/**": {
          proxy: `${process.env["API_PROXY_TARGET"] ?? "http://127.0.0.1:3001"}/api/**`,
        },
      },
    }),

    ...vitePWAs,

    react(),
  ],
};

export default defineConfig(config);
