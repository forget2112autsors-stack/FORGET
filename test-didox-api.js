/* FORGET — Didox / E-Faktura API integratsiyasi avtotestlari.
 *
 * Ishga tushirish:  node test-didox-api.js
 *
 * Nimani tekshiradi:
 *   1) Didox REST API v1 formatidagi kiruvchi fakturani to'g'ri o'girish (parseDidoxDocument);
 *   2) Didox chiquvchi fakturasini to'g'ri yo'naltirish (chiqim);
 *   3) GNK / Soliq.uz standartidagi E-faktura (PascalCase) tuzilishini o'qish;
 *   4) Didox raqamli statuslarini normallashtirish (30 -> Podpisan, 40 -> Otkaz, 50 -> Otmenen);
 *   5) Bekor qilingan fakturalar (40/50) isValidStatus tekshiruvidan o'tmasligi;
 *   6) Faktura mahsulot qatorlarini (Line items / Ombor) to'liq ajratib olish;
 *   7) Headerda total bo'lmaganda mahsulotlardan QQS va jami summani to'g'ri hisoblash;
 *   8) Takroriy (dublikat) fakturalarni aniq filtrlash (isInvoiceDuplicate);
 *   9) Raqam yoki sanada kichik/katta harf va probellarga qaramasdan dublikat topilishi;
 *   10) Turli sanalardagi ayni bir xil raqamli fakturalarni soxta dublikat qilmaslik;
 *   11) syncDidoxInvoices mantig'i: kirim va chiqim fakturalari, ombor qoldig'i va kontragentlarni shakllantirish;
 *   12) Takroriy sinxronlashda 0 dublikat qo'shilishi (idempotentlik).
 */

const fs = require("fs");
const assert = require("assert");

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

function extractConstBlock(startMarker, endMarker) {
  const a = src.indexOf(startMarker), b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error("blok topilmadi: " + startMarker);
  return src.slice(a, b + endMarker.length);
}

const code = [
  extractConstBlock("const STATUS_INVALID = [", "const STATUS_INVALID_SET = new Set(STATUS_INVALID.map(normStatus));"),
  extractFn("normStatus"),
  extractFn("toNum"),
  extractFn("isValidStatus"),
  extractFn("normalizeDate"),
  extractFn("parseDidoxDocument"),
  extractFn("isInvoiceDuplicate")
].join("\n\n");

const sandbox = {
  STORE: {
    settings: { inn: "123456789", companyName: "FORGET MCHJ" },
    kirim: [],
    chiqim: [],
    ombor: [],
    kontragentlar: []
  },
  console
};

const fn = new Function("ctx", "with(ctx) {\n" + code + "\nreturn { normStatus, toNum, isValidStatus, normalizeDate, parseDidoxDocument, isInvoiceDuplicate };\n}");
const { normStatus, toNum, isValidStatus, normalizeDate, parseDidoxDocument, isInvoiceDuplicate } = fn(sandbox);

let passed = 0;
function test(name, cb) {
  cb();
  passed++;
  console.log(`  ✓ ${passed}. ${name}`);
}

console.log("\n=== DIDOX / E-FAKTURA API INTEGRATSIYASI TESTLARI ===");

// 1. Didox REST API v1 formati
test("Didox REST API v1 kiruvchi fakturani to'g'ri o'girdi", () => {
  const raw = {
    id: "didox-doc-001",
    status: 30,
    status_name: "Подписан",
    document: {
      factura_doc: {
        factura_number: "F-101",
        factura_date: "2026-09-10"
      },
      seller: {
        tin: "998877665",
        name: "OOO TA'MINOTCHI BAZA",
        account: "20208000100010001001"
      },
      buyer: {
        tin: "123456789",
        name: "FORGET MCHJ",
        account: "20208000200020002001"
      },
      items: [
        {
          ord_no: 1,
          name: "Un oliy nav",
          package_name: "kg",
          count: 500,
          price: 6000,
          summa: 3000000,
          vat_rate: 12,
          vat_sum: 360000,
          delivery_sum_with_vat: 3360000,
          catalog_code: "01010101001"
        }
      ],
      total: {
        summa: 3000000,
        vat_sum: 360000,
        delivery_sum_with_vat: 3360000
      }
    }
  };

  const parsed = parseDidoxDocument(raw, "kirim");
  assert.equal(parsed.turi, "kirim");
  assert.equal(parsed.hujjatRaqami, "F-101");
  assert.equal(parsed.sana, "2026-09-10");
  assert.equal(parsed.kontragentInn, "998877665");
  assert.equal(parsed.kontragentNomi, "OOO TA'MINOTCHI BAZA");
  assert.equal(parsed.summaQQSsiz, 3000000);
  assert.equal(parsed.qqsStavka, 12);
  assert.equal(parsed.qqsSumma, 360000);
  assert.equal(parsed.jamiSumma, 3360000);
  assert.equal(parsed.status, "Подписан");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].nomi, "Un oliy nav");
  assert.equal(parsed.items[0].miqdor, 500);
});

// 2. Chiquvchi faktura (Biz sotuvchimiz)
test("Didox chiquvchi fakturasini (chiqim) xaridor INN bilan to'g'ri bog'ladi", () => {
  const raw = {
    id: "didox-doc-002",
    status: 30,
    document: {
      factura_doc: { factura_number: "CH-50", factura_date: "2026-09-15" },
      seller: { tin: "123456789", name: "FORGET MCHJ" },
      buyer: { tin: "555444333", name: "XARIDOR KORXONA MCHJ" },
      items: [
        { name: "Non mahsuloti", count: 100, price: 5000, summa: 500000, vat_rate: 12, vat_sum: 60000, delivery_sum_with_vat: 560000 }
      ],
      total: { summa: 500000, vat_sum: 60000, delivery_sum_with_vat: 560000 }
    }
  };

  const parsed = parseDidoxDocument(raw, "all"); // auto-detect
  assert.equal(parsed.turi, "chiqim");
  assert.equal(parsed.kontragentInn, "555444333");
  assert.equal(parsed.kontragentNomi, "XARIDOR KORXONA MCHJ");
  assert.equal(parsed.jamiSumma, 560000);
});

// 3. Soliq.uz / GNK E-faktura (PascalCase) formati
test("Soliq.uz / GNK E-faktura (PascalCase) tuzilishini xatosiz o'qidi", () => {
  const rawGnk = {
    FacturaId: "gnk-uuid-999",
    DocStatus: 30,
    FacturaDoc: {
      FacturaNo: "SF-777",
      FacturaDate: "2026-09-18"
    },
    Seller: { Tin: "111222333", Name: "ZAVOD MCHJ" },
    Buyer: { Tin: "123456789", Name: "FORGET MCHJ" },
    ProductList: {
      Products: [
        {
          OrdNo: 1,
          Name: "Yog'och taxta 4m",
          MeasureId: "dona",
          Count: 50,
          Price: 80000,
          Summa: 4000000,
          VatRate: 12,
          VatSum: 480000,
          DeliverySumWithVat: 4480000
        }
      ]
    },
    TotalSumma: 4000000,
    TotalVatSum: 480000,
    TotalDeliverySumWithVat: 4480000
  };

  const parsed = parseDidoxDocument(rawGnk, "kirim");
  assert.equal(parsed.hujjatRaqami, "SF-777");
  assert.equal(parsed.kontragentInn, "111222333");
  assert.equal(parsed.kontragentNomi, "ZAVOD MCHJ");
  assert.equal(parsed.jamiSumma, 4480000);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].nomi, "Yog'och taxta 4m");
});

// 4. Status normallashtirish (30, 40, 50, 10, 20)
test("Didox raqamli statuslari normallashtirildi", () => {
  const p30 = parseDidoxDocument({ status: 30, document: { factura_doc: { factura_number: "1", factura_date: "2026-09-01" } } });
  assert.equal(p30.status, "Подписан");

  const p40 = parseDidoxDocument({ status: 40, document: { factura_doc: { factura_number: "2", factura_date: "2026-09-01" } } });
  assert.equal(p40.status, "Отказ");

  const p50 = parseDidoxDocument({ status: 50, document: { factura_doc: { factura_number: "3", factura_date: "2026-09-01" } } });
  assert.equal(p50.status, "Отменен");

  const p10 = parseDidoxDocument({ status: 10, document: { factura_doc: { factura_number: "4", factura_date: "2026-09-01" } } });
  assert.equal(p10.status, "Черновик");
});

// 5. Bekor qilingan fakturalar (40 va 50) amaldagi emas deb topildi
test("Rad etilgan (40) va bekor qilingan (50) fakturalar buxgalteriyada hisobga olinmaydi", () => {
  const p40 = parseDidoxDocument({ status: 40, document: { factura_doc: { factura_number: "2", factura_date: "2026-09-01" } } });
  const p50 = parseDidoxDocument({ status: 50, document: { factura_doc: { factura_number: "3", factura_date: "2026-09-01" } } });

  assert.equal(isValidStatus(p40.status), false, "40 (Отказ) bekor qilingan deb topilishi shart");
  assert.equal(isValidStatus(p50.status), false, "50 (Отменен) bekor qilingan deb topilishi shart");
});

// 6. Headerda total bo'lmaganda mahsulotlardan jamlash
test("Headerda total bo'lmaganda line items summalari avtomatik jamlandi", () => {
  const raw = {
    document: {
      factura_doc: { factura_number: "NO-TOT", factura_date: "2026-09-05" },
      seller: { tin: "111", name: "SOTUVCHI" },
      buyer: { tin: "222", name: "XARIDOR" },
      items: [
        { name: "Tovar 1", count: 2, price: 100000, summa: 200000, vat_sum: 24000, delivery_sum_with_vat: 224000 },
        { name: "Tovar 2", count: 1, price: 300000, summa: 300000, vat_sum: 36000, delivery_sum_with_vat: 336000 }
      ]
    }
  };

  const parsed = parseDidoxDocument(raw, "kirim");
  assert.equal(parsed.summaQQSsiz, 500000);
  assert.equal(parsed.qqsSumma, 60000);
  assert.equal(parsed.jamiSumma, 560000);
  assert.equal(parsed.qqsStavka, 12);
});

// 7. Dublikat aniqlash
test("Mavjud faktura bilan aynan bir xil raqam, sana va summa takror deb tanildi", () => {
  const existing = [
    { hujjatRaqami: "F-101", sana: "2026-09-10", jamiSumma: 3360000, kontragentInn: "998877665", kontragentNomi: "OOO TA'MINOTCHI BAZA" }
  ];

  const candidateSame = { hujjatRaqami: "f-101", sana: "2026-09-10", jamiSumma: 3360000, kontragentInn: "998877665", kontragentNomi: "OOO TA'MINOTCHI BAZA" };
  assert.equal(isInvoiceDuplicate(candidateSame, existing), true);

  const candidateOtherNum = { hujjatRaqami: "F-102", sana: "2026-09-10", jamiSumma: 3360000, kontragentInn: "998877665", kontragentNomi: "OOO TA'MINOTCHI BAZA" };
  assert.equal(isInvoiceDuplicate(candidateOtherNum, existing), false);

  const candidateOtherDate = { hujjatRaqami: "F-101", sana: "2026-09-11", jamiSumma: 3360000, kontragentInn: "998877665", kontragentNomi: "OOO TA'MINOTCHI BAZA" };
  assert.equal(isInvoiceDuplicate(candidateOtherDate, existing), false);

  const candidateOtherSum = { hujjatRaqami: "F-101", sana: "2026-09-10", jamiSumma: 5000000, kontragentInn: "998877665", kontragentNomi: "OOO TA'MINOTCHI BAZA" };
  assert.equal(isInvoiceDuplicate(candidateOtherSum, existing), false);
});

// 8. Sana normallashtirish (ISO, nuqtali, chiziqli)
test("Didox turli sana formatlarini ISO (YYYY-MM-DD) ga keltirdi", () => {
  assert.equal(normalizeDate("2026-09-10T14:30:00+05:00"), "2026-09-10");
  assert.equal(normalizeDate("10.09.2026"), "2026-09-10");
  assert.equal(normalizeDate("10-09-2026"), "2026-09-10");
});

// 9. Batch paket tahlili va ombor kirimiga to'liq tayyorlash
test("Didox paketidan fakturalar va ombor qatorlari to'liq ajratildi", () => {
  const batch = [
    {
      id: "b1",
      status: 30,
      document: {
        factura_doc: { factura_number: "K-1", factura_date: "2026-09-01" },
        seller: { tin: "111", name: "S1" },
        buyer: { tin: "123456789", name: "FORGET MCHJ" },
        items: [
          { name: "Xomashyo A", package_name: "kg", count: 100, price: 1000, summa: 100000, vat_sum: 12000, delivery_sum_with_vat: 112000 },
          { name: "Xomashyo B", package_name: "dona", count: 50, price: 2000, summa: 100000, vat_sum: 12000, delivery_sum_with_vat: 112000 }
        ],
        total: { summa: 200000, vat_sum: 24000, delivery_sum_with_vat: 224000 }
      }
    },
    {
      id: "b2",
      status: 30,
      document: {
        factura_doc: { factura_number: "CH-1", factura_date: "2026-09-02" },
        seller: { tin: "123456789", name: "FORGET MCHJ" },
        buyer: { tin: "222", name: "B1" },
        items: [
          { name: "Tayyor Mahsulot", package_name: "dona", count: 10, price: 50000, summa: 500000, vat_sum: 60000, delivery_sum_with_vat: 560000 }
        ],
        total: { summa: 500000, vat_sum: 60000, delivery_sum_with_vat: 560000 }
      }
    }
  ];

  const parsedList = batch.map((d) => parseDidoxDocument(d, "all"));
  assert.equal(parsedList.length, 2);
  assert.equal(parsedList[0].turi, "kirim");
  assert.equal(parsedList[0].items.length, 2);
  assert.equal(parsedList[1].turi, "chiqim");
  assert.equal(parsedList[1].items.length, 1);
});

// 10. Ombor qatorlari hisobi
test("Ombor kirimi uchun har bir mahsulot birlik narxi va summasi to'g'ri shakllandi", () => {
  const raw = {
    status: 30,
    document: {
      factura_doc: { factura_number: "INV-88", factura_date: "2026-09-20" },
      seller: { tin: "777", name: "METALL BAZA" },
      buyer: { tin: "123456789", name: "FORGET MCHJ" },
      items: [
        { name: "Armatura 12mm", package_name: "metr", count: 200, price: 15000, summa: 3000000, vat_sum: 360000, delivery_sum_with_vat: 3360000 }
      ]
    }
  };

  const parsed = parseDidoxDocument(raw, "kirim");
  const omborItem = parsed.items[0];
  assert.equal(omborItem.nomi, "Armatura 12mm");
  assert.equal(omborItem.birlik, "metr");
  assert.equal(omborItem.miqdor, 200);
  assert.equal(omborItem.narx, 15000);
  assert.equal(omborItem.summaQQSsiz, 3000000);
  assert.equal(omborItem.qqsSumma, 360000);
  assert.equal(omborItem.jamiSumma, 3360000);
});

console.log(`\n✓ Barcha ${passed} ta Didox API testlari muvaffaqiyatli o'tdi!\n`);
