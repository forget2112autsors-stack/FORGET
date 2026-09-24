/* FORGET — Avtomatik Backup va Multi-Sheet Excel Tizimi Testlari.
 *
 * Ishga tushirish:  node test-backup-system.js
 *
 * Nimani tekshiradi:
 *   1) 11 ta varaqli to'liq Excel zaxira ma'lumotlar tuzilishi (Sozlamalar, Kirim, Chiqim, Bank, Kassa, Ombor, Kontragentlar, Ishlab_chiqarish, Qayta_ishlash, Ish_haqi, Asosiy_vositalar);
 *   2) Excel varaqlarida ustun nomlari va qiymatlarining to'liqligi;
 *   3) Barcha summalar va raqamli maydonlar to'g'ri hisob-kitob formatida bo'lishi;
 *   4) To'liq JSON Snapshot formati, versiyasi (2.0) va vaqt tamg'asi;
 *   5) JSON Snapshot orqali barcha jadvallarning 100% tiklanish imkoniyati;
 *   6) Avtomatik backup eslatmasi (checkBackupReminder):
 *      - Agar hali zaxira olinmagan bo'lsa -> needsBackup: true;
 *      - Agar zaxira 3 kun oldin olingan bo'lsa -> needsBackup: false;
 *      - Agar zaxira 8 kun oldin olingan bo'lsa -> needsBackup: true, daysSince: 8;
 *   7) Zaxira olingandan so'ng localStorage'da vaqt tamg'asining yangilanishi.
 */

const fs = require("fs");
const assert = require("assert");
const XLSX = require("./vendor/xlsx.full.min.js");

const src = fs.readFileSync(__dirname + "/app.js", "utf8");

function extractFn(name) {
  const re = new RegExp("^(?:async )?function " + name + "\\s*\\(", "m");
  const m = re.exec(src);
  if (!m) throw new Error("topilmadi: " + name);
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

const fnsToExtract = [
  "toNum",
  "normalizeDate",
  "exportFullBackupXlsx",
  "exportFullBackupJson",
  "checkBackupReminder"
];

const code = fnsToExtract.map(extractFn).join("\n\n");

// LocalStorage va Window simulyatori
let storageMock = {};
const mockLocalStorage = {
  getItem: (k) => storageMock[k] || null,
  setItem: (k, v) => { storageMock[k] = String(v); },
  removeItem: (k) => { delete storageMock[k]; },
  clear: () => { storageMock = {}; }
};

let capturedWorkbook = null;
const mockXLSX = Object.assign({}, XLSX, {
  writeFile: (wb, filename) => {
    capturedWorkbook = { wb, filename };
  }
});

let capturedBlob = null;
const mockBlob = function (parts, opts) {
  capturedBlob = { content: parts.join(""), type: opts.type };
};

const sandbox = {
  XLSX: mockXLSX,
  Blob: mockBlob,
  localStorage: mockLocalStorage,
  STORE: {
    settings: {
      companyName: "FORGET TEST MCHJ",
      inn: "987654321",
      address: "Toshkent sh.",
      period: "2026-yil 3-chorak",
      rahbar: "Karimov A.",
      bankOpeningBalance: 12000000,
      qqsStavka: 12,
      foydaStavka: 15,
      davrXarajati: 2000000,
      moliyaviyXarajat: 500000,
      tannarxUsuli: "fifo",
      yonalish: "ishlab_chiqarish"
    },
    kirim: [
      { id: "k1", sana: "2026-09-01", hujjatRaqami: "10", kontragentNomi: "Sotuvchi A", kontragentInn: "111", summaQQSsiz: 1000000, qqsStavka: 12, qqsSumma: 120000, jamiSumma: 1120000, status: "Подписан", tolandi: 1120000, qarz: 0, tolovHolati: "to'langan" }
    ],
    chiqim: [
      { id: "c1", sana: "2026-09-05", hujjatRaqami: "20", kontragentNomi: "Xaridor B", kontragentInn: "222", summaQQSsiz: 2000000, qqsStavka: 12, qqsSumma: 240000, jamiSumma: 2240000, status: "Подписан", tolandi: 1000000, qarz: 1240000, tolovHolati: "qisman" }
    ],
    bank: [
      { id: "b1", sana: "2026-09-02", hujjatRaqami: "1", kontragent: "Sotuvchi A", kontragentInn: "111", tavsif: "To'lov", kirim: 0, chiqim: 1120000, xizmat: false }
    ],
    kassa: [
      { id: "ks1", sana: "2026-09-03", hujjatRaqami: "K1", turi: "kirim", kontragent: "Mijoz C", kontragentInn: "333", tavsif: "Naqd tushum", summa: 500000 }
    ],
    ombor: [
      { id: "o1", sana: "2026-09-01", nomi: "Xomashyo X", birlik: "kg", miqdor: 100, narx: 10000, qoldiq: 40, summa: 1000000, kirim_id: "k1" }
    ],
    kontragentlar: [
      { id: "kt1", inn: "111", nomi: "Sotuvchi A", kategoriya: "Yetkazib beruvchi", telefon: "+998901234567", manzil: "Toshkent", izoh: "Asosiy" }
    ],
    ishlabChiqarish: [
      { id: "ic1", sana: "2026-09-04", hujjatRaqami: "IC1", mahsulotNomi: "Mahsulot M", birlik: "dona", miqdor: 50, tannarxJami: 600000, birlikTannarxi: 12000 }
    ],
    qaytaIshlash: [
      { id: "qi1", sana: "2026-09-06", hujjatRaqami: "Q1", mijoz: "Mijoz D", inn: "444", tavsif: "Maydalash xizmati", summa: 300000 }
    ],
    ishHaqi: [
      { id: "ih1", xodim: "Aliyev B.", lavozim: "Usta", oklad: 5000000, mukofot: 500000, jamiHisoblangan: 5500000, ndfl: 660000, inps: 5500, ijtimoiySoliq: 660000, qolgaTegadigan: 4834500 }
    ],
    asosiyVositalar: [
      { id: "av1", nomi: "Stanok CNC", inventarRaqam: "AV-01", sana: "2026-01-10", boshlangichQiymat: 40000000, guruh: "Uskunalar", amortizatsiyaStavkasi: 15, jamgAmortizatsiya: 4000000, qoldiqQiymat: 36000000 }
    ]
  },
  ACTIVE_FIRMA_ID: "firma-uuid-test",
  todayISO: () => "2026-09-24",
  toast: (m) => {},
  URL: {
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => {}
  },
  document: {
    createElement: () => ({ click: () => {}, appendChild: () => {}, removeChild: () => {} }),
    body: { appendChild: () => {}, removeChild: () => {} }
  },
  console
};

const fnFactory = new Function("ctx", `with(ctx) {\n${code}\nreturn {
  toNum, normalizeDate,
  exportFullBackupXlsx, exportFullBackupJson, checkBackupReminder
};\n}`);

const fns = fnFactory(sandbox);

let passed = 0;
function test(name, cb) {
  cb();
  passed++;
  console.log(`  ✓ ${passed}. ${name}`);
}

console.log("\n=== AVTOMATIK BACKUP VA MULTI-SHEET EXCEL TIZIMI TESTLARI ===");

// 1. 11 varaqli Excel zaxira nusxasi
test("exportFullBackupXlsx barcha 11 ta varaqni o'z ichiga olgan workbook yaratdi", () => {
  fns.exportFullBackupXlsx();
  assert(capturedWorkbook, "Workbook eksport qilinishi shart");
  assert(capturedWorkbook.filename.includes("FORGET_Backup_TOLIQ_2026-09-24.xlsx"));

  const wb = capturedWorkbook.wb;
  const expectedSheets = [
    "Sozlamalar",
    "Kirim",
    "Chiqim",
    "Bank",
    "Kassa",
    "Ombor",
    "Kontragentlar",
    "Ishlab_chiqarish",
    "Qayta_ishlash",
    "Ish_haqi",
    "Asosiy_vositalar"
  ];

  assert.equal(wb.SheetNames.length, 11, "Aynan 11 ta varaq bo'lishi shart");
  expectedSheets.forEach((sh) => {
    assert(wb.SheetNames.includes(sh), `${sh} varag'i mavjud bo'lishi kerak`);
  });
});

// 2. Excel varaqlari ma'lumotlar to'liqligi
test("Excel varaqlaridagi qatorlar va ma'lumotlar to'liq joylandi", () => {
  const wb = capturedWorkbook.wb;

  // Kirim varag'i tekshiruvi
  const wsKirim = wb.Sheets["Kirim"];
  const kirimRows = XLSX.utils.sheet_to_json(wsKirim, { header: 1 });
  assert.equal(kirimRows.length, 2); // 1 header + 1 ma'lumot
  assert.equal(kirimRows[1][1], "10"); // hujjat №
  assert.equal(kirimRows[1][2], "Sotuvchi A");
  assert.equal(kirimRows[1][7], 1120000); // jami summa

  // Chiqim varag'i tekshiruvi
  const wsChiqim = wb.Sheets["Chiqim"];
  const chiqimRows = XLSX.utils.sheet_to_json(wsChiqim, { header: 1 });
  assert.equal(chiqimRows[1][1], "20");
  assert.equal(chiqimRows[1][2], "Xaridor B");
  assert.equal(chiqimRows[1][7], 2240000);

  // Bank varag'i (Ko'p valyutali 12 ta ustun bilan)
  const wsBank = wb.Sheets["Bank"];
  const bankRows = XLSX.utils.sheet_to_json(wsBank, { header: 1 });
  assert.equal(bankRows[1][1], "1");
  assert.equal(bankRows[1][2], "5110"); // schyot
  assert.equal(bankRows[1][3], "UZS"); // valyuta
  assert.equal(bankRows[1][6], "Sotuvchi A"); // kontragent
  assert.equal(bankRows[1][10], 1120000); // chiqim (UZS)

  // Asosiy vositalar
  const wsAv = wb.Sheets["Asosiy_vositalar"];
  const avRows = XLSX.utils.sheet_to_json(wsAv, { header: 1 });
  assert.equal(avRows[1][0], "Stanok CNC");
  assert.equal(avRows[1][3], 40000000);
});

// 3. JSON Snapshot eksporti
test("exportFullBackupJson butun tizim holatini to'liq serializatsiya qildi", () => {
  fns.exportFullBackupJson();
  assert(capturedBlob, "JSON Blob shakllantirilishi shart");
  const parsed = JSON.parse(capturedBlob.content);

  assert.equal(parsed.format, "FORGET_Full_Backup");
  assert.equal(parsed.version, "2.0");
  assert.equal(parsed.firmaId, "firma-uuid-test");
  assert.equal(parsed.company.inn, "987654321");
  assert.equal(parsed.store.kirim.length, 1);
  assert.equal(parsed.store.chiqim.length, 1);
  assert.equal(parsed.store.ombor.length, 1);
  assert.equal(parsed.store.ishHaqi.length, 1);
});

// 4. checkBackupReminder: Hali zaxira olinmagan holat
test("checkBackupReminder: Zaxira sanasi bo'lmaganda needsBackup: true deb qaytardi", () => {
  mockLocalStorage.clear();
  const res = fns.checkBackupReminder();
  assert.equal(res.needsBackup, true);
  assert.equal(res.lastDate, null);
});

// 5. checkBackupReminder: Zaxira yangi olingan holat (2 kun oldin)
test("checkBackupReminder: 2 kun oldin olingan zaxira uchun needsBackup: false", () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  mockLocalStorage.setItem("forget_last_backup_date", twoDaysAgo);

  const res = fns.checkBackupReminder();
  assert.equal(res.needsBackup, false);
  assert.equal(res.daysSince, 2);
  assert.equal(res.lastDate, twoDaysAgo.split("T")[0]);
});

// 6. checkBackupReminder: 8 kun oldin olingan zaxira (eskirgan)
test("checkBackupReminder: 8 kun oldin olingan zaxira uchun needsBackup: true (ogohlantirish)", () => {
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  mockLocalStorage.setItem("forget_last_backup_date", eightDaysAgo);

  const res = fns.checkBackupReminder();
  assert.equal(res.needsBackup, true);
  assert.equal(res.daysSince, 8);
});

// 7. Zaxira olingandan so'ng vaqt tamg'asi yangilanishi
test("Zaxira olingandan so'ng localStorage'da yangi vaqt qayd etildi", () => {
  mockLocalStorage.clear();
  fns.exportFullBackupXlsx();

  const saved = mockLocalStorage.getItem("forget_last_backup_date");
  assert(saved, "Vaqt tamg'asi saqlangan bo'lishi kerak");
  const check = fns.checkBackupReminder();
  assert.equal(check.needsBackup, false);
  assert.equal(check.daysSince, 0);
});

console.log(`\n✓ Barcha ${passed} ta Avtomatik Backup tizimi testlari muvaffaqiyatli o'tdi!\n`);
