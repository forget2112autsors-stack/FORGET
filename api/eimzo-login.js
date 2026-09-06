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
//
// DIQQAT: EIMZO_SERVER_URL sozlanmagunicha bu funksiya doim xato qaytaradi —
// bu KUTILGAN holat (rasmiy ruxsat/config olinmaguncha ishlatib bo'lmaydi).
// Email/parol orqali kirish bunga bog'liq emas, alohida ishlaydi.

const EIMZO_INN_OID = "1.2.860.3.16.1.1";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { EIMZO_SERVER_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!EIMZO_SERVER_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server sozlanmagan — EIMZO_SERVER_URL/SUPABASE_SERVICE_ROLE_KEY hali kiritilmagan." });
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
    const verifyData = await verifyResp.json();
    const signer = verifyData && verifyData.pkcs7Info && verifyData.pkcs7Info.signers && verifyData.pkcs7Info.signers[0];
    if (!signer || !signer.verified) {
      res.status(401).json({ error: "Imzo tasdiqlanmadi (soxta yoki muddati o'tgan bo'lishi mumkin)" });
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
          body: JSON.stringify({ firma_id: firmaRow.id, email })
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
