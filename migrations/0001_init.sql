-- Visitor log for wenjia.me (Cloudflare D1, SQLite).
-- Written by worker/index.ts; read in the Cloudflare dashboard (Storage & databases > D1)
-- or with `npm run logs:views` / `npm run logs:chat`.
--
-- No IP address, cookie or other identifier of a person is stored. `session` is a random
-- id that lives only as long as one browser tab, so the pages of one visit can be read
-- in order. Location is what Cloudflare reports for the request, to the city.

CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), -- UTC
  kind      TEXT NOT NULL,   -- 'view' (a page was opened) or 'chat' (a question to Pop Cat)
  session   TEXT,
  path      TEXT,            -- the page: /, /publications/, ...
  -- page views
  referrer  TEXT,            -- the site the visitor came from, if another site
  seconds   INTEGER,         -- how long the page was on screen
  device    TEXT,            -- 'phone' or 'desktop', from the window's width
  lang      TEXT,            -- the browser's language, e.g. zh-CN
  -- chat
  cid       TEXT,            -- ties a question to its answer
  question  TEXT,
  answer    TEXT,
  model     TEXT,
  -- where from
  country   TEXT,
  region    TEXT,
  city      TEXT
);
CREATE INDEX events_ts ON events (ts);
CREATE INDEX events_session ON events (session);
CREATE INDEX events_cid ON events (cid);

-- One row per city, for the visitor map on the homepage. A visit is one browser tab's
-- session, however many pages it opens.
CREATE TABLE places (
  key        TEXT PRIMARY KEY,  -- "lat,lon" rounded to 0.1 degree
  city       TEXT,
  country    TEXT,
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  visits     INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL
);

-- Ready-made tables to read, newest first.
CREATE VIEW page_views AS
  SELECT ts, city, country, path, seconds, referrer, device, lang, session
  FROM events WHERE kind = 'view' ORDER BY id DESC;

CREATE VIEW chat_log AS
  SELECT ts, city, country, question, answer, path, model, session
  FROM events WHERE kind = 'chat' ORDER BY id DESC;
