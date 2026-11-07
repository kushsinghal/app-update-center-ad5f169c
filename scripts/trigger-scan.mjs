// Run by the Render Cron Job: asks the website to start a deal scan.
const base = (process.env.APP_URL || "").replace(/\/+$/, "");
if (!base || !process.env.CRON_SECRET) {
  console.error("APP_URL and CRON_SECRET must be set");
  process.exit(1);
}
const r = await fetch(`${base}/api/public/cron/fetch`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(90000),
});
const text = await r.text();
console.log(r.status, text.slice(0, 500));
if (!r.ok) process.exit(1);
