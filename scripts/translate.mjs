#!/usr/bin/env node
/**
 * Translate blog posts into the other language (Chinese <-> English).
 *
 *   npm run translate                 translate every post that is new or has changed
 *   npm run translate -- my-post      only this post (file name without extension)
 *   npm run translate -- --force      redo translations even if the source is unchanged
 *
 * Each post in src/content/blog/ is written once, in either language (`lang: zh` or
 * `lang: en` in its front matter). This script writes the other-language version to
 * src/content/blog-i18n/<same file name>, which the site shows when a reader switches
 * language. Translations are ordinary Markdown files: commit them, and edit them by
 * hand if a sentence reads badly.
 *
 * A translation is redone only when its source post changes. To stop the script from
 * ever touching a translation you have polished, add `locked: true` to its front matter.
 *
 * Translation runs on Cloudflare Workers AI using your existing `wrangler login`
 * (or CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID if set).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = '@cf/qwen/qwen3.8-27b';
const CHUNK_CHARS = 2600;
const LANGUAGE = { zh: 'Simplified Chinese', en: 'English' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'src/content/blog');
const targetDir = path.join(root, 'src/content/blog-i18n');

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

// ---- Cloudflare access ---------------------------------------------------------

function getToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    const out = execFileSync('npx', ['wrangler', 'auth', 'token'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const token = out.trim().split('\n').pop()?.trim();
    if (token) return token;
  } catch {}
  console.error('Not logged in to Cloudflare. Run `npx wrangler login` first (or set CLOUDFLARE_API_TOKEN).');
  process.exit(1);
}

async function getAccountId(token) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts', { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const id = data?.result?.[0]?.id;
  if (!id) {
    console.error('Could not find your Cloudflare account. Set CLOUDFLARE_ACCOUNT_ID.');
    process.exit(1);
  }
  return id;
}

let api;
async function chat(system, user) {
  api ??= (async () => {
    const token = getToken();
    return { token, account: await getAccountId(token) };
  })();
  const { token, account } = await api;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 8000,
        // plain translation needs no step-by-step reasoning; this is ~15x faster
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const text = await res.text();
    if (res.ok) {
      const content = JSON.parse(text).choices?.[0]?.message?.content;
      if (content?.trim()) return content.trim();
    }
    if (attempt >= 3) throw new Error(`Translation request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

// ---- Markdown handling ---------------------------------------------------------

/** Split a post file into its front matter text and body. */
function splitFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { front: m[1], body: m[2] } : { front: '', body: raw };
}

/** Read a simple `key: value` front matter field (quotes optional). */
function field(front, key) {
  const m = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!m) return undefined;
  const v = m[1].trim();
  return /^(".*"|'.*')$/.test(v) ? v.slice(1, -1).replace(/\\"/g, '"') : v;
}

/**
 * Cut the body into pieces: text that should be translated, and blocks that must be
 * kept exactly as they are (code fences, display math, raw HTML/MDX imports).
 */
function segment(body) {
  const lines = body.split('\n');
  const out = [];
  let text = [];
  const flush = () => {
    if (text.length) out.push({ keep: false, content: text.join('\n') });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*(```+|~~~+)/);
    const math = /^\s*\$\$/.test(lines[i]);
    if (fence || math) {
      flush();
      const block = [lines[i]];
      const closes = fence ? new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`) : /\$\$\s*$/;
      // a one-line $$...$$ block closes on the same line
      const oneLine = math && /\$\$.+\$\$\s*$/.test(lines[i]);
      if (!oneLine) {
        while (++i < lines.length) {
          block.push(lines[i]);
          if (closes.test(lines[i])) break;
        }
      }
      out.push({ keep: true, content: block.join('\n') });
    } else if (/^(import|export)\s/.test(lines[i])) {
      flush();
      out.push({ keep: true, content: lines[i] });
    } else {
      text.push(lines[i]);
    }
  }
  flush();
  return out;
}

/** Group paragraphs into chunks small enough for one request. */
function chunk(text) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && current.length + p.length > CHUNK_CHARS) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

const systemPrompt = (from, to) =>
  `You are translating a personal technical blog post from ${LANGUAGE[from]} to ${LANGUAGE[to]}.
Translate faithfully, in a natural voice a native speaker would write, keeping the author's tone.
Rules:
- Keep all Markdown structure exactly: headings, lists, tables, blockquotes, emphasis, line breaks.
- Do not translate or alter inline code (\`like this\`), LaTeX math ($like this$), URLs, HTML tags or file paths.
- Translate link text but keep the link target unchanged.
- Keep names of people, products, models, libraries and papers as they are.${
    to === 'zh' ? '\n- Leave terms that Chinese engineers normally say in English (LLM, agent, token, prompt, GPU ...) in English.' : ''
  }
- Output only the translation. No notes, no explanations, no surrounding code fence.`;

/** Models sometimes wrap the answer in a code fence; undo that. */
const unwrap = (s) => s.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, '$1');

async function translateBody(body, from, to) {
  const system = systemPrompt(from, to);
  const parts = [];
  for (const seg of segment(body)) {
    if (seg.keep || !seg.content.trim()) {
      parts.push(seg.content);
      continue;
    }
    const lead = seg.content.match(/^\n*/)[0];
    const trail = seg.content.match(/\n*$/)[0];
    const translated = await Promise.all(chunk(seg.content.trim()).map((piece) => chat(system, piece).then(unwrap)));
    parts.push(lead + translated.join('\n\n') + trail);
  }
  return parts.join('\n');
}

const translateLine = (line, from, to, what) =>
  chat(
    `Translate this blog post ${what} from ${LANGUAGE[from]} to ${LANGUAGE[to]}. Keep names of people, products and models as they are. Output only the translated ${what} on one line, without quotes.`,
    line,
  ).then((s) => s.replace(/\s*\n\s*/g, ' ').replace(/^["“”']|["“”']$/g, ''));

// ---- main ------------------------------------------------------------------------

await mkdir(targetDir, { recursive: true });
const files = (await readdir(sourceDir)).filter((f) => /\.(md|mdx)$/.test(f)).sort();
let done = 0;

for (const file of files) {
  const slug = file.replace(/\.(md|mdx)$/, '');
  if (only.length && !only.includes(slug)) continue;

  const { front, body } = splitFrontMatter(await readFile(path.join(sourceDir, file), 'utf8'));
  const title = field(front, 'title') ?? slug;
  const description = field(front, 'description');
  const from = field(front, 'lang') === 'zh' ? 'zh' : 'en';
  const to = from === 'zh' ? 'en' : 'zh';
  const sourceHash = createHash('sha256').update([title, description ?? '', body].join('\u0000')).digest('hex').slice(0, 16);

  const targetFile = path.join(targetDir, file);
  const existing = await readFile(targetFile, 'utf8').catch(() => null);
  if (existing) {
    const old = splitFrontMatter(existing).front;
    if (field(old, 'locked') === 'true') {
      console.log(`locked   ${file}`);
      continue;
    }
    if (!force && field(old, 'sourceHash') === sourceHash) {
      console.log(`current  ${file}`);
      continue;
    }
  }

  process.stdout.write(`translating ${file} (${from} → ${to}) ...`);
  const started = Date.now();
  const newTitle = await translateLine(title, from, to, 'title');
  const newDescription = description ? await translateLine(description, from, to, 'summary') : undefined;
  const newBody = await translateBody(body, from, to);

  const frontMatter = [
    `title: ${JSON.stringify(newTitle)}`,
    newDescription ? `description: ${JSON.stringify(newDescription)}` : null,
    `lang: ${to}`,
    `# Generated by scripts/translate.mjs. Edit freely; add "locked: true" to keep your edits.`,
    `sourceHash: ${sourceHash}`,
    `model: ${JSON.stringify(MODEL)}`,
  ].filter(Boolean);
  await writeFile(targetFile, `---\n${frontMatter.join('\n')}\n---\n${newBody.startsWith('\n') ? '' : '\n'}${newBody}`);
  done++;
  console.log(` done in ${Math.round((Date.now() - started) / 1000)}s`);
}

console.log(done ? `\n${done} translation(s) written to src/content/blog-i18n/. Review, commit and deploy.` : '\nEverything is up to date.');
