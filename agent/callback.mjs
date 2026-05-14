#!/usr/bin/env node
// POSTs a status update to pitch-pit /api/build-callback.
//
// Usage:
//   node agent/callback.mjs <phase> "<log line>" [--mvp-url ...] [--repo-url ...] [--error ...]
//
// Env vars consumed (set by the workflow):
//   CALLBACK_URL, CALLBACK_TOKEN, IDEA_ID
//
// Exits non-zero only on hard transport failure — a 4xx/5xx from the
// receiver is logged and treated as best-effort so a flaky callback
// doesn't bring down a successful build.

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("usage: callback.mjs <phase> [log] [--mvp-url ...] [--repo-url ...] [--error ...]");
  process.exit(2);
}

const phase = args[0];
let log = args[1] && !args[1].startsWith("--") ? args[1] : undefined;

const flags = {};
for (let i = log ? 2 : 1; i < args.length; i++) {
  const flag = args[i];
  if (!flag.startsWith("--")) continue;
  const key = flag.replace(/^--/, "").replace(/-/g, "_");
  const value = args[i + 1];
  flags[key] = value;
  i++;
}

const payload = {
  callback_token: process.env.CALLBACK_TOKEN,
  idea_id: process.env.IDEA_ID,
  phase,
  log,
  mvp_url: flags.mvp_url,
  repo_url: flags.repo_url,
  screenshot_url: flags.screenshot_url,
  error: flags.error,
};

const url = process.env.CALLBACK_URL;
if (!url || !payload.callback_token || !payload.idea_id) {
  console.error("callback: missing CALLBACK_URL / CALLBACK_TOKEN / IDEA_ID");
  process.exit(1);
}

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`[callback] ${phase} → ${res.status} ${text.slice(0, 200)}`);
} catch (err) {
  console.error(`[callback] transport error: ${err?.message ?? err}`);
  process.exit(0); // best-effort: don't fail the workflow on a flaky callback
}
