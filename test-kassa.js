/* FORGET — Kassa operatsiyalari (5010) moduli uchun avtotestlar.
 *
 * Ishga tushirish:  node test-kassa.js
 *
 * Nimani tekshiradi:
 *   1) Summani so'z bilan ifodalash (summaSozBilan) — KO-1 va KO-2 talabi;
 *   2) Kassa qoldig'i (kassaQoldiqAsOf) — sana filtri, boshlang'ich qoldiq, kirim va chiqim;
 *   3) F1 Balans integratsiyasi — Pul mablag'lari (Bank + Kassa);
 *   4) Solishtirma dalolatnoma (Sverka) — KO-1 va KO-2 ning kontragent tarixisiga tushishi;
 *   5) Kassa kitobi (KO-4) — kunlik boshlang'ich, aylanma va yakuniy qoldiqlar zanjiri.
 */

const fs = require("fs");
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
  extractConstBlock("const SON_BIRLIK_SOZ = [", "const SON_ONLIK_SOZ = [\"\", \"o'n\", \"yigirma\", \"o'ttiz\", \"qirq\", \"ellik\", \"oltmish\", \"yetmish\", \"sakson\", \"to'qson\"];"),
  extractFn("normStatus"),
  extractFn("toNum"),
  extractFn("isValidStatus"),
  extractFn("inRange"),
  extractFn("sonUchXonaliSoz"),
  extractFn("sonSozBilan"),
  extractFn("summaSozBilan"),
  extractFn("kassaQoldiqAsOf"),
  extractFn("computeKontragentLedger"),
  extractFn("computeReconciliationRows"),
  "let STORE = { bank: [], kassa: [], kirim: [], chiqim: [], ombor: [], kontragentlar: [], settings: { bankOpeningBalance: 0, kassaOpeningBalance: 0, f1Kassa: 0, filterFrom: '', filterTo: '' } };",
  "module.exports = { sonSozBilan, summaSozBilan, kassaQoldiqAsOf, computeKontragentLedger, computeReconciliationRows, setStore: (s) => { STORE = Object.assign({ bank: [], kassa: [], kirim: [], chiqim: [], ombor: [], kontragentlar: [], settings: { bankOpeningBalance: 0, kassaOpeningBalance: 0, f1Kassa: 0, filterFrom: '', filterTo: '' } }, s); } };"
].join("\n\n");

const tmp = require("path").join(require("os").tmpdir(), "forget_kassa_" + process.pid + ".js");
fs.writeFileSync(tmp, code);
const F = require(tmp);
process.on("exit", () => { try { fs.unlinkSync(tmp); } catch (e) {} });

let ok = 0, fail = 0;
function t(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) {
    ok++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name + "\n      kutilgan: " + e + "\n      chiqdi:   " + a);
  }
}

console.log("\n=== KASSA OPERATSIYALARI (5010) TESTLARI ===");

console.log("\n[1] Summani so'z bilan ifodalash (summaSozBilan)");
t("Nol so'm", F.summaSozBilan(0), "Nol so'm 00 tiyin");
t("Yuz ming so'm", F.summaSozBilan(100000), "Yuz ming so'm 00 tiyin");
t("Bir million ikki yuz ellik ming", F.summaSozBilan(1250000), "Bir million ikki yuz ellik ming so'm 00 tiyin");
t("Tiyinli summa (50 tiyin)", F.summaSozBilan(5400200.50), "Besh million to'rt yuz ming ikki yuz so'm 50 tiyin");

console.log("\n[2] Kassa qoldig'i (kassaQoldiqAsOf)");
F.setStore({
  settings: { kassaOpeningBalance: 1000000 },
  kassa: [
    { id: "k1", sana: "2026-09-01", turi: "kirim", summa: 500000, hujjatRaqami: "KO-1/001" },
    { id: "k2", sana: "2026-09-05", turi: "chiqim", summa: 300000, hujjatRaqami: "KO-2/001" },
    { id: "k3", sana: "2026-09-15", turi: "kirim", summa: 700000, hujjatRaqami: "KO-1/002" },
    { id: "k4", sana: "2026-09-20", turi: "chiqim", summa: 400000, hujjatRaqami: "KO-2/002" }
  ]
});

t("01.09 holatiga qoldiq: 1 mln + 500 ming", F.kassaQoldiqAsOf("2026-09-01"), 1500000);
t("10.09 holatiga qoldiq: 1.5 mln - 300 ming", F.kassaQoldiqAsOf("2026-09-10"), 1200000);
t("18.09 holatiga qoldiq: 1.2 mln + 700 ming", F.kassaQoldiqAsOf("2026-09-18"), 1900000);
t("30.09 holatiga yakuniy qoldiq: 1.9 mln - 400 ming", F.kassaQoldiqAsOf("2026-09-30"), 1500000);
t("Sanasiz (barcha harakatlar) qoldiq", F.kassaQoldiqAsOf(""), 1500000);

console.log("\n[3] Solishtirma dalolatnoma (Sverka) integratsiyasi");
const INN = "123456789";
F.setStore({
  settings: { filterFrom: "2026-09-01", filterTo: "2026-09-30", kassaOpeningBalance: 0 },
  kontragentlar: [{ inn: INN, nomi: "ALFA MCHJ", boshlangichQarz: 0 }],
  chiqim: [{ id: "c1", sana: "2026-09-02", kontragentInn: INN, kontragentNomi: "ALFA MCHJ", jamiSumma: 2000000, status: "Принят" }],
  kirim: [],
  bank: [{ id: "b1", sana: "2026-09-05", kontragentInn: INN, kontragent: "ALFA MCHJ", kirim: 1000000, chiqim: 0 }],
  kassa: [
    // Xaridor naqd pul to'ladi (KO-1): ALFA qarzini kamaytiradi (kredit 500 ming)
    { id: "k1", sana: "2026-09-10", kontragentInn: INN, kontragent: "ALFA MCHJ", turi: "kirim", summa: 500000, hujjatRaqami: "KO-1/001", tavsif: "Naqd to'lov" },
    // Korxona ta'minotchi/hamkorga kassa chiqim orderi bilan to'ladi (KO-2): debet 200 ming
    { id: "k2", sana: "2026-09-15", kontragentInn: INN, kontragent: "ALFA MCHJ", turi: "chiqim", summa: 200000, hujjatRaqami: "KO-2/001", tavsif: "Kassa chiqim" }
  ]
});

const ledger = F.computeKontragentLedger(INN);
t("Sverka daftari satrlari soni (faktura + bank + 2 ta kassa)", ledger.rows.length, 4);

const ko1Row = ledger.rows.find((r) => r.hujjat.includes("KO-1"));
t("KO-1 kassa kirim orderi kreditga tushdi", ko1Row ? ko1Row.kredit : 0, 500000);

const ko2Row = ledger.rows.find((r) => r.hujjat.includes("KO-2"));
t("KO-2 kassa chiqim orderi debetga tushdi", ko2Row ? ko2Row.debet : 0, 200000);

// Boshlang'ich 0 + Sotuv 2 000 000 - Bank 1 000 000 - Kassa kirim 500 000 + Kassa chiqim 200 000 = 700 000
t("Sverka yakuniy saldosi to'g'ri (700 000 so'm)", ledger.oxirgiSaldo, 700000);

const recon = F.computeReconciliationRows();
const alfaRecon = recon.find((r) => r.inn === INN);
t("Reconciliation jadvalida kassa to'liq hisoblandi", !!alfaRecon && alfaRecon.oxiriga, 700000);

console.log("\n[4] Kassa operatsiyalari va kunlik Kassa kitobi (KO-4) balansi");
{
  const testRows = [
    { sana: "2026-09-10", turi: "kirim", summa: 1000000 },
    { sana: "2026-09-10", turi: "chiqim", summa: 300000 },
    { sana: "2026-09-11", turi: "kirim", summa: 400000 },
    { sana: "2026-09-11", turi: "chiqim", summa: 600000 }
  ];
  F.setStore({ settings: { kassaOpeningBalance: 500000 }, kassa: testRows });

  // 10.09 kun boshi: 500 000, kirim: 1 000 000, chiqim: 300 000 -> kun oxiri: 1 200 000
  const qoldiq10 = F.kassaQoldiqAsOf("2026-09-10");
  t("10-sentyabr kassa kitobi oxirgi qoldig'i (1 200 000)", qoldiq10, 1200000);

  // 11.09 kun boshi: 1 200 000, kirim: 400 000, chiqim: 600 000 -> kun oxiri: 1 000 000
  const qoldiq11 = F.kassaQoldiqAsOf("2026-09-11");
  t("11-sentyabr kassa kitobi oxirgi qoldig'i (1 000 000)", qoldiq11, 1000000);
}

console.log("\n" + (fail === 0 ? "✓ Barcha " + ok + " ta Kassa (5010) testlari muvaffaqiyatli o'tdi!" : "✗ " + fail + " ta testda xatolik yuz berdi"));
process.exit(fail ? 1 : 0);
