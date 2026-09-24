/**
 * PM2 configuration for the EnergyScope solar-generation archive collector.
 *
 * Deploy on the Oracle server:
 *   pm2 start ecosystem.archive.config.js
 *   pm2 save
 *
 * The collector runs once and exits (autorestart: false). cron_restart wakes
 * it HOURLY from 10:00 to 22:00 SYSTEM time (TZ below is Asia/Kolkata) — PM2
 * evaluates cron_restart in the HOST's local timezone, and on the Oracle host
 * that timezone IS Asia/Kolkata, so the expression below means 10:00-22:00 IST:
 *
 *   - 10:00 IST  — post-sunrise; captures early-day production.
 *   - 11:00-19:00 IST — hourly daylight checkpoints of the evolving day.
 *   - 20:00 IST  — after sunset; final capture of the completed solar day.
 *   - 21:00 / 22:00 IST — post-completion safety nets for any slow UTL
 *                          publication and today's authoritative scalar.
 *
 * No runs between 23:00 and 09:00 IST: the solar day is over and the fixed
 * 10:00-22:00 window keeps the archive's "has today" boundary fresh without
 * wasting API calls overnight. Every run performs the same gap-aware scan: it
 * backfills any missing days in the archive window and upserts already-present
 * rows. The scan is fully idempotent, so multiple daily firings never
 * duplicate data, and a missed run is simply covered by the next one. The
 * script computes target dates on the Asia/Kolkata calendar day boundary, so
 * even if the host clock zone differs, the correct days are archived.
 */

module.exports = {
  apps: [
    {
      name: "energyscope-archive-collector",
      cwd: __dirname,
      script: "scripts/archive-collector.js",
      exec_mode: "fork",
      instances: 1,

      // Run once per invocation; PM2 cron restarts it every hour from 10:00
      // to 22:00 IST (see header comment on timezone interpretation).
      autorestart: false,
      cron_restart: "0 10-22 * * *",

      max_memory_restart: "300M",

      env: {
        NODE_ENV: "production",
        // Helps humans reading logs; correctness never depends on this.
        TZ: "Asia/Kolkata",
      },

      out_file: "./logs/archive-out.log",
      error_file: "./logs/archive-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
