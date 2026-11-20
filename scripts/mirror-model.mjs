#!/usr/bin/env node
/**
 * Copy a WebLLM model (weights + compiled library) from Hugging Face / GitHub into the
 * R2 bucket behind https://models.wenjia.me, so Pop Cat downloads it from our own domain.
 *
 *   npm run model:mirror -- Qwen3.5-0.8B-q4f16_1-MLC Qwen3.5-0.8B-q4f32_1-MLC
 *   npm run model:mirror -- --dry-run <model id>      only list what would be copied
 *
 * Use the ids in src/data/popcat.ts (`id` and `fallbackId`). Files land at
 * <model id>/resolve/main/<file> and libs/<version>/<file>.wasm, which is where
 * src/scripts/popcat-worker.ts looks for them. Needs `npx wrangler login`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';

const BUCKET = 'wenjia-models';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ids = args.filter((a) => !a.startsWith('--'));
if (!ids.length) {
  console.error('Give at least one WebLLM model id, for example Qwen3.5-0.8B-q4f16_1-MLC');
  process.exit(1);
}

const contentType = (file) =>
  file.endsWith('.json') ? 'application/json' : file.endsWith('.txt') ? 'text/plain; charset=utf-8' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';

async function copy(url, key, dir) {
  if (dryRun) return console.log(`would copy ${url}\n        -> ${key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const file = path.join(dir, 'part');
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', contentType(key), '--cache-control', 'public, max-age=31536000, immutable', '--remote'],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  console.log(`ok  ${key}`);
}

const dir = await mkdtemp(path.join(tmpdir(), 'model-mirror-'));
try {
  for (const id of ids) {
    const record = prebuiltAppConfig.model_list.find((m) => m.model_id === id);
    if (!record) throw new Error(`"${id}" is not a model this version of WebLLM knows`);
    const repo = record.model.replace('https://huggingface.co/', '').replace(/\/$/, '');
    const tree = await (await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=1`)).json();
    for (const f of tree) {
      if (f.type !== 'file' || f.path === '.gitattributes' || f.path === 'README.md') continue;
      await copy(`https://huggingface.co/${repo}/resolve/main/${f.path}`, `${id}/resolve/main/${f.path}`, dir);
    }
    const [, version, lib] = record.model_lib.match(/web-llm-models\/([^/]+)\/.*\/([^/]+\.wasm)$/) ?? [];
    if (!lib) throw new Error(`cannot tell where the library of "${id}" should go: ${record.model_lib}`);
    await copy(record.model_lib, `libs/${version}/${lib}`, dir);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
console.log(dryRun ? '\nNothing was copied (dry run).' : '\nDone. Set these ids in src/data/popcat.ts and deploy.');
