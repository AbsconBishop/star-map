// Ephemeris · JPL Horizons proxy
// GET /api/body?id=voyager1            -> osculating elements + live window (now ±3 d, 2 h step) + long trajectory track
// GET /api/body?id=voyager1&at=2461322 -> exact window around a given Julian date (±2 d, 2 h step)
// All vectors: heliocentric, ecliptic J2000, AU and AU/day. No dependencies (Node 18+ global fetch).

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const Y = 365.25;
const D = s => Date.parse(s + 'T00:00:00Z') / 864e5 + 2440587.5;

// id -> Horizons COMMAND and how far the trajectory track should reach.
// span: [startJD|null, endJD|null] fixed, or { around: 'now'|'tp', half: days } relative.
const T = {
  mercury: { cmd: '1', half: 0.5 * 88 },
  venus: { cmd: '2', half: 0.5 * 225 },
  earth: { cmd: '3', half: 0.5 * Y },
  mars: { cmd: '4', half: 0.5 * 687 },
  jupiter: { cmd: '5', half: 0.5 * 11.86 * Y },
  saturn: { cmd: '6', half: 0.5 * 29.46 * Y },
  uranus: { cmd: '7', half: 0.5 * 84.0 * Y },
  neptune: { cmd: '8', half: 0.5 * 164.8 * Y },
  pluto: { cmd: '9', half: 0.5 * 248 * Y },
  ceres: { cmd: '1;', half: 0.5 * 4.6 * Y },
  vesta: { cmd: '4;', half: 0.5 * 3.63 * Y },
  pallas: { cmd: '2;', half: 0.5 * 4.6 * Y },
  apophis: { cmd: '99942;', half: 0.5 * 0.89 * Y },
  didymos: { cmd: '65803;', half: 0.5 * 2.11 * Y },
  arrokoth: { cmd: '486958;', half: 100 * Y },
  eris: { cmd: '136199;', half: 150 * Y },
  haumea: { cmd: '136108;', half: 142 * Y },
  makemake: { cmd: '136472;', half: 150 * Y },
  sedna: { cmd: '90377;', half: 150 * Y },
  chiron: { cmd: '2060;', span: [D('1925-01-01'), D('2080-01-01')], steps: 1600 },
  halley: { cmd: 'DES=1P;', half: 38 * Y },
  cg67p: { cmd: 'DES=67P;', half: 3.2 * Y },
  encke: { cmd: 'DES=2P;', half: 1.65 * Y },
  ponsbrooks: { cmd: 'DES=12P;', half: 36 * Y },
  halebopp: { cmd: 'DES=C/1995 O1;', around: 'tp', half: 60 * Y },
  tsuchinshan: { cmd: 'DES=C/2023 A3;', around: 'tp', half: 25 * Y },
  oumuamua: { cmd: 'DES=1I;', around: 'tp', half: 25 * Y },
  borisov: { cmd: 'DES=2I;', around: 'tp', half: 25 * Y },
  atlas3i: { cmd: 'DES=3I;', around: 'tp', half: 25 * Y },
  voyager1: { cmd: '-31', span: [D('1977-09-06'), D('2060-01-01')], probe: true },
  voyager2: { cmd: '-32', span: [D('1977-08-21'), D('2060-01-01')], probe: true },
  newhorizons: { cmd: '-98', span: [D('2006-01-20'), D('2060-01-01')], probe: true },
  pioneer10: { cmd: '-23', span: [D('1972-03-04'), D('2060-01-01')], probe: true },
  pioneer11: { cmd: '-24', span: [D('1973-04-07'), D('2060-01-01')], probe: true },
  parker: { cmd: '-96', span: [D('2018-08-13'), D('2030-01-01')], probe: true },
  bepi: { cmd: '-121', span: [D('2018-10-21'), D('2029-01-01')], probe: true },
  juice: { cmd: '-28', span: [D('2023-04-15'), D('2036-01-01')], probe: true },
  clipper: { cmd: '-159', span: [D('2024-10-15'), D('2035-01-01')], probe: true },
  hera: { cmd: '-91', span: [D('2024-10-08'), D('2028-01-01')], probe: true },
  jwst: { cmd: '-170', span: [D('2021-12-26'), D('2032-01-01')], probe: true, noTrack: true },
};

const resolved = new Map(); // warm-lambda cache: designation -> record number

const jdNow = () => Date.now() / 864e5 + 2440587.5;
const iso = jd => new Date((jd - 2440587.5) * 864e5).toISOString().slice(0, 16).replace('T', ' ');
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const r9 = x => +x.toPrecision(10);

class HzError extends Error {}

async function call(params, tries = 2) {
  const q = new URLSearchParams({ format: 'text', OBJ_DATA: 'NO', MAKE_EPHEM: 'YES', CENTER: "'500@10'", OUT_UNITS: "'AU-D'", REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", CSV_FORMAT: "'YES'", ...params });
  for (let k = 0; k < tries; k++) {
    const r = await fetch(API + '?' + q.toString(), { headers: { 'User-Agent': 'Ephemeris/1.0 (solar system visualisation)' } });
    if (r.status === 503 || r.status === 429) { await new Promise(s => setTimeout(s, 800 * (k + 1))); continue; }
    const text = await r.text();
    if (!r.ok) throw new HzError(`Horizons HTTP ${r.status}: ${text.slice(0, 200)}`);
    return text;
  }
  throw new HzError('Horizons is busy (503)');
}

function parseTable(text) {
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  if (a < 0 || b < 0) return null;
  const head = text.slice(0, a).split('\n').filter(l => l.includes('JDTDB')).pop() || '';
  const cols = head.split(',').map(s => s.trim());
  const rows = text.slice(a + 5, b).trim().split('\n').map(l => l.split(',').map(s => s.trim()));
  return { cols, rows };
}

// Run a query; transparently handles small-body record lists and ephemeris coverage limits.
async function query(cmd, params, depth = 0) {
  const command = resolved.get(cmd) || cmd;
  const text = await call({ COMMAND: `'${command}'`, ...params });
  const tab = parseTable(text);
  if (tab) {
    const m = text.match(/Target body name:\s*(.+?)\s{2,}\{source:\s*([^}]+)\}/);
    return { tab, name: m ? m[1].trim() : null, source: m ? m[2].trim() : null, params };
  }
  if (depth > 2) throw new HzError(text.slice(0, 300));
  // multiple small-body records (comet apparitions): pick the latest one not after the current year
  if (/matches\.\s*To SELECT/i.test(text)) {
    const yr = new Date().getUTCFullYear();
    const recs = [...text.matchAll(/^\s*(\d{5,})\s+(-?\d+)\s+\S+/gm)].map(m => ({ rec: m[1], ep: +m[2] }));
    if (!recs.length) throw new HzError('Ambiguous designation: ' + cmd);
    const past = recs.filter(r => r.ep <= yr);
    const pick = (past.length ? past : recs).reduce((a, b) => (b.ep > a.ep ? b : a));
    resolved.set(cmd, pick.rec + ';');
    return query(cmd, params, depth + 1);
  }
  // coverage limits: "No ephemeris for target ... prior to A.D. 1972-MAR-03 02:04:42.1854 TDB" / "... after A.D. ..."
  const cov = text.match(/(prior to|before|after)\s+A\.D\.\s+(\d{4})-([A-Z]{3})-(\d{2})\s+(\d{2}):(\d{2})/i);
  if (cov && params.START_TIME) {
    const jd = Date.UTC(+cov[2], MON[cov[3].toUpperCase()], +cov[4], +cov[5], +cov[6]) / 864e5 + 2440587.5;
    const p = { ...params };
    const after = /after/i.test(cov[1]);
    if (after) p.STOP_TIME = `'${iso(jd - 1 / 24)}'`; else p.START_TIME = `'${iso(jd + 1 / 24)}'`;
    const s = Date.parse(p.START_TIME.slice(1, -1).replace(' ', 'T') + 'Z'), e = Date.parse(p.STOP_TIME.slice(1, -1).replace(' ', 'T') + 'Z');
    if (!(e > s)) throw new HzError('No coverage in requested range');
    return query(cmd, p, depth + 1);
  }
  throw new HzError(text.replace(/\s+/g, ' ').slice(0, 300));
}

async function vectors(cmd, t0, t1, steps) {
  const r = await query(cmd, { EPHEM_TYPE: 'VECTORS', VEC_TABLE: "'2'", START_TIME: `'${iso(t0)}'`, STOP_TIME: `'${iso(t1)}'`, STEP_SIZE: `'${steps}'` });
  const rows = r.tab.rows.filter(c => c.length >= 8);
  if (rows.length < 2) throw new HzError('Too few rows');
  const v = [];
  for (const c of rows) for (const k of [2, 3, 4, 5, 6, 7]) v.push(r9(+c[k]));
  const jd0 = +rows[0][0], jd1 = +rows[1][0];
  return { t0: jd0, dt: jd1 - jd0, n: rows.length, v, name: r.name, source: r.source };
}

async function elements(cmd, t) {
  const r = await query(cmd, { EPHEM_TYPE: 'ELEMENTS', START_TIME: `'${iso(t)}'`, STOP_TIME: `'${iso(t + 1 / 24)}'`, STEP_SIZE: "'1'" });
  const row = r.tab.rows[0], ix = n => r.tab.cols.indexOf(n), g = n => +row[ix(n)];
  return { epoch: +row[0], e: g('EC'), q: g('QR'), i: g('IN'), O: g('OM'), w: g('W'), tp: g('Tp'), a: g('A'), name: r.name, source: r.source };
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('id');
  const t = T[id];
  if (!t) { res.status(400).json({ error: 'Unknown id' }); return; }
  const now = jdNow();
  const out = { id, fetched: new Date().toISOString() };

  try {
    const at = url.searchParams.get('at');
    if (at) {
      const c = Math.round(+at * 2) / 2;
      if (!isFinite(c)) { res.status(400).json({ error: 'Bad at' }); return; }
      out.win = await vectors(t.cmd, c - 2, c + 2, 48);
      res.setHeader('Cache-Control', c < now - 2 ? 'public, s-maxage=2592000, stale-while-revalidate=604800' : 'public, s-maxage=21600, stale-while-revalidate=86400');
      res.status(200).json(out);
      return;
    }

    const h = Math.floor(now * 12) / 12; // round to 2 h so the CDN cache key stays meaningful
    const jobs = {
      el: t.probe ? null : elements(t.cmd, h),
      live: vectors(t.cmd, h - 3, h + 3, 72),
    };
    const settled = {};
    await Promise.all(Object.entries(jobs).map(async ([k, p]) => { if (!p) return; try { settled[k] = await p; } catch (e) { settled[k] = { error: String(e.message || e) }; } }));
    Object.assign(out, settled);

    if (!t.noTrack) {
      let a, b;
      if (t.span) [a, b] = t.span;
      else {
        const c = t.around === 'tp' && out.el && !out.el.error ? out.el.tp : h;
        a = c - t.half; b = c + t.half;
      }
      const steps = t.steps || (t.probe ? 1400 : t.around === 'tp' ? 700 : 420);
      try { out.track = await vectors(t.cmd, a, b, steps); } catch (e) { out.track = { error: String(e.message || e) }; }
    }
    const src = [out.live, out.el, out.track].find(x => x && x.name);
    if (src) { out.name = src.name; out.source = src.source; }
    for (const k of ['live', 'el', 'track']) if (out[k]) { delete out[k].name; delete out[k].source; }

    const ok = ['live', 'el', 'track'].some(k => out[k] && !out[k].error);
    res.setHeader('Cache-Control', ok ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'no-store');
    res.status(ok ? 200 : 502).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ id, error: String(e.message || e) });
  }
}
