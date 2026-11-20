/**
 * Refreshes the GitHub star and citation numbers after the page has loaded, so they
 * stay current between deployments. The numbers baked in at build time are shown
 * first and are kept if a request fails. Results are remembered in the browser for an
 * hour (localStorage, so across tabs and visits), to avoid asking again on every page
 * view: GitHub allows only 60 anonymous requests an hour from one IP address, which
 * everyone on the same campus or conference Wi-Fi shares.
 */
import { formatCount, openAlexUrl } from '../lib/metrics-format';

const TTL_MS = 60 * 60 * 1000;
const STORE = 'metrics:'; // prefix of our keys in localStorage

function cached(key: string): number | undefined {
  try {
    const raw = localStorage.getItem(STORE + key);
    if (!raw) return undefined;
    const { v, t } = JSON.parse(raw) as { v: number; t: number };
    return Date.now() - t < TTL_MS ? v : undefined;
  } catch {
    return undefined;
  }
}
function remember(key: string, v: number) {
  try {
    localStorage.setItem(STORE + key, JSON.stringify({ v, t: Date.now() }));
  } catch {}
}

function show(el: HTMLElement, n: number) {
  const num = el.querySelector<HTMLElement>('[data-num]');
  if (num) num.textContent = formatCount(n);
  const count = n.toLocaleString('en-US');
  if (el.hasAttribute('data-cites-doi')) {
    const word = n === 1 ? 'citation' : 'citations';
    const label = el.querySelector<HTMLElement>('[data-word]');
    if (label) label.textContent = word;
    el.hidden = n === 0;
    el.title = `${count} ${word} (OpenAlex)`;
  } else {
    const word = n === 1 ? 'star' : 'stars';
    const label = el.querySelector<HTMLElement>('[data-word]');
    if (label) label.textContent = ` ${word}`;
    el.title = `${count} ${word} on GitHub`;
  }
}

async function refreshStars() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-stars-repo]')];
  const repos = [...new Set(els.map((e) => e.dataset.starsRepo!))];
  await Promise.all(
    repos.map(async (repo) => {
      const key = `stars:${repo}`;
      let n = cached(key);
      if (n === undefined) {
        try {
          const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: { Accept: 'application/vnd.github+json' },
          });
          if (!res.ok) return;
          n = (await res.json()).stargazers_count;
          if (typeof n !== 'number') return;
          remember(key, n);
        } catch {
          return;
        }
      }
      for (const el of els) if (el.dataset.starsRepo === repo) show(el, n);
    }),
  );
}

async function refreshCitations() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-cites-doi]')];
  const dois = [...new Set(els.map((e) => e.dataset.citesDoi!))];
  if (!dois.length) return;
  const missing = dois.filter((d) => cached(`cites:${d}`) === undefined);
  if (missing.length) {
    try {
      const res = await fetch(openAlexUrl(missing));
      if (res.ok) {
        const data = (await res.json()) as { results: { doi: string; cited_by_count: number }[] };
        for (const w of data.results) {
          remember(`cites:${w.doi.replace('https://doi.org/', '').toLowerCase()}`, w.cited_by_count);
        }
      }
    } catch {}
  }
  for (const el of els) {
    const n = cached(`cites:${el.dataset.citesDoi}`);
    if (n !== undefined) show(el, n);
  }
}

// Not urgent: wait until the page is idle.
const idle = (window as any).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 800));
idle(() => {
  refreshStars();
  refreshCitations();
});
