/* FORGET — "kontragent ustiga bosilsa tarixi ochilsin" xatti-harakati uchun
 * testlar. DOM ustida bosish simulyatsiya qilinadi.
 *
 * Ishga tushirish:  node test-kontragent-tarixi.js
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

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

// Lightweight DOM Node
class MockNode {
  constructor(tagName, attrs = {}, parent = null) {
    this.tagName = tagName.toUpperCase();
    this.attributes = attrs;
    this.dataset = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("data-")) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = v;
      }
    }
    this.parentElement = parent;
    this.children = [];
    this.listeners = {};
    this.style = {};
  }
  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }
  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }
  closest(selector) {
    const parts = selector.split(",").map((s) => s.trim());
    let cur = this;
    while (cur) {
      for (const sel of parts) {
        if (cur.matches(sel)) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }
  matches(sel) {
    sel = sel.trim();
    if (sel.startsWith("tr[") && sel.endsWith("]")) {
      const attr = sel.slice(3, -1);
      return this.tagName === "TR" && this.hasAttribute(attr);
    }
    if (sel.startsWith("[") && sel.endsWith("]")) {
      const attr = sel.slice(1, -1);
      return this.hasAttribute(attr);
    }
    if (sel.startsWith(".")) {
      const cls = sel.slice(1);
      return ((this.attributes["class"] || "").split(/\s+/)).includes(cls);
    }
    return this.tagName === sel.toUpperCase();
  }
  addEventListener(ev, fn) {
    (this.listeners[ev] = this.listeners[ev] || []).push(fn);
  }
  dispatchEvent(event) {
    event.target = this;
    let cur = this;
    while (cur) {
      const fns = cur.listeners[event.type] || [];
      for (const fn of fns) fn(event);
      if (event._stopped) break;
      cur = cur.parentElement;
    }
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    const list = [];
    function walk(node) {
      for (const ch of node.children) {
        if (ch.matches(sel)) list.push(ch);
        walk(ch);
      }
    }
    walk(this);
    return list;
  }
}

function parseFragment(html, parentNode) {
  const tagRegex = /<(\/?)([\w-]+)([^>]*)>|([^<]+)/g;
  let cur = parentNode;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    if (match[4]) continue;
    const isClose = match[1] === "/";
    const tag = match[2];
    if (isClose) {
      if (cur !== parentNode && cur.parentElement) {
        cur = cur.parentElement;
      }
    } else {
      const rawAttrs = match[3] || "";
      const attrs = {};
      const attrRegex = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let am;
      while ((am = attrRegex.exec(rawAttrs)) !== null) {
        attrs[am[1]] = am[2] !== undefined ? am[2] : (am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : ""));
      }
      const node = new MockNode(tag, attrs, cur);
      cur.children.push(node);
      const isSelfClosing = ["INPUT", "IMG", "BR", "HR", "USE", "SOURCE"].includes(node.tagName) || rawAttrs.trim().endsWith("/");
      if (!isSelfClosing) {
        cur = node;
      }
    }
  }
}

const main = new MockNode("div", { id: "main" });
global.window = {
  document: {
    getElementById: (id) => (id === "main" ? main : null)
  }
};
global.document = global.window.document;

const opened = [];
global.openSverkaDetail = (inn, back) => {
  opened.push({ inn, back });
};
global.CURRENT_PAGE = "kontragentlar";
global.KONTRAGENT_HISTORY_BOUND = false;

eval(extractFn("escapeHtml"));
eval(extractFn("toNum"));
eval(extractFn("kontragentHistoryCellHtml"));
eval(extractFn("kontragentHistoryBtnHtml"));
eval(extractFn("kontragentRowHtml"));
eval(extractFn("bindKontragentHistoryDelegation"));

bindKontragentHistoryDelegation();

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

console.log("\n[1] Kontragentlar sahifasi — qatorning istalgan joyiga bosish");

const k1Html = kontragentRowHtml({ id: "k1", nomi: "ALFA MCHJ", inn: "123456789", telefon: "90-000-00-00" });
const k2Html = kontragentRowHtml({ id: "k2", nomi: "INN'siz firma", inn: "", telefon: "" });

main.children = [];
const tbody = new MockNode("tbody", { id: "kontragentBody" }, main);
main.children.push(tbody);
parseFragment(k1Html + k2Html, tbody);

opened.length = 0;
const k1Row = tbody.children[0];
const k1TdName = k1Row.children[0];
k1TdName.dispatchEvent({ type: "click", preventDefault: () => {} });
t("Nom katagiga bosilsa tarix ochiladi", opened, [{ inn: "123456789", back: "kontragentlar" }]);

opened.length = 0;
const k1TdPhone = k1Row.children[3];
k1TdPhone.dispatchEvent({ type: "click", preventDefault: () => {} });
t("Telefon katagiga bosilsa ham tarix ochiladi", opened.length, 1);

opened.length = 0;
const k1TarixBtn = k1Row.querySelector("[data-detail-inn]");
k1TarixBtn.dispatchEvent({ type: "click", preventDefault: () => {} });
t("Tarix tugmasi bosilsa tarix ochiladi", opened, [{ inn: "123456789", back: "kontragentlar" }]);

opened.length = 0;
const editBtn = k1Row.querySelector("[data-edit]");
editBtn.dispatchEvent({ type: "click", preventDefault: () => {} });
t("Tahrirlash tugmasi tarixni OCHMAYDI", opened, []);

opened.length = 0;
const editSvg = editBtn.children[0];
if (editSvg) {
  editSvg.dispatchEvent({ type: "click", preventDefault: () => {} });
  t("Tahrirlash SVG ikonkasi tarixni OCHMAYDI", opened, []);
}

opened.length = 0;
const delBtn = k1Row.querySelector("[data-del]");
delBtn.dispatchEvent({ type: "click", preventDefault: () => {} });
t("O'chirish tugmasi tarixni OCHMAYDI", opened, []);

opened.length = 0;
const delSvg = delBtn.children[0];
if (delSvg) {
  delSvg.dispatchEvent({ type: "click", preventDefault: () => {} });
  t("O'chirish SVG ikonkasi tarixni OCHMAYDI", opened, []);
}

opened.length = 0;
const k2Row = tbody.children[1];
const k2TdName = k2Row.children[0];
k2TdName.dispatchEvent({ type: "click", preventDefault: () => {} });
t("INN'siz kontragentda xato bermaydi va ochmaydi", opened, []);

console.log("\n[2] Tahrirlanadigan jadvallar (Faktura kirim / chiqim)");
global.CURRENT_PAGE = "kirim";

main.children = [];
const invTbody = new MockNode("tbody", { id: "invoiceBody" }, main);
main.children.push(invTbody);
const invoiceHtml = `<tr data-id="r1">
  <td><input class="cell-input" data-f="kontragentNomi" value="ALFA"></td>
  <td class="row-actions">
    ${kontragentHistoryBtnHtml("123456789", "kirim")}
    <button class="icon-btn" data-del="r1"><svg class="ic"><use href="#i-x"/></svg></button>
  </td>
</tr>`;
parseFragment(invoiceHtml, invTbody);

const invRow = invTbody.children[0];
const inputEl = invRow.querySelector("input");
opened.length = 0;
inputEl.dispatchEvent({ type: "click", preventDefault: () => {} });
t("Tahrirlanadigan katak bosilsa tarix OCHILMAYDI", opened, []);

const histBtn = invRow.querySelector("[data-hist-inn]");
opened.length = 0;
histBtn.dispatchEvent({ type: "click", preventDefault: () => {} });
t("Tarix tugmasi — qaytish sahifasi 'kirim'", opened, [{ inn: "123456789", back: "kirim" }]);

const histSvg = histBtn.children[0];
if (histSvg) {
  opened.length = 0;
  histSvg.dispatchEvent({ type: "click", preventDefault: () => {} });
  t("Tugma ichidagi svg'ga bosilsa ham ishlaydi", opened.length, 1);
}

const delBtn2 = invRow.querySelector("[data-del]");
opened.length = 0;
delBtn2.dispatchEvent({ type: "click", preventDefault: () => {} });
t("O'chirish tugmasi tarixni OCHMAYDI", opened, []);

t("INN bo'lmasa tugma umuman chizilmaydi", kontragentHistoryBtnHtml("  ", "kirim"), "");

console.log("\n[3] XSS — nom va INN ekranlanadi");
{
  const html = kontragentHistoryCellHtml('<img src=x onerror=alert(1)>', '1"2', "sverka");
  t("teg ekranlangan", html.includes("<img"), false);
  t("qo'shtirnoq ekranlangan", html.includes('data-hist-inn="1&quot;2"'), true);
}

console.log("\n" + (fail ? `✗ ${fail} ta sinov muvaffaqiyatsiz, ${ok} ta o'tdi` : `✓ hammasi o'tdi (${ok} ta sinov)`));
process.exit(fail ? 1 : 0);
