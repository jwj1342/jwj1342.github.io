/**
 * The visitor log. Every page tells the site's own server (worker/index.ts) that it was
 * opened, where the visitor came from and how long it stayed on screen; Pop Cat reports
 * the questions it is asked. Nothing goes to any other company, and no cookie is set.
 *
 * `session` is a random id kept only for the life of the browser tab, so that the pages
 * of one visit can be read in order. It says nothing about who the visitor is.
 *
 * To keep your own visits out of the log, open any page once with ?track=off added to
 * its address in each browser you use (?track=on turns it back on).
 */
const ENDPOINT = '/api/log';

/** localStorage / sessionStorage can be blocked (private windows); then we simply go without. */
function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}
function write(store: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {}
}
const local = () => localStorage;
const tab = () => sessionStorage;

const wish = new URLSearchParams(location.search).get('track');
if (wish === 'off') write(local, 'track-off', '1');
if (wish === 'on') write(local, 'track-off', null);

// nothing is sent while developing (there is no server behind `npm run dev`)
const on = !import.meta.env.DEV && read(local, 'track-off') !== '1';

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

let session = read(tab, 'sid');
const firstPage = !session;
if (!session) {
  session = randomId();
  write(tab, 'sid', session);
}

function send(data: Record<string, unknown>) {
  if (!on) return;
  const body = JSON.stringify({ ...data, s: session, p: location.pathname });
  // a beacon is still delivered when the page is being closed
  if (navigator.sendBeacon?.(ENDPOINT, body)) return;
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
}

/** The site the visitor came from, without its query string; nothing for our own pages. */
function referrer(): string | undefined {
  try {
    const from = new URL(document.referrer);
    return from.host === location.host ? undefined : from.origin + from.pathname;
  } catch {
    return undefined;
  }
}

// ---- page views ---------------------------------------------------------------------

send({ k: 'view', first: firstPage, r: referrer(), d: innerWidth < 768 ? 'phone' : 'desktop', l: navigator.language });

// Time on screen: counted only while the tab is visible, and reported each time the
// visitor leaves it (the server keeps the latest figure).
let shownAt = document.visibilityState === 'visible' ? performance.now() : null;
let onScreen = 0;
let reported = 0;
function report() {
  if (shownAt !== null) {
    onScreen += performance.now() - shownAt;
    shownAt = null;
  }
  const seconds = Math.round(onScreen / 1000);
  if (seconds > reported) send({ k: 'time', t: seconds });
  reported = seconds;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') report();
  else shownAt = performance.now();
});
addEventListener('pagehide', report);

// ---- Pop Cat -------------------------------------------------------------------------

/** A visitor asked Pop Cat something. Returns an id to pass to `logAnswer`. */
export function logChat(question: string, model: string): string {
  const id = randomId();
  send({ k: 'chat', c: id, q: question, m: model });
  return id;
}

/** What Pop Cat answered to the question logged as `id`. */
export function logAnswer(id: string, answer: string) {
  send({ k: 'answer', c: id, a: answer });
}
