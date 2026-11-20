/**
 * How Pop Cat talks: everything in one paragraph, and every sentence ends in a meow
 * ("meow" after English, "喵" after Chinese).
 * Small models cannot be trusted to keep either habit, so the text is reshaped here
 * after the model has written it. Used in the browser (answers) and at build time
 * (the greeting).
 */

/** Join lines, list items and headings into a single paragraph. */
export function oneParagraph(text: string): string {
  return text
    // list items become clauses of the sentence before them
    .replace(/([^\s:：,，;；.!?。！？])\s*\n+\s*(?:[-*•]|\d+[.)])\s+/g, '$1; ')
    .replace(/\s*\n+\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)?/g, ' ')
    .replace(/^\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** What the cat says: `en` after sentences in Latin script, `zh` after Chinese ones. */
export interface Cries {
  en: string;
  zh: string;
}

// A full stop after one of these is part of the word, not the end of a sentence.
const ABBREVIATION = /(?:\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Ms|Mrs|Prof|Ph\.D|B\.Eng|M\.Eng|B\.Sc|M\.Sc|U\.S|No|Fig)|\b[A-Z])$/;
const CHINESE = /[\u3400-\u9fff]/;

/** `sentence` with its meow: "…, meow" in English, "…喵" in Chinese. Unchanged if it already has one. */
function withCry(sentence: string, cries: Cries): string {
  const body = sentence.trimEnd();
  if (body.trim().length < 4) return sentence; // "Hi!" is too short to carry one
  const lower = body.toLowerCase();
  if ((cries.en && lower.endsWith(cries.en.toLowerCase())) || (cries.zh && body.endsWith(cries.zh))) return sentence;
  if (CHINESE.test(body)) return cries.zh ? body + cries.zh : sentence;
  if (!cries.en) return sentence;
  return body + (/[,;:，；：]$/.test(body) ? ' ' : ', ') + cries.en;
}

/**
 * Put a meow at the end of every sentence, before its full stop. `final: false` is for
 * text that is still being written: its last sentence is left alone until we know it
 * has really ended.
 */
export function meow(text: string, cries: Cries, final = true): string {
  if (!text || (!cries.en && !cries.zh)) return text;
  let out = '';
  let from = 0; // where the current sentence started
  const ends = /[.!?。！？]+/g;
  for (let m = ends.exec(text); m; m = ends.exec(text)) {
    const before = text.slice(from, m.index);
    const after = text.slice(m.index + m[0].length);
    const last = before.slice(-1);
    const atEnd = after.trim() === '';
    const isEnd = /[。！？]/.test(m[0])
      ? true
      : m[0] === '.'
        ? (atEnd || /^["”’)\]]*\s+["“‘(\[]*[A-Z\u3400-\u9fff]/.test(after)) && !ABBREVIATION.test(before)
        : atEnd || /^["”’)\]]*\s/.test(after);
    if (!isEnd || !last || /\s/.test(last) || (atEnd && !final)) continue;
    out += withCry(before, cries) + m[0];
    from = m.index + m[0].length;
  }
  const rest = text.slice(from);
  // an answer that stops without a full stop still gets its meow
  return out + (final && rest.trim() ? withCry(rest, cries) : rest);
}
