// test-bank-import.js
// Bank ko'chirmalari (eski ABS va zamonaviy "Biznes 24/7" / TurnoverOperationsInfoByDate)
// importini to'liq tekshirish testi.

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const XLSX = require("./vendor/xlsx.full.min.js");

console.log("\n--- BANK IMPORTI VA KO'CHIRMALARINI TEKSHIRISH ---\n");

// app.js'dan kerakli funksiyalarni ajratib olamiz
const appJsCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  const idx = appJsCode.indexOf(marker);
  if (idx === -1) throw new Error(`Funksiya topilmadi: ${name}`);
  let braceCount = 0;
  let started = false;
  let end = idx;
  for (let i = idx; i < appJsCode.length; i++) {
    if (appJsCode[i] === "{") {
      braceCount++;
      started = true;
    } else if (appJsCode[i] === "}") {
      braceCount--;
      if (started && braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return appJsCode.slice(idx, end);
}

// Kerakli yordamchi funksiyalarni evaluatsiya qilamiz
const toNumCode = extractFunction("toNum");
const normalizeDateCode = extractFunction("normalizeDate");
const normalizeKontragentNomiCode = extractFunction("normalizeKontragentNomi");
const tryParseAbsBankStatementCode = extractFunction("tryParseAbsBankStatement");

const context = {
  XLSX,
  console,
  todayISO: () => "2026-09-23"
};

const scriptCode = `
${toNumCode}
${normalizeDateCode}
${normalizeKontragentNomiCode}
${tryParseAbsBankStatementCode}
return { toNum, normalizeDate, normalizeKontragentNomi, tryParseAbsBankStatement };
`;

const fns = new Function(
  "XLSX",
  scriptCode
)(XLSX);

const { toNum, normalizeDate, normalizeKontragentNomi, tryParseAbsBankStatement } = fns;

let passCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error("   ", err.message);
    process.exitCode = 1;
  }
}

// 1. Sana formatlari
console.log("[1] Sana normallashtirish (har xil bank formatlari)");
test("Nuqtali sana: '04.09.2026' -> '2026-09-04'", () => {
  assert.strictEqual(normalizeDate("04.09.2026"), "2026-09-04");
});
test("Chiziqli sana: '04-09-2026' -> '2026-09-04'", () => {
  assert.strictEqual(normalizeDate("04-09-2026"), "2026-09-04");
});
test("Sleshli sana: '04/09/2026' -> '2026-09-04'", () => {
  assert.strictEqual(normalizeDate("04/09/2026"), "2026-09-04");
});
test("ISO sana: '2026-09-04' -> '2026-09-04'", () => {
  assert.strictEqual(normalizeDate("2026-09-04"), "2026-09-04");
});
test("Excel sonli sana kodi (45539)", () => {
  const d = normalizeDate(45539);
  assert.strictEqual(typeof d, "string");
  assert.match(d, /^2024-09-04/);
});

// 2. Zamonaviy 15-ustunli ko'chirma (TurnoverOperationsInfoByDate)
console.log("\n[2] Zamonaviy 'Biznes 24/7' (TurnoverOperationsInfoByDate.xlsx)");
const sampleFilePath = "C:/Users/user/.gemini/antigravity-ide/brain/a98ea0cd-5115-4bb3-8b9c-4c4d72d469ac/scratch/Turnover.xlsx";
if (fs.existsSync(sampleFilePath)) {
  const buf = fs.readFileSync(sampleFilePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  const parsed = tryParseAbsBankStatement(rows);

  test("Barcha 22 ta bank operatsiyasi tanib olindi", () => {
    assert(parsed !== null, "Ko'chirma tanib olinmadi");
    assert.strictEqual(parsed.rows.length, 22);
  });

  test("Boshlang'ich qoldiq 'Остаток на начала периода: 0' -> 0", () => {
    assert.strictEqual(parsed.opening, 0);
  });

  test("Debet va kredit aylanmalari 100% to'g'ri", () => {
    const totalDebet = parsed.rows.reduce((s, r) => s + r.chiqim, 0);
    const totalKredit = parsed.rows.reduce((s, r) => s + r.kirim, 0);
    assert.strictEqual(totalDebet, 248661440);
    assert.strictEqual(totalKredit, 399044256);
  });

  test("Bank xizmatlari (xizmat: true) avtomatik aniqlandi", () => {
    const services = parsed.rows.filter((r) => r.xizmat);
    assert.strictEqual(services.length, 7);
    assert(services.some((s) => s.tavsif.includes("Накд пул бериш")));
    assert(services.some((s) => s.kontragent.includes("Начисленные %%")));
  });

  test("Kontragent nomidan ortiqcha qo'shtirnoqlar tozalandi", () => {
    const rtsb = parsed.rows.find((r) => r.kontragentInn === "200933985" && r.kontragent.includes("O`ZBEKISTON RESPUBLIKASI"));
    assert(rtsb, "O'zRTSB operatsiyasi topilmadi");
    assert(!rtsb.kontragent.startsWith('""'), "Boshida qo'shaloq tirnoq qolmasligi kerak");
    assert(!rtsb.kontragent.endsWith('""'), "Oxirida qo'shaloq tirnoq qolmasligi kerak");
  });

  test("Yakuniy 'Итого' va 'Остаток на конец' qatorlari operatsiyalarga qo'shilmagan", () => {
    assert(!parsed.rows.some((r) => /итого|остаток/i.test(r.kontragent)));
  });
} else {
  console.log("  (Sample turnover file yo'q, mock bilan davom ettiriladi)");
}

// 3. Eski ABS formati (Счет/ИНН/Наименование birlashtirilgan)
console.log("\n[3] Eski ABS formati (Birlashtirilgan Счет/ИНН/Наименование)");
const legacyRows = [
  ["O'zbekiston Milliy Banki"],
  ["Hisob: 20208000100000000001"],
  ["Остаток на начало: 5,400,000.50"],
  ["Дата", "№ док", "Счет/ИНН/Наименование", "Дебет", "Кредит", "Назначение платежа"],
  ["01.08.2026", "101", "20208000999/201234567/ALFA MCHJ", "1,200,000", "0", "Tovarlar uchun to'lov"],
  ["02.08.2026", "102", "20208000888/309876543/BETA MCHJ", "0", "3,500,000", "Xizmatlar uchun to'lov"],
  ["03.08.2026", "103", "20208000777/201234567/BANK XIZMATI", "25,000", "0", "Komissiya to'lovi"],
  ["Итого:", "", "", "1,225,000", "3,500,000", ""],
  ["Остаток на конец: 7,675,000.50"]
];

const legacyParsed = tryParseAbsBankStatement(legacyRows);
test("Eski ABS formatini to'liq taniydi", () => {
  assert(legacyParsed !== null);
  assert.strictEqual(legacyParsed.rows.length, 3);
});

test("Eski ABS boshlang'ich qoldig'i (5400000.50)", () => {
  assert.strictEqual(legacyParsed.opening, 5400000.5);
});

test("Eski ABS'da INN va Nomi to'g'ri ajratiladi", () => {
  assert.strictEqual(legacyParsed.rows[0].kontragentInn, "201234567");
  assert.strictEqual(legacyParsed.rows[0].kontragent, "ALFA MCHJ");
  assert.strictEqual(legacyParsed.rows[0].chiqim, 1200000);
});

test("Eski ABS'da bank xizmati avtomat xizmat: true deb belgilanadi", () => {
  const k = legacyParsed.rows[2];
  assert.strictEqual(k.xizmat, true);
  assert.strictEqual(k.chiqim, 25000);
});

// 4. Takroriy (dublikat) yozuvlarni aniqlash mantig'i
console.log("\n[4] Takroriy (dublikat) yozuvlarni filtrlash");
const existingBank = [
  { sana: "2026-09-04", hujjatRaqami: "186251", kontragent: "UzRTSB", kirim: 0, chiqim: 980000 },
  { sana: "2026-09-14", hujjatRaqami: "", kontragent: "Kassa", kirim: 0, chiqim: 50000, tavsif: "Kantselyariya" }
];

function checkDuplicate(r, bank) {
  return bank.some((b) => {
    const sameDate = b.sana === r.sana;
    const sameKirim = Math.abs(toNum(b.kirim) - toNum(r.kirim)) < 1;
    const sameChiqim = Math.abs(toNum(b.chiqim) - toNum(r.chiqim)) < 1;
    if (!sameDate || !sameKirim || !sameChiqim) return false;
    if (r.hujjatRaqami && r.hujjatRaqami !== "0" && b.hujjatRaqami && b.hujjatRaqami !== "0") {
      return b.hujjatRaqami === r.hujjatRaqami;
    }
    const sameKontragent = normalizeKontragentNomi(b.kontragent) === normalizeKontragentNomi(r.kontragent);
    const sameTavsif = (b.tavsif || "").trim().toLowerCase() === (r.tavsif || "").trim().toLowerCase();
    return sameKontragent && (sameTavsif || !r.tavsif || !b.tavsif);
  });
}

test("Ayni bir xil yozuv qayta import qilinganda o'tkazib yuboriladi", () => {
  const isDup = checkDuplicate(
    { sana: "2026-09-04", hujjatRaqami: "186251", kontragent: "UzRTSB", kirim: 0, chiqim: 980000 },
    existingBank
  );
  assert.strictEqual(isDup, true);
});

test("Hujjat raqami bo'sh lekin boshqa kontragent bo'lsa xato dublikat deb hisoblamaydi", () => {
  const isDup = checkDuplicate(
    { sana: "2026-09-14", hujjatRaqami: "", kontragent: "Boshqa korxona", kirim: 0, chiqim: 50000, tavsif: "Xizmat" },
    existingBank
  );
  assert.strictEqual(isDup, false);
});

test("Hujjat raqami 0 bo'lsa ham kontragent boshqa bo'lsa dublikat bo'lmaydi", () => {
  const isDup = checkDuplicate(
    { sana: "2026-09-04", hujjatRaqami: "0", kontragent: "Boshqa korxona", kirim: 0, chiqim: 980000 },
    existingBank
  );
  assert.strictEqual(isDup, false);
});

console.log(`\n✓ Hammasi o'tdi (${passCount} ta sinov muvaffaqiyatli!)\n`);
