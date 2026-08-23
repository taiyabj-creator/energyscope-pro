import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  server: {
    host: "0.0.0.0",
  },

  plugins: [
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

    VitePWA({
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
    }),

    react(),
  ],
});
