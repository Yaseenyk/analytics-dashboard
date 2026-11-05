// Daily lab speed test (Lighthouse, mobile, performance only) of every site's home page. Free: runs on the GitHub runner.
// Appends one run to data/speed.json (newest last, 60 kept); scripts/build.mjs publishes it to the dashboard.
//   node scripts/speed.mjs                 test all sites
//   node scripts/speed.mjs solar.streamerosai.com   test only the named hosts (for trying it out)
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const HOSTS = ["streamerosai.com", "yk.streamerosai.com", "fitrank.streamerosai.com", "campus.streamerosai.com", "spotai.streamerosai.com", "tools.streamerosai.com", "solar.streamerosai.com", "calc.streamerosai.com", "images.streamerosai.com", "math.streamerosai.com"];
const only = process.argv.slice(2);
const hosts = only.length ? only : HOSTS;
const FILE = "data/speed.json";

function test(host) {
  try {
    const out = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["--yes", "lighthouse@12.8.2", `https://${host}/`, "--only-categories=performance", "--output=json", "--output-path=stdout", "--quiet", "--chrome-flags=--headless=new --no-sandbox --disable-gpu"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240000, shell: process.platform === "win32" },
    );
    const j = JSON.parse(out);
    const a = j.audits;
    return { score: Math.round(100 * j.categories.performance.score), lcp: Math.round(a["largest-contentful-paint"].numericValue), cls: +a["cumulative-layout-shift"].numericValue.toFixed(3), tbt: Math.round(a["total-blocking-time"].numericValue), fcp: Math.round(a["first-contentful-paint"].numericValue) };
  } catch (e) {
    console.warn(`speed: ${host} failed: ${String(e.message).split("\n")[0]}`);
    return null;
  }
}

let file = { generatedAt: "", runs: [] };
try { file = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* first run */ }
const sites = {};
for (const h of hosts) {
  sites[h] = test(h);
  console.log(`speed: ${h} ${sites[h] ? sites[h].score : "failed"}`);
}
if (Object.values(sites).some(Boolean)) {
  const at = new Date().toISOString();
  file = { generatedAt: at, runs: [...file.runs, { at, sites }].slice(-60) };
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(file));
} else {
  console.error("speed: every test failed, keeping the old file");
  process.exit(1);
}
