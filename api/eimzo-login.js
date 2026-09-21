// Vercel serverless funksiya (Node runtime) — E-IMZO orqali kirishni
// tasdiqlaydi. Bu fayl shu ilova (bux2112/FORGET) bilan BIRGA Vercel'ga
// deploy qilinadi (avtomatik — "api/" papkasidagi har bir fayl alohida
// endpoint bo'ladi, qo'shimcha sozlash shart emas).
//
// NIMA UCHUN BU YERDA (frontendda emas): imzoning HAQIQIYLIGINI (soxta
// emasligini, O'zbekiston sertifikat markazi zanjiri bo'yicha) tekshirish va
// Supabase sessiyasini yaratish uchun maxfiy kalitlar (SUPABASE_SERVICE_ROLE_KEY)
// kerak — bularni HECH QACHON brauzer/frontend kodida saqlab bo'lmaydi.
//
// TALAB QILINADIGAN SOZLASH (Vercel Dashboard -> loyiha -> Settings ->
// Environment Variables):
//   EIMZO_SERVER_URL           — o'zingiz ishga tushirgan E-IMZO-SERVER manzili
//                                 (masalan "https://sizning-server:port").
//                                 Bu server O'zbekiston Milliy sertifikatlash
//                                 markazidan rasman olingan config/VPN-kalitlar
//                                 bilan ishga tushiriladi — buni ilova ichidan
//                                 ta'minlab bo'lmaydi, alohida rasmiy ro'yxatdan
//                                 o'tish talab qilinadi (qarang: github.com/qo0p/e-imzo-doc).
//   SUPABASE_URL                — index.html'dagi SUPABASE_URL bilan bir xil.
//   SUPABASE_SERVICE_ROLE_KEY   — Supabase Dashboard -> Project Settings -> API
//                                 -> "service_role" (MAXFIY, faqat shu yerda,
//                                 hech qachon frontendga chiqarilmaydi).
//   EIMZO_CHALLENGE_SECRET      — istalgan uzun tasodifiy satr (masalan
//                                 "openssl rand -hex 32"). "api/eimzo-challenge.js"
//                                 bilan BIR XIL bo'lishi shart — imzolanadigan
//                                 bir martalik matn shu kalit bilan muhrlanadi.
//
// DIQQAT: EIMZO_SERVER_URL sozlanmagunicha bu funksiya doim xato qaytaradi —
// bu KUTILGAN holat (rasmiy ruxsat/config olinmaguncha ishlatib bo'lmaydi).
// Email/parol orqali kirish bunga bog'liq emas, alohida ishlaydi.

const crypto = require("crypto");

const EIMZO_INN_OID = "1.2.860.3.16.1.1";

// Imzolangan matn "api/eimzo-challenge.js" bergan bir martalik challenge
// ekanini tekshiradi: shakli to'g'rimi, HMAC muhri joyidami va 2 daqiqa
// ichida berilganmi. Busiz imzo HAQIQIY bo'lsa ham, uni boshqa joydan
// olib kelib qayta ishlatish (replay) mumkin bo'lardi.
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function challengeValid(text, secret) {
  if (!secret) return false;
  const m = /^FORGET-LOGIN:(\d+):([0-9a-f]{32}):([0-9a-f]{64})$/.exec(String(text || "").trim());
  if (!m) return false;
  const [, ts, rnd, sig] = m;
  const expected = crypto.createHmac("sha256", secret).update(`FORGET-LOGIN:${ts}:${rnd}`).digest("hex");
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return false;
  const age = Date.now() - Number(ts);
  return age >= 0 && age < CHALLENGE_TTL_MS;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { EIMZO_SERVER_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EIMZO_CHALLENGE_SECRET } = process.env;
  if (!EIMZO_SERVER_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EIMZO_CHALLENGE_SECRET) {
    res.status(500).json({ error: "Server sozlanmagan — EIMZO_SERVER_URL/SUPABASE_SERVICE_ROLE_KEY/EIMZO_CHALLENGE_SECRET hali kiritilmagan." });
    return;
  }

  const { pkcs7 } = req.body || {};
  if (!pkcs7) { res.status(400).json({ error: "pkcs7 yuborilmadi" }); return; }

  try {
    // 1) E-IMZO-SERVER orqali imzoni tekshirish (sertifikat zanjiri, muddati,
    // haqiqiyligi). Aniq so'rov/javob shakli EIMZO-SERVER versiyasiga qarab
    // biroz farq qilishi mumkin — quyidagi qo'shimcha tekshiruv (verified,
    // subjectName) github.com/qo0p/e-imzo-doc'dagi namunaga asoslangan;
    // haqiqiy serveringizdan qaytgan javobni tekshirib, kerak bo'lsa moslang.
    const verifyResp = await fetch(`${EIMZO_SERVER_URL}/backend/pkcs7/verify/attached`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: pkcs7
    });
    if (!verifyResp.ok) { res.status(502).json({ error: "E-IMZO-SERVER javob bermadi" }); return; }
    const verifyData = await verifyResp.json();
    const signer = verifyData && verifyData.pkcs7Info && verifyData.pkcs7Info.signers && verifyData.pkcs7Info.signers[0];
    if (!signer || !signer.verified) {
      res.status(401).json({ error: "Imzo tasdiqlanmadi (soxta yoki muddati o'tgan bo'lishi mumkin)" });
      return;
    }

    // 1.1) ENG MUHIM TEKSHIRUV: imzo haqiqiyligi yetarli emas — imzolangan
    // MATN ham aynan shu server bergan bir martalik challenge bo'lishi shart.
    // Aks holda o'sha korxonaning boshqa biror joyda qo'ygan imzo blokini
    // qo'lga kiritgan kishi uni shu yerga yuborib, korxona nomidan sessiya
    // olishi mumkin edi. Qarang: api/eimzo-challenge.js, app.js authEimzoBtn.
    // DIQQAT: imzolangan hujjat qaysi maydonda qaytishi EIMZO-SERVER
    // versiyasiga bog'liq — serveringiz javobida "document" bo'lmasa,
    // mos maydon nomini shu yerda moslang.
    const signedRaw = (verifyData.pkcs7Info && verifyData.pkcs7Info.document) || verifyData.document || "";
    const signedText = Buffer.from(String(signedRaw), "base64").toString("utf8");
    if (!challengeValid(signedText, EIMZO_CHALLENGE_SECRET)) {
      res.status(401).json({ error: "Imzolangan matn noto'g'ri yoki muddati o'tgan — qaytadan urinib ko'ring" });
      return;
    }
    const inn = signer.subjectName && signer.subjectName[EIMZO_INN_OID];
    const nomi = (signer.subjectName && signer.subjectName.CN) || `INN ${inn}`;
    if (!inn) { res.status(401).json({ error: "Sertifikatda tashkilot INN'i topilmadi (jismoniy shaxs sertifikati bo'lishi mumkin)" }); return; }

    // 2) INN'ga bog'langan barqaror (lekin haqiqatda hech kimga yuborilmaydigan)
    // email — Supabase Auth foydalanuvchisi sifatida ishlatiladi.
    const email = `inn+${inn}@eimzo.forget.local`;
    const authHeaders = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    };

    // 2.1) Bloklangan INN — signup_create_own_firma() bilan BIR XIL qoida.
    // Ilgari bu tekshiruv faqat email/parol bilan ro'yxatdan o'tishda bor edi,
    // shu sabab bloklangan mijoz E-IMZO orqali bemalol kirib, o'ziga yangi
    // firma ochib olardi. Qarang: migration_self_signup.sql.
    const blockResp = await fetch(
      `${SUPABASE_URL}/rest/v1/bloklangan_innlar?inn=eq.${encodeURIComponent(inn)}&select=inn`,
      { headers: authHeaders }
    );
    const blocked = await blockResp.json();
    if (Array.isArray(blocked) && blocked.length) {
      res.status(403).json({ error: "Bu INN bloklangan — ro'yxatdan o'tish rad etildi. Administratorga murojaat qiling." });
      return;
    }

    // 3) Foydalanuvchi hali yo'q bo'lsa yaratamiz (bor bo'lsa xato jim
    // e'tiborsiz qoldiriladi — "email allaqachon ro'yxatdan o'tgan").
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { eimzo_inn: inn, eimzo_nomi: nomi } })
    });

    // 4) Shu foydalanuvchi uchun hali firma biriktirilmagan bo'lsa, o'zi
    // uchun BO'SH firma yaratamiz (signup_create_own_firma bilan bir xil
    // g'oya, lekin service-role orqali to'g'ridan-to'g'ri — chunki bu yerda
    // hali auth.email() beradigan foydalanuvchi sessiyasi yo'q).
    const existingAccessResp = await fetch(
      `${SUPABASE_URL}/rest/v1/firma_foydalanuvchilari?email=eq.${encodeURIComponent(email)}&select=firma_id`,
      { headers: authHeaders }
    );
    const existingAccess = await existingAccessResp.json();
    if (Array.isArray(existingAccess) && !existingAccess.length) {
      const firmaResp = await fetch(`${SUPABASE_URL}/rest/v1/firmalar`, {
        method: "POST",
        headers: { ...authHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ nomi })
      });
      const [firmaRow] = await firmaResp.json();
      if (firmaRow && firmaRow.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ firma_id: firmaRow.id, inn, company_name: nomi })
        });
        await fetch(`${SUPABASE_URL}/rest/v1/firma_foydalanuvchilari`, {
          method: "POST",
          headers: authHeaders,
          // rol: "egasi" — o'z firmasini shu yerda yaratgan foydalanuvchi uning
          // egasi bo'ladi (yozuvlarni o'chira oladi, xodim qo'sha oladi).
          // Qarang: migration_xavfsizlik_v2.sql, is_firma_admin().
          body: JSON.stringify({ firma_id: firmaRow.id, email, rol: "egasi" })
        });
      }
    }

    // 5) Frontend sessiya o'rnatishi uchun bir martalik token ("magiclink"
    // turi) — hech qanday email jo'natilmaydi, faqat token_hash qaytariladi
    // va frontend uni darhol sbClient.auth.verifyOtp() bilan almashtiradi.
    const linkResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ type: "magiclink", email })
    });
    const linkData = await linkResp.json();
    const tokenHash = linkData && linkData.properties && linkData.properties.hashed_token;
    if (!tokenHash) { res.status(500).json({ error: "Sessiya yaratib bo'lmadi" }); return; }

    res.status(200).json({ token_hash: tokenHash, email, inn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kutilmagan xatolik: " + err.message });
  }
};
