/* FORGET — 1C:Enterprise / 1UZ & Klient-Bank integratsiyasi avtotestlari.
 *
 * Ishga tushirish:  node test-1c-exchange.js
 *
 * Nimani tekshiradi:
 *   1) 1C sana formatlash va o'qish (format1CDate, parse1CDate);
 *   2) 1CClientBankExchange v1.03 matnli eksport (kl_to_1c.txt) sarlavha va qoldiqlar bo'limi;
 *   3) Chiqim to'lovlarida bizning korxona to'lovchi (Плательщик), kontragent esa oluvchi (Получатель) bo'lishi;
 *   4) Kirim to'lovlarida kontragent to'lovchi, bizning korxona oluvchi bo'lishi;
 *   5) 1CClientBankExchange importi: sana, hujjat №, kontragent, INN, kirim/chiqim ajratilishi;
 *   6) Bank komissiyasi/xizmat xarajatlarini avtomatik aniqlash (xizmat: true);
 *   7) Klient-Bank eksport -> import round-trip yaxlitligi;
 *   8) CommerceML 2.0 XML eksporti: tovarlar katalogi, kontragentlar, kirim va chiqim fakturalari;
 *   9) CommerceML 2.0 XML importi: XML teglardan kontragentlar va hujjatlarni ajratish;
 *   10) EnterpriseData JSON eksport va import ma'lumotlar yaxlitligi.
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

const fnsToExtract = [
  "toNum",
  "normalizeDate",
  "format1CDate",
  "parse1CDate",
  "generate1CClientBankExport",
  "parse1CClientBankExchange",
  "escapeXml",
  "generateCommerceMLExport",
  "parseCommerceML",
  "generate1CEnterpriseJson",
  "parse1CEnterpriseJson"
];

const code = fnsToExtract.map(extractFn).join("\n\n");

const sandbox = {
  STORE: {
    settings: {
      inn: "123456789",
      companyName: "FORGET MCHJ",
      account: "20208000100010001001",
      bankOpeningBalance: 5000000
    },
    kirim: [
      {
        id: "k-1",
        hujjatRaqami: "F-101",
        sana: "2026-09-10",
        kontragentInn: "998877665",
        kontragentNomi: "OOO TA'MINOTCHI BAZA",
        summaQQSsiz: 3000000,
        qqsStavka: 12,
        qqsSumma: 360000,
        jamiSumma: 3360000,
        status: "Подписан"
      }
    ],
    chiqim: [
      {
        id: "c-1",
        hujjatRaqami: "CH-50",
        sana: "2026-09-15",
        kontragentInn: "555444333",
        kontragentNomi: "XARIDOR KORXONA MCHJ",
        summaQQSsiz: 5000000,
        qqsStavka: 12,
        qqsSumma: 600000,
        jamiSumma: 5600000,
        status: "Подписан"
      }
    ],
    ombor: [
      {
        id: "o-1",
        nomi: "Un oliy nav",
        birlik: "kg",
        artikul: "UN-01",
        narx: 6000,
        miqdor: 500,
        summa: 3000000,
        kirim_id: "k-1"
      }
    ],
    ishlabChiqarish: [
      {
        id: "ic-1",
        mahsulotNomi: "Non qolipli",
        birlik: "dona",
        artikul: "NON-01",
        birlikTannarxi: 3500,
        miqdor: 1000,
        tannarxJami: 3500000
      }
    ],
    kontragentlar: [
      {
        inn: "998877665",
        nomi: "OOO TA'MINOTCHI BAZA",
        kategoriya: "Yetkazib beruvchi",
        telefon: "+998901112233",
        manzil: "Toshkent sh., Chilonzor"
      },
      {
        inn: "555444333",
        nomi: "XARIDOR KORXONA MCHJ",
        kategoriya: "Xaridor",
        telefon: "+998912223344",
        manzil: "Samarqand sh."
      }
    ],
    bank: [
      {
        id: "b-1",
        sana: "2026-09-12",
        hujjatRaqami: "201",
        kontragent: "OOO TA'MINOTCHI BAZA",
        kontragentInn: "998877665",
        tavsif: "Xomashyo uchun to'lov",
        kirim: 0,
        chiqim: 3360000,
        xizmat: false
      },
      {
        id: "b-2",
        sana: "2026-09-16",
        hujjatRaqami: "305",
        kontragent: "XARIDOR KORXONA MCHJ",
        kontragentInn: "555444333",
        tavsif: "Mahsulot uchun to'lov",
        kirim: 5600000,
        chiqim: 0,
        xizmat: false
      },
      {
        id: "b-3",
        sana: "2026-09-18",
        hujjatRaqami: "88",
        kontragent: "ATB HAMKORBANK",
        kontragentInn: "200123456",
        tavsif: "Bank xizmati uchun komissiya",
        kirim: 0,
        chiqim: 15000,
        xizmat: true
      }
    ],
    kassa: [
      {
        id: "ks-1",
        sana: "2026-09-20",
        hujjatRaqami: "K-1",
        turi: "kirim",
        kontragent: "XARIDOR KORXONA MCHJ",
        kontragentInn: "555444333",
        tavsif: "Kassaga naqd pul tushumi",
        summa: 500000
      }
    ]
  },
  todayISO: () => "2026-09-24",
  console
};

const fnFactory = new Function("ctx", `with(ctx) {\n${code}\nreturn {
  format1CDate, parse1CDate,
  generate1CClientBankExport, parse1CClientBankExchange,
  generateCommerceMLExport, parseCommerceML,
  generate1CEnterpriseJson, parse1CEnterpriseJson
};\n}`);

const fns = fnFactory(sandbox);

let passed = 0;
function test(name, cb) {
  cb();
  passed++;
  console.log(`  ✓ ${passed}. ${name}`);
}

console.log("\n=== 1C:ENTERPRISE / 1UZ & KLIENT-BANK INTEGRATSIYASI TESTLARI ===");

// 1. Sana konversiyasi
test("1C sana formatlash va o'qish (DD.MM.YYYY <-> YYYY-MM-DD)", () => {
  assert.equal(fns.format1CDate("2026-09-24"), "24.09.2026");
  assert.equal(fns.format1CDate("2026-01-05"), "05.01.2026");
  assert.equal(fns.parse1CDate("24.09.2026"), "2026-09-24");
  assert.equal(fns.parse1CDate("05.01.2026"), "2026-01-05");
});

// 2. 1CClientBankExchange eksport sarlavhasi
test("generate1CClientBankExport standarti va hisob-kitob sarlavhasi", () => {
  const exportTxt = fns.generate1CClientBankExport(sandbox.STORE.bank);
  assert(exportTxt.includes("1CClientBankExchange"), "Format nomi bo'lishi shart");
  assert(exportTxt.includes("ВерсияФормата=1.03"), "Versiya 1.03 bo'lishi shart");
  assert(exportTxt.includes("Кодировка=Windows"), "Windows kodirovkasi ko'rsatilishi shart");
  assert(exportTxt.includes("Отправитель=FORGET MCHJ"));
  assert(exportTxt.includes("СекцияРасчСчет"));
  assert(exportTxt.includes("НачальныйОстаток=5000000.00"));
  assert(exportTxt.includes("ВсегоПоступило=5600000.00"));
  assert(exportTxt.includes("ВсегоСписано=3375000.00")); // 3360000 + 15000
  assert(exportTxt.includes("КонечныйОстаток=7225000.00")); // 5000000 + 5600000 - 3375000
  assert(exportTxt.includes("КонецФайла"));
});

// 3. Chiqim va kirim to'lovlarida to'lovchi/oluvchi mosligi
test("1CClientBankExport chiqimda biz to'lovchi, kirimda esa oluvchi bo'lishi", () => {
  const exportTxt = fns.generate1CClientBankExport(sandbox.STORE.bank);

  // Chiqim to'lovi: 3360000
  assert(exportTxt.includes("Номер=201"));
  assert(exportTxt.includes("Сумма=3360000.00"));
  assert(exportTxt.includes("ПлательщикИНН=123456789"), "Chiqimda bizning INN to'lovchi bo'lishi kerak");
  assert(exportTxt.includes("ПолучательИНН=998877665"), "Chiqimda ta'minotchi oluvchi bo'lishi kerak");

  // Kirim to'lovi: 5600000
  assert(exportTxt.includes("Номер=305"));
  assert(exportTxt.includes("Сумма=5600000.00"));
  assert(exportTxt.includes("ПлательщикИНН=555444333"), "Kirimda xaridor to'lovchi bo'lishi kerak");
  assert(exportTxt.includes("ПолучательИНН=123456789"), "Kirimda bizning INN oluvchi bo'lishi kerak");
});

// 4. parse1CClientBankExchange importi
test("parse1CClientBankExchange faylni to'g'ri o'qib, kirim/chiqimga ajratdi", () => {
  const sample1C = `1CClientBankExchange
ВерсияФормата=1.03
Кодировка=Windows
Отправитель=1C:Предприятие
Получатель=Клиент Банка
ДатаСоздания=24.09.2026
ВремяСоздания=10:00:00
ДатаНачала=01.09.2026
ДатаКонца=24.09.2026
РасчСчет=20208000100010001001
СекцияРасчСчет
ДатаНачала=01.09.2026
ДатаКонца=24.09.2026
НачальныйОстаток=10000000.00
ВсегоПоступило=2000000.00
ВсегоСписано=1500000.00
КонечныйОстаток=10500000.00
КонецРасчСчет
СекцияДокумент=Платежное поручение
Номер=701
Дата=10.09.2026
Сумма=1500000.00
Плательщик=FORGET MCHJ
ПлательщикИНН=123456789
Получатель=OOO YETKAZIB BERUVCHI
ПолучательИНН=998811223
НазначениеПлатежа=Xizmat uchun to'lov
КонецДокумента
СекцияДокумент=Платежное поручение
Номер=702
Дата=14.09.2026
Сумма=2000000.00
Плательщик=OOO HAMKOR TIZIM
ПлательщикИНН=444555666
Получатель=FORGET MCHJ
ПолучательИНН=123456789
НазначениеПлатежа=Shartnoma bo'yicha to'lov
КонецДокумента
КонецФайла`;

  const parsed = fns.parse1CClientBankExchange(sample1C);
  assert.equal(parsed.opening, 10000000);
  assert.equal(parsed.closing, 10500000);
  assert.equal(parsed.rows.length, 2);

  // 1-hujjat: chiqim
  const r1 = parsed.rows[0];
  assert.equal(r1.hujjatRaqami, "701");
  assert.equal(r1.sana, "2026-09-10");
  assert.equal(r1.chiqim, 1500000);
  assert.equal(r1.kirim, 0);
  assert.equal(r1.kontragent, "OOO YETKAZIB BERUVCHI");
  assert.equal(r1.kontragentInn, "998811223");

  // 2-hujjat: kirim
  const r2 = parsed.rows[1];
  assert.equal(r2.hujjatRaqami, "702");
  assert.equal(r2.sana, "2026-09-14");
  assert.equal(r2.kirim, 2000000);
  assert.equal(r2.chiqim, 0);
  assert.equal(r2.kontragent, "OOO HAMKOR TIZIM");
  assert.equal(r2.kontragentInn, "444555666");
});

// 5. Bank xizmatini aniqlash
test("1C to'lov topshiriqnomasida bank komissiyasi xizmat deb belgilandi", () => {
  const txt = `1CClientBankExchange
СекцияДокумент=Платежное поручение
Номер=12
Дата=05.09.2026
Сумма=25000.00
Плательщик=FORGET MCHJ
ПлательщикИНН=123456789
Получатель=HAMKORBANK
ПолучательИНН=200111222
НазначениеПлатежа=Bank xizmati uchun komissiya yechildi
КонецДокумента`;

  const parsed = fns.parse1CClientBankExchange(txt);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].xizmat, true);
});

// 6. Round-trip fidelity (Eksport -> Import)
test("1CClientBankExchange eksport va importi round-trip to'liq mos keldi", () => {
  const exported = fns.generate1CClientBankExport(sandbox.STORE.bank);
  const parsed = fns.parse1CClientBankExchange(exported);

  assert.equal(parsed.rows.length, sandbox.STORE.bank.length);
  assert.equal(parsed.opening, sandbox.STORE.settings.bankOpeningBalance);

  for (let i = 0; i < sandbox.STORE.bank.length; i++) {
    const orig = sandbox.STORE.bank[i];
    const imp = parsed.rows[i];
    assert.equal(imp.hujjatRaqami, orig.hujjatRaqami);
    assert.equal(imp.sana, orig.sana);
    assert.equal(imp.kirim, orig.kirim);
    assert.equal(imp.chiqim, orig.chiqim);
    assert.equal(imp.kontragentInn, orig.kontragentInn);
  }
});

// 7. CommerceML 2.0 XML Eksport
test("generateCommerceMLExport tovarlar, kontragentlar va fakturalarni XML qildi", () => {
  const xml = fns.generateCommerceMLExport();
  assert(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  assert(xml.includes('<КоммерческаяИнформация ВерсияСхемы="2.09"'));
  assert(xml.includes('<Каталог СодержитТовары="true">'));
  assert(xml.includes('<Наименование>Un oliy nav</Наименование>'));
  assert(xml.includes('<БазоваяЕдиница Код="796" НаименованиеПолное="kg">kg</БазоваяЕдиница>'));
  assert(xml.includes('<Контрагенты>'));
  assert(xml.includes('<ИНН>998877665</ИНН>'));
  assert(xml.includes('<Наименование>OOO TA&apos;MINOTCHI BAZA</Наименование>'));
  assert(xml.includes('<Документы>'));
  assert(xml.includes('<ХозОперация>ПоступлениеТоваров</ХозОперация>'));
  assert(xml.includes('<Номер>F-101</Номер>'));
  assert(xml.includes('<ХозОперация>РеализацияТоваров</ХозОперация>'));
  assert(xml.includes('<Номер>CH-50</Номер>'));
  assert(xml.includes('<ХозОперация>ПриходныйКассовыйОрдер</ХозОперация>'));
});

// 8. CommerceML 2.0 XML Import
test("parseCommerceML XML fayldan tovarlar, kontragentlar va hujjatlarni ajratdi", () => {
  const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.09">
  <Каталог>
    <Товары>
      <Товар>
        <Ид>t-1</Ид>
        <Наименование>Shakar oq</Наименование>
        <БазоваяЕдиница>kg</БазоваяЕдиница>
        <Артикул>SH-01</Артикул>
        <СтавкиНалогов><СтавкаНалога><Ставка>12</Ставка></СтавкаНалога></СтавкиНалогов>
      </Товар>
    </Товары>
  </Каталог>
  <Контрагенты>
    <Контрагент>
      <Ид>k-10</Ид>
      <Наименование>OOO SHAKAR BAZA</Наименование>
      <ИНН>777888999</ИНН>
      <ЮридическийАдрес>Toshkent sh.</ЮридическийАдрес>
    </Контрагент>
  </Контрагенты>
  <Документы>
    <Документ>
      <Номер>SF-500</Номер>
      <Дата>2026-09-08</Дата>
      <ХозОперация>ПоступлениеТоваров</ХозОперация>
      <Сумма>2240000.00</Сумма>
      <Контрагенты>
        <КонтактноеЛицо>
          <Наименование>OOO SHAKAR BAZA</Наименование>
          <ИНН>777888999</ИНН>
        </КонтактноеЛицо>
      </Контрагенты>
      <Товары>
        <Товар>
          <Наименование>Shakar oq</Наименование>
          <Количество>200</Количество>
          <ЦенаЗаЕдиницу>10000</ЦенаЗаЕдиницу>
          <Сумма>2000000</Сумма>
          <БазоваяЕдиница>kg</БазоваяЕдиница>
        </Товар>
      </Товары>
    </Документ>
  </Документы>
</КоммерческаяИнформация>`;

  const parsed = fns.parseCommerceML(xmlSample);
  assert.equal(parsed.kontragentlar.length, 1);
  assert.equal(parsed.kontragentlar[0].inn, "777888999");
  assert.equal(parsed.kontragentlar[0].nomi, "OOO SHAKAR BAZA");

  assert.equal(parsed.tovarlar.length, 1);
  assert.equal(parsed.tovarlar[0].nomi, "Shakar oq");
  assert.equal(parsed.tovarlar[0].birlik, "kg");

  assert.equal(parsed.hujjatlar.length, 1);
  const doc = parsed.hujjatlar[0];
  assert.equal(doc.turi, "kirim");
  assert.equal(doc.hujjatRaqami, "SF-500");
  assert.equal(doc.jamiSumma, 2240000);
  assert.equal(doc.items.length, 1);
  assert.equal(doc.items[0].miqdor, 200);
});

// 9. EnterpriseData JSON Eksport
test("generate1CEnterpriseJson tuzilmasi to'liq va to'g'ri shakllandi", () => {
  const data = fns.generate1CEnterpriseJson();
  assert.equal(data.format, "FORGET_1C_EnterpriseData");
  assert.equal(data.company.inn, "123456789");
  assert.equal(data.counterparties.length, 2);
  assert.equal(data.nomenclature.length, 1);
  assert.equal(data.invoices.length, 2); // 1 kirim + 1 chiqim
  assert.equal(data.bankPayments.length, 3);
  assert.equal(data.cashOrders.length, 1);
});

// 10. EnterpriseData JSON Import
test("parse1CEnterpriseJson ma'lumotlarni to'liq FORGET obyektlariga aylantirdi", () => {
  const jsonExport = fns.generate1CEnterpriseJson();
  const parsed = fns.parse1CEnterpriseJson(jsonExport);

  assert.equal(parsed.counterparties.length, 2);
  assert.equal(parsed.counterparties[0].inn, "998877665");
  assert.equal(parsed.invoices.length, 2);
  assert.equal(parsed.invoices[0].turi, "kirim");
  assert.equal(parsed.invoices[1].turi, "chiqim");
  assert.equal(parsed.bankPayments.length, 3);
  assert.equal(parsed.cashOrders.length, 1);
});

console.log(`\n✓ Barcha ${passed} ta 1C:Enterprise integratsiyasi testlari muvaffaqiyatli o'tdi!\n`);
