/**
 * Draws the visitor map on the homepage (src/components/VisitorMap.astro): the world's
 * land as a flat map on a canvas, and a dot on every city a visitor came from. A city
 * with more visits gets a larger dot. The dots come from /api/visitors.
 */
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import landData from 'world-atlas/land-110m.json';

interface Visitors {
  visits: number;
  cities: number;
  countries: number;
  since: string | null;
  /** [longitude, latitude, visits] */
  points: [number, number, number][];
}

const NORTH = 84; // the map is cut off here and at SOUTH: no polar ice, more room for cities
const SOUTH = -57;

export function start(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const count = root.querySelector<HTMLElement>('[data-vm-count]')!;
  const ctx = canvas.getContext('2d')!;
  const world = landData as unknown as Topology;
  const land = feature(world, world.objects.land);
  const projection = geoNaturalEarth1();
  const path = geoPath(projection, ctx);
  let data: Visitors | null = null;

  function draw() {
    const width = canvas.clientWidth;
    if (!width) return;
    // fit the whole world to the width, then slide it up so that NORTH is the top edge
    projection.fitWidth(width, { type: 'Sphere' });
    const top = projection([0, NORTH])![1];
    const height = projection([0, SOUTH])![1] - top;
    const [tx, ty] = projection.translate();
    projection.translate([tx, ty - top]);

    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const style = getComputedStyle(root);
    const colour = (name: string) => style.getPropertyValue(name).trim();
    ctx.beginPath();
    path(land);
    ctx.fillStyle = colour('--vm-land');
    ctx.fill();
    ctx.strokeStyle = colour('--vm-coast');
    ctx.lineWidth = 0.7;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (!data) return;
    const dot = colour('--vm-dot');
    const scale = Math.max(0.7, Math.min(1.15, width / 720)); // smaller dots on a phone
    // largest first, so that a small city next to a big one stays visible on top of it
    for (const [lon, lat, visits] of [...data.points].sort((a, b) => b[2] - a[2])) {
      const at = projection([lon, lat]);
      if (!at || at[1] < 0 || at[1] > height) continue;
      const r = Math.min(7, 1.8 + 1.1 * Math.log2(1 + visits)) * scale;
      ctx.beginPath();
      ctx.arc(at[0], at[1], r * 2.4, 0, 2 * Math.PI);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = dot;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(at[0], at[1], r, 0, 2 * Math.PI);
      ctx.globalAlpha = 0.9;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

  function describe(v: Visitors) {
    if (!v.visits) return 'No visits counted yet.';
    const parts = [plural(v.visits, 'visit', 'visits'), plural(v.cities, 'city', 'cities'), plural(v.countries, 'country', 'countries')];
    const since = v.since ? new Date(v.since) : null;
    if (since && !Number.isNaN(since.getTime())) parts.push(`since ${since.toLocaleDateString('en', { month: 'short', year: 'numeric' })}`);
    return parts.join(' · ');
  }

  draw(); // the land first; the dots when they arrive
  fetch('/api/visitors')
    .then((res) => (res.ok ? (res.json() as Promise<Visitors>) : Promise.reject(new Error(String(res.status)))))
    .then((v) => {
      data = v;
      count.textContent = describe(v);
      canvas.setAttribute('aria-label', `World map of the cities this site's visitors came from: ${describe(v)}`);
      draw();
    })
    .catch(() => {
      count.textContent = 'Visitor counts are not available right now.';
    });

  let lastWidth = canvas.clientWidth;
  new ResizeObserver(() => {
    if (canvas.clientWidth !== lastWidth) {
      lastWidth = canvas.clientWidth;
      draw();
    }
  }).observe(canvas);
  // follow the site's light / dark switch
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
}
