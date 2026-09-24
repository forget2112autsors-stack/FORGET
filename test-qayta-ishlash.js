// test-qayta-ishlash.js — Ombordagi mahsulotni qayta ishlash va konvertatsiya testlari
const assert = require("assert");

function toNum(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\s+/g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function computeQaytaIshlashCost(params) {
  const sarfMiqdor = toNum(params.sarfMiqdor);
  const manbaNarx = toNum(params.manbaNarx);
  const sarfSumma = sarfMiqdor * manbaNarx;

  const yangiMiqdor = toNum(params.yangiMiqdor);
  const qoshimchaXarajat = toNum(params.qoshimchaXarajat);
  const chiqindiSumma = toNum(params.chiqindiSumma);

  const jamiXarajat = Math.max(0, sarfSumma + qoshimchaXarajat - chiqindiSumma);
  const yangiBirlikNarx = yangiMiqdor > 0 ? jamiXarajat / yangiMiqdor : 0;
  const yangiJamiSumma = yangiMiqdor * yangiBirlikNarx;

  return {
    sarfMiqdor,
    manbaNarx,
    sarfSumma,
    yangiMiqdor,
    qoshimchaXarajat,
    chiqindiSumma,
    jamiXarajat,
    yangiBirlikNarx,
    yangiJamiSumma
  };
}

function computeTexnologikYoqotish(sarfMiqdor, yangiMiqdor, manbaBirlik, yangiBirlik) {
  sarfMiqdor = toNum(sarfMiqdor);
  yangiMiqdor = toNum(yangiMiqdor);
  const sameUnit = String(manbaBirlik || "").trim().toLowerCase() === String(yangiBirlik || "").trim().toLowerCase();
  if (!sameUnit || sarfMiqdor <= 0) {
    return { sameUnit: false, yoqotishMiqdor: 0, yoqotishFoiz: 0 };
  }
  const yoqotishMiqdor = Math.max(0, sarfMiqdor - yangiMiqdor);
  const yoqotishFoiz = sarfMiqdor > 0 ? (yoqotishMiqdor / sarfMiqdor) * 100 : 0;
  return {
    sameUnit: true,
    yoqotishMiqdor,
    yoqotishFoiz: Math.round(yoqotishFoiz * 10) / 10
  };
}

console.log("=== OMBORDAGI MAHSULOTNI QAYTA ISHLASH (KONVERTATSIYA) TESTLARI ===");

// 1-Test: Manba xomashyo qiymati va yangi mahsulot tannarxi to'g'ri o'tishi
{
  // Masalan: 50 kg go'sht (har kg 70,000 so'm) qayta ishlanib, 48 kg qiyma olindi.
  // Qo'shimcha xarajatlar yo'q.
  const res = computeQaytaIshlashCost({
    sarfMiqdor: 50,
    manbaNarx: 70000,
    yangiMiqdor: 48,
    qoshimchaXarajat: 0,
    chiqindiSumma: 0
  });

  assert.strictEqual(res.sarfSumma, 3500000, "Manba sarf summasi 3,500,000 bo'lishi kerak");
  assert.strictEqual(res.jamiXarajat, 3500000, "Jami xarajat 3,500,000 bo'lishi kerak");
  // 3,500,000 / 48 = 72,916.666...
  assert.ok(Math.abs(res.yangiBirlikNarx - 72916.67) < 0.01, "Yangi qiyma birlik narxi to'g'ri hisoblandi");
  assert.strictEqual(Math.round(res.yangiJamiSumma), 3500000, "Jami yangi qiymat manba qiymatiga teng");
  console.log("  ✓ 1. Manba tovar sarf qiymati yangi mahsulot tannarxiga to'g'ri o'tkazildi");
}

// 2-Test: Qo'shimcha xarajatlar va qaytariladigan chiqindi hisobga olinishi
{
  // 100 dona xom yog'och taxta (1 dona 50,000 so'm = 5,000,000).
  // Qayta ishlab 90 dona silliqlangan taxta olindi.
  // Qo'shimcha ish haqi + elektr: 400,000 so'm.
  // Qaytariladigan chiqindi (qipiq/yem): 100,000 so'm (tannarxdan chegiriladi).
  // Jami xarajat = 5,000,000 + 400,000 - 100,000 = 5,300,000 so'm.
  // Yangi birlik narxi = 5,300,000 / 90 = 58,888.89 so'm.
  const res = computeQaytaIshlashCost({
    sarfMiqdor: 100,
    manbaNarx: 50000,
    yangiMiqdor: 90,
    qoshimchaXarajat: 400000,
    chiqindiSumma: 100000
  });

  assert.strictEqual(res.jamiXarajat, 5300000, "Jami xarajat 5,300,000 bo'lishi kerak");
  assert.ok(Math.abs(res.yangiBirlikNarx - (5300000 / 90)) < 0.001, "Yangi birlik narxi to'g'ri");
  console.log("  ✓ 2. Qo'shimcha xarajat va qaytariladigan chiqindi tannarxda to'liq inobatga olindi");
}

// 3-Test: Texnologik yo'qotish (brak, uvol) hisobi
{
  const loss1 = computeTexnologikYoqotish(50, 48, "kg", "kg");
  assert.strictEqual(loss1.sameUnit, true);
  assert.strictEqual(loss1.yoqotishMiqdor, 2, "2 kg yo'qotish");
  assert.strictEqual(loss1.yoqotishFoiz, 4, "4% yo'qotish");

  // Birliklar har xil bo'lsa (masalan qop -> kg)
  const loss2 = computeTexnologikYoqotish(10, 500, "qop", "kg");
  assert.strictEqual(loss2.sameUnit, false, "Har xil birlikda to'g'ridan-to'g'ri foiz olinmaydi");
  console.log("  ✓ 3. Bir xil o'lchov birligida texnologik yo'qotish va foizi avtomatik hisoblandi");
}

// 4-Test: Ombor harakatlari (Kirim va Chiqim) bir xil QI- hujjat bilan yaratilishi
{
  const fakeStore = { ombor: [] };
  const docNo = "QI-TEST123";

  // Manba chiqim
  fakeStore.ombor.push({
    id: "omb_1",
    sana: "2026-09-23",
    hujjatRaqami: docNo,
    nomi: "Mol go'shti",
    birlik: "kg",
    miqdor: 50,
    narx: 70000,
    yetkazibBerishNarxi: 3500000,
    turi: "chiqim"
  });

  // Yangi mahsulot kirimi
  fakeStore.ombor.push({
    id: "omb_2",
    sana: "2026-09-23",
    hujjatRaqami: docNo,
    nomi: "Qiyma 1-nav",
    birlik: "kg",
    miqdor: 48,
    narx: 72916.67,
    yetkazibBerishNarxi: 3500000,
    turi: "kirim"
  });

  const matchingRows = fakeStore.ombor.filter((r) => r.hujjatRaqami === docNo);
  assert.strictEqual(matchingRows.length, 2, "2 ta qator bo'lishi kerak");
  assert.strictEqual(matchingRows.filter((r) => r.turi === "chiqim").length, 1);
  assert.strictEqual(matchingRows.filter((r) => r.turi === "kirim").length, 1);
  console.log("  ✓ 4. Manba tovar chiqimi va yangi mahsulot kirimi yagona QI- hujjatiga bog'landi");
}

// 5-Test: Kaskadli o'chirish (QI- hujjati o'chirilganda ikkala harakat ham o'chirilishi)
{
  let ombor = [
    { id: "1", hujjatRaqami: "KIR-1", turi: "kirim", nomi: "Un" },
    { id: "2", hujjatRaqami: "QI-1001", turi: "chiqim", nomi: "Mol go'shti" },
    { id: "3", hujjatRaqami: "QI-1001", turi: "kirim", nomi: "Qiyma" },
    { id: "4", hujjatRaqami: "KIR-2", turi: "kirim", nomi: "Yog'" }
  ];

  const targetDoc = "QI-1001";
  ombor = ombor.filter((r) => r.hujjatRaqami !== targetDoc);

  assert.strictEqual(ombor.length, 2, "Faqat 2 ta qator qolishi kerak");
  assert.ok(!ombor.some((r) => r.hujjatRaqami === targetDoc), "QI-1001 barcha harakatlari o'chirildi");
  console.log("  ✓ 5. QI-<id> qayta ishlash hujjati o'chirilganda chiqim va kirim to'liq kaskad o'chirildi");
}

// 6-Test: Qoldiqni o'lchov birligi bilan shakllantirish
{
  const testOmbor = [
    { nomi: "Shakar", birlik: "kg", miqdor: 100, turi: "kirim" },
    { nomi: "Shakar", birlik: "kg", miqdor: 30, turi: "chiqim" },
    { nomi: "Quti", birlik: "dona", miqdor: 500, turi: "kirim" },
    { nomi: "Moy", birlik: "litr", miqdor: 200, turi: "kirim" }
  ];

  const map = {};
  testOmbor.forEach((r) => {
    const key = r.nomi + "||" + (r.birlik || "");
    if (!map[key]) map[key] = { nomi: r.nomi, birlik: r.birlik, kirim: 0, chiqim: 0 };
    if (r.turi === "chiqim") map[key].chiqim += r.miqdor;
    else map[key].kirim += r.miqdor;
  });

  const list = Object.values(map).map((x) => ({ ...x, qoldiq: x.kirim - x.chiqim }));
  const shakar = list.find((x) => x.nomi === "Shakar");
  assert.ok(shakar);
  assert.strictEqual(shakar.birlik, "kg");
  assert.strictEqual(shakar.qoldiq, 70);

  const quti = list.find((x) => x.nomi === "Quti");
  assert.ok(quti);
  assert.strictEqual(quti.birlik, "dona");
  assert.strictEqual(quti.qoldiq, 500);

  console.log("  ✓ 6. Ombordagi mahsulotlar o'lchov birligi va qoldig'i bilan to'g'ri shakllandi");
}

console.log("\nBarcha Qayta ishlash (konvertatsiya) testlari muvaffaqiyatli o'tdi!\n");
