/**
 * The site's only server-side code: a small Cloudflare Worker in front of the static
 * pages. It answers two addresses and hands everything else to the static files
 * (wrangler.jsonc sends only /api/* here, so ordinary page loads never run it).
 *
 *   POST /api/log        the pages report a page view, the time spent on it, or a
 *                        question put to Pop Cat (src/scripts/track.ts)
 *   GET  /api/visitors   the cities visitors came from, for the map on the homepage
 *
 * Once a day (the cron in wrangler.jsonc) it also looks at how full the database is and
 * how much was written in the last day, and emails a warning if either is too high.
 *
 * Everything is kept in the D1 database `wenjia-me` (tables in migrations/). No IP
 * address or cookie is stored; the location is the city Cloudflare reports.
 *
 * Both addresses are rate-limited per visitor (the limit is set in wrangler.jsonc). The
 * visitor's IP address is the key Cloudflare counts by; it is used for that count only
 * and never written anywhere. The limiter is loose (each Cloudflare machine counts by
 * itself), so it slows a flood down rather than stopping it; the daily check is what
 * tells you that one happened.
 */
import { site } from '../src/data/site';

// Just enough of the Workers types for this file, so the site's own type check passes
// without pulling the whole Workers runtime types into the Astro project.
interface Statement {
  bind(...values: unknown[]): Statement;
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; meta?: { size_after?: number } }>;
}
interface Env {
  DB: { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Cloudflare's rate limiter: `success` is false once this key has used up its allowance. */
  API_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Cloudflare Email Service: sends from an address on our own domain. */
  EMAIL: { send(message: { to: string; from: { email: string; name: string }; subject: string; text: string }): Promise<unknown> };
}
interface Context {
  waitUntil(promise: Promise<unknown>): void;
}
/** What Cloudflare knows about where a request came from. */
interface Cf {
  country?: string;
  region?: string;
  city?: string;
  latitude?: string;
  longitude?: string;
}

const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|scrapy|httpclient|facebookexternalhit|whatsapp/i;
const MAX_BODY = 8000; // characters; the longest honest message is a question and its answer

/** A string field from the page, cut to a sane length; anything else becomes null. */
const text = (value: unknown, max: number) => (typeof value === 'string' && value ? value.slice(0, max) : null);

async function log(request: Request, env: Env): Promise<Response> {
  // only our own pages may write: a browser always says which site a POST comes from
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return new Response(null, { status: 403 });
  if (BOTS.test(request.headers.get('User-Agent') ?? '')) return new Response(null, { status: 204 });

  const body = await request.text();
  if (body.length > MAX_BODY) return new Response(null, { status: 413 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }

  const cf = (request as Request & { cf?: Cf }).cf ?? {};
  const where = [cf.country ?? null, cf.region ?? null, cf.city ?? null];
  const session = text(data.s, 24);
  const path = text(data.p, 200);

  if (data.k === 'view') {
    const statements = [
      env.DB.prepare(
        'INSERT INTO events (kind, session, path, referrer, device, lang, country, region, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind('view', session, path, text(data.r, 300), data.d === 'phone' ? 'phone' : 'desktop', text(data.l, 20), ...where),
    ];
    // the first page of a visit also puts the visitor's city on the map
    const lat = Number(cf.latitude);
    const lon = Number(cf.longitude);
    if (data.first === true && cf.latitude && cf.longitude && Number.isFinite(lat) && Number.isFinite(lon)) {
      const now = new Date().toISOString().slice(0, 19) + 'Z';
      statements.push(
        env.DB.prepare(
          `INSERT INTO places (key, city, country, lat, lon, visits, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT (key) DO UPDATE SET visits = visits + 1, last_seen = excluded.last_seen`,
        ).bind(`${lat.toFixed(1)},${lon.toFixed(1)}`, cf.city ?? null, cf.country ?? null, Number(lat.toFixed(1)), Number(lon.toFixed(1)), now, now),
      );
    }
    await env.DB.batch(statements);
  } else if (data.k === 'time') {
    // how long the page has been on screen so far; written onto that page view's row
    const seconds = Math.round(Number(data.t));
    if (session && path && seconds > 0 && seconds < 86400) {
      await env.DB.prepare(
        `UPDATE events SET seconds = ? WHERE id = (SELECT max(id) FROM events WHERE kind = 'view' AND session = ? AND path = ?)`,
      )
        .bind(seconds, session, path)
        .run();
    }
  } else if (data.k === 'chat') {
    const question = text(data.q, 1000);
    if (question) {
      await env.DB.prepare(
        'INSERT INTO events (kind, session, path, cid, question, model, country, region, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
        .bind('chat', session, path, text(data.c, 24), question, text(data.m, 80), ...where)
        .run();
    }
  } else if (data.k === 'answer') {
    const cid = text(data.c, 24);
    const answer = text(data.a, 3000);
    if (cid && answer) {
      await env.DB.prepare(`UPDATE events SET answer = ? WHERE kind = 'chat' AND cid = ? AND session IS ?`).bind(answer, cid, session).run();
    }
  } else {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 204 });
}

/** The cities on the map: [longitude, latitude, visits] each, and the totals. */
async function visitors(request: Request, env: Env, ctx: Context): Promise<Response> {
  // the same answer serves everyone for five minutes, so the database is read rarely
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL('/api/visitors', request.url).toString());
  const kept = await cache.match(key);
  if (kept) return kept;

  const [points, totals] = await Promise.all([
    env.DB.prepare('SELECT lon, lat, visits FROM places ORDER BY visits DESC LIMIT 3000').all<{ lon: number; lat: number; visits: number }>(),
    env.DB.prepare(
      'SELECT COALESCE(SUM(visits), 0) AS visits, COUNT(*) AS cities, COUNT(DISTINCT country) AS countries, MIN(first_seen) AS since FROM places',
    ).first<{ visits: number; cities: number; countries: number; since: string | null }>(),
  ]);
  const response = new Response(
    JSON.stringify({
      visits: totals?.visits ?? 0,
      cities: totals?.cities ?? 0,
      countries: totals?.countries ?? 0,
      since: totals?.since ?? null,
      points: points.results.map((p) => [p.lon, p.lat, p.visits]),
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } },
  );
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

// ---- the daily check -------------------------------------------------------------------

const DATABASE_LIMIT = 500 * 1024 * 1024; // the most one D1 database may hold on the free plan
const WARN_WHEN_FULL = 0.8; // warn once the database is this full...
// ...or when a day brings more log lines than this. A quiet personal site writes a few
// hundred; D1's free plan stops accepting writes for the day at 100,000 rows, and one
// log line costs about five.
const WARN_LINES_A_DAY = 5000;
const ALERT_FROM = { email: 'alerts@wenjia.me', name: 'wenjia.me' };

/** Email the owner if the log needs attention. With `test`, send the email whatever the numbers. */
async function dailyCheck(env: Env, test: boolean) {
  const counted = await env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')), 0) AS lastDay FROM events`,
  ).all<{ total: number; lastDay: number }>();
  const { total, lastDay } = counted.results[0];
  const size = counted.meta?.size_after ?? 0;
  // shown in KB while the database is still tiny, so the figure is never a bare 0
  const megabytes = size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  const full = Math.round((size / DATABASE_LIMIT) * 100);

  const reasons: string[] = [];
  if (size >= DATABASE_LIMIT * WARN_WHEN_FULL) reasons.push(`数据库已用 ${megabytes}，达到 500 MB 上限的 ${full}%。写满后将无法再记录新的访问。`);
  if (lastDay >= WARN_LINES_A_DAY) reasons.push(`过去 24 小时写入了 ${lastDay} 条日志，远高于平时，可能有人在刷接口。`);
  if (!reasons.length && !test) return;

  const text = [
    test ? '这是一封测试邮件：提醒功能工作正常，下面是当前的数字。' : reasons.join('\n'),
    '',
    `日志总条数：${total}`,
    `过去 24 小时：${lastDay} 条`,
    `数据库大小：${megabytes}（上限 500 MB，已用 ${full}%）`,
    '',
    '可以做的事（在项目目录里运行）：',
    '1. 导出备份：npm run logs:export',
    '2. 查看最近的记录：npm run logs:views 和 npm run logs:chat',
    `3. 导出后删除旧记录，例如某个日期之前的：npx wrangler d1 execute wenjia-me --remote --command "DELETE FROM events WHERE ts < '2026-01-01'"`,
    '',
    '也可以在 Cloudflare 后台 Storage & databases > D1 > wenjia-me 里直接查看。',
    '只要数字仍然超标，这封邮件每天会再发一次。',
  ].join('\n');
  await env.EMAIL.send({
    to: site.email,
    from: ALERT_FROM,
    subject: test ? 'wenjia.me 访客日志：测试提醒' : 'wenjia.me 访客日志需要处理',
    text,
  });
}

export default {
  /** Runs on the schedule in wrangler.jsonc. `cron` is "test" only when triggered by hand while developing. */
  async scheduled(controller: { cron: string }, env: Env): Promise<void> {
    await dailyCheck(env, controller.cron === 'test');
  },

  async fetch(request: Request, env: Env, ctx: Context): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      let allowed = true;
      try {
        allowed = (await env.API_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' })).success;
      } catch (error) {
        console.error(error); // if the limiter itself fails, let the request through
      }
      if (!allowed) return new Response('Too many requests', { status: 429, headers: { 'Retry-After': '60' } });
    }
    try {
      if (pathname === '/api/log' && request.method === 'POST') return await log(request, env);
      if (pathname === '/api/visitors' && request.method === 'GET') return await visitors(request, env, ctx);
    } catch (error) {
      // a logging failure must never be the visitor's problem
      console.error(error);
      return new Response(null, { status: pathname === '/api/log' ? 204 : 503 });
    }
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
