#!/usr/bin/env node
/**
 * Add photos to the photo wall.
 *
 *   npm run photos:add -- <file-or-folder> [more...] [--title "Caption"] [--year 2026] [--dry-run]
 *
 * For each image this script:
 *   1. makes two WebP versions (a thumbnail and a large view), auto-rotated, with
 *      location and other private metadata stripped;
 *   2. uploads both to the R2 bucket (via `wrangler r2 object put`);
 *   3. records size, colour and camera info in src/data/photos.json.
 *
 * The photo wall groups photos by year, taken from each photo's capture date. For
 * photos without one (screenshots, edited exports), pass --year.
 *
 * Originals are never uploaded or committed. Re-adding the same file is a no-op.
 *
 * To take photos down again:
 *
 *   npm run photos:remove -- <id> [more ids...]     (ids are in src/data/photos.json)
 *   npm run photos:remove -- --title "Placeholder"  (every photo with that caption)
 * With --dry-run nothing is uploaded and the manifest is not changed; the WebP
 * files are written to .photos-preview/ so you can inspect them.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';

const BUCKET = 'wenjia-photos';
const THUMB_WIDTH = 800;
const FULL_LONG_EDGE = 2400;
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff', '.avif']);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src/data/photos.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const titleAt = args.indexOf('--title');
const title = titleAt >= 0 ? args[titleAt + 1] : undefined;
const yearAt = args.indexOf('--year');
const year = yearAt >= 0 ? Number(args[yearAt + 1]) : undefined;
if (yearAt >= 0 && !(year >= 1900 && year <= 2100)) {
  console.error('--year needs a four-digit year, e.g. --year 2026');
  process.exit(1);
}
const inputs = args.filter(
  (a, i) => !a.startsWith('--') && (titleAt < 0 || i !== titleAt + 1) && (yearAt < 0 || i !== yearAt + 1),
);

if (args.includes('--remove')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const doomed = manifest.filter((p) => inputs.includes(p.id) || (title !== undefined && p.title === title));
  if (doomed.length === 0) {
    console.error('Nothing matched. Pass photo ids from src/data/photos.json, or --title "Caption".');
    process.exit(1);
  }
  for (const p of doomed) {
    for (const key of [p.thumb, p.full]) {
      execFileSync('npx', ['wrangler', 'r2', 'object', 'delete', `${BUCKET}/${key}`, '--remote'], {
        cwd: root,
        stdio: ['ignore', 'ignore', 'inherit'],
      });
    }
    console.log(`removed ${p.id}${p.title ? ` (${p.title})` : ''}`);
  }
  const gone = new Set(doomed.map((p) => p.id));
  await writeFile(manifestPath, JSON.stringify(manifest.filter((p) => !gone.has(p.id)), null, 2) + '\n');
  console.log(`\n${doomed.length} photo(s) removed. Commit src/data/photos.json and deploy.`);
  process.exit(0);
}

if (inputs.length === 0) {
  console.error('Usage: npm run photos:add -- <file-or-folder> [more...] [--title "Caption"] [--year 2026] [--dry-run]');
  process.exit(1);
}

async function collect(p) {
  const s = await stat(p);
  if (s.isFile()) return EXTENSIONS.has(path.extname(p).toLowerCase()) ? [p] : [];
  const entries = await readdir(p);
  const nested = await Promise.all(entries.filter((e) => !e.startsWith('.')).map((e) => collect(path.join(p, e))));
  return nested.flat().sort();
}

function describeSettings(exif) {
  if (!exif) return undefined;
  const parts = [];
  if (exif.FocalLength) parts.push(`${Math.round(exif.FocalLength)}mm`);
  if (exif.FNumber) parts.push(`f/${exif.FNumber}`);
  if (exif.ExposureTime) {
    parts.push(exif.ExposureTime >= 1 ? `${exif.ExposureTime}s` : `1/${Math.round(1 / exif.ExposureTime)}s`);
  }
  if (exif.ISO) parts.push(`ISO ${exif.ISO}`);
  return parts.length ? parts.join(' ') : undefined;
}

function upload(localFile, key) {
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', localFile, '--content-type', 'image/webp',
     '--cache-control', 'public, max-age=31536000, immutable', '--remote'],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const known = new Set(manifest.map((p) => p.id));
const files = (await Promise.all(inputs.map(collect))).flat();
const outDir = dryRun ? path.join(root, '.photos-preview') : path.join(tmpdir(), `photos-${process.pid}`);
await mkdir(outDir, { recursive: true });

let added = 0;
for (const file of files) {
  const original = await readFile(file);
  // Content hash as the id: stable names, and duplicates are detected.
  const id = createHash('sha256').update(original).digest('hex').slice(0, 12);
  if (known.has(id)) {
    console.log(`skip   ${path.basename(file)} (already on the wall)`);
    continue;
  }

  // Only these fields are read; GPS and everything else is dropped with the metadata.
  const exif = await exifr
    .parse(original, ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'FocalLength', 'FNumber', 'ExposureTime', 'ISO'])
    .catch(() => null);

  const base = sharp(original, { failOn: 'none' }).rotate(); // apply EXIF orientation
  const thumb = await base.clone().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  const full = await base.clone().resize({ width: FULL_LONG_EDGE, height: FULL_LONG_EDGE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  const { dominant } = await sharp(thumb.data).stats();
  const color = '#' + [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('');

  const thumbKey = `t/${id}.webp`;
  const fullKey = `l/${id}.webp`;
  const thumbFile = path.join(outDir, `${id}-t.webp`);
  const fullFile = path.join(outDir, `${id}-l.webp`);
  await writeFile(thumbFile, thumb.data);
  await writeFile(fullFile, full.data);

  if (!dryRun) {
    upload(thumbFile, thumbKey);
    upload(fullFile, fullKey);
  }

  const camera = exif?.Model
    ? exif.Make && !exif.Model.startsWith(exif.Make) ? `${exif.Make} ${exif.Model}` : exif.Model
    : undefined;
  const entry = {
    id,
    width: thumb.info.width,
    height: thumb.info.height,
    thumb: thumbKey,
    full: fullKey,
    fullWidth: full.info.width,
    fullHeight: full.info.height,
    color,
    title,
    year,
    takenAt: exif?.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toISOString() : undefined,
    camera,
    lens: exif?.LensModel || undefined,
    settings: describeSettings(exif),
  };
  manifest.push(entry);
  known.add(id);
  added++;
  console.log(`${dryRun ? 'dry    ' : 'added  '}${path.basename(file)} → ${thumb.info.width}×${thumb.info.height}, ${Math.round(full.data.length / 1024)} KB large`);
}

if (!dryRun && added > 0) {
  // Newest first; photos without a capture date keep the order they were added in.
  manifest.sort((a, b) => (b.takenAt ?? '').localeCompare(a.takenAt ?? ''));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
console.log(
  dryRun
    ? `\nDry run: ${added} photo(s) processed into ${path.relative(root, outDir)}/, nothing uploaded.`
    : `\n${added} photo(s) added. Commit src/data/photos.json and deploy to publish them.`,
);
