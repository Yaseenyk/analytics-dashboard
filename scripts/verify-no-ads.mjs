// Tripwire: this site must NOT show Google ads. Fails the build if the built site contains Google's ad script or an ad unit.
// (The AdSense ownership meta tag and ads.txt are fine: they load nothing.)
// To turn ads on for a site on purpose, delete this script and its line in package.json "build".
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = ["out", "dist"].find((d) => existsSync(d));
if (!dir) {
  console.log("verify-no-ads: no build output folder found, nothing to check");
  process.exit(0);
}

const MARKERS = ["pagead2.googlesyndication.com", "adsbygoogle.js", 'class="adsbygoogle"', "googleads.g.doubleclick.net"];
const hits = [];
let scanned = 0;
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(html|js|mjs|css|json|txt|xml)$/i.test(n) || s.size > 5_000_000) continue;
    scanned++;
    const t = readFileSync(p, "utf-8");
    for (const m of MARKERS) if (t.includes(m)) hits.push(`${p}: contains "${m}"`);
  }
})(dir);

if (hits.length) {
  console.error(`verify-no-ads: FAILED. Google ad code found in a site that must not show ads:\n- ${hits.slice(0, 10).join("\n- ")}`);
  process.exit(1);
}
console.log(`verify-no-ads: OK, no Google ad code in ${scanned} built files (${dir}/)`);
