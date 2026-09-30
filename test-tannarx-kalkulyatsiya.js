// test-tannarx-kalkulyatsiya.js — birlik konvertatsiyasi (t↔kg), FIFO partiyalar,
// to'liq tannarx, minimal marja, "Kirim qilinishi shart" va kritik qoldiq qoidalari.
// Funksiyalar app.js'dan to'g'ridan-to'g'ri olinadi (nusxa emas).
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const appJsCode = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function extractFunction(name) {
  const marker = `function ${name}(`;
  const idx = appJsCode.indexOf(marker);
  if (idx === -1) throw new Error(`Funksiya topilmadi: ${name}`);
  let depth = 0, started = false;
  for (let i = idx; i < appJsCode.length; i++) {
    if (appJsCode[i] === "{") { depth++; started = true; }
    else if (appJsCode[i] === "}") { depth--; if (started && depth === 0) return appJsCode.slice(idx, i + 1); }
  }
  throw new Error(`Funksiya oxiri topilmadi: ${name}`);
}

function extractBetween(startMarker, endMarker) {
  const a = appJsCode.indexOf(startMarker);
  const b = appJsCode.indexOf(endMarker, a);
  if (a === -1 || b === -1) throw new Error(`Blok topilmadi: ${startMarker}`);
  return appJsCode.slice(a, b);
}

const FUNCS = [
  "toNum", "birlikAniqla", "birlikKonvert", "birlikMosmi", "omborAsosiyBirlik", "omborMiqdorAsosiy",
  "omborKirimBaza", "omborKirimRows", "cmpOmbor", "buildFifoLedgerFromRows", "buildAllFifoLedgers",
  "fifoLedger", "invalidateFifo", "fifoHypotheticalCost", "fifoUsulActive", "avgOmborNarx",
  "getXomashyoBirlikNarx", "annotateOmborShortages", "omborSarfTekshir", "omborQoldiqByNomiAsOf",
  "computeMahsulotConsumption", "mahsulotSarfRejasi", "tayyorMahsulotKirimiBor", "kalkulyatsiyaHisobla",
  "mahsulotXarajatNormalari", "ijtimoiySoliqStavkasi", "minMarjaFoiz", "marjaTekshir",
  "kritikQoldiqNormasi", "kritikQoldiqRoyxati"
];

const script = `
let STORE = null;
let FIFO_LEDGERS = null, CHIQIM_HOLAT_CACHE = null, ASOSIY_BIRLIK_CACHE = null;
${extractBetween("const BIRLIK_TURLARI", "function birlikAniqla(")}
${extractBetween("const XARAJAT_NORMA_MAYDONLARI", "function mahsulotXarajatNormalari(")}
${FUNCS.map(extractFunction).join("\n")}
return {
  setStore: (s) => { STORE = s; invalidateFifo(); },
  ${FUNCS.join(", ")}
};
`;
const A = new Function(script)();

const MLN = 1000000;
let seq = 0;
const kirim = (nomi, birlik, miqdor, jami, sana) => ({ id: "k" + (++seq), turi: "kirim", nomi, birlik, miqdor, narx: jami / miqdor, yetkazibBerishNarxi: jami, sana, createdAt: String(seq).padStart(4, "0") });
const chiqim = (nomi, birlik, miqdor, sana, hujjatRaqami) => ({ id: "c" + (++seq), turi: "chiqim", nomi, birlik, miqdor, narx: 0, yetkazibBerishNarxi: 0, sana, hujjatRaqami, createdAt: String(seq).padStart(4, "0") });

const G = "Polietilen granulasi PE 100";
const truba = { id: "m1", nomi: "Truba PE 100 d.110", birlik: "metr", tarkib: [{ nomi: G, birlik: "kg", norma: 5 }], standartNarxi: 100000,
  xarajatNormalari: { ishHaqi: 1000, elektr: 200, amortizatsiya: 0, logistika: 100, boshqa: 0 } };

const store = {
  settings: { tannarxUsuli: "fifo", minMarjaFoiz: 15, ijtimoiySoliqStavka: 12, kritikQoldiqlar: {} },
  ombor: [
    // Sizning misolingiz: granula tonnada keladi.
    kirim(G, "tonna", 5, 5 * 13500000, "2026-09-01"),
    kirim(G, "tonna", 10, 10 * 15500000, "2026-09-10")
  ],
  mahsulotlar: [truba]
};
A.setStore(store);

// 1. Birliklar
assert.strictEqual(A.birlikKonvert(1, "tonna", "kg"), 1000);
assert.strictEqual(A.birlikKonvert(500, "кг", "т"), 0.5);
assert.strictEqual(A.birlikKonvert(250, "sm", "metr"), 2.5);
assert.strictEqual(A.birlikKonvert(3, "dona", "kg"), 3, "mos kelmaydigan birlik o'zgarmaydi");
assert.strictEqual(A.birlikMosmi("dona", "kg"), false);
assert.strictEqual(A.birlikMosmi("kg", "Тонна"), true);
assert.strictEqual(A.omborAsosiyBirlik(G), "tonna");

// 2. FIFO: 1 kg narxi — birinchi partiyadan (13 500 000 / 1000)
assert.strictEqual(Math.round(A.getXomashyoBirlikNarx(G, 5, null, "kg")), 13500);
// 1 metr truba = 5 kg granula = 67 500
const kalk = A.kalkulyatsiyaHisobla(truba.tarkib, A.mahsulotXarajatNormalari(truba));
assert.strictEqual(Math.round(kalk.xomashyo), 67500);
// To'liq tannarx = 67 500 + 1 000 ish haqi + 120 ijtimoiy soliq (12%) + 300 qo'shimcha
assert.strictEqual(Math.round(kalk.jami), 68920);

// 6 000 kg sarf: 5 t × 13,5 mln + 1 t × 15,5 mln = 83 mln
assert.strictEqual(Math.round(A.fifoHypotheticalCost(G, 6000, null, "kg").tannarx), 83 * MLN);

// 3. 1000 metr ishlab chiqarildi (5 000 kg granula, retsept birligida yozilgan)
store.ombor.push(chiqim(G, "kg", 5000, "2026-09-15", "IC-1"));
A.setStore(store);
const led = A.fifoLedger(G);
assert.strictEqual(Math.round(led.byDoc.get("IC-1").tannarx), Math.round(67.5 * MLN), "birinchi partiya to'liq sarflandi");
assert.strictEqual(led.qtyAsOf(null), 10, "qoldiq 10 tonna (5000 kg to'g'ri o'girildi, 5000 tonna emas)");
// Birinchi partiya tugagach — keyingi partiya narxi
assert.strictEqual(Math.round(A.getXomashyoBirlikNarx(G, 1, null, "kg")), 15500);
assert.strictEqual(A.omborQoldiqByNomiAsOf(G, null, null, "kg"), 10000);
// Eski sana holatida narx hali birinchi partiyadan
assert.strictEqual(Math.round(A.getXomashyoBirlikNarx(G, 1, "2026-09-05", "kg")), 13500);
// Hujjat tannarxi yozilgan sarf qatorlaridan (retsept keyin o'zgarsa ham)
const ic = A.computeMahsulotConsumption(truba, 1000, "2026-09-15", { docRef: "IC-1" });
assert.strictEqual(Math.round(ic.tannarx), Math.round(67.5 * MLN));

// 4. Qoldiq nazorati
let t = A.omborSarfTekshir([{ nomi: G, birlik: "kg", miqdor: 12000 }], "2026-09-20");
assert.strictEqual(t.bloklar.length, 0);
assert.strictEqual(t.kamlar.length, 1, "kirim bor, lekin kam — tasdiq so'raladi");
assert.strictEqual(Math.round(t.kamlar[0].kamomad), 2000);
t = A.omborSarfTekshir([{ nomi: "Bo'yoq (kirim qilinmagan)", birlik: "kg", miqdor: 1 }], "2026-09-20");
assert.strictEqual(t.bloklar.length, 1, "kirim qilinmagan xomashyo — bloklanadi");
assert.strictEqual(t.bloklar[0].sabab, "kirim_yoq");
t = A.omborSarfTekshir([{ nomi: G, birlik: "kg", miqdor: 10 }], "2026-08-30");
assert.strictEqual(t.bloklar.length, 1, "sotuv sanasida hali kirim yo'q — bloklanadi");
t = A.omborSarfTekshir([{ nomi: G, birlik: "dona", miqdor: 10 }], "2026-09-20");
assert.strictEqual(t.birlikXatolar.length, 1, "retseptda dona, omborda tonna — birlik xatosi");

// 5. Minimal marja: Tannarx ≤ Sotuv narxi × 0.85
assert.strictEqual(A.marjaTekshir(82, 100).holat, "chegara", "18% — chegaradan 5 punktdan kam yuqori");
assert.strictEqual(A.marjaTekshir(70, 100).holat, "ok");
assert.strictEqual(A.marjaTekshir(85, 100).holat, "chegara", "aynan 0.85 — qoida bajarilgan");
assert.strictEqual(A.marjaTekshir(90, 100).holat, "buzildi");
assert.strictEqual(A.marjaTekshir(110, 100).holat, "zarar");
assert.strictEqual(Math.round(A.marjaTekshir(85, 100).minNarx), 100);
assert.strictEqual(A.marjaTekshir(68920, 0).holat, "yoq");

// 6. Tayyor mahsulot omborda bo'lsa — sotuvda xomashyo ikkinchi marta yechilmaydi
const sotuvOldin = A.mahsulotSarfRejasi(truba, 10, "2026-09-20");
assert.strictEqual(sotuvOldin[0].nomi, G, "tayyor mahsulot kirimi yo'q — retsept bo'yicha");
store.ombor.push({ id: "p1", turi: "kirim", nomi: truba.nomi, birlik: "metr", miqdor: 1000, narx: 68920, yetkazibBerishNarxi: 0, sana: "2026-09-15", hujjatRaqami: "IC-1", createdAt: "9999" });
A.setStore(store);
const sotuv = A.mahsulotSarfRejasi(truba, 10, "2026-09-20");
assert.deepStrictEqual(sotuv, [{ nomi: truba.nomi, birlik: "metr", miqdor: 10 }], "tayyor mahsulotning o'zi yechiladi");
assert.strictEqual(A.mahsulotSarfRejasi(truba, 10, "2026-09-20", { retseptBoyicha: true })[0].nomi, G);
// Tayyor mahsulot partiyasi 0 so'm emas — "narx" (birlik tannarxi)dan baholanadi
assert.strictEqual(Math.round(A.getXomashyoBirlikNarx(truba.nomi, 1, null)), 68920);

// 7. Kritik qoldiq
store.settings.kritikQoldiqlar = { [G]: 12 };
const kritik = A.kritikQoldiqRoyxati();
assert.strictEqual(kritik.length, 1, "10 t qoldiq ≤ 12 t norma");
store.settings.kritikQoldiqlar = { [G]: 5 };
assert.strictEqual(A.kritikQoldiqRoyxati().length, 0);

console.log("OK: tannarx kalkulyatsiyasi (t↔kg, FIFO, to'liq tannarx, marja, qoldiq nazorati) ishlayapti");
