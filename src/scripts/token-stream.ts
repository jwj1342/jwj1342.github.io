/**
 * Token-stream hero: text inside [data-stream] elements is "generated" the way a
 * language model decodes.
 *
 *  - Everything not yet generated is shown as flickering noise of the same shape.
 *  - A small next-token distribution (the [data-sampler] chart) is re-drawn for every
 *    token; one bar is sampled, and a line runs from that bar to the token it produced.
 *  - The token resolves from noise into the real text, briefly highlighted like a
 *    tokenizer visualiser.
 *
 * The real text is always in the HTML (good for SEO, no-JS and reduced motion), and
 * noise is drawn on top of it without changing its size, so the layout never shifts.
 */

const SUFFIXES = ['tion', 'ment', 'ing', 'ity', 'ers', 'ed', 'ly', 'al', 'er', 's'];
const CJK = /[㐀-鿿豈-﫿぀-ヿ]/;

/** Quiet time between the end of one run and the start of the next. */
const REPLAY_AFTER_MS = 14000;
/** How often pending tokens re-roll their noise. */
const FLICKER_MS = 90;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = (s: string) => s[Math.floor(Math.random() * s.length)];

/** Split a word into sub-word pieces, roughly the way a BPE tokenizer would. */
function splitWord(word: string): string[] {
  if (CJK.test(word)) {
    // CJK: one or two characters per token
    const out: string[] = [];
    for (let i = 0; i < word.length; ) {
      const n = i + 1 < word.length && CJK.test(word[i + 1]) && out.length % 2 === 0 ? 2 : 1;
      out.push(word.slice(i, i + n));
      i += n;
    }
    return out;
  }
  // peel trailing punctuation into its own token
  const m = word.match(/^(.*?)([.,;:!?)\]”’"']+)$/);
  const core = m ? m[1] : word;
  const punct = m ? [m[2]] : [];
  if (core.length <= 6 || /[^A-Za-z-]/.test(core)) return [core, ...punct].filter(Boolean);

  // hyphenated words break at the hyphen
  if (core.includes('-')) {
    const i = core.indexOf('-');
    return [core.slice(0, i), core.slice(i), ...punct];
  }
  const lower = core.toLowerCase();
  for (const s of SUFFIXES) {
    if (lower.endsWith(s) && core.length - s.length >= 4) {
      return [core.slice(0, -s.length), core.slice(-s.length), ...punct];
    }
  }
  const cut = Math.ceil(core.length / 2);
  return [core.slice(0, cut), core.slice(cut), ...punct];
}

/** Tokenize text into pieces; whitespace is returned as separate pieces. */
function tokenize(text: string): { space: boolean; text: string }[] {
  const out: { space: boolean; text: string }[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) out.push({ space: true, text: part });
    else for (const piece of splitWord(part)) out.push({ space: false, text: piece });
  }
  return out;
}

/** Noise with the same "shape" as the text: letters for letters, digits for digits. */
function noiseFor(text: string): string {
  let out = '';
  for (const ch of text) {
    if (/[a-z]/.test(ch)) out += pick('abcdefghijklmnopqrstuvwxyz');
    else if (/[A-Z]/.test(ch)) out += pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    else if (/[0-9]/.test(ch)) out += pick('0123456789');
    else if (CJK.test(ch)) out += pick('口日目田山水木火土金中文字');
    else out += pick(".,:;'!");
  }
  return out;
}

/**
 * Wrap every token under `el` in a span. Whitespace stays outside the spans, so each
 * span is a single unbreakable box that the noise can be laid over exactly.
 */
function wrapTokens(el: Element): HTMLElement[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  const spans: HTMLElement[] = [];
  for (const node of textNodes) {
    if (!node.data.trim()) continue;
    const frag = document.createDocumentFragment();
    for (const piece of tokenize(node.data)) {
      if (piece.space) {
        frag.append(piece.text);
        continue;
      }
      const span = document.createElement('span');
      span.className = 'tok';
      span.textContent = piece.text;
      span.dataset.s = noiseFor(piece.text);
      frag.append(span);
      spans.push(span);
    }
    node.replaceWith(frag);
  }
  return spans;
}

/** Resolves once the tab is visible and `el` is on screen (immediately if it already is). */
function whenOnScreen(el: Element): Promise<void> {
  return new Promise((resolve) => {
    let inView = false;
    const check = () => {
      if (inView && document.visibilityState === 'visible') {
        io.disconnect();
        document.removeEventListener('visibilitychange', check);
        resolve();
      }
    };
    const io = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      check();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', check);
  });
}

/** The little next-token distribution chart and the line from it to the current token. */
function createSampler(root: HTMLElement | null) {
  if (!root) return null;
  const hero = root.closest<HTMLElement>('.hero');
  const bars = [...root.querySelectorAll<HTMLElement>('.bars i')];
  const tokenOut = root.querySelector<HTMLElement>('[data-tk]');
  const probOut = root.querySelector<HTMLElement>('[data-p]');
  if (!hero || bars.length === 0) return null;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sampler-line idle');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '2.5');
  svg.append(path, dot);
  hero.append(svg);

  /** Current distribution, as bar heights from 0 to 1 (one bar per "vocabulary" slot). */
  let levels = bars.map(() => 0.06);
  let picked = -1;

  function draw(jitter = 0) {
    bars.forEach((bar, i) => {
      const wobble = i === picked ? 1 : 1 + (Math.random() - 0.5) * jitter;
      bar.style.height = `${Math.min(100, Math.max(5, levels[i] * wobble * 100))}%`;
    });
  }

  /** Draw a fresh distribution, sample from it, and point at `span`. */
  function step(span: HTMLElement) {
    // Softmax over random logits. The temperature changes from token to token, so the
    // chart swings between confident spikes and flat, uncertain spreads; the bars are
    // not sorted, so the peak jumps around the vocabulary.
    const temperature = 0.3 + Math.random() ** 1.6 * 1.3;
    const logits = bars.map(() => (Math.random() + Math.random() + Math.random() - 1.5) * 2.4);
    const exps = logits.map((l) => Math.exp(l / temperature));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / sum);
    const top = Math.max(...probs);

    // Actually sample from it.
    let r = Math.random();
    picked = probs.length - 1;
    for (let i = 0; i < probs.length; i++) {
      r -= probs[i];
      if (r <= 0) {
        picked = i;
        break;
      }
    }
    levels = probs.map((p) => p / top);
    const runnerUp = [...probs].sort((a, b) => b - a)[2] ?? 0;
    bars.forEach((bar, i) => {
      bar.classList.toggle('pick', i === picked);
      bar.classList.toggle('near', i !== picked && probs[i] >= runnerUp && probs[i] > 0.04);
    });
    draw();
    if (tokenOut) tokenOut.textContent = `"${span.textContent}"`;
    if (probOut) probOut.textContent = `p=${probs[picked].toFixed(2)}`;

    // Line from the sampled bar down to the token it produced.
    const h = hero!.getBoundingClientRect();
    const base = root!.querySelector('.bars')!.getBoundingClientRect();
    const b = bars[picked].getBoundingClientRect();
    const t = span.getBoundingClientRect();
    const x1 = b.left + b.width / 2 - h.left;
    const y1 = base.bottom - h.top; // the chart's baseline
    const x2 = t.left + t.width / 2 - h.left;
    const y2 = t.top - h.top + 3;
    const mid = y1 + (y2 - y1) * 0.55;
    const f = (n: number) => n.toFixed(1);
    path.setAttribute('d', `M${f(x1)},${f(y1)} C${f(x1)},${f(mid)} ${f(x2)},${f(mid)} ${f(x2)},${f(y2)}`);
    dot.setAttribute('cx', f(x2));
    dot.setAttribute('cy', f(y2));
    svg.classList.remove('idle');
  }

  /** Between tokens the unsampled bars keep shimmering, like logits still settling. */
  let shimmer: number | undefined;
  function start() {
    stop();
    // before the first token: an undecided, noisy spread
    picked = -1;
    levels = bars.map(() => 0.12 + Math.random() * 0.4);
    bars.forEach((bar) => bar.classList.remove('pick', 'near'));
    if (tokenOut) tokenOut.textContent = '…';
    if (probOut) probOut.textContent = '';
    shimmer = window.setInterval(() => draw(0.7), 70);
  }
  function stop() {
    if (shimmer !== undefined) clearInterval(shimmer);
    shimmer = undefined;
  }

  /** Generation finished: sample the end-of-sequence token and let the line fade. */
  function finish() {
    stop();
    picked = bars.length - 1;
    levels = bars.map((_, i) => (i === picked ? 1 : 0.05 + Math.random() * 0.05));
    bars.forEach((bar, i) => {
      bar.classList.toggle('pick', i === picked);
      bar.classList.remove('near');
    });
    draw();
    if (tokenOut) tokenOut.textContent = '<eos>';
    if (probOut) probOut.textContent = 'p=0.99';
    svg.classList.add('idle');
  }

  return { step, start, finish };
}

async function run() {
  const root = document.documentElement;
  const targets = [...document.querySelectorAll<HTMLElement>('[data-stream]')];
  if (!targets.length || !root.classList.contains('stream-pending')) return;

  // Start in the real typeface when it arrives quickly, so the text does not change
  // font halfway through the stream; never wait longer than 400ms for it.
  await Promise.race([document.fonts.ready, sleep(400)]);

  const groups = targets.map((el) => ({ el, spans: wrapTokens(el) }));
  const allSpans = groups.flatMap((g) => g.spans);
  const sampler = createSampler(document.querySelector<HTMLElement>('[data-sampler]'));
  // Each tool-call link starts out as raw model output, e.g. <github.open()/>, written
  // over the link; once its last token is generated the link is "rendered" as a button.
  const tools = [...document.querySelectorAll<HTMLElement>('[data-tool]')].map((el) => {
    const [object, ...rest] = (el.dataset.call ?? '').split('.');
    const method = rest.join('.').replace(/\(\)$/, '');
    const raw = document.createElement('span');
    raw.className = 'raw';
    raw.setAttribute('aria-hidden', 'true');
    const spans = ['<', object, method ? `.${method}` : '', '()', '/>'].filter(Boolean).map((text) => {
      const span = document.createElement('span');
      span.className = 'tok';
      span.textContent = text;
      span.dataset.s = noiseFor(text);
      raw.append(span);
      return span;
    });
    el.append(raw);
    return { el, spans };
  });
  const toolSpans = tools.flatMap((t) => t.spans);
  // Tokens are wrapped and covered by noise now, so the containers can be shown.
  root.classList.add('stream-ready');
  root.classList.remove('stream-pending');

  const cursor = document.createElement('span');
  cursor.className = 'tok-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  /** Keep the not-yet-generated tokens flickering. */
  let flicker: number | undefined;
  function stopFlicker() {
    if (flicker !== undefined) clearInterval(flicker);
    flicker = undefined;
  }
  function startFlicker() {
    stopFlicker();
    flicker = window.setInterval(() => {
      for (const span of [...allSpans, ...toolSpans]) {
        if (!span.classList.contains('on') && Math.random() < 0.35) {
          span.dataset.s = noiseFor(span.textContent ?? '');
        }
      }
    }, FLICKER_MS);
  }

  /** One pass: sample every token in order. The tool calls are generated only once. */
  async function play(withTools: boolean) {
    startFlicker();
    sampler?.start();
    // a beat of pure noise before the first token is sampled
    await sleep(380);

    // Give every token a due time up front, then resolve whatever is due on each tick.
    // If the browser throttles timers (background tab, busy main thread) the stream
    // catches up instead of crawling.
    const queue: { span: HTMLElement; at: number; render?: HTMLElement }[] = [];
    let at = 0;
    for (const { el, spans } of groups) {
      const base = Number(el.dataset.streamSpeed) || 40;
      for (const span of spans) {
        queue.push({ span, at });
        // a little jitter, and a longer beat after sentence punctuation
        const pause = /[.!?。！？]$/.test(span.textContent ?? '') ? base * 4 : 0;
        at += base * (0.6 + Math.random() * 0.9) + pause;
      }
      at += 180;
    }
    if (withTools) {
      for (const { el, spans } of tools) {
        spans.forEach((span, n) => {
          // the closing bracket completes the call: render the button
          queue.push({ span, at, render: n === spans.length - 1 ? el : undefined });
          at += 55 * (0.6 + Math.random() * 0.9);
        });
        at += 160;
      }
    }

    const start = performance.now();
    let i = 0;
    while (i < queue.length) {
      const elapsed = performance.now() - start;
      let last: HTMLElement | undefined;
      while (i < queue.length && queue[i].at <= elapsed) {
        last = queue[i].span;
        last.classList.add('on', `c${(i % 5) + 1}`);
        // a link only looks like a link once all of its text has been generated
        const link = last.closest('a');
        if (link && !link.querySelector('.tok:not(.on)')) link.classList.add('resolved');
        const button = queue[i].render;
        if (button) {
          button.classList.add('calling');
          setTimeout(() => button.classList.replace('calling', 'called'), 320);
        }
        i++;
      }
      if (last) {
        last.after(cursor);
        sampler?.step(last);
      }
      if (i < queue.length) await sleep(Math.max(8, queue[i].at - (performance.now() - start)));
    }
    stopFlicker();
    sampler?.finish();

    // Let the cursor blink for a moment at the end, then retire it.
    await sleep(1600);
    cursor.remove();
  }

  /** Dissolve the text back into noise so the next pass can start over. The tool
   *  calls below it have already been made and stay as they are. */
  function dissolve() {
    for (const { el } of groups) el.querySelectorAll('a.resolved').forEach((a) => a.classList.remove('resolved'));
    for (const span of allSpans) {
      span.dataset.s = noiseFor(span.textContent ?? '');
      span.classList.remove('on', 'c1', 'c2', 'c3', 'c4', 'c5');
    }
  }

  const busy = () => groups.some(({ el }) => el.matches(':hover') || el.contains(document.activeElement));

  performance.mark('stream-start');
  await play(true);
  performance.mark('stream-end');
  root.classList.add('stream-done');

  // Replay every so often — but only while the text is actually on screen, and never
  // while the reader is pointing at it or has focus inside it (e.g. on a link).
  for (;;) {
    await sleep(REPLAY_AFTER_MS);
    await whenOnScreen(groups[0].el);
    while (busy()) await sleep(2000);
    dissolve();
    performance.mark('stream-replay');
    await play(false);
  }
}

run();
