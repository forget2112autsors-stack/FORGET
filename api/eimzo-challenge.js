// Vercel serverless funksiya (Node runtime) — E-IMZO bilan kirish uchun
// BIR MARTALIK imzolanadigan matn ("challenge") beradi.
//
// NIMA UCHUN KERAK: imzoning haqiqiyligini tekshirish yetarli emas. Agar
// imzolanadigan matnni brauzerning o'zi o'ylab topsa (ilgari shunday edi),
// server esa uni umuman tekshirmasa — o'sha korxonaning boshqa biror joyda
// qo'ygan haqiqiy imzo blokini qo'lga kiritgan kishi uni "api/eimzo-login"ga
// yuborib, korxona nomidan sessiya olib ketishi mumkin ("replay" hujumi).
// Endi matnni SERVER beradi, u bir martalik va qisqa muddatli.
//
// HOLATSIZ (stateless): challenge ichida vaqt belgisi + tasodifiy qism bor va
// ular EIMZO_CHALLENGE_SECRET bilan HMAC-SHA256 orqali muhrlangan. Shuning
// uchun berilgan challenge'larni baza yoki Redis'da saqlash shart emas —
// "api/eimzo-login.js" muhrni va 2 daqiqalik muddatni o'zi tekshiradi.
//
// TALAB QILINADIGAN SOZLASH (Vercel Dashboard -> loyiha -> Settings ->
// Environment Variables):
//   EIMZO_CHALLENGE_SECRET — istalgan uzun tasodifiy satr, masalan
//                            "openssl rand -hex 32" natijasi. "eimzo-login.js"
//                            bilan BIR XIL qiymat bo'lishi shart.

const crypto = require("crypto");

module.exports = async function handler(req, res) {
  const secret = process.env.EIMZO_CHALLENGE_SECRET;
  if (!secret) {
    res.status(500).json({ error: "Server sozlanmagan — EIMZO_CHALLENGE_SECRET hali kiritilmagan." });
    return;
  }

  // Shakl: FORGET-LOGIN:<ms>:<32 hex>:<64 hex HMAC>
  // (eimzo-login.js'dagi challengeValid() shu shaklni kutadi — ikkalasini
  // birga o'zgartiring).
  const body = `FORGET-LOGIN:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`;
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");

  // Har safar yangi qiymat — hech qanday keshga tushmasin.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ challenge: `${body}:${sig}` });
};
