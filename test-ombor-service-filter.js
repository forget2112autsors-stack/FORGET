const fs = require("fs");
const path = require("path");
const assert = require("assert");

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

const toNumCode = extractFunction("toNum");
const isServiceCode = extractFunction("isServiceOmborItem");
const filterOmborCode = extractFunction("filterOmborStockRows");

const script = `
${toNumCode}
${isServiceCode}
${filterOmborCode}
return { isServiceOmborItem, filterOmborStockRows };
`;

const { isServiceOmborItem, filterOmborStockRows } = new Function(script)();

const serviceRows = [
  { nomi: "Xizmat ko'rsatish", miqdor: 1, birlik: "soat" },
  { nomi: "Konsultatsiya xizmati", miqdor: 1, birlik: "dona" },
  { nomi: "Asosiy mahsulot", miqdor: 2, birlik: "dona" }
];

const filtered = filterOmborStockRows(serviceRows);
assert.strictEqual(filtered.length, 1, "Faqat mahsulotlar omborga qabul qilinishi kerak");
assert.strictEqual(filtered[0].nomi, "Asosiy mahsulot");
assert.strictEqual(isServiceOmborItem({ nomi: "Xizmat ko'rsatish" }), true);
assert.strictEqual(isServiceOmborItem({ nomi: "Asosiy mahsulot" }), false);

// Soliq/didox birlikka valyutani qavsda qo'shadi — bular ham xizmat.
assert.strictEqual(isServiceOmborItem({ nomi: "Комиссионный сбор по операции", birlik: "услуга (сум)" }), true);
assert.strictEqual(isServiceOmborItem({ nomi: "Банклараро электрон хизмат", birlik: "xizmat (so'm)" }), true);
assert.strictEqual(isServiceOmborItem({ nomi: "Абон.тўл.\"Мобил-банк\"", birlik: "xizmat (so'm)" }), true);
assert.strictEqual(isServiceOmborItem({ nomi: "Комиссионный сбор", birlik: "" }), true);
// Mahsulotlar qolishi kerak.
assert.strictEqual(isServiceOmborItem({ nomi: "Диагональ мато", birlik: "pogono metr" }), false);
assert.strictEqual(isServiceOmborItem({ nomi: "Текстильный материал", birlik: "metr" }), false);
assert.strictEqual(isServiceOmborItem({ nomi: "Ворсовые полотна", birlik: "kilogramm" }), false);
assert.strictEqual(isServiceOmborItem({ nomi: "Ип", birlik: "dona (g'altak)" }), false);

console.log("OK: ombor xizmat filtratsiyasi ishlayapti");
