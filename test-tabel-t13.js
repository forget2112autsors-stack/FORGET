// test-tabel-t13.js
// O'zbekiston Respublikasi Mehnat Kodeksi va T-13 shakli bo'yicha
// Elektron Tabel, davomat hisobi, ta'til (otpusknoy) va kasallik nafaqasi (bolnichniy) test suite.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("\n============================================================");
console.log("   ELEKTRON TABEL VA DAVOMAT (T-13 SHAKLI) TEST SUITE");
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

// Kerakli funksiya va konstantalarni app.js dan ajratib olamiz
const toNumCode = extractFn("toNum");
const stripLoneSurrogatesCode = extractFn("stripLoneSurrogates");
const toDbRowCode = extractFn("toDbRow");
const fromDbRowCode = extractFn("fromDbRow");
const computeIshHaqiRowCode = extractFn("computeIshHaqiRow");
const getUzbekistanHolidaysCode = extractFn("getUzbekistanHolidays");
const getMonthlyWorkingDaysCode = extractFn("getMonthlyWorkingDays");
const calculateTabelRowTotalsCode = extractFn("calculateTabelRowTotals");
const calculateTatilPuliCode = extractFn("calculateTatilPuli");
const calculateKasallikPuliCode = extractFn("calculateKasallikPuli");
const autoFillAllTabelRowsCode = extractFn("autoFillAllTabelRows");

const uzBayramlariBlock = extractConstBlock("const UZ_BAYRAMLARI = {", "};");
const haftaKunlariBlock = extractConstBlock("const HAFTA_KUNLARI_QISQA = [", "];");
const tabelDbMapBlock = extractConstBlock("const TABEL_DB_MAP = {", "};");

const scriptCode = `
let ACTIVE_FIRMA_ID = "firma_test_001";
let CURRENT_TABEL_YEAR = 2026;
let CURRENT_TABEL_MONTH = 9;
let TABEL_GRAFIK_FILTER = "5_kunlik";
let STORE = {
  tabel: [],
  ishHaqi: [],
  settings: {
    ijtimoiySoliqStavka: 12,
    ndflStavka: 12,
    inpsStavka: 0.1
  }
};

function pushFieldsUpdate(tbl, id, fields) {}
function saveStore() {}

${toNumCode}
${stripLoneSurrogatesCode}
${toDbRowCode}
${fromDbRowCode}
${computeIshHaqiRowCode}
${uzBayramlariBlock}
${haftaKunlariBlock}
${tabelDbMapBlock}
${getUzbekistanHolidaysCode}
${getMonthlyWorkingDaysCode}
${calculateTabelRowTotalsCode}
${calculateTatilPuliCode}
${calculateKasallikPuliCode}
${autoFillAllTabelRowsCode}

return {
  toNum,
  toDbRow,
  fromDbRow,
  computeIshHaqiRow,
  UZ_BAYRAMLARI,
  HAFTA_KUNLARI_QISQA,
  TABEL_DB_MAP,
  getUzbekistanHolidays,
  getMonthlyWorkingDays,
  calculateTabelRowTotals,
  calculateTatilPuli,
  calculateKasallikPuli,
  autoFillAllTabelRows,
  setStore: (s) => { STORE = Object.assign(STORE, s); },
  getStore: () => STORE
};
`;

const mod = new Function(scriptCode)();

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn(mod);
    console.log(`  [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(err);
  }
}

// -------------------------------------------------------------
// 1. O'zbekiston bayramlari va taqvim hisob-kitobi (getMonthlyWorkingDays)
// -------------------------------------------------------------
runTest("O'zbekiston davlat bayramlari to'liq kiritilganligi", (ctx) => {
  const holidays = ctx.getUzbekistanHolidays(2026);
  assert.strictEqual(holidays["01-01"], "Yangi yil");
  assert.strictEqual(holidays["03-08"], "Xalqaro xotin-qizlar kuni");
  assert.strictEqual(holidays["03-21"], "Navro'z bayrami");
  assert.strictEqual(holidays["05-09"], "Xotira va qadrlash kuni");
  assert.strictEqual(holidays["09-01"], "Mustaqillik kuni");
  assert.strictEqual(holidays["10-01"], "O'qituvchi va murabbiylar kuni");
  assert.strictEqual(holidays["12-08"], "Konstitutsiya kuni");
});

runTest("2026-yil sentyabr oyi (30 kun, 1-sentyabr bayram, 30-sentyabr bayram arafasi -1 soat) 5 kunlik grafik hisobi", (ctx) => {
  const res = ctx.getMonthlyWorkingDays(2026, 9, "5_kunlik");
  assert.strictEqual(res.totalDays, 30);
  assert.strictEqual(res.daysList.length, 30);

  // 1-sentyabr 2026 - Seshanba (Mustaqillik kuni) -> dam olish (D, 0 soat)
  const day1 = res.daysList[0];
  assert.strictEqual(day1.day, 1);
  assert.strictEqual(day1.isHoliday, true);
  assert.strictEqual(day1.defaultCode, "D");
  assert.strictEqual(day1.defaultHours, 0);

  // 30-sentyabr 2026 - 1-oktyabr (O'qituvchilar kuni) arafasi -> 7 soat (-1 soat qisqargan)
  const day30 = res.daysList[29];
  assert.strictEqual(day30.day, 30);
  assert.strictEqual(day30.defaultCode, "7");
  assert.strictEqual(day30.defaultHours, 7);

  // Jami: 21 ish kuni (20 ta 8 soatlik + 1 ta 7 soatlik = 167 soat me'yor)
  assert.strictEqual(res.standardWorkDays, 21);
  assert.strictEqual(res.standardWorkHours, 167);
});

runTest("6 kunlik grafik: Shanba 5 soat, boshqa kunlar 7 soat, yakshanba dam olish", (ctx) => {
  const res = ctx.getMonthlyWorkingDays(2026, 9, "6_kunlik");
  assert.strictEqual(res.totalDays, 30);

  // 5-sentyabr 2026 - Shanba (weekday === 6)
  const sat = res.daysList.find((d) => d.day === 5);
  assert.strictEqual(sat.weekday, 6);
  assert.strictEqual(sat.isWeekend, false); // 6 kunlikda shanba ish kuni
  assert.strictEqual(sat.defaultCode, "5");
  assert.strictEqual(sat.defaultHours, 5);

  // 6-sentyabr 2026 - Yakshanba (weekday === 0)
  const sun = res.daysList.find((d) => d.day === 6);
  assert.strictEqual(sun.weekday, 0);
  assert.strictEqual(sun.isWeekend, true);
  assert.strictEqual(sun.defaultCode, "D");
  assert.strictEqual(sun.defaultHours, 0);

  // 7-sentyabr 2026 - Dushanba (weekday === 1)
  const mon = res.daysList.find((d) => d.day === 7);
  assert.strictEqual(mon.weekday, 1);
  assert.strictEqual(mon.defaultCode, "7");
  assert.strictEqual(mon.defaultHours, 7);
});

// -------------------------------------------------------------
// 2. Mehnat ta'tili (Otpusknoy) kalkulyatori - MK 233-modda (25.3 bo'luvchi)
// -------------------------------------------------------------
runTest("Mehnat ta'tili puli hisobi: 5,060,000 so'm oklad, 15 kun ta'til", (ctx) => {
  // 5,060,000 / 25.3 = 200,000 so'm kunlik
  // 200,000 * 15 = 3,000,000 so'm ta'til puli
  const res = ctx.calculateTatilPuli(5060000, 15);
  assert.strictEqual(res.kunlikOrtacha, 200000);
  assert.strictEqual(res.summa, 3000000);
});

runTest("Mehnat ta'tili puli nol yoki manfiy parametrlar bilan xavfsiz ishlashi", (ctx) => {
  const zero1 = ctx.calculateTatilPuli(0, 15);
  assert.strictEqual(zero1.summa, 0);
  const zero2 = ctx.calculateTatilPuli(5000000, 0);
  assert.strictEqual(zero2.summa, 0);
});

// -------------------------------------------------------------
// 3. Kasallik nafaqasi (Bolnichniy) kalkulyatori - VM Nizomi № 1136
// -------------------------------------------------------------
runTest("Kasallik varaqasi hisobi: 4,400,000 so'm oklad, 22 ish kuni, 5 kun kasallik", (ctx) => {
  // Kunlik o'rtacha = 4,400,000 / 22 = 200,000 so'm
  // Staj 60%: 200,000 * 5 * 0.6 = 600,000 so'm
  const res60 = ctx.calculateKasallikPuli(4400000, 22, 5, 60);
  assert.strictEqual(res60.kunlikOrtacha, 200000);
  assert.strictEqual(res60.summa, 600000);

  // Staj 80%: 200,000 * 5 * 0.8 = 800,000 so'm
  const res80 = ctx.calculateKasallikPuli(4400000, 22, 5, 80);
  assert.strictEqual(res80.summa, 800000);

  // Staj 100%: 200,000 * 5 * 1.0 = 1,000,000 so'm
  const res100 = ctx.calculateKasallikPuli(4400000, 22, 5, 100);
  assert.strictEqual(res100.summa, 1000000);
});

// -------------------------------------------------------------
// 4. Tabel qatori hisob-kitoblari (calculateTabelRowTotals)
// -------------------------------------------------------------
runTest("Tabel to'liq oy ishlaganda oklad 100% hisoblanishi", (ctx) => {
  const std = ctx.getMonthlyWorkingDays(2026, 9, "5_kunlik");
  const kunlar = {};
  std.daysList.forEach((d) => { kunlar[d.day] = d.defaultCode; });

  const row = {
    oklad: 6000000,
    stavka: 1.0,
    kunlar,
    tatilSumma: 0,
    kasallikSumma: 0,
    mukofot: 500000
  };

  const totals = ctx.calculateTabelRowTotals(row, 2026, 9, "5_kunlik");
  assert.strictEqual(totals.ishlanganKun, 21);
  assert.strictEqual(totals.ishlanganSoat, 167); // 20 kun * 8 + 1 kun * 7 (bayram arafasi)
  assert.strictEqual(totals.tatilKun, 0);
  assert.strictEqual(totals.kasallikKun, 0);
  assert.strictEqual(totals.faktikOylik, 6000000);
  assert.strictEqual(totals.jamiHisoblandi, 6500000); // 6,000,000 + 500,000 mukofot
});

runTest("Qisman ishlangan oy (10 kun ishlagan, oklad 6,300,000, 21 ish kuni)", (ctx) => {
  const kunlar = {};
  // 10 ta 8 soatlik ish kuni, qolganlari D yoki X
  for (let i = 1; i <= 10; i++) kunlar[i] = "8";
  for (let i = 11; i <= 30; i++) kunlar[i] = "X";

  const row = {
    oklad: 6300000,
    stavka: 1.0,
    kunlar,
    tatilSumma: 0,
    kasallikSumma: 0,
    mukofot: 0
  };

  const totals = ctx.calculateTabelRowTotals(row, 2026, 9, "5_kunlik");
  assert.strictEqual(totals.ishlanganKun, 10);
  assert.strictEqual(totals.ishlanganSoat, 80);
  assert.strictEqual(totals.ozHisobidanKun, 20);
  // (6,300,000 / 21) * 10 = 300,000 * 10 = 3,000,000
  assert.strictEqual(totals.faktikOylik, 3000000);
  assert.strictEqual(totals.jamiHisoblandi, 3000000);
});

runTest("0.5 stavka (yarim stavka) bilan hisob-kitob", (ctx) => {
  const std = ctx.getMonthlyWorkingDays(2026, 9, "5_kunlik");
  const kunlar = {};
  std.daysList.forEach((d) => { kunlar[d.day] = d.defaultCode; });

  const row = {
    oklad: 8000000,
    stavka: 0.5,
    kunlar,
    tatilSumma: 0,
    kasallikSumma: 0,
    mukofot: 0
  };

  const totals = ctx.calculateTabelRowTotals(row, 2026, 9, "5_kunlik");
  // 8,000,000 * 0.5 = 4,000,000
  assert.strictEqual(totals.faktikOylik, 4000000);
  assert.strictEqual(totals.jamiHisoblandi, 4000000);
});

runTest("Maxsus belgilar: Ta'til (T), Kasallik (K), Sababsiz (S), Xizmat safari (Xiz)", (ctx) => {
  const kunlar = {
    1: "T", 2: "T", 3: "T",
    4: "K", 5: "K",
    6: "S",
    7: "xiz",
    8: "8"
  };
  const row = {
    oklad: 5000000,
    stavka: 1.0,
    kunlar,
    tatilSumma: 600000,
    kasallikSumma: 350000,
    mukofot: 200000
  };

  const totals = ctx.calculateTabelRowTotals(row, 2026, 9, "5_kunlik");
  assert.strictEqual(totals.tatilKun, 3);
  assert.strictEqual(totals.kasallikKun, 2);
  assert.strictEqual(totals.sababsizKun, 1);
  assert.strictEqual(totals.xizmatSafariKun, 1);
  // Xizmat safari 8 soat va 1 ish kuni sifatida qo'shiladi + 1 ta "8" = 2 kun
  assert.strictEqual(totals.ishlanganKun, 2);
  assert.strictEqual(totals.ishlanganSoat, 16);
  // Jami hisoblandi = faktikOylik + tatilSumma + kasallikSumma + mukofot
  assert.strictEqual(totals.jamiHisoblandi, totals.faktikOylik + 600000 + 350000 + 200000);
});

// -------------------------------------------------------------
// 5. Avto-to'ldirish (autoFillAllTabelRows)
// -------------------------------------------------------------
runTest("Barcha xodimlarni avtomatik reja bo'yicha to'ldirish", (ctx) => {
  ctx.setStore({
    tabel: [
      { id: "t1", yil: 2026, oy: 9, fio: "Aliyev Ali", oklad: 5000000, stavka: 1.0, kunlar: {} },
      { id: "t2", yil: 2026, oy: 9, fio: "Valiyev Vali", oklad: 7000000, stavka: 1.0, kunlar: {} }
    ]
  });

  const count = ctx.autoFillAllTabelRows(2026, 9);
  assert.strictEqual(count, 2);

  const t1 = ctx.getStore().tabel[0];
  assert.strictEqual(t1.ishlanganKun, 21);
  assert.strictEqual(t1.faktikOylik, 5000000);
  assert.strictEqual(t1.kunlar[1], "D"); // 1-sentyabr bayram
  assert.strictEqual(t1.kunlar[2], "8"); // 2-sentyabr ish kuni
});

// -------------------------------------------------------------
// 6. Ish haqi hisob-kitobi bilan sinxronizatsiya va soliqlar
// -------------------------------------------------------------
runTest("Tabeldan hisoblangan jami ish haqi bo'yicha NDFL, INPS va Ijtimoiy soliq hisobi", (ctx) => {
  // Masalan xodimga tabel bo'yicha jami 10,000,000 so'm hisoblandi (oylik + ta'til + mukofot)
  const payrollRow = {
    oyliqSumma: 10000000,
    imtiyozSumma: 0
  };
  const settings = {
    ijtimoiySoliqStavka: 12,
    ndflStavka: 12,
    inpsStavka: 0.1
  };

  const comp = ctx.computeIshHaqiRow(payrollRow, settings);
  assert.strictEqual(comp.oylik, 10000000);
  assert.strictEqual(comp.soliqBazasi, 10000000);
  assert.strictEqual(comp.ijtimoiySoliq, 1200000); // 12%
  assert.strictEqual(comp.ndfl, 1200000); // 12%
  assert.strictEqual(comp.inps, 10000); // 0.1%
  assert.strictEqual(comp.ndflByudjetga, 1190000); // 1,200,000 - 10,000
  assert.strictEqual(comp.sofIshHaqi, 8800000); // 10,000,000 - 1,200,000
});

// -------------------------------------------------------------
// 7. Supabase DB mapping (toDbRow va fromDbRow)
// -------------------------------------------------------------
runTest("Tabel ma'lumotlarini Supabase bazasiga moslashtirish (round-trip)", (ctx) => {
  const appObj = {
    id: "tab_123",
    yil: 2026,
    oy: 9,
    xodimId: "xod_456",
    fio: "Karimov Botir",
    lavozimi: "Bosh muhandis",
    pinfl: "12345678901234",
    oklad: 8500000,
    stavka: 1.0,
    grafik: "5_kunlik",
    kunlar: { 1: "D", 2: "8", 3: "8", 4: "T" },
    ishlanganKun: 20,
    ishlanganSoat: 160,
    tatilKun: 1,
    tatilSumma: 335968,
    kasallikKun: 0,
    kasallikSumma: 0,
    mukofot: 1000000,
    faktikOylik: 8095238,
    jamiHisoblandi: 9431206,
    izoh: "Sentyabr oyi tabeli"
  };

  const dbRow = ctx.toDbRow(ctx.TABEL_DB_MAP, appObj);
  assert.strictEqual(dbRow.firma_id, "firma_test_001");
  assert.strictEqual(dbRow.yil, 2026);
  assert.strictEqual(dbRow.oy, 9);
  assert.strictEqual(dbRow.xodim_id, "xod_456");
  assert.strictEqual(dbRow.fio, "Karimov Botir");
  assert.strictEqual(dbRow.oklad, 8500000);
  assert.strictEqual(dbRow.tatil_summa, 335968);
  assert.strictEqual(dbRow.jami_hisoblandi, 9431206);
  assert.deepStrictEqual(dbRow.kunlar, { 1: "D", 2: "8", 3: "8", 4: "T" });

  const restored = ctx.fromDbRow(ctx.TABEL_DB_MAP, { id: "tab_123", ...dbRow });
  assert.strictEqual(restored.id, "tab_123");
  assert.strictEqual(restored.fio, "Karimov Botir");
  assert.strictEqual(restored.xodimId, "xod_456");
  assert.strictEqual(restored.oklad, 8500000);
  assert.strictEqual(restored.jamiHisoblandi, 9431206);
  assert.deepStrictEqual(restored.kunlar, { 1: "D", 2: "8", 3: "8", 4: "T" });
});

console.log(`\nNatija: ${passed}/${total} testlar muvaffaqiyatli o'tdi.`);
if (passed !== total) {
  process.exit(1);
} else {
  console.log("BARCHA TABEL T-13 TESTLARI MUVAFFAQIYATLI O'TDI!\n");
}
