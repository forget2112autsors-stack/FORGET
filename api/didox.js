// Vercel serverless funksiya (Node runtime) — Didox.uz / E-Faktura API proksi.
// Brauzer va ilovadan Didox API'ga xavfsiz va CORS cheklovlarisiz to'g'ridan-to'g'ri
// ulanishni ta'minlaydi.
//
// Endpointlar:
//   POST /api/didox  { action: "ping", token?: "..." }
//   POST /api/didox  { action: "documents", owner: "incoming"|"outgoing", token: "...", page?: 1, limit?: 50, date_from?: "...", date_to?: "..." }
//   POST /api/didox  { action: "proxy", path: "/v1/...", method?: "GET"|"POST", body?: {...}, token: "..." }
//   POST /api/didox  { action: "auth", pkcs7: "...", challenge?: "..." }

module.exports = async function handler(req, res) {
  // CORS sarlavhalari
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Didox-Token");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed. Faqat POST yoki GET qabul qilinadi." });
    return;
  }

  const payload = req.method === "POST" ? (req.body || {}) : (req.query || {});
  const action = payload.action || "documents";
  const didoxBaseUrl = (payload.didox_url || process.env.DIDOX_API_URL || "https://api.didox.uz").replace(/\/+$/, "");

  // Token: body'dan yoki sarlavhadan olish
  const authHeader = req.headers["authorization"] || req.headers["x-didox-token"] || "";
  const token = payload.token || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader);

  // 1) Ulanishni tekshirish (Ping)
  if (action === "ping") {
    try {
      const resp = await fetch(`${didoxBaseUrl}/v1/profile`, {
        headers: {
          "Accept": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        res.status(200).json({ ok: true, message: "Didox API bilan aloqa o'rnatildi", profile: data });
        return;
      }
      res.status(200).json({
        ok: false,
        status: resp.status,
        message: resp.status === 401 ? "Didox API tokeni noto'g'ri yoki muddati o'tgan" : `Didox API javob kodi: ${resp.status}`
      });
      return;
    } catch (e) {
      res.status(200).json({ ok: false, error: e.message || "Didox serveriga ulanib bo'lmadi" });
      return;
    }
  }

  // 2) E-IMZO orqali avtorizatsiya qilish
  if (action === "auth") {
    try {
      const resp = await fetch(`${didoxBaseUrl}/v1/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => ({}));
      res.status(resp.status).json(data);
      return;
    } catch (e) {
      res.status(502).json({ error: "Didox avtorizatsiya serveriga ulanishda xatolik: " + e.message });
      return;
    }
  }

  // 3) Fakturalar ro'yxatini olish (Documents)
  if (action === "documents") {
    if (!token) {
      res.status(400).json({ error: "Didox API tokeni kiritilmagan" });
      return;
    }

    const owner = payload.owner || "incoming"; // 'incoming' (kirim) yoki 'outgoing' (chiqim)
    const page = parseInt(payload.page, 10) || 1;
    const limit = Math.min(parseInt(payload.limit, 10) || 50, 100);
    const dateFrom = payload.date_from || "";
    const dateTo = payload.date_to || "";
    const status = payload.status !== undefined ? payload.status : "";

    const queryParams = new URLSearchParams({
      owner,
      page: String(page),
      limit: String(limit)
    });
    if (dateFrom) queryParams.set("date_from", dateFrom);
    if (dateTo) queryParams.set("date_to", dateTo);
    if (status !== "" && status !== null) queryParams.set("status", String(status));

    const targetUrl = `${didoxBaseUrl}/v1/documents?${queryParams.toString()}`;

    try {
      const resp = await fetch(targetUrl, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        }
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        res.status(resp.status).json({
          error: errData.message || errData.error || `Didox API xatosi (${resp.status})`,
          status: resp.status
        });
        return;
      }

      const data = await resp.json();
      res.status(200).json(data);
      return;
    } catch (e) {
      res.status(502).json({ error: "Didox API serveriga ulanishda xatolik: " + e.message });
      return;
    }
  }

  // 4) Umumiy ixtiyoriy Didox proxy so'rovi
  if (action === "proxy") {
    const subPath = (payload.path || "").replace(/^\/+/, "");
    const method = (payload.method || "GET").toUpperCase();
    const url = `${didoxBaseUrl}/${subPath}`;

    try {
      const fetchOpts = {
        method,
        headers: {
          "Accept": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      };
      if (payload.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
        fetchOpts.headers["Content-Type"] = "application/json";
        fetchOpts.body = typeof payload.body === "string" ? payload.body : JSON.stringify(payload.body);
      }

      const resp = await fetch(url, fetchOpts);
      const data = await resp.json().catch(() => ({}));
      res.status(resp.status).json(data);
      return;
    } catch (e) {
      res.status(502).json({ error: "Didox API so'rovida xatolik: " + e.message });
      return;
    }
  }

  res.status(400).json({ error: "Noma'lum amal (action): " + action });
};
