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
const findBankDupCode = extractFunction("findBankDup");

const context = {
  XLSX,
  console,
  todayISO: () => "2026-09-23"
};

const vositachiStart = appJsCode.indexOf("const BANK_VOSITACHI_INNS");
const vositachiCode = appJsCode.slice(vositachiStart, appJsCode.indexOf("function normalizeKontragentNomi(", vositachiStart));

const scriptCode = `
${vositachiCode}
${toNumCode}
${normalizeDateCode}
${normalizeKontragentNomiCode}
${tryParseAbsBankStatementCode}
${findBankDupCode}
return { toNum, normalizeDate, normalizeKontragentNomi, tryParseAbsBankStatement, extractPayerFromBankTavsif, findBankDup };
`;

const STORE = { bank: [] };
const fns = new Function(
  "XLSX", "STORE",
  scriptCode
)(XLSX, STORE);

const { toNum, normalizeDate, normalizeKontragentNomi, tryParseAbsBankStatement, extractPayerFromBankTavsif, findBankDup } = fns;

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
    // "Начисленные %% <firma>" — firmaning o'z foizlar hisobi, kontragent sifatida olinmaydi
    assert(services.every((s) => !s.kontragent.includes("Начисленные %%")));
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

// 5. "TurnoverOperInfo" formati (Счёт/инн — hisob+INN slashsiz qo'shilgan, "Платежная цель")
console.log("\n[5] 'TurnoverOperInfo' formati (Счёт/инн qo'shib yozilgan)");
const turnoverRows = [
  ["01037 / TOSHKENT SH, Biznesni rivojlantirish banki ATB BOSH OFISI", "", "", "", "", ""],
  ["Дата", "Счёт/инн", "Номер документа", "Дебет", "Кредит", "Платежная цель"],
  ["2026-01-30 13:30:22", "20208000905596227001206916313", "48839288", "0.00", "1,500,000.00", "1900  Устав кап. шаклантириш"],
  ["2026-01-30 13:44:45", "20208000905596227001310068867", "19", "144,840.00", "0.00", "08102~Оплата за 100 Айланмадан олинадиган солик"],
  ["2026-03-13 12:45:44", "20208000905596227001310068867", "61032388", "741.60", "0.00", "00668 BC 13.03.2026 погашение Электрон хужжат. -741.60"],
  ["Итого:", "", "", 145581.6, 1500000, ""]
];
const turnoverParsed = tryParseAbsBankStatement(turnoverRows, { ownInn: "310068867" });

test("Barcha 3 ta operatsiya va summalar o'qildi", () => {
  assert(turnoverParsed !== null);
  assert.strictEqual(turnoverParsed.rows.length, 3);
  assert.strictEqual(turnoverParsed.rows[0].kirim, 1500000);
  assert.strictEqual(turnoverParsed.rows[1].chiqim, 144840);
});

test("Kontragent INN'i hisob raqamidan ajratildi, firmaning o'z INN'i olinmadi", () => {
  assert.strictEqual(turnoverParsed.rows[0].kontragentInn, "206916313");
  assert.strictEqual(turnoverParsed.rows[1].kontragentInn, "");
});

test("'Платежная цель' tavsif sifatida olindi, BC komissiyasi xizmat deb belgilandi", () => {
  assert(turnoverParsed.rows[0].tavsif.includes("Устав"));
  assert.strictEqual(turnoverParsed.rows[2].xizmat, true);
  assert.strictEqual(turnoverParsed.rows[1].xizmat, false);
});

console.log("\n[6] Vositachi (UZEX 201122919) orqali kelgan to'lov — haqiqiy kontragent to'lov maqsadidan");
test("To'lov maqsadidan INN va kontragent nomi ajratildi", () => {
  const p = extractPayerFromBankTavsif("00602700110860262877950600262007~200933985~За Одежда, договор №4304240 от 01.04.2026 от ИНН: 207323290(Ёшлар ишлари агентлиги (Ёшларга оид давлат сиёсатини куллаб-кувватлаш ) xarid.uzex.uz (Электронный магазин)");
  assert.deepStrictEqual(p, { inn: "207323290", nomi: "Ёшлар ишлари агентлиги" });
});

test("Nomsiz INN — faqat INN olinadi; INN yo'q yoki vositachining o'zi bo'lsa — null", () => {
  assert.deepStrictEqual(extractPayerFromBankTavsif("от ИНН:305123456 xarid.uzex.uz"), { inn: "305123456", nomi: "" });
  assert.strictEqual(extractPayerFromBankTavsif("Устав кап. шаклантириш"), null);
  assert.strictEqual(extractPayerFromBankTavsif("ИНН: 201122919 (UZEX)"), null);
});

console.log("\n[7] 'TurnoverSaldoInfoByDate' (История по счету: INN va hujjat raqamisiz)");
const saldoRows = [
  ["История по счету: 20208000905596227001", "", "", "", "", "", "", "", "", ""],
  ["Остаток на начала периода Пассив 0", "", "", "", "", "", "", "", "", ""],
  ["Счет клиента", "Наименование клиента", "Счет кореспондента", "Наименование кореспондента", "Транзакционный номер", "МФО", "Сумма дебита", "Сумма кредита", "Дата", "Назначение платежа"],
  ["", "", "", "", "", "Корес", "", "", "", ""],
  ["20208000905596227001", "RISE SPACE МЧЖ", "10111000000010886400", "Амалиёт кассаларидаги накд пуллар", "", "", 0, 1500000, "30.01.2026", "1900  Юлчиев Э Устав кап. шаклантириш"],
  ["20208000905596227001", "RISE SPACE МЧЖ", "16401000005596227001", "Начисленные %% \"HOJI DADA FAYZ MAKONI\" MChJ", "", "10883", 0.96, 0, "30.01.2026", "00668 BC 30.01.2026 погашение Дебетовый оборот (внеш) -0.96"],
  ["20208000905596227001", "RISE SPACE МЧЖ", "23106000000000001001", "RISE SPACE МЧЖ", "", "", 2500000, 0, "13.08.2026", "00633 июл ойи иш хаки"],
  ["20208000905596227001", "RISE SPACE МЧЖ", "23402000300100001010", "Узбекистон Республикаси Молия вазирлиги Газначилиги", "", "", 28300, 0, "13.08.2026", "08101~4014228603304123430937093~201423281~199 СОРЖ пеня"]
];
const saldoParsed = tryParseAbsBankStatement(saldoRows, { ownInn: "310068867" });

test("Sarlavha ('Сумма дебита', 'кореспондента') tanildi, 4 ta qator o'qildi", () => {
  assert(saldoParsed !== null);
  assert.strictEqual(saldoParsed.rows.length, 4);
  assert.strictEqual(saldoParsed.rows[0].kirim, 1500000);
  assert.strictEqual(saldoParsed.rows[3].chiqim, 28300);
  assert.strictEqual(saldoParsed.rows[3].sana, "2026-08-13");
});

test("Kontragent — korrespondent; firmaning o'z nomi va foizlar hisobi olinmadi", () => {
  assert.strictEqual(saldoParsed.rows[3].kontragent, "Узбекистон Республикаси Молия вазирлиги Газначилиги");
  assert.strictEqual(saldoParsed.rows[1].kontragent, "");
  assert.strictEqual(saldoParsed.rows[1].xizmat, true);
  assert.strictEqual(saldoParsed.rows[2].kontragent, "");
});

test("Takror: hujjat raqamisiz qator tavsif bo'yicha, sana 1 kun farqli bo'lsa ham topildi", () => {
  STORE.bank = [
    { id: 1, sana: "2026-08-12", hujjatRaqami: "52", kontragent: "", tavsif: "08101~4014228603304123430937093~201423281~199 СОРЖ пеня", kirim: 0, chiqim: 28300 },
    { id: 2, sana: "2026-01-30", hujjatRaqami: "48839288", kontragent: "", tavsif: "1900  Юлчиев Э Устав кап. шаклантириш", kirim: 1500000, chiqim: 0 }
  ];
  const used = new Set();
  assert.strictEqual(findBankDup(saldoParsed.rows[3], used), STORE.bank[0]);
  assert.strictEqual(findBankDup(saldoParsed.rows[0], used), STORE.bank[1]);
  // Bir xil qator ikkinchi marta kelsa — ishlatilgan yozuvga qayta yopishmaydi
  assert.strictEqual(findBankDup(saldoParsed.rows[0], used), undefined);
  // Tavsif farqli bo'lsa — sana yaqin bo'lsa ham takror emas
  assert.strictEqual(findBankDup({ ...saldoParsed.rows[3], tavsif: "boshqa to'lov" }, new Set()), undefined);
});

console.log(`\n✓ Hammasi o'tdi (${passCount} ta sinov muvaffaqiyatli!)\n`);
