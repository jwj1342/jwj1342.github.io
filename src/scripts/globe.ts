/**
 * The footprints globe on the Misc page, drawn here on a canvas from vector outlines
 * (coastlines and country borders from Natural Earth), so it stays sharp at any zoom
 * and on any screen. Drag it to turn it; pick a label or a row in the list and the
 * globe turns to face that place; the +/- buttons zoom; the filter buttons show one
 * kind of place at a time. The places come from src/data/footprints.ts, through the page.
 */
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import worldData from 'world-atlas/countries-110m.json';

interface Place {
  lat: number;
  lon: number;
  kind: string;
}

const root = document.querySelector<HTMLElement>('[data-globe]');

function start(root: HTMLElement) {
  const places = JSON.parse(root.dataset.places ?? '[]') as Place[];
  const stage = root.querySelector<HTMLElement>('.globe-stage')!;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const labels = [...root.querySelectorAll<HTMLButtonElement>('.glabel')];
  const rows = [...root.querySelectorAll<HTMLButtonElement>('.place')];
  const filters = [...root.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const zoomButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-zoom]')];

  const MAX_ZOOM = 11; // far enough in to tell apart cities a couple of hundred kilometres apart
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- the world ------------------------------------------------------------------

  const world = worldData as unknown as Topology;
  const countries = world.objects.countries as GeometryCollection;
  const land = feature(world, world.objects.land);
  const borders = mesh(world, countries, (a, b) => a !== b); // lines between countries, not coasts
  const graticule = geoGraticule10();

  root.classList.add('globe-on'); // shows the stage, so that it can be measured
  /** How wide each label is with its name written out, in px (measured once). */
  const widths = labels.map((label) => label.offsetWidth);

  // The view: the point of the globe that faces the visitor, and how far in we are.
  let lon = 40;
  let lat = 28;
  let zoom = 1;
  let lonTarget: number | null = null;
  let latTarget: number | null = null;
  let zoomTarget = 1;
  let spinning = !calm; // turns slowly by itself until the visitor takes hold of it
  let picked = -1;
  let shown = 'all';
  let size = stage.clientWidth;
  let dirty = true;

  const projection = geoOrthographic().clipAngle(90).precision(0.4);
  const path = geoPath(projection, ctx);

  // ---- colours (they follow the site's light / dark theme) ----------------------------

  let colours: Record<string, string> = {};
  function readColours() {
    const style = getComputedStyle(root);
    const names = ['--globe-sea', '--globe-land', '--globe-coast', '--globe-border', '--globe-grid', '--globe-rim', '--globe-halo', '--kind-conference', '--kind-base', '--kind-trip'];
    colours = Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()]));
    dirty = true;
  }
  readColours();

  // ---- drawing ----------------------------------------------------------------------

  function fit() {
    size = stage.clientWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    dirty = true;
  }

  function draw() {
    projection
      .translate([size / 2, size / 2])
      .scale(size * 0.44 * zoom)
      .rotate([-lon, -lat]);
    ctx.clearRect(0, 0, size, size);
    ctx.lineJoin = 'round';

    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = colours['--globe-sea'];
    ctx.fill();

    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle = colours['--globe-grid'];
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.beginPath();
    path(land);
    ctx.fillStyle = colours['--globe-land'];
    ctx.fill();
    ctx.strokeStyle = colours['--globe-coast'];
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.beginPath();
    path(borders);
    ctx.strokeStyle = colours['--globe-border'];
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.strokeStyle = colours['--globe-rim'];
    ctx.lineWidth = 1.2;
    ctx.stroke();

    placeDotsAndLabels();
  }

  /**
   * Draw a dot on every place that faces the visitor, and put its label on it. A name is
   * written to the right of its dot, or to the left if another name is in the way there;
   * if neither side is free only the dot is drawn (the picked place gets first choice,
   * then list order), and zooming in makes room.
   */
  function placeDotsAndLabels() {
    const taken: { left: number; right: number; y: number }[] = [];
    const free = (left: number, right: number, y: number) =>
      left > 0 && right < size && !taken.some((t) => Math.abs(t.y - y) < 20 && left < t.right + 4 && t.left < right + 4);
    const order = labels.map((_, i) => i).sort((a, b) => Number(b === picked) - Number(a === picked) || a - b);
    const dots: { x: number; y: number; i: number }[] = [];

    for (const i of order) {
      const label = labels[i];
      const place = places[i];
      const at = projection([place.lon, place.lat]);
      const facing = geoDistance([lon, lat], [place.lon, place.lat]) < 1.45; // a little short of the edge
      const inKind = shown === 'all' || place.kind === shown;
      const visible = !!at && facing && inKind && at[0] > 6 && at[0] < size - 6 && at[1] > 6 && at[1] < size - 6;
      label.classList.toggle('away', !visible);
      label.tabIndex = visible ? 0 : -1;
      if (!visible || !at) continue;
      const [x, y] = at;
      label.style.left = `${x.toFixed(1)}px`;
      label.style.top = `${y.toFixed(1)}px`;
      dots.push({ x, y, i });
      const half = 9; // half the width of the label's hit area around the dot
      const onRight = free(x - half, x - half + widths[i], y);
      const onLeft = !onRight && free(x + half - widths[i], x + half, y);
      label.classList.toggle('flip', onLeft);
      label.classList.toggle('tight', !onRight && !onLeft);
      if (onRight) taken.push({ left: x - half, right: x - half + widths[i], y });
      else if (onLeft) taken.push({ left: x + half - widths[i], right: x + half, y });
      else taken.push({ left: x - half, right: x + half, y });
    }

    // the picked place's dot is drawn last, on top
    for (const { x, y, i } of dots.reverse()) {
      const on = i === picked;
      const colour = colours[`--kind-${places[i].kind}`];
      if (on) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.fillStyle = colours['--globe-halo'];
        ctx.fill();
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, on ? 5 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.strokeStyle = colours['--globe-sea'];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ---- animation --------------------------------------------------------------------

  let onScreen = true;
  let dragging = false;
  let velocity = 0; // sideways spin left over from a drag, in degrees per frame
  function frame() {
    requestAnimationFrame(frame);
    if (!onScreen || document.hidden) return;
    if (lonTarget !== null && latTarget !== null) {
      // turn the short way round towards the picked place
      const gap = ((((lonTarget - lon) % 360) + 540) % 360) - 180;
      lon += gap * (calm ? 1 : 0.1);
      lat += (latTarget - lat) * (calm ? 1 : 0.1);
      if (Math.abs(gap) < 0.02 && Math.abs(latTarget - lat) < 0.02) {
        lon = lonTarget;
        lat = latTarget;
        lonTarget = latTarget = null;
      }
      dirty = true;
    } else if (!dragging) {
      if (Math.abs(velocity) > 0.01) {
        lon -= velocity;
        velocity *= 0.94;
        dirty = true;
      } else if (spinning) {
        lon += 0.12;
        dirty = true;
      }
    }
    if (Math.abs(zoomTarget - zoom) > 0.001) {
      zoom += (zoomTarget - zoom) * (calm ? 1 : 0.14);
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      draw();
    }
  }

  // ---- picking, filtering, zooming -----------------------------------------------------

  function select(index: number) {
    picked = index;
    spinning = false;
    velocity = 0;
    for (const el of [...labels, ...rows]) {
      const on = Number(el.dataset.place) === index;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    }
    if (places[index]) {
      lonTarget = places[index].lon;
      latTarget = Math.max(-75, Math.min(75, places[index].lat));
    }
    dirty = true;
  }

  function show(kind: string) {
    shown = kind;
    for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.filter === kind));
    for (const row of rows) row.closest('li')!.toggleAttribute('hidden', kind !== 'all' && row.dataset.kind !== kind);
    dirty = true;
  }

  for (const label of labels) label.addEventListener('click', () => select(Number(label.dataset.place)));
  for (const row of rows) row.addEventListener('click', () => select(Number(row.dataset.place)));
  for (const button of filters) button.addEventListener('click', () => show(button.dataset.filter ?? 'all'));
  for (const button of zoomButtons) {
    button.addEventListener('click', () => {
      // rounded, so that zooming in and back out lands on exactly 1 and the − button goes grey again
      const next = Math.round(zoomTarget * (button.dataset.zoom === 'in' ? 1.6 : 1 / 1.6) * 1000) / 1000;
      zoomTarget = Math.max(1, Math.min(MAX_ZOOM, next));
      for (const b of zoomButtons) b.disabled = b.dataset.zoom === 'in' ? zoomTarget >= MAX_ZOOM : zoomTarget <= 1;
    });
  }

  // ---- dragging -----------------------------------------------------------------------

  let lastX = 0;
  let lastY = 0;
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return; // labels and zoom buttons are for clicking
    dragging = true;
    spinning = false;
    lonTarget = latTarget = null;
    velocity = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('grabbing');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // the point under the pointer stays under the pointer
    const degreesPerPx = 180 / Math.PI / (size * 0.44 * zoom);
    const turn = (e.clientX - lastX) * degreesPerPx;
    lon -= turn;
    velocity = turn;
    lat = Math.max(-80, Math.min(80, lat + (e.clientY - lastY) * degreesPerPx));
    lastX = e.clientX;
    lastY = e.clientY;
    dirty = true;
  });
  const release = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    stage.classList.remove('grabbing');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  // ---- keeping up with the page -------------------------------------------------------

  new ResizeObserver(() => {
    if (stage.clientWidth && stage.clientWidth !== size) fit();
  }).observe(stage);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    dirty = true;
  }).observe(stage);
  // follow the site's light / dark switch
  new MutationObserver(readColours).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColours);

  fit();
  frame();
}

if (root) start(root);
