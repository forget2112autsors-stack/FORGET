/* FORGET — hisob-kitob yadrosi uchun avtotestlar.
 *
 * Ishga tushirish:  node test-hisobkitob.js
 * Hech qanday paket o'rnatish shart emas (faqat Node.js).
 *
 * app.js brauzer uchun yozilgan (DOM'ga bog'liq), shu sabab bu yerda undan
 * faqat SOF funksiyalar matn sifatida ajratib olinadi va alohida ishga
 * tushiriladi. Yangi funksiya qo'shsangiz, uni quyidagi ro'yxatga qo'shing.
 *
 * Nimani qo'riqlaydi:
 *   1) faktura statusini normallashtirish (bekor qilingan hujjat hisobotga
 *      kirib ketmasligi uchun);
 *   2) ish haqi: INPS badali JShDS ichida — ikki marta ushlanmasligi;
 *   3) F1 balans: to'lov holati "gacha" sanasiga bog'langanligi;
 *   4) FIFO: bitta o'tishda qurilgan daftar eski natijani aynan takrorlashi;
 *   5) kontragent tarixi (saldo daftari) va "Butun tarix" rejimi.
 */
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/app.js", "utf8");

function extractFn(name) {
  const re = new RegExp("^(?:async )?function " + name + "\\s*\\(", "m");
  const m = re.exec(src);
  if (!m) throw new Error("topilmadi: " + name);
  // Avval parametrlar qavsini yopamiz — aks holda destrukturizatsiyali
  // parametr ({ a = 1 } = {}) ichidagi "{" tana boshi deb qabul qilinardi.
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
  if (a < 0 || b < 0) throw new Error("blok topilmadi");
  return src.slice(a, b + endMarker.length);
}

const code = [
  extractConstBlock("const STATUS_INVALID = [", "const STATUS_INVALID_SET = new Set(STATUS_INVALID.map(normStatus));"),
  extractFn("normStatus"),
  extractFn("toNum"),
  extractFn("isValidStatus"),
  extractFn("computeIshHaqiRow"),
  extractFn("tolanmaganQoldiqAsOf"),
  extractFn("cmpOmbor"),
  extractFn("buildFifoLedgerFromRows"),
  extractFn("buildAllFifoLedgers"),
  extractFn("inRange"),
  extractFn("computeKontragentLedger"),
  "let FIFO_LEDGERS = null;",
  extractFn("fifoLedger"),
  "let STORE = { bank: [], kirim: [], chiqim: [], ombor: [], kontragentlar: [], settings: { filterFrom: '', filterTo: '' } };",
  "module.exports = { normStatus, isValidStatus, computeIshHaqiRow, tolanmaganQoldiqAsOf, buildAllFifoLedgers, fifoLedger, computeKontragentLedger, setStore: (s) => { STORE = Object.assign({ bank: [], kirim: [], chiqim: [], ombor: [], kontragentlar: [], settings: { filterFrom: '', filterTo: '' } }, s); FIFO_LEDGERS = null; } };"
].join("\n\n");

const tmp = require("path").join(require("os").tmpdir(), "forget_extracted_" + process.pid + ".js");
fs.writeFileSync(tmp, code);
const F = require(tmp);
process.on("exit", () => { try { fs.unlinkSync(tmp); } catch (e) {} });

let ok = 0, fail = 0;
function t(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { ok++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + "\n      kutilgan: " + e + "\n      chiqdi:   " + a); }
}

console.log("\n[1] Status normallashtirish");
t("Отказ — bekor", F.isValidStatus("Отказ"), false);
t("отказ (kichik harf) — bekor", F.isValidStatus("отказ"), false);
t("'  Отменён ' (bo'shliq+ё) — bekor", F.isValidStatus("  Отменён "), false);
t("Отклонен (yangi variant) — bekor", F.isValidStatus("Отклонен"), false);
t("Отозван (yangi variant) — bekor", F.isValidStatus("Отозван"), false);
t("bekor qilingan (kichik) — bekor", F.isValidStatus("bekor qilingan"), false);
t("Принят — amaldagi", F.isValidStatus("Принят"), true);
t("bo'sh status — amaldagi", F.isValidStatus(""), true);
t("undefined — amaldagi", F.isValidStatus(undefined), true);

console.log("\n[2] Ish haqi: INPS ikki marta ushlanmaydi");
{
  const s = { ijtimoiySoliqStavka: 12, ndflStavka: 12, inpsStavka: 0.1 };
  const r = F.computeIshHaqiRow({ oyliqSumma: 10000000, imtiyozSumma: 0 }, s);
  t("NDFL 12%", r.ndfl, 1200000);
  t("INPS 0.1%", r.inps, 10000);
  t("byudjetga NDFL−INPS", r.ndflByudjetga, 1190000);
  t("sof ish haqi = oylik−NDFL", r.sofIshHaqi, 8800000);
  t("byudjetga+INPS = NDFL", r.ndflByudjetga + r.inps, r.ndfl);
  t("sof + NDFL = oylik", r.sofIshHaqi + r.ndfl, r.oylik);
}

console.log("\n[3] F1: to'lov holati 'to' sanasiga bog'langan");
{
  F.setStore({
    bank: [{ kontragentInn: "111111111", sana: "2026-03-10", chiqim: 5000000, kirim: 0 }],
    kirim: [{ id: "k1", kontragentInn: "111111111", sana: "2026-01-15", jamiSumma: 5000000, status: "", tolandi: true }],
    chiqim: [], ombor: []
  });
  t("31.01 holatiga — hali to'lanmagan (5 mln qarz)", F.tolanmaganQoldiqAsOf("kirim", "2026-01-31"), 5000000);
  t("31.03 holatiga — to'langan (0)", F.tolanmaganQoldiqAsOf("kirim", "2026-03-31"), 0);
  t("sanasiz (bugungi) — to'langan (0)", F.tolanmaganQoldiqAsOf("kirim", ""), 0);
}
{
  F.setStore({
    bank: [], ombor: [], chiqim: [],
    kirim: [
      { id: "a", kontragentInn: "", sana: "2026-02-01", jamiSumma: 1000000, status: "", tolandi: false },
      { id: "b", kontragentInn: "222222222", sana: "2026-02-01", jamiSumma: 2000000, status: "Отказ", tolandi: false },
      { id: "c", kontragentInn: "333333333", sana: "2026-02-01", jamiSumma: 3000000, status: "", tolandi: true, tolandiOverride: true }
    ]
  });
  t("INN'siz qo'lda + bekor qilingan chiqarib tashlanadi + qo'lda to'langan", F.tolanmaganQoldiqAsOf("kirim", "2026-12-31"), 1000000);
}

console.log("\n[4] FIFO: bitta o'tishda qurish eski natijani takrorlaydi");
{
  const ombor = [
    { id: "1", nomi: "Metall", turi: "kirim", sana: "2026-01-01", miqdor: 10, yetkazibBerishNarxi: 1000 },
    { id: "2", nomi: "Metall", turi: "kirim", sana: "2026-02-01", miqdor: 10, yetkazibBerishNarxi: 2000 },
    { id: "3", nomi: "Metall", turi: "chiqim", sana: "2026-03-01", miqdor: 15, hujjatRaqami: "CHT-1" },
    { id: "4", nomi: "Bo'yoq", turi: "kirim", sana: "2026-01-05", miqdor: 5, yetkazibBerishNarxi: 500 }
  ];
  F.setStore({ bank: [], kirim: [], chiqim: [], ombor });
  const metall = F.fifoLedger("Metall");
  // 10 dona × 100 + 5 dona × 200 = 1000 + 1000 = 2000
  t("FIFO tannarx (10×100 + 5×200)", metall.byDoc.get("CHT-1").tannarx, 2000);
  t("kamomad yo'q", metall.byDoc.get("CHT-1").kamomad, 0);
  t("01.02 holatiga qoldiq qiymati (10×100+10×200)", metall.qiymatAsOf("2026-02-01"), 3000);
  t("31.03 holatiga qoldiq (5×200)", metall.qiymatAsOf("2026-03-31"), 1000);
  t("boshqa nom aralashmagan", F.fifoLedger("Bo'yoq").qiymatAsOf(""), 500);
  t("nomsiz qator daftarga tushmaydi", F.fifoLedger("Yo'q narsa").qiymatAsOf(""), 0);
}

console.log("\n[5] Kontragent tarixi (saldo daftari)");
{
  F.setStore({
    settings: { filterFrom: "2026-03-01", filterTo: "2026-03-31" },
    kontragentlar: [{ nomi: "ALFA", inn: "123456789", boshlangichQarz: 1000000 }],
    chiqim: [
      { kontragentInn: "123456789", sana: "2026-01-10", hujjatRaqami: "S-1", jamiSumma: 2000000, status: "" },
      { kontragentInn: "123456789", sana: "2026-03-05", hujjatRaqami: "S-2", jamiSumma: 3000000, status: "" },
      { kontragentInn: "123456789", sana: "2026-03-20", hujjatRaqami: "S-X", jamiSumma: 9000000, status: "Отказ" }
    ],
    kirim: [],
    bank: [{ kontragentInn: "123456789", sana: "2026-03-25", kirim: 1500000, chiqim: 0, tavsif: "to'lov" }]
  });

  const davr = F.computeKontragentLedger("123456789");
  // Boshlang'ich = 1 000 000 (qo'lda) + 2 000 000 (mart oyidan oldingi sotuv)
  t("davr boshi saldosi eski tarixni hisobga oladi", davr.boshlangichSaldo, 3000000);
  t("davrda 2 ta harakat (bekor qilingani hisobga olinmaydi)", davr.rows.length, 2);
  t("davr oxirgi saldosi", davr.oxirgiSaldo, 3000000 + 3000000 - 1500000);

  const butun = F.computeKontragentLedger("123456789", { butunTarix: true });
  t("butun tarixda boshlang'ich — faqat qo'lda kiritilgan baza", butun.boshlangichSaldo, 1000000);
  t("butun tarixda 3 ta harakat (yanvardagisi ham)", butun.rows.length, 3);
  t("ikkala rejimda oxirgi saldo bir xil", butun.oxirgiSaldo, davr.oxirgiSaldo);
}

console.log("\n" + (fail ? `✗ ${fail} ta sinov muvaffaqiyatsiz, ${ok} ta o'tdi` : `✓ hammasi o'tdi (${ok} ta sinov)`));
process.exit(fail ? 1 : 0);
