// Ephemeris · place search for birth location (Open-Meteo geocoding, no key)
// GET /api/geo?q=Bratislava -> [{name, region, country, lat, lon, tz}]
export default async function handler(req, res) {
  const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) { res.status(400).json({ error: 'Zadaj aspoň 2 znaky.' }); return; }
  try {
    const u = 'https://geocoding-api.open-meteo.com/v1/search?count=8&format=json&language=sk&name=' + encodeURIComponent(q);
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const out = (j.results || []).filter(x => x.timezone).map(x => ({
      name: x.name, region: x.admin1 || '', country: x.country || x.country_code || '',
      lat: x.latitude, lon: x.longitude, tz: x.timezone,
    }));
    res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=604800');
    res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Vyhľadávanie miest je nedostupné. Zadaj súradnice ručne.' });
  }
}
