import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: {
      entry: "server",
    },
  },

  nitro: {
    preset: "node-server",
  },

  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",

        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "masked-icon.svg",
        ],

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
        },

        devOptions: {
          enabled: true,
        },
      }),
    ],
  },
});
