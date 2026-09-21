/* FORGET — "kontragent ustiga bosilsa tarixi ochilsin" xatti-harakati uchun
 * testlar. Haqiqiy DOM (jsdom) ustida bosish simulyatsiya qilinadi.
 *
 * Ishga tushirish:  npm i -D jsdom && node test-kontragent-tarixi.js
 * (jsdom o'rnatilmagan bo'lsa test o'zini o'tkazib yuboradi — CI'ni buzmaydi.)
 */
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/app.js", "utf8");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) { console.log("jsdom o'rnatilmagan — test o'tkazib yuborildi"); process.exit(0); }

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

const dom = new JSDOM(`<!doctype html><html><body>
  <main id="main"></main>
</body></html>`);
global.window = dom.window;
global.document = dom.window.document;

const opened = [];
const code = [
  extractFn("escapeHtml"),
  extractFn("toNum"),
  extractFn("kontragentHistoryCellHtml"),
  extractFn("kontragentHistoryBtnHtml"),
  extractFn("kontragentRowHtml"),
  extractFn("bindKontragentHistoryDelegation"),
  'let CURRENT_PAGE = "kontragentlar";',
  "function openSverkaDetail(inn, back) { OPENED.push({ inn, back }); }",
  "module.exports = { kontragentRowHtml, kontragentHistoryCellHtml, kontragentHistoryBtnHtml, bindKontragentHistoryDelegation, setPage: (p) => { CURRENT_PAGE = p; } };"
].join("\n\n");

const tmp = require("path").join(require("os").tmpdir(), "forget_khist_" + process.pid + ".js");
fs.writeFileSync(tmp, code);
global.OPENED = opened;
const F = require(tmp);
process.on("exit", () => { try { fs.unlinkSync(tmp); } catch (e) {} });

let ok = 0, fail = 0;
function t(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { ok++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + "\n      kutilgan: " + e + "\n      chiqdi:   " + a); }
}

const main = document.getElementById("main");
F.bindKontragentHistoryDelegation();

console.log("\n[1] Kontragentlar sahifasi — qatorning istalgan joyiga bosish");
main.innerHTML = `<table><tbody id="kontragentBody">
  ${F.kontragentRowHtml({ id: "k1", nomi: "ALFA MCHJ", inn: "123456789", telefon: "90-000-00-00" })}
  ${F.kontragentRowHtml({ id: "k2", nomi: "INN'siz firma", inn: "", telefon: "" })}
</tbody></table>`;

opened.length = 0;
main.querySelector('tr[data-id="k1"] td').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("nom katagiga bosilsa tarix ochiladi", opened, [{ inn: "123456789", back: "kontragentlar" }]);

opened.length = 0;
main.querySelectorAll('tr[data-id="k1"] td')[3].dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("telefon katagiga bosilsa ham ochiladi", opened.length, 1);

opened.length = 0;
main.querySelector('tr[data-id="k1"] [data-edit]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("Tahrirlash tugmasi tarixni OCHMAYDI", opened, []);

opened.length = 0;
main.querySelector('tr[data-id="k1"] [data-del] svg').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("O'chirish ikonkasi (svg) tarixni OCHMAYDI", opened, []);

opened.length = 0;
main.querySelector('tr[data-id="k2"] td').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("INN'siz kontragent bosilsa hech narsa bo'lmaydi", opened, []);

console.log("\n[2] Tahrirlanadigan jadvallar — faqat tarix tugmasi");
main.innerHTML = `<table><tbody id="invoiceBody"><tr data-id="r1">
  <td><input class="cell-input" data-f="kontragentNomi" value="ALFA"></td>
  <td class="row-actions">
    ${F.kontragentHistoryBtnHtml("123456789", "kirim")}
    <button class="icon-btn" data-del="r1"><svg class="ic"><use href="#i-x"/></svg></button>
  </td>
</tr></tbody></table>`;

opened.length = 0;
main.querySelector("[data-hist-inn]").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("tarix tugmasi — qaytish sahifasi 'kirim'", opened, [{ inn: "123456789", back: "kirim" }]);

opened.length = 0;
main.querySelector("[data-hist-inn] svg").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("tugma ichidagi svg'ga bosilsa ham ishlaydi", opened.length, 1);

opened.length = 0;
main.querySelector('input[data-f="kontragentNomi"]').dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("tahrirlanadigan katak bosilsa tarix OCHILMAYDI", opened, []);

opened.length = 0;
main.querySelector("[data-del]").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
t("o'chirish tugmasi tarixni OCHMAYDI", opened, []);

t("INN bo'lmasa tugma umuman chizilmaydi", F.kontragentHistoryBtnHtml("  ", "kirim"), "");

console.log("\n[3] XSS — nom va INN ekranlanadi");
{
  const html = F.kontragentHistoryCellHtml('<img src=x onerror=alert(1)>', '1"2', "sverka");
  t("teg ekranlangan", html.includes("<img"), false);
  t("qo'shtirnoq ekranlangan", html.includes('data-hist-inn="1&quot;2"'), true);
}

console.log("\n" + (fail ? `✗ ${fail} ta sinov muvaffaqiyatsiz, ${ok} ta o'tdi` : `✓ hammasi o'tdi (${ok} ta sinov)`));
process.exit(fail ? 1 : 0);
