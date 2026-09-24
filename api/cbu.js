// Vercel serverless funksiya (Node runtime) — O'zbekiston Respublikasi Markaziy Banki (CBU)
// rasmiy valyuta kurslari API proksi.
//
// Endpointlar:
//   GET /api/cbu                      -> Bugungi barcha valyutalar kurslari
//   GET /api/cbu?date=YYYY-MM-DD     -> Ko'rsatilgan sanadagi valyutalar kurslari
//   GET /api/cbu?ccy=USD&date=...    -> Muayyan valyuta kursi
//   POST /api/cbu { date?: "...", ccy?: "..." }

const CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 soat

module.exports = async function handler(req, res) {
  // CORS sarlavhalari
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Faqat GET yoki POST qabul qilinadi." });
    return;
  }

  const payload = req.method === "POST" ? (req.body || {}) : (req.query || {});
  const date = (payload.date || "").trim(); // YYYY-MM-DD
  const ccy = (payload.ccy || "").trim().toUpperCase();

  const cacheKey = `${date}_${ccy}`;
  const cached = CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    res.status(200).json(cached.data);
    return;
  }

  try {
    let url = "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";
    if (ccy && date) {
      url = `https://cbu.uz/uz/arkhiv-kursov-valyut/json/${encodeURIComponent(ccy)}/${encodeURIComponent(date)}/`;
    } else if (date) {
      url = `https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/${encodeURIComponent(date)}/`;
    }

    const resp = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "FORGET-Buxgalteriya/2.0"
      }
    });

    if (!resp.ok) {
      res.status(resp.status).json({ ok: false, error: `CBU API xatosi: ${resp.status} ${resp.statusText}` });
      return;
    }

    const data = await resp.json();
    CACHE.set(cacheKey, { timestamp: now, data });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "Markaziy Bank API bilan bog'lanishda xatolik" });
  }
};
