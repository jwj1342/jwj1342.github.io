/**
 * Checks a hand-edited data file (src/data/*.json) when the site is built. A wrong or
 * missing field stops the build with a message that names the file, the entry and the
 * field, instead of producing a broken page.
 */
import type { ZodType } from 'astro/zod';

export function check<T>(schema: ZodType<T>, data: unknown, file: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    // "story[2].children[0].icon" for a nested field; "[4].lat" for the fifth entry of a list
    const where = issue.path.map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`)).join('').replace(/^\./, '');
    // name the entry too, by its place or title, so it is easy to find in the file
    let entry: unknown = data;
    let name = '';
    for (const part of issue.path.slice(0, -1)) {
      entry = (entry as Record<string | number, unknown> | undefined)?.[part as string | number];
      const label = (entry as { place?: unknown; title?: unknown } | undefined)?.place ?? (entry as { title?: unknown } | undefined)?.title;
      if (typeof label === 'string') name = label;
    }
    return `  ${where || '(the whole file)'}${name ? ` (${name})` : ''}: ${issue.message}`;
  });
  throw new Error(`${file} has ${problems.length === 1 ? 'a problem' : 'problems'} (entries are counted from 0):\n${problems.join('\n')}`);
}
