/**
 * PM2 configuration for the EnergyScope solar-generation archive collector.
 *
 * Deploy on the Oracle server:
 *   pm2 start ecosystem.archive.config.js
 *   pm2 save
 *
 * The collector runs once and exits (autorestart: false). cron_restart wakes
 * it daily at 06:00 SYSTEM time (TZ below is Asia/Kolkata). 06:00 IST gives
 * the entire previous solar day time to complete before archival, and the
 * script itself computes the previous completed Asia/Kolkata calendar day,
 * so even if the host clock zone differs, the correct day is archived. A
 * duplicate fire or reboot simply re-runs an idempotent upsert.
 */

module.exports = {
  apps: [
    {
      name: "energyscope-archive-collector",
      cwd: __dirname,
      script: "scripts/archive-collector.js",
      exec_mode: "fork",
      instances: 1,

      // Run once per invocation; PM2 cron restarts it each day at 06:00 IST.
      autorestart: false,
      cron_restart: "0 6 * * *",

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
