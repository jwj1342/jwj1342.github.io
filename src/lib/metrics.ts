/**
 * Numbers shown next to a publication: GitHub stars and citation counts.
 *
 * They are looked up while the site is being built, so the page ships with real
 * numbers, and refreshed in the visitor's browser by src/scripts/live-metrics.ts.
 * If a lookup fails (offline build, rate limit) that number is simply left out.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getCollection } from 'astro:content';
import { openAlexUrl } from './metrics-format';

/**
 * Last numbers that were fetched successfully, kept in the repository. When a lookup
 * fails during a build (GitHub allows only 60 anonymous requests an hour), the page
 * falls back to these instead of showing nothing.
 */
const CACHE_FILE = path.join(process.cwd(), 'src/data/metrics-cache.json');
type Saved = { stars: Record<string, number>; citations: Record<string, number> };
const saved: Saved = existsSync(CACHE_FILE)
  ? JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  : { stars: {}, citations: {} };
function remember() {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(saved, null, 2) + '\n');
  } catch {}
}

const starCache = new Map<string, Promise<number | null>>();

/** "owner/repo" for a https://github.com/owner/repo URL. */
export function repoSlug(url?: string): string | undefined {
  return url?.match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+)/)?.[1];
}

async function fetchStars(repo: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'site-build' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export function repoStars(url?: string): Promise<number | null> {
  const repo = repoSlug(url);
  if (!repo) return Promise.resolve(null);
  if (!starCache.has(repo)) {
    starCache.set(
      repo,
      fetchStars(repo).then((n) => {
        if (n === null) return saved.stars[repo] ?? null;
        if (saved.stars[repo] !== n) {
          saved.stars[repo] = n;
          remember();
        }
        return n;
      }),
    );
  }
  return starCache.get(repo)!;
}

let citationTable: Promise<Map<string, number>> | undefined;

async function fetchCitations(): Promise<Map<string, number>> {
  const table = new Map<string, number>();
  try {
    const dois = (await getCollection('publications')).map((p) => p.data.doi).filter((d): d is string => !!d);
    if (!dois.length) return table;
    const res = await fetch(openAlexUrl(dois), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return table;
    const data = (await res.json()) as { results: { doi: string; cited_by_count: number }[] };
    for (const w of data.results) table.set(w.doi.replace('https://doi.org/', '').toLowerCase(), w.cited_by_count);
  } catch {}
  return table;
}

/** Citation count for a DOI (from OpenAlex), or null when unknown. */
export async function citations(doi?: string): Promise<number | null> {
  if (!doi) return null;
  citationTable ??= fetchCitations().then((table) => {
    if (table.size === 0) return new Map(Object.entries(saved.citations));
    const fresh = Object.fromEntries(table);
    if (JSON.stringify(fresh) !== JSON.stringify(saved.citations)) {
      saved.citations = fresh;
      remember();
    }
    return table;
  });
  return (await citationTable).get(doi.toLowerCase()) ?? null;
}
