/** Small helpers shared by the build (metrics.ts) and the browser (live-metrics.ts). */

/** One OpenAlex request for every DOI. */
export function openAlexUrl(dois: string[]): string {
  return `https://api.openalex.org/works?filter=doi:${dois.join('|')}&select=doi,cited_by_count&per-page=100`;
}

/** 682 → "682", 1234 → "1.2k", 15300 → "15k" */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
}
