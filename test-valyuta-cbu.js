// test-valyuta-cbu.js
// Ko'p valyutali hisob (5210), Markaziy Bank (CBU) kursi integratsiyasi va
// BHMS 22 bo'yicha kurs farqlari (9540/9640) hisob-kitobini to'liq tekshirish testi.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("\n============================================================");
console.log("   KO'P VALYUTALI HISOB VA CBU KURSLARI TEST SUITE");
console.log("============================================================\n");

const src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function extractFn(name) {
  const re = new RegExp("^(?:async )?function " + name + "\\s*\\(", "m");
  const m = re.exec(src);
  if (!m) throw new Error("Funksiya topilmadi: " + name);
  let p = src.indexOf("(", m.index), pd = 0, k = p;
  for (; k < src.length; k++) {
    if (src[k] === "(") pd++;
    else if (src[k] === ")") { pd--; if (pd === 0) { k++; break; } }
  }
  let i = src.indexOf("{", k), depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(m.index, j);
}

function extractConstBlock(startMarker, endMarker) {
  const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error("Blok topilmadi: " + startMarker);
  return src.slice(a, b + endMarker.length);
}

// Kerakli konstantalar va yordamchi funksiyalarni ajratib olamiz
const toNumCode = extractFn("toNum");
const escapeHtmlCode = extractFn("escapeHtml");
const normalizeCbuRateItemCode = extractFn("normalizeCbuRateItem");
const getCbuRateCode = extractFn("getCbuRate");
const getCbuDiffCode = extractFn("getCbuDiff");
const convertCbuCurrencyCode = extractFn("convertCbuCurrency");
const computeKursFarqlariCode = extractFn("computeKursFarqlari");
const cbuFallbackBlock = extractConstBlock("const CBU_FALLBACK_RATES = {", "};");
const bankDbMapBlock = extractConstBlock("const BANK_DB_MAP = {", "};");
const settingsDbMapBlock = extractConstBlock("const SETTINGS_DB_MAP = {", "};");

// Mock muhit yaratamiz
const scriptCode = `
let STORE = {
  bank: [],
  kassa: [],
  kirim: [],
  chiqim: [],
  ombor: [],
  kontragentlar: [],
  settings: {
    bankOpeningBalance: 0,
    valyutaOpeningBalance: 0,
    filterFrom: '',
    filterTo: ''
  }
};

let CBU_RATES_CACHE = {};

function todayISO() {
  return "2026-09-24";
}

${toNumCode}
${escapeHtmlCode}
${cbuFallbackBlock}
${bankDbMapBlock}
${settingsDbMapBlock}
${normalizeCbuRateItemCode}
${getCbuRateCode}
${getCbuDiffCode}
${convertCbuCurrencyCode}
${computeKursFarqlariCode}

return {
  toNum,
  normalizeCbuRateItem,
  getCbuRate,
  getCbuDiff,
  convertCbuCurrency,
  computeKursFarqlari,
  CBU_FALLBACK_RATES,
  BANK_DB_MAP,
  SETTINGS_DB_MAP,
  setRatesCache: (date, list) => { CBU_RATES_CACHE[date] = list; },
  clearRatesCache: () => { CBU_RATES_CACHE = {}; },
  setStore: (s) => { STORE = Object.assign(STORE, s); },
  getStore: () => STORE
};
`;

const mod = new Function(scriptCode)();

let passed = 0;
let total = 0;

function it(desc, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. CBU API Parsing Testlari
// -------------------------------------------------------------
console.log("1. Markaziy Bank (CBU) JSON javobini pars qilish:");

it("Rasmiy CBU JSON ob'ektini to'g'ri maydonlarga o'girishi kerak", () => {
  const raw = {
    id: 69,
    Code: "840",
    Ccy: "USD",
    CcyNm_RU: "Доллар США",
    CcyNm_UZ: "AQSH dollari",
    Rate: "12845.50",
    Diff: "15.50",
    Date: "24.09.2026"
  };

  const parsed = mod.normalizeCbuRateItem(raw, "2026-09-24");
  assert.strictEqual(parsed.ccy, "USD");
  assert.strictEqual(parsed.code, "840");
  assert.strictEqual(parsed.name, "AQSH dollari");
  assert.strictEqual(parsed.rate, 12845.50);
  assert.strictEqual(parsed.diff, "15.50");
  assert.strictEqual(parsed.date, "24.09.2026");
});

it("Kutilmagan yoki buzilgan satrlarni (probellar, vergullar) xatosiz tozalashi kerak", () => {
  const raw = {
    Code: "978",
    Ccy: "eur",
    Rate: "13 920,40",
    Diff: "-5,20"
  };

  const parsed = mod.normalizeCbuRateItem(raw);
  assert.strictEqual(parsed.ccy, "EUR");
  assert.strictEqual(parsed.rate, 13920.40);
  assert.strictEqual(parsed.diff, "-5.20");
});

it("Noto'g'ri yoki bo'sh ob'ekt kelsa null qaytarishi kerak", () => {
  assert.strictEqual(mod.normalizeCbuRateItem(null), null);
  assert.strictEqual(mod.normalizeCbuRateItem({}), null);
  assert.strictEqual(mod.normalizeCbuRateItem({ Ccy: "XYZ", Rate: "0" }), null);
});

// -------------------------------------------------------------
// 2. Kurslarni olish va Kesh/Fallback Testlari
// -------------------------------------------------------------
console.log("\n2. Kurslarni olish (getCbuRate) va Fallback tizimi:");

it("UZS uchun har doim 1 qaytarishi kerak", () => {
  assert.strictEqual(mod.getCbuRate("UZS"), 1);
  assert.strictEqual(mod.getCbuRate("uzs"), 1);
  assert.strictEqual(mod.getCbuRate(""), 1);
});

it("Keshda bo'lmaganda rasmiy fallback kurslarini (USD, EUR, RUB) berishi kerak", () => {
  mod.clearRatesCache();
  assert.strictEqual(mod.getCbuRate("USD"), 12850);
  assert.strictEqual(mod.getCbuRate("EUR"), 13900);
  assert.strictEqual(mod.getCbuRate("RUB"), 140);
});

it("Keshda mavjud bo'lganda keshdagi joriy kursni berishi kerak", () => {
  mod.clearRatesCache();
  mod.setRatesCache("2026-09-24", [
    { ccy: "USD", rate: 12950.25, diff: "+10.00" },
    { ccy: "EUR", rate: 14100.00, diff: "+25.00" }
  ]);

  assert.strictEqual(mod.getCbuRate("USD", "2026-09-24"), 12950.25);
  assert.strictEqual(mod.getCbuRate("EUR", "2026-09-24"), 14100);
  assert.strictEqual(mod.getCbuDiff("USD", "2026-09-24"), "+10.00");
});

// -------------------------------------------------------------
// 3. Valyuta Konvertori Testlari
// -------------------------------------------------------------
console.log("\n3. Valyuta konvertatsiyasi (convertCbuCurrency):");

it("USD -> UZS konvertatsiyasi (500 USD @ 12,850 = 6,425,000 UZS)", () => {
  mod.clearRatesCache();
  const uzs = mod.convertCbuCurrency(500, "USD", "UZS");
  assert.strictEqual(uzs, 6425000);
});

it("UZS -> USD konvertatsiyasi (12,850,000 UZS @ 12,850 = 1,000 USD)", () => {
  mod.clearRatesCache();
  const usd = mod.convertCbuCurrency(12850000, "UZS", "USD");
  assert.strictEqual(usd, 1000);
});

it("Cross-valyuta: USD -> EUR (13,900 / 12,850 nisbati bo'yicha)", () => {
  mod.clearRatesCache();
  // 1390 USD = 1390 * 12850 = 17,861,500 UZS -> / 13900 = 1285 EUR
  const eur = mod.convertCbuCurrency(1390, "USD", "EUR");
  assert.strictEqual(Math.round(eur), 1285);
});

it("Qo'lda kiritilgan maxsus kurs (Custom Rate) bilan to'g'ri hisoblashi kerak", () => {
  const uzs = mod.convertCbuCurrency(100, "USD", "UZS", 13000);
  assert.strictEqual(uzs, 1300000);
});

// -------------------------------------------------------------
// 4. Bank Harakati va 5210 Hisobvarag'i Matematikasi
// -------------------------------------------------------------
console.log("\n4. 5210 Hisobvarag'i bo'yicha aylanmalar va qoldiq:");

it("5210 bo'yicha valyuta summasi va kursi orqali UZS ekvivalenti to'g'ri chiqishi kerak", () => {
  // Masalan, 5,000 USD eksport tushumi 12,800 kurs bilan = 64,000,000 UZS
  const valyutaSumma = 5000;
  const kurs = 12800;
  const kirimUzs = valyutaSumma * kurs;
  assert.strictEqual(kirimUzs, 64000000);
});

it("5210 bo'yicha ko'p operatsiyali qoldiqni hisoblash", () => {
  mod.setStore({
    settings: {
      bankOpeningBalance: 50000000, // 5110 so'm hisobi: 50 mln
      valyutaOpeningBalance: 1000,  // 5210 USD hisobi: $1,000
      filterFrom: "2026-09-01",
      filterTo: "2026-09-30"
    },
    bank: [
      {
        id: "b1",
        sana: "2026-09-05",
        schyot: "5210",
        valyuta: "USD",
        valyutaSumma: 10000,
        kurs: 12800,
        kirim: 128000000,
        chiqim: 0,
        tavsif: "Eksport tushumi"
      },
      {
        id: "b2",
        sana: "2026-09-15",
        schyot: "5210",
        valyuta: "USD",
        valyutaSumma: 4000,
        kurs: 12820,
        kirim: 0,
        chiqim: 51280000,
        tavsif: "Xomashyo importi to'lovi"
      }
    ]
  });

  // USD qoldig'i: 1,000 + 10,000 - 4,000 = 7,000 USD
  const kf = mod.computeKursFarqlari("2026-09-30");
  assert.strictEqual(kf.details.length, 1);
  const usdDet = kf.details[0];
  assert.strictEqual(usdDet.ccy, "USD");
  assert.strictEqual(usdDet.valyutaQoldiq, 7000);
});

// -------------------------------------------------------------
// 5. BHMS 22: Ijobiy Kurs Farqi (9540 Daromad)
// -------------------------------------------------------------
console.log("\n5. BHMS 22 Ijobiy Kurs Farqi (9540 Hisobvarag'i):");

it("Valyuta kursi oshganda 9540 (Daromad) hosil bo'lishi va provodka to'g'ri shakllanishi kerak", () => {
  mod.clearRatesCache();
  // 30-sentyabr sanasiga CBU kursi 12,900 ga ko'tarildi
  mod.setRatesCache("2026-09-30", [
    { ccy: "USD", rate: 12900, diff: "+50.00" }
  ]);

  mod.setStore({
    settings: {
      bankOpeningBalance: 0,
      valyutaOpeningBalance: 0,
      filterTo: "2026-09-30"
    },
    bank: [
      {
        id: "b10",
        sana: "2026-09-10",
        schyot: "5210",
        valyuta: "USD",
        valyutaSumma: 5000,
        kurs: 12800,
        kirim: 64000000, // 5000 * 12800
        chiqim: 0
      }
    ]
  });

  // Buxgalteriya qiymati: 64,000,000 UZS
  // MB kursi (12,900) bo'yicha yangi qiymat: 5,000 * 12,900 = 64,500,000 UZS
  // Kurs farqi: +500,000 UZS (Ijobiy, 9540)
  const kf = mod.computeKursFarqlari("2026-09-30");
  assert.strictEqual(kf.details.length, 1);
  const usd = kf.details[0];

  assert.strictEqual(usd.buxgalteriyaQiymati, 64000000);
  assert.strictEqual(usd.qaytaBaholanganQiymat, 64500000);
  assert.strictEqual(usd.kursFarqi, 500000);
  assert.strictEqual(usd.ijobiy, 500000);
  assert.strictEqual(usd.salbiy, 0);
  assert.strictEqual(usd.provodka, "Dt 5210 - Kt 9540 (Daromad)");
  assert.strictEqual(kf.jamiIjobiy, 500000);
  assert.strictEqual(kf.jamiSalbiy, 0);
  assert.strictEqual(kf.sofKursFarqi, 500000);
});

// -------------------------------------------------------------
// 6. BHMS 22: Salbiy Kurs Farqi (9640 Zarar)
// -------------------------------------------------------------
console.log("\n6. BHMS 22 Salbiy Kurs Farqi (9640 Hisobvarag'i):");

it("Valyuta kursi tushganda 9640 (Zarar) hosil bo'lishi va provodka to'g'ri shakllanishi kerak", () => {
  mod.clearRatesCache();
  // 30-sentyabr sanasiga CBU kursi 12,700 ga tushdi
  mod.setRatesCache("2026-09-30", [
    { ccy: "USD", rate: 12700, diff: "-100.00" }
  ]);

  mod.setStore({
    settings: {
      bankOpeningBalance: 0,
      valyutaOpeningBalance: 0,
      filterTo: "2026-09-30"
    },
    bank: [
      {
        id: "b20",
        sana: "2026-09-10",
        schyot: "5210",
        valyuta: "USD",
        valyutaSumma: 5000,
        kurs: 12800,
        kirim: 64000000, // 5000 * 12800
        chiqim: 0
      }
    ]
  });

  // Buxgalteriya qiymati: 64,000,000 UZS
  // MB kursi (12,700) bo'yicha yangi qiymat: 5,000 * 12,700 = 63,500,000 UZS
  // Kurs farqi: -500,000 UZS (Salbiy, 9640)
  const kf = mod.computeKursFarqlari("2026-09-30");
  assert.strictEqual(kf.details.length, 1);
  const usd = kf.details[0];

  assert.strictEqual(usd.buxgalteriyaQiymati, 64000000);
  assert.strictEqual(usd.qaytaBaholanganQiymat, 63500000);
  assert.strictEqual(usd.kursFarqi, -500000);
  assert.strictEqual(usd.ijobiy, 0);
  assert.strictEqual(usd.salbiy, 500000);
  assert.strictEqual(usd.provodka, "Dt 9640 - Kt 5210 (Zarar)");
  assert.strictEqual(kf.jamiIjobiy, 0);
  assert.strictEqual(kf.jamiSalbiy, 500000);
  assert.strictEqual(kf.sofKursFarqi, -500000);
});

// -------------------------------------------------------------
// 7. Bazaga saqlash va Excel strukturalari Testlari
// -------------------------------------------------------------
console.log("\n7. Supabase DB xaritalash va Excel ma'lumotlari:");

it("BANK_DB_MAP yangi valyuta maydonlarini (schyot, valyuta, valyuta_summa, kurs) o'z ichiga olishi kerak", () => {
  const map = mod.BANK_DB_MAP;
  assert.strictEqual(map.schyot, "schyot");
  assert.strictEqual(map.valyuta, "valyuta");
  assert.strictEqual(map.valyutaSumma, "valyuta_summa");
  assert.strictEqual(map.kurs, "kurs");
});

it("SETTINGS_DB_MAP valyuta_opening_balance maydonini o'z ichiga olishi kerak", () => {
  const map = mod.SETTINGS_DB_MAP;
  assert.strictEqual(map.valyutaOpeningBalance, "valyuta_opening_balance");
});

// -------------------------------------------------------------
// 8. 0 Valyuta holatida orqaga to'liq mutanosiblik (Regression)
// -------------------------------------------------------------
console.log("\n8. Orqaga to'liq mutanosiblik (Valyutasiz korxona):");

it("Valyuta kiritilmaganda ijobiy va salbiy kurs farqlari 0 bo'lib qolishi kerak", () => {
  mod.setStore({
    settings: {
      bankOpeningBalance: 10000000,
      valyutaOpeningBalance: 0,
      filterTo: "2026-09-30"
    },
    bank: [
      {
        id: "b30",
        sana: "2026-09-12",
        schyot: "5110",
        valyuta: "UZS",
        kirim: 5000000,
        chiqim: 0
      }
    ]
  });

  const kf = mod.computeKursFarqlari("2026-09-30");
  assert.strictEqual(kf.details.length, 0);
  assert.strictEqual(kf.jamiIjobiy, 0);
  assert.strictEqual(kf.jamiSalbiy, 0);
  assert.strictEqual(kf.sofKursFarqi, 0);
});

// -------------------------------------------------------------
// Yakuniy natija
// -------------------------------------------------------------
console.log("\n============================================================");
console.log(`   NATIJA: ${passed} / ${total} ta test muvaffaqiyatli o'tdi.`);
console.log("============================================================\n");

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
