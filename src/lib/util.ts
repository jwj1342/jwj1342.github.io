import { getCollection } from 'astro:content';

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Published posts, newest first. Drafts are visible only in `astro dev`. */
export async function getPosts() {
  const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Translations by post id; a post that has none is simply shown in its own language. */
export async function getTranslations() {
  const entries = await getCollection('blogI18n');
  return new Map(entries.map((e) => [e.id, e]));
}

export const htmlLang = (lang: 'en' | 'zh') => (lang === 'zh' ? 'zh-CN' : 'en');

export interface Photo {
  id: string;
  width: number;
  height: number;
  /** Paths relative to the photo bucket base URL. */
  thumb: string;
  full: string;
  fullWidth: number;
  fullHeight: number;
  color?: string;
  title?: string;
  /** Set by hand when the photo has no capture date; otherwise taken from `takenAt`. */
  year?: number;
  takenAt?: string;
  camera?: string;
  lens?: string;
  settings?: string;
}
