/**
 * PM2 configuration for the EnergyScope solar-generation archive collector.
 *
 * Deploy on the Oracle server:
 *   pm2 start ecosystem.archive.config.js
 *   pm2 save
 *
 * The collector runs once and exits (autorestart: false). cron_restart wakes
 * it SIX TIMES EVERY DAY at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00 SYSTEM
 * time (TZ below is Asia/Kolkata):
 *
 *   - 00:00 IST  — overnight backup / safety net.
 *   - 04:00 IST  — pre-dawn safety net for any missed overnight run.
 *   - 08:00 IST  — post-sunrise; captures early-day production.
 *   - 12:00 IST  — midday checkpoint of today's partial production.
 *   - 16:00 IST  — afternoon checkpoint; declining production phase.
 *   - 20:00 IST  — after sunset; final capture of the completed solar day.
 *
 * Every run performs the same gap-aware scan: it backfills any missing days
 * in the archive window and upserts already-present rows. The scan is fully
 * idempotent, so multiple daily firings never duplicate data, and a missed
 * run is simply covered by the next one. The script computes target dates on
 * the Asia/Kolkata calendar day boundary, so even if the host clock zone
 * differs, the correct days are archived.
 */

module.exports = {
  apps: [
    {
      name: "energyscope-archive-collector",
      cwd: __dirname,
      script: "scripts/archive-collector.js",
      exec_mode: "fork",
      instances: 1,

      // Run once per invocation; PM2 cron restarts it at 00:00, 04:00, 08:00,
      // 12:00, 16:00 and 20:00 IST each day (six gap-aware/idempotent scans per day).
      autorestart: false,
      cron_restart: "0 0,4,8,12,16,20 * * *",

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
