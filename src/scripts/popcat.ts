/**
 * Pop Cat's behaviour: open and close the panel and run the conversation. This file is
 * small and loads with every page; the model itself lives in popcat-worker.ts, which is
 * fetched (with the model's weights) only when the visitor sends their first question.
 */
import { meow, oneParagraph, type Cries } from '../lib/meow';
import { logAnswer, logChat } from './track';

type Role = 'user' | 'assistant';
interface Turn {
  role: Role;
  content: string;
}
type FromWorker =
  | { type: 'progress'; progress: number; text: string }
  | { type: 'ready' }
  | { type: 'token'; id: number; delta: string }
  | { type: 'done'; id: number; tps?: number }
  | { type: 'error'; id?: number; message: string };

const STORAGE_KEY = 'popcatModel';
/** How many past messages go back to the model with each question (odd: starts with the visitor). */
const HISTORY_TURNS = 7;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** What the cat says at the end of each sentence; set from the page in init(). */
let cries: Cries = { en: '', zh: '' };

/**
 * Turn what the model wrote into what the cat says: one paragraph, a meow after every
 * sentence, and of its light Markdown only bold, code and links. `final: false` while
 * the answer is still being written, so an unfinished sentence is not given its meow yet.
 */
function format(raw: string, final = true): string {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .replace(/<\/?think>/g, '');
  return escapeHtml(meow(oneParagraph(text), cries, final))
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, '<a href="mailto:$1">$1</a>');
}

function init(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const panel = $('.pc-panel');
  const catButton = $<HTMLButtonElement>('.pc-btn');
  const closeButton = $<HTMLButtonElement>('.pc-x');
  const log = $('[data-log]');
  const greeting = $('[data-greeting]');
  const chips = $('[data-chips]');
  const form = $<HTMLFormElement>('[data-form]');
  const input = $<HTMLTextAreaElement>('[data-input]');
  const sendButton = $<HTMLButtonElement>('[data-send]');

  // For trying another model without editing anything: add ?popcat-model=<WebLLM model id>
  // to the address. That model is downloaded from Hugging Face, not from our own host.
  const override = new URLSearchParams(location.search).get('popcat-model');
  // Phones and tablets get a smaller model: they cannot spare the graphics memory the usual one needs.
  const phone =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
  const data = root.dataset;
  const chosen = phone
    ? { id: data.phoneModel, fallback: data.phoneFallback, label: data.phoneLabel, size: data.phoneSize }
    : { id: data.model, fallback: data.fallback, label: data.label, size: data.size };
  let modelId = override ?? chosen.id!;
  const label = override ?? chosen.label ?? 'model';
  const size = override ? 'a few hundred MB' : (chosen.size ?? '');
  const host = override ? '' : (data.host ?? '');

  /** idle: nothing loaded yet. loading: fetching the model. ready: can answer. */
  let state: 'idle' | 'loading' | 'ready' | 'unsupported' = 'idle';
  let worker: Worker | null = null;
  let system = { en: '', zh: '' };
  let reminder: { en?: string; zh?: string } = {};
  const history: Turn[] = [];
  let busy = false;
  let turnId = 0;
  let live: { el: HTMLElement; text: string } | null = null;
  /** The newest question's id in the visitor log (the chat panel says that questions are logged). */
  let logged: string | null = null;
  let progress: HTMLElement | null = null;
  let checked = false;
  let lastToken = 0;
  let popTimer = 0;

  /** Ids of the models this browser has already downloaded. */
  const stored = (): string[] => {
    try {
      return (localStorage.getItem(STORAGE_KEY) ?? '').split(',').filter(Boolean);
    } catch {
      return [];
    }
  };

  cries = { en: root.dataset.meowEn ?? '', zh: root.dataset.meowZh ?? '' };
  $('[data-model-detail]').textContent = label;
  if (phone && !override) greeting.textContent = greeting.dataset.phone ?? greeting.textContent;

  // ---- open / close ------------------------------------------------------------

  /** Keep the panel inside the visible part of the page, above an on-screen keyboard. */
  function fitViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    root.style.setProperty('--pc-vh', `${vv.height}px`);
    root.style.setProperty('--pc-kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
  }

  function open() {
    panel.hidden = false;
    root.classList.add('open');
    catButton.setAttribute('aria-expanded', 'true');
    fitViewport();
    if (root.style.left) place(parseFloat(root.style.left)); // the panel may need shifting to stay on screen
    window.visualViewport?.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('scroll', fitViewport);
    if (!checked) void checkSupport();
    // on a phone, focusing the field would throw the keyboard up over the greeting
    if (matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
  }
  function close() {
    panel.hidden = true;
    root.classList.remove('open');
    catButton.setAttribute('aria-expanded', 'false');
    window.visualViewport?.removeEventListener('resize', fitViewport);
    window.visualViewport?.removeEventListener('scroll', fitViewport);
    root.style.removeProperty('--pc-kb');
  }

  catButton.addEventListener('click', () => {
    // the click that ends a drag is not a request to open the chat
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (panel.hidden) open();
    else close();
  });
  closeButton.addEventListener('click', () => {
    close();
    catButton.focus();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      close();
      catButton.focus();
    }
  });

  // ---- dragging the cat (mouse or pen) -------------------------------------------
  //
  // The cat starts in the bottom-left corner, facing right. It can be slid along the
  // bottom edge of the window and stays where it is put down. While it is carried it
  // looks where it is going; at rest it faces the middle of the page. It leans against
  // the direction of travel, opens its mouth while held, and stretches
  // like rubber when pulled upwards (it never leaves the floor); let go and it snaps
  // back with a bounce. Touch is left alone: on a phone a tap opens the chat and a
  // swipe scrolls the page, as people expect.

  const POSITION_KEY = 'popcatLeft';
  const EDGE = 8; // closest the cat gets to either side of the window, in px
  const stretchy = root.classList.contains('has-pic');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let suppressClick = false;
  let settleTimer = 0;
  let drag: {
    pointer: number;
    startX: number;
    startY: number;
    startLeft: number;
    moved: boolean;
    lastX: number;
    lastTime: number;
    lean: number;
    stretch: number;
  } | null = null;

  const maxLeft = () => Math.max(EDGE, window.innerWidth - catButton.offsetWidth - EDGE);
  /** Which way the cat looks: 1 is to the right (as in the picture), -1 to the left. */
  const face = (direction: 1 | -1) => root.style.setProperty('--pc-face', String(direction));

  /** Put the cat `left` px from the left edge; keep the panel and the hint on screen. */
  function place(left: number, give = 0) {
    const clamped = Math.min(maxLeft(), Math.max(EDGE, left));
    // `give`: how far past an end the pointer has pulled; the cat follows a quarter of the way
    root.style.left = `${clamped + give * 0.25}px`;
    const panelWidth = panel.offsetWidth || Math.min(376, window.innerWidth - 32);
    const overflow = clamped + panelWidth + 16 - window.innerWidth;
    panel.style.transform = overflow > 0 ? `translateX(${-overflow}px)` : '';
    const onRight = clamped + catButton.offsetWidth / 2 > window.innerWidth / 2;
    root.classList.toggle('on-right', onRight);
    if (!drag?.moved) face(onRight ? -1 : 1); // at rest, look towards the middle of the page
    return clamped;
  }

  function pose() {
    if (!drag) return;
    const wide = stretchy ? 1 - (drag.stretch - 1) * (drag.stretch > 1 ? 0.22 : 0.5) : 1;
    catButton.style.transform = `skewX(${drag.lean.toFixed(2)}deg) scale(${wide.toFixed(3)}, ${(stretchy ? drag.stretch : 1).toFixed(3)})`;
  }

  catButton.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    drag = {
      pointer: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: root.getBoundingClientRect().left,
      moved: false,
      lastX: e.clientX,
      lastTime: e.timeStamp,
      lean: 0,
      stretch: 1,
    };
    catButton.setPointerCapture(e.pointerId);
  });

  catButton.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return; // a shaky click is still a click
      drag.moved = true;
      for (const animation of catButton.getAnimations()) animation.cancel();
      root.classList.remove('settling');
      root.classList.add('dragging', 'pop');
    }
    // sideways: slide along the floor, with a little give past either end
    const want = drag.startLeft + dx;
    const give = want < EDGE ? want - EDGE : want > maxLeft() ? want - maxLeft() : 0;
    place(want, give);
    // look where it is being carried
    if (Math.abs(e.clientX - drag.lastX) > 1) face(e.clientX > drag.lastX ? 1 : -1);
    // lean back against the direction of travel, more the faster it goes
    const speed = (e.clientX - drag.lastX) / Math.max(1, e.timeStamp - drag.lastTime); // px per ms
    drag.lean += (Math.max(-16, Math.min(16, speed * 12)) - drag.lean) * 0.4;
    drag.lastX = e.clientX;
    drag.lastTime = e.timeStamp;
    // upwards: stretch, less and less the further it is pulled; downwards: squash a little
    drag.stretch = dy < 0 ? 1 + 0.85 * (1 - Math.exp(dy / 170)) : Math.max(0.82, 1 - dy / 320);
    pose();
    // when the pointer stops, stand up straight again
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (!drag) return;
      drag.lean = 0;
      pose();
    }, 90);
  });

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const { moved, startLeft, startX } = drag;
    drag = null;
    window.clearTimeout(settleTimer);
    if (catButton.hasPointerCapture(e.pointerId)) catButton.releasePointerCapture(e.pointerId);
    if (!moved) return;
    suppressClick = e.type === 'pointerup';
    window.setTimeout(() => (suppressClick = false), 300);
    // let go: slide back inside the window if it was pulled past an end, and bounce
    const held = catButton.style.transform;
    catButton.style.transform = '';
    root.classList.remove('dragging');
    root.classList.add('settling');
    const left = place(startLeft + (e.clientX - startX));
    window.setTimeout(() => root.classList.remove('settling'), 320);
    if (!calm) {
      catButton.animate(
        [
          { transform: held, offset: 0 },
          { transform: 'scale(1.14, 0.8)', offset: 0.3 },
          { transform: 'scale(0.95, 1.08)', offset: 0.55 },
          { transform: 'scale(1.03, 0.97)', offset: 0.78 },
        ],
        { duration: 560, easing: 'ease-out' },
      );
    }
    // the mouth shuts as it lands (unless it is busy talking: that timer owns the mouth then)
    if (!busy) window.setTimeout(() => root.classList.remove('pop'), calm ? 0 : 170);
    try {
      localStorage.setItem(POSITION_KEY, (left / window.innerWidth).toFixed(4));
    } catch {}
  }
  catButton.addEventListener('pointerup', endDrag);
  catButton.addEventListener('pointercancel', endDrag);

  // come back to where it was left last time (on devices where it can be dragged)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let saved = NaN;
    try {
      saved = parseFloat(localStorage.getItem(POSITION_KEY) ?? '');
    } catch {}
    if (saved >= 0 && saved <= 1) place(saved * window.innerWidth);
    window.addEventListener('resize', () => {
      if (root.style.left) place(parseFloat(root.style.left));
    });
  }

  // ---- can this browser run it? --------------------------------------------------

  async function checkSupport() {
    checked = true;
    // typed loosely so this compiles whether or not the WebGPU type definitions are present
    type Adapter = { features: { has(name: string): boolean } };
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu;
    let adapter: Adapter | null = null;
    try {
      adapter = gpu ? await gpu.requestAdapter() : null;
    } catch {
      adapter = null;
    }
    if (!adapter) {
      state = 'unsupported';
      greeting.textContent = meow(
        'I am a small model that runs inside the browser, and this browser cannot run me: I need WebGPU. Try a recent Chrome, Edge or Safari. You can still reach Wenjia by email, from the link at the bottom of the page.',
        cries,
      );
      chips.hidden = true;
      input.disabled = true;
      sendButton.disabled = true;
      return;
    }
    if (!adapter.features.has('shader-f16') && !override) modelId = chosen.fallback ?? modelId;
    // the model is already in this browser: no need to warn about the download
    if (stored().includes(modelId)) greeting.textContent = greeting.dataset.cached ?? greeting.textContent;
  }

  // ---- waking the model ----------------------------------------------------------

  function showProgress(fraction: number) {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    if (!progress) {
      progress = document.createElement('div');
      progress.className = 'pc-msg bot pc-wake';
      progress.innerHTML = '<span></span><i role="progressbar" aria-label="Loading the model" aria-valuemin="0" aria-valuemax="100"><b></b></i>';
      log.append(progress);
      scrollDown(true);
    }
    progress.querySelector('span')!.textContent = `Waking up… ${pct}%`;
    progress.querySelector('i')!.setAttribute('aria-valuenow', String(pct));
    progress.querySelector('b')!.style.width = `${pct}%`;
  }

  /**
   * The usual failure on a phone: the browser took the page's GPU away because the model
   * needs more graphics memory than it will give. Say so in plain words.
   */
  const lostGpu = (message: string) => /mapAsync|Instance reference|device (?:was |is )?lost|out of memory|GPUDevice|GPUBuffer/i.test(message);
  const NO_MEMORY = 'I ran out of graphics memory on this device and fell asleep. I need more than this browser will give me here; a computer has room.';

  function fail(message: string) {
    worker?.terminate();
    worker = null;
    state = 'idle';
    root.classList.remove('waking');
    progress?.remove();
    progress = null;
    history.pop(); // the question that could not be answered
    addMessage('bot', lostGpu(message) ? NO_MEMORY : `I could not wake up: ${message}`).classList.add('err');
    setBusy(false);
  }

  async function wake() {
    state = 'loading';
    root.classList.add('waking');
    showProgress(0);
    try {
      const profile = fetch('/chat-profile.json').then((r) => {
        if (!r.ok) throw new Error(`profile: HTTP ${r.status}`);
        return r.json() as Promise<{ system: { en: string; zh: string }; reminder?: { en?: string; zh?: string } }>;
      });
      worker = new Worker(new URL('./popcat-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<FromWorker>) => onWorker(e.data);
      worker.onerror = (e) => fail(e.message || 'the model library failed to load');
      worker.postMessage({ type: 'load', model: modelId, host });
      const loaded = await profile;
      const fill = (text: string) => text.replaceAll('{{model}}', label).replaceAll('{{size}}', size);
      system = { en: fill(loaded.system.en), zh: fill(loaded.system.zh) };
      reminder = loaded.reminder ?? {};
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  // ---- messages from the model ---------------------------------------------------

  function onWorker(msg: FromWorker) {
    if (msg.type === 'progress') {
      showProgress(msg.progress);
    } else if (msg.type === 'ready') {
      try {
        localStorage.setItem(STORAGE_KEY, [...new Set([...stored(), modelId])].join(','));
      } catch {}
      state = 'ready';
      root.classList.remove('waking');
      progress?.remove();
      progress = null;
      generate();
    } else if (msg.type === 'token') {
      if (!live || msg.id !== turnId) return;
      live.text += msg.delta;
      live.el.innerHTML = format(live.text, false);
      lastToken = performance.now();
      scrollDown();
    } else if (msg.type === 'done') {
      if (msg.id !== turnId) return;
      finish();
    } else if (msg.type === 'error') {
      if (state === 'loading') return fail(msg.message);
      if (live) {
        live.el.classList.remove('live');
        if (!live.text.trim()) live.el.remove();
        live = null;
      }
      addMessage('bot', lostGpu(msg.message) ? NO_MEMORY : `Something went wrong: ${msg.message}`).classList.add('err');
      // whatever happened, the model is in an unknown state: start afresh on the next question
      worker?.terminate();
      worker = null;
      state = 'idle';
      history.pop();
      setBusy(false);
    }
  }

  // ---- conversation --------------------------------------------------------------

  function addMessage(who: 'user' | 'bot', text: string) {
    const el = document.createElement('div');
    el.className = `pc-msg ${who}`;
    if (who === 'user') el.textContent = text;
    else el.innerHTML = format(text);
    log.append(el);
    scrollDown(true);
    return el;
  }
  function scrollDown(force = false) {
    if (force || log.scrollHeight - log.scrollTop - log.clientHeight < 80) log.scrollTop = log.scrollHeight;
  }

  function setBusy(value: boolean) {
    busy = value;
    root.classList.toggle('busy', value);
    sendButton.setAttribute('aria-label', value ? 'Stop' : 'Send');
    window.clearInterval(popTimer);
    root.classList.remove('pop');
    if (value) {
      // the cat's mouth pops open and shut for as long as words are coming out
      popTimer = window.setInterval(() => {
        const talking = performance.now() - lastToken < 300;
        root.classList.toggle('pop', talking && !root.classList.contains('pop'));
      }, 150);
    }
  }

  /** The visitor asked something: show it, wake the model if this is the first time, answer. */
  function send(text: string) {
    const question = text.trim();
    if (!question || busy || state === 'unsupported') return;
    chips.hidden = true;
    addMessage('user', question);
    history.push({ role: 'user', content: question });
    logged = logChat(question, modelId);
    setBusy(true);
    if (state === 'ready') generate();
    else void wake();
  }

  /** Ask the model to answer the newest question in `history`. */
  function generate() {
    if (!worker) return;
    const el = addMessage('bot', '');
    el.classList.add('live');
    live = { el, text: '' };
    turnId++;
    let recent: Turn[] = history.slice(-HISTORY_TURNS);
    while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
    // the newest question carries a short reminder of the rules; the visitor never sees it
    const question = recent[recent.length - 1].content;
    const inChinese = /[\u3400-\u9fff]/.test(question);
    const nudge = inChinese ? reminder.zh : reminder.en;
    // a small model answers in the language it read first and last, so say it at both ends
    const asked = inChinese ? `请用中文回答这个问题：${question}` : question;
    if (nudge) recent = [...recent.slice(0, -1), { role: 'user', content: `${asked}\n\n(${nudge})` }];
    worker.postMessage({
      type: 'chat',
      id: turnId,
      // Qwen3-family models think out loud unless told not to; other models must not get this flag
      noThink: /qwen3/i.test(modelId),
      // a Chinese question gets the instructions in Chinese, so the answer comes back in Chinese
      messages: [{ role: 'system', content: inChinese ? system.zh : system.en }, ...recent],
    });
  }

  function finish() {
    if (live) {
      live.el.classList.remove('live');
      const answer = live.text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (answer) {
        history.push({ role: 'assistant', content: answer });
        if (logged) logAnswer(logged, answer);
        logged = null;
        live.el.innerHTML = format(live.text); // now that it is finished, the last sentence gets its meow
      } else live.el.textContent = '…';
      live = null;
    }
    setBusy(false);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) {
      // the button is a stop button while an answer is being written
      if (state === 'ready') worker?.postMessage({ type: 'stop' });
      return;
    }
    const text = input.value;
    input.value = '';
    input.style.height = '';
    send(text);
  });
  input.addEventListener('keydown', (e) => {
    // Enter sends; Shift+Enter makes a new line; Enter that confirms an IME choice does neither
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + 2}px`;
  });
  chips.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    if (button) send(button.dataset.ask ?? button.textContent ?? '');
  });
}

const root = document.getElementById('popcat');
if (root) init(root);
