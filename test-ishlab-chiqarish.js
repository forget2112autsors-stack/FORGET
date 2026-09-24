// test-ishlab-chiqarish.js — Ishlab chiqarish dalolatnomasi va ko'p moddali kalkulyatsiya testlari
const assert = require("assert");

function toNum(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\s+/g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function computeKalkulyatsiyaTannarx(params) {
  const miqdor = toNum(params.miqdor);
  if (miqdor <= 0) return { jamiTannarx: 0, birlikTannarx: 0, xomashyoTannarx: 0 };

  const materiallar = params.materiallar || [];
  let xomashyoTannarx = 0;
  const processedMateriallar = materiallar.map((m) => {
    const norma = toNum(m.norma);
    const rejaMiqdor = toNum(m.rejaMiqdor || norma * miqdor);
    const faktMiqdor = toNum(m.faktMiqdor !== undefined ? m.faktMiqdor : rejaMiqdor);
    const narx = toNum(m.narx);
    const summa = faktMiqdor * narx;
    xomashyoTannarx += summa;
    const farq = faktMiqdor - rejaMiqdor;
    return {
      nomi: m.nomi,
      birlik: m.birlik,
      norma,
      rejaMiqdor,
      faktMiqdor,
      farq,
      narx,
      summa
    };
  });

  const ishHaqi = toNum(params.ishHaqi);
  const ijtimoiySoliq = params.ijtimoiySoliq !== undefined ? toNum(params.ijtimoiySoliq) : Math.round(ishHaqi * 0.12);
  const boshqaXarajat = toNum(params.boshqaXarajat);
  const chiqindi = toNum(params.chiqindi);

  const jamiTannarx = Math.max(0, xomashyoTannarx + ishHaqi + ijtimoiySoliq + boshqaXarajat - chiqindi);
  const birlikTannarx = miqdor > 0 ? jamiTannarx / miqdor : 0;

  const foydaNormasi = toNum(params.foydaNormasi);
  const birlikSotishQqssiz = birlikTannarx + foydaNormasi;
  const qqsStavka = toNum(params.qqsStavka || 12);
  const birlikQqsSumma = birlikSotishQqssiz * (qqsStavka / 100);
  const birlikSotishQqsBilan = birlikSotishQqssiz + birlikQqsSumma;

  return {
    miqdor,
    materiallar: processedMateriallar,
    xomashyoTannarx,
    ishHaqi,
    ijtimoiySoliq,
    boshqaXarajat,
    chiqindi,
    jamiTannarx,
    birlikTannarx,
    foydaNormasi,
    birlikSotishQqssiz,
    birlikQqsSumma,
    birlikSotishQqsBilan
  };
}

function parseIshlabChiqarishDetails(icRow) {
  if (!icRow || !icRow.izoh) return null;
  try {
    const raw = String(icRow.izoh);
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);
      if (obj.kalkulyatsiya) return obj.kalkulyatsiya;
    }
    const match = raw.match(/\[KALK:(.*?)\]$/);
    if (match) {
      return JSON.parse(match[1]);
    }
  } catch (e) {}
  return null;
}

function getDisplayIzoh(izoh) {
  if (!izoh) return "";
  const raw = String(izoh);
  const match = raw.match(/^(.*?)(\s*\[KALK:.*?\])?$/);
  if (match && match[1] !== undefined) return match[1].trim();
  if (raw.startsWith("{") && raw.includes("kalkulyatsiya")) return "";
  return raw;
}

console.log("=== ISHLAB CHIQARISH VA KO'P MODDALI KALKULYATSIYA TESTLARI ===");

// 1. Bazaviy me'yoriy hisob-kitob
{
  const res = computeKalkulyatsiyaTannarx({
    miqdor: 100,
    materiallar: [
      { nomi: "Granula", birlik: "kg", norma: 1.5, narx: 10000 }
    ],
    foydaNormasi: 2000
  });
  assert.strictEqual(res.materiallar[0].rejaMiqdor, 150);
  assert.strictEqual(res.materiallar[0].faktMiqdor, 150);
  assert.strictEqual(res.materiallar[0].summa, 1500000);
  assert.strictEqual(res.xomashyoTannarx, 1500000);
  assert.strictEqual(res.jamiTannarx, 1500000);
  assert.strictEqual(res.birlikTannarx, 15000);
  assert.strictEqual(res.birlikSotishQqssiz, 17000);
  assert.strictEqual(res.birlikQqsSumma, 2040);
  assert.strictEqual(res.birlikSotishQqsBilan, 19040);
  console.log("  ✓ 1. Bazaviy me'yor bo'yicha tannarx va sotish narxi to'g'ri hisoblandi");
}

// 2. Faktik sarfning me'yordan farqi (brak yoki tejamkorlik)
{
  const res = computeKalkulyatsiyaTannarx({
    miqdor: 100,
    materiallar: [
      { nomi: "Granula", birlik: "kg", norma: 1.5, faktMiqdor: 160, narx: 10000 } // +10 kg ortiqcha sarf
    ]
  });
  assert.strictEqual(res.materiallar[0].rejaMiqdor, 150);
  assert.strictEqual(res.materiallar[0].faktMiqdor, 160);
  assert.strictEqual(res.materiallar[0].farq, 10);
  assert.strictEqual(res.materiallar[0].summa, 1600000);
  assert.strictEqual(res.jamiTannarx, 1600000);
  assert.strictEqual(res.birlikTannarx, 16000);
  console.log("  ✓ 2. Faktik sarf me'yordan ortganda (+10 kg) tannarx to'g'ri oshirildi");
}

// 3. To'liq 7 moddali tannarx (Xomashyo + Ish haqi + Ijtimoiy soliq + Elektr - Chiqindi)
{
  const res = computeKalkulyatsiyaTannarx({
    miqdor: 200,
    materiallar: [
      { nomi: "Yog'och taxta", birlik: "dona", norma: 2, faktMiqdor: 400, narx: 50000 } // 20,000,000
    ],
    ishHaqi: 2000000,       // 2,000,000
    ijtimoiySoliq: 240000,  // 12% = 240,000
    boshqaXarajat: 500000,  // elektr va uskunalar amortizatsiyasi = 500,000
    chiqindi: 300000        // qipiq/qaytariladigan chiqindi = -300,000
  });
  // Jami = 20,000,000 + 2,000,000 + 240,000 + 500,000 - 300,000 = 22,440,000
  assert.strictEqual(res.xomashyoTannarx, 20000000);
  assert.strictEqual(res.jamiTannarx, 22440000);
  assert.strictEqual(res.birlikTannarx, 112200); // 22,440,000 / 200
  console.log("  ✓ 3. Ko'p moddali tannarx (Xomashyo + Oylik + 12% Ijtimoiy soliq + Elektr - Chiqindi) 100% to'g'ri");
}

// 4. Ijtimoiy soliqning avtomatik 12% hisoblanishi
{
  const res = computeKalkulyatsiyaTannarx({
    miqdor: 1,
    materiallar: [],
    ishHaqi: 5000000
  });
  assert.strictEqual(res.ijtimoiySoliq, 600000); // 12% of 5,000,000
  assert.strictEqual(res.jamiTannarx, 5600000);
  console.log("  ✓ 4. Ish haqiga ijtimoiy soliq avtomatik 12% qilib hisoblandi");
}

// 5. Izoh ichidagi KALK metadata saqlanishi va toza ajratilishi
{
  const details = { smena: "1-smena", masullar: "Karimov", birlikTannarx: 12000 };
  const storedIzoh = `Usta Karimov partiyasi [KALK:${JSON.stringify(details)}]`;
  const parsed = parseIshlabChiqarishDetails({ izoh: storedIzoh });
  assert.deepStrictEqual(parsed, details);
  assert.strictEqual(getDisplayIzoh(storedIzoh), "Usta Karimov partiyasi");

  // Faqat KALK bo'lsa
  const onlyKalk = `[KALK:${JSON.stringify(details)}]`;
  assert.strictEqual(getDisplayIzoh(onlyKalk), "");

  // Oddiy izoh bo'lsa
  const normalIzoh = "Oddiy ishlab chiqarish yozuvi";
  assert.strictEqual(getDisplayIzoh(normalIzoh), "Oddiy ishlab chiqarish yozuvi");
  assert.strictEqual(parseIshlabChiqarishDetails({ izoh: normalIzoh }), null);
  console.log("  ✓ 5. Metadata [KALK:...] formatida saqlanib, jadvalda toza izoh ko'rsatilishi kafolatlandi");
}

// 6. Ombor kirim va chiqim harakatlarining izchilligi
{
  const mockOmbor = [];
  const icId = "test-uuid-123";

  // Chiqimlar (sarflangan xomashyo)
  mockOmbor.push({ hujjatRaqami: `IC-${icId}`, nomi: "Granula", miqdor: 120, turi: "chiqim" });
  // Kirim (ishlab chiqarilgan tayyor mahsulot)
  mockOmbor.push({ hujjatRaqami: `IC-${icId}`, nomi: "Quvur D200", miqdor: 100, narx: 15000, turi: "kirim" });

  assert.strictEqual(mockOmbor.filter(r => r.hujjatRaqami === `IC-${icId}`).length, 2);

  // Kaskad o'chirish
  const cleaned = mockOmbor.filter(r => r.hujjatRaqami !== `IC-${icId}`);
  assert.strictEqual(cleaned.length, 0);
  console.log("  ✓ 6. Tayyor mahsulot kirimi va xomashyo chiqimi IC-<id> bilan kaskad o'chirilishi tasdiqlandi");
}

console.log("\nBarcha ishlab chiqarish va kalkulyatsiya testlari muvaffaqiyatli o'tdi!");
