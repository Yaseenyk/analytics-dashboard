// One-off: turn Natural Earth country shapes (world-atlas) into SVG paths for the dashboard's world map.
// Run `node scripts/gen-world.mjs` after changing it; the output (src/lib/world.json) is committed, so the
// build and the browser need no map libraries.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1, geoPath, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const load = (f) => JSON.parse(fs.readFileSync(require.resolve(`world-atlas/${f}`), 'utf8'));
const c110 = feature(load('countries-110m.json'), load('countries-110m.json').objects.countries).features.filter((f) => f.id !== '010'); // no Antarctica
const c50 = feature(load('countries-50m.json'), load('countries-50m.json').objects.countries).features.filter((f) => f.id !== '010');

const W = 960;
const proj = geoNaturalEarth1();
const sphere = { type: 'Sphere' };
proj.fitWidth(W, sphere);
const path = geoPath(proj).digits(1);
// Crop the view to the land that is drawn (Antarctica is left out), with a small margin.
const [[x0, y0], [x1, y1]] = path.bounds({ type: 'FeatureCollection', features: c110 });
const vb = [Math.floor(x0) - 4, Math.floor(y0) - 4, Math.ceil(x1 - x0) + 8, Math.ceil(y1 - y0) + 8];

const names = new Set(c110.map((f) => f.properties.name));
const countries = c110.map((f) => ({ n: f.properties.name, d: path(f) })).filter((x) => x.d);
// Places too small for the 110m shapes (Singapore, Hong Kong, Malta...) become dots at their centre.
const dots = c50
  .filter((f) => !names.has(f.properties.name))
  .map((f) => {
    const [x, y] = proj(geoCentroid(f));
    return { n: f.properties.name, x: +x.toFixed(1), y: +y.toFixed(1) };
  })
  .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y));

fs.writeFileSync(new URL('../src/lib/world.json', import.meta.url), JSON.stringify({ vb, countries, dots }));
console.log(`${countries.length} countries, ${dots.length} dots, viewBox ${vb.join(' ')}`);
