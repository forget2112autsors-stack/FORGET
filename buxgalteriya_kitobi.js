/**
 * FORGET — Buxgalteriya Daftari Moduli (BHMS 21 / O'zbekiston BHMQ)
 * "Бухгалтерская_программа_УЗБ_версия 20.xlsx" andazasi asosida yaratilgan.
 *
 * Vazifalari:
 * 1. O'zbekiston BHMS 21 bo'yicha to'liq 159+ hisobvaraqlar rejasi (Chart of Accounts).
 * 2. Yagona xo'jalik operatsiyalari jurnali (Order-jurnallar 1..12 va butun yil).
 * 3. Schyotlar bo'yicha aylanma va qoldiq vedomosti (Карточка счёта / ОСВ) running-balance bilan.
 * 4. Shaxmatka vedomosti (Шахматная ведомость) — Dt x Kt aylanmalar matritsasi.
 * 5. Bosh kitob (Главная книга) — oylar va korrespondent hisoblar kesimida.
 * 6. Boshlang'ich qoldiqlar (Йил бошига қолдиқ) kiritish va balans tengligi nazorati.
 * 7. "Бухгалтерская_программа_УЗБ_версия 20.xlsx" faylini 1-klikda to'liq IMPORT va EKSPORT qilish.
 */

(function () {
  "use strict";

  /* --------------------------------------------------------------------------
     0. ASOSIY FORMATTER VA YORDAMCHI FUNKSIYALAR
     -------------------------------------------------------------------------- */

  function formatSum(n) {
    if (typeof window.fmt === "function") {
      const num = typeof window.toNum === "function" ? window.toNum(n) : (Number(n) || 0);
      const digits = (Math.abs(num) % 1 > 0.001) ? 2 : 0;
      return window.fmt(num, digits);
    }
    const num = Number(n) || 0;
    const digits = (Math.abs(num) % 1 > 0.001) ? 2 : 0;
    return num.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  window.formatSum = formatSum;

  function toNum(v) {
    if (typeof window.toNum === "function") return window.toNum(v);
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    const clean = String(v).replace(/\s+/g, "").replace(/,/g, ".");
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  }
  if (!window.toNum) window.toNum = toNum;

  function escapeHtml(str) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(str);
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  if (!window.escapeHtml) window.escapeHtml = escapeHtml;

  function isValidStatus(status) {
    if (typeof window.isValidStatus === "function") return window.isValidStatus(status);
    return status !== "bekor" && status !== "qoralama";
  }
  if (!window.isValidStatus) window.isValidStatus = isValidStatus;

  /* --------------------------------------------------------------------------
     1. BHMS 21 TO'LIQ HISOBLAR REJASI (CHART OF ACCOUNTS)
     -------------------------------------------------------------------------- */

  const BUXGALTERIYA_SCHYOTLAR_FULL = {
    // 0100..0800 Uzoq muddatli aktivlar
    "0110": { nomi: "Er", turi: "A", bolim: "Asosiy vositalar" },
    "0111": { nomi: "Erni obodonlashtirish", turi: "A", bolim: "Asosiy vositalar" },
    "0112": { nomi: "Uzoq muddatli ijara shartnomasi bo'yicha olingan asosiy vositalarni obodonlashtirish", turi: "A", bolim: "Asosiy vositalar" },
    "0120": { nomi: "Binolar, inshootlar va uzatuvchi moslamalar", turi: "A", bolim: "Asosiy vositalar" },
    "0130": { nomi: "Mashina va asbob-uskunalar", turi: "A", bolim: "Asosiy vositalar" },
    "0140": { nomi: "Mebel va ofis jihozlari", turi: "A", bolim: "Asosiy vositalar" },
    "0150": { nomi: "Kompyuter jihozlari va hisoblash texnikasi", turi: "A", bolim: "Asosiy vositalar" },
    "0160": { nomi: "Transport vositalari", turi: "A", bolim: "Asosiy vositalar" },
    "0170": { nomi: "Ishchi va mahsuldor hayvonlar", turi: "A", bolim: "Asosiy vositalar" },
    "0180": { nomi: "Ko'p yillik o'simliklar", turi: "A", bolim: "Asosiy vositalar" },
    "0190": { nomi: "Boshqa asosiy vositalar", turi: "A", bolim: "Asosiy vositalar" },
    "0199": { nomi: "Konservatsiya qilingan asosiy vositalar", turi: "A", bolim: "Asosiy vositalar" },
    "0211": { nomi: "Erni obodonlashtirishning eskirishi", turi: "KA", bolim: "Eskirish" },
    "0220": { nomi: "Bino, inshoot va uzatuvchi moslamalarning eskirishi", turi: "KA", bolim: "Eskirish" },
    "0230": { nomi: "Mashina va asbob-uskunalarning eskirishi", turi: "KA", bolim: "Eskirish" },
    "0240": { nomi: "Mebel va ofis jihozlarining eskirishi", turi: "KA", bolim: "Eskirish" },
    "0250": { nomi: "Kompyuter jihozlari va hisoblash texnikasining eskirishi", turi: "KA", bolim: "Eskirish" },
    "0260": { nomi: "Transport vositalarining eskirishi", turi: "KA", bolim: "Eskirish" },
    "0290": { nomi: "Boshqa asosiy vositalarning eskirishi", turi: "KA", bolim: "Eskirish" },
    "0410": { nomi: "Patentlar, litsenziyalar va nou-xau", turi: "A", bolim: "Nomoddiy aktivlar" },
    "0420": { nomi: "Savdo belgilari va xizmat ko'rsatish belgilari", turi: "A", bolim: "Nomoddiy aktivlar" },
    "0430": { nomi: "Dasturiy ta'minot", turi: "A", bolim: "Nomoddiy aktivlar" },
    "0480": { nomi: "Franshiza", turi: "A", bolim: "Nomoddiy aktivlar" },
    "0490": { nomi: "Boshqa nomoddiy aktivlar", turi: "A", bolim: "Nomoddiy aktivlar" },
    "0510": { nomi: "Patentlar, litsenziyalar amortizatsiyasi", turi: "KA", bolim: "Nomoddiy aktivlar eskirishi" },
    "0520": { nomi: "Savdo belgilari amortizatsiyasi", turi: "KA", bolim: "Nomoddiy aktivlar eskirishi" },
    "0530": { nomi: "Dasturiy ta'minot amortizatsiyasi", turi: "KA", bolim: "Nomoddiy aktivlar eskirishi" },
    "0590": { nomi: "Boshqa nomoddiy aktivlar amortizatsiyasi", turi: "KA", bolim: "Nomoddiy aktivlar eskirishi" },
    "0810": { nomi: "Tugallanmagan qurilish", turi: "A", bolim: "Kapital qo'yilmalar" },
    "0820": { nomi: "Asosiy vositalarni xarid qilish", turi: "A", bolim: "Kapital qo'yilmalar" },
    "0830": { nomi: "Nomoddiy aktivlarni xarid qilish", turi: "A", bolim: "Kapital qo'yilmalar" },

    // 1000..2900 TMZ va Ishlab chiqarish
    "1010": { nomi: "Xomashyo va materiallar", turi: "A", bolim: "Materiallar zaxirasi" },
    "1011": { nomi: "Xomashyo va materiallar (import)", turi: "A", bolim: "Materiallar zaxirasi" },
    "1020": { nomi: "Sotib olingan yarim tayyor mahsulotlar va butlovchi buyumlar", turi: "A", bolim: "Materiallar zaxirasi" },
    "1030": { nomi: "Yoqilg'ilar", turi: "A", bolim: "Materiallar zaxirasi" },
    "1040": { nomi: "Idish va idishbop materiallar", turi: "A", bolim: "Materiallar zaxirasi" },
    "1050": { nomi: "Ehtiyot qismlar", turi: "A", bolim: "Materiallar zaxirasi" },
    "1060": { nomi: "Boshqa materiallar", turi: "A", bolim: "Materiallar zaxirasi" },
    "1080": { nomi: "Inventar va xo'jalik jihozlari", turi: "A", bolim: "Materiallar zaxirasi" },
    "1090": { nomi: "Qayta ishlashga berilgan materiallar", turi: "A", bolim: "Materiallar zaxirasi" },
    "2010": { nomi: "Asosiy ishlab chiqarish", turi: "A", bolim: "Ishlab chiqarish xarajatlari" },
    "2110": { nomi: "O'zida ishlab chiqarilgan yarim tayyor mahsulotlar", turi: "A", bolim: "Ishlab chiqarish xarajatlari" },
    "2310": { nomi: "Yordamchi ishlab chiqarish", turi: "A", bolim: "Ishlab chiqarish xarajatlari" },
    "2510": { nomi: "Umumiylab chiqarish xarajatlari", turi: "A", bolim: "Ishlab chiqarish xarajatlari" },
    "2610": { nomi: "Ishlab chiqarishdagi yaroqsiz mahsulotlar", turi: "A", bolim: "Ishlab chiqarish xarajatlari" },
    "2810": { nomi: "Tayyor mahsulotlar", turi: "A", bolim: "Tayyor mahsulot va tovarlar" },
    "2910": { nomi: "Ombordagi tovarlar", turi: "A", bolim: "Tayyor mahsulot va tovarlar" },

    // 4000..4800 Debitorlik
    "4010": { nomi: "Xaridorlar va buyurtmachilardan olinadigan schyotlar", turi: "A", bolim: "Debitorlar" },
    "4110": { nomi: "Ajratilgan bo'linmalardan olinadigan schyotlar", turi: "A", bolim: "Debitorlar" },
    "4210": { nomi: "Xodimlarga berilgan bo'naklar (bo'nak hisobotlari)", turi: "A", bolim: "Debitorlar" },
    "4310": { nomi: "Mol yetkazib beruvchilarga berilgan bo'naklar (avanslar)", turi: "A", bolim: "Debitorlar" },
    "4410": { nomi: "Byudjetga to'lovlar bo'yicha bo'naklar (QQS hisobga olish)", turi: "A", bolim: "Debitorlar" },
    "4510": { nomi: "Sug'urta bo'yicha bo'naklar", turi: "A", bolim: "Debitorlar" },
    "4810": { nomi: "Ustav kapitaliga ta'sischilarning ulushlari bo'yicha qarz", turi: "A", bolim: "Debitorlar" },
    "4890": { nomi: "Boshqa debitorlar bilan hisob-kitoblar", turi: "A", bolim: "Debitorlar" },

    // 5000..5800 Pul mablag'lari
    "5010": { nomi: "Milliy valyutadagi pul mablag'lari (Kassa)", turi: "A", bolim: "Pul mablag'lari" },
    "5020": { nomi: "Xorijiy valyutadagi pul mablag'lari (Kassa)", turi: "A", bolim: "Pul mablag'lari" },
    "5110": { nomi: "Hisob-kitob schyoti (Bank milliy valyuta)", turi: "A", bolim: "Pul mablag'lari" },
    "5210": { nomi: "Mamlakat ichidagi valyuta hisobvaraqlari (Bank xorijiy valyuta)", turi: "A", bolim: "Pul mablag'lari" },
    "5510": { nomi: "Akkreditivlar", turi: "A", bolim: "Pul mablag'lari" },
    "5520": { nomi: "Chek daftarchalari", turi: "A", bolim: "Pul mablag'lari" },
    "5530": { nomi: "Boshqa maxsus hisobvaraqlar", turi: "A", bolim: "Pul mablag'lari" },
    "5710": { nomi: "Yo'ldagi pul mablag'lari (Terminal va inkassatsiya)", turi: "A", bolim: "Pul mablag'lari" },
    "5810": { nomi: "Qisqa muddatli investitsiyalar", turi: "A", bolim: "Pul mablag'lari" },
    "5820": { nomi: "Qisqa muddatli qarzlar (berilgan)", turi: "A", bolim: "Pul mablag'lari" },

    // 6000..7900 Majburiyatlar
    "6010": { nomi: "Mol yetkazib beruvchilar va pudratchilarga to'lanadigan schyotlar", turi: "P", bolim: "Kreditorlar" },
    "6310": { nomi: "Xaridorlar va buyurtmachilardan olingan bo'naklar (avanslar)", turi: "P", bolim: "Kreditorlar" },
    "6411": { nomi: "Foyda solig'i bo'yicha byudjet bilan hisob-kitoblar", turi: "P", bolim: "Soliqlar" },
    "6412": { nomi: "JShDS (NDFL) bo'yicha byudjet bilan hisob-kitoblar", turi: "P", bolim: "Soliqlar" },
    "6413": { nomi: "QQS bo'yicha byudjet bilan hisob-kitoblar", turi: "P", bolim: "Soliqlar" },
    "6414": { nomi: "Aksiz solig'i bo'yicha byudjet bilan hisob-kitoblar", turi: "P", bolim: "Soliqlar" },
    "6415": { nomi: "Er solig'i bo'yicha byudjet bilan hisob-kitoblar", turi: "P", bolim: "Soliqlar" },
    "6416": { nomi: "Mulk solig'i bo'yicha byudjet bilan hisob-kitoblar", turi: "P", bolim: "Soliqlar" },
    "6417": { nomi: "Suv resurslaridan foydalanganlik uchun soliq", turi: "P", bolim: "Soliqlar" },
    "6418": { nomi: "Yagona soliq / Aylanmadan olinadigan soliq", turi: "P", bolim: "Soliqlar" },
    "6419": { nomi: "Boshqa soliqlar va majburiy to'lovlar", turi: "P", bolim: "Soliqlar" },
    "6510": { nomi: "Sug'urta bo'yicha to'lovlar", turi: "P", bolim: "Majburiy to'lovlar" },
    "6520": { nomi: "Davlat maqsadli jamg'armalariga to'lovlar (Ijtimoiy soliq 12%)", turi: "P", bolim: "Majburiy to'lovlar" },
    "6530": { nomi: "Shaxsiy jamg'arib boriladigan pensiya hisobvarag'i (INPS 0.1%)", turi: "P", bolim: "Majburiy to'lovlar" },
    "6610": { nomi: "To'lanadigan dividendlar", turi: "P", bolim: "Majburiyatlar" },
    "6710": { nomi: "Mehnat haqi bo'yicha xodimlar bilan hisob-kitoblar", turi: "P", bolim: "Mehnat haqi" },
    "6810": { nomi: "Qisqa muddatli bank kreditlari", turi: "P", bolim: "Kreditlar va qarzlar" },
    "6820": { nomi: "Qisqa muddatli qarzlar", turi: "P", bolim: "Kreditlar va qarzlar" },
    "6910": { nomi: "Operativ ijara bo'yicha to'lanadigan schyotlar", turi: "P", bolim: "Boshqa majburiyatlar" },
    "6920": { nomi: "Hisoblangan foizlar (kredit va lizing foizlari)", turi: "P", bolim: "Boshqa majburiyatlar" },
    "6990": { nomi: "Boshqa majburiyatlar", turi: "P", bolim: "Boshqa majburiyatlar" },
    "7810": { nomi: "Uzoq muddatli bank kreditlari (tani)", turi: "P", bolim: "Uzoq muddatli majburiyatlar" },
    "7820": { nomi: "Uzoq muddatli qarzlar", turi: "P", bolim: "Uzoq muddatli majburiyatlar" },

    // 8300..8700 Xususiy kapital
    "8310": { nomi: "Oddiy aksiyalar", turi: "P", bolim: "Xususiy kapital" },
    "8320": { nomi: "Imtiyozli aksiyalar", turi: "P", bolim: "Xususiy kapital" },
    "8330": { nomi: "Pay va ulushlar (Ustav kapitali)", turi: "P", bolim: "Xususiy kapital" },
    "8410": { nomi: "Qo'shilgan kapital", turi: "P", bolim: "Xususiy kapital" },
    "8510": { nomi: "Mulkni qayta baholash bo'yicha tuzatishlar", turi: "P", bolim: "Xususiy kapital" },
    "8520": { nomi: "Zaxira kapitali", turi: "P", bolim: "Xususiy kapital" },
    "8710": { nomi: "Hisobot davrining taqsimlanmagan foydasi (qoplanmagan zarari)", turi: "P", bolim: "Xususiy kapital" },
    "8720": { nomi: "O'tgan yillarning taqsimlanmagan foydasi (qoplanmagan zarari)", turi: "P", bolim: "Xususiy kapital" },

    // 9000..9900 Daromadlar va Xarajatlar
    "9010": { nomi: "Tayyor mahsulotlarni sotishdan daromadlar", turi: "P", bolim: "Daromadlar" },
    "9020": { nomi: "Tovarlarni sotishdan daromadlar", turi: "P", bolim: "Daromadlar" },
    "9030": { nomi: "Ishlar bajarish va xizmatlar ko'rsatishdan daromadlar", turi: "P", bolim: "Daromadlar" },
    "9110": { nomi: "Sotilgan tayyor mahsulotlarning tannarxi", turi: "A", bolim: "Tannarx" },
    "9120": { nomi: "Sotilgan tovarlarning tannarxi", turi: "A", bolim: "Tannarx" },
    "9130": { nomi: "Bajarilgan ish va ko'rsatilgan xizmatlar tannarxi", turi: "A", bolim: "Tannarx" },
    "9410": { nomi: "Sotish xarajatlari (marketing, transport)", turi: "A", bolim: "Davr xarajatlari" },
    "9420": { nomi: "Ma'muriy xarajatlar", turi: "A", bolim: "Davr xarajatlari" },
    "9430": { nomi: "Boshqa operatsion xarajatlar (bank xizmati, jarimalar)", turi: "A", bolim: "Davr xarajatlari" },
    "9510": { nomi: "Foizlar ko'rinishidagi daromadlar", turi: "P", bolim: "Moliyaviy daromadlar" },
    "9520": { nomi: "Dividendlar ko'rinishidagi daromadlar", turi: "P", bolim: "Moliyaviy daromadlar" },
    "9540": { nomi: "Valyutalar kurs farqidan daromadlar", turi: "P", bolim: "Moliyaviy daromadlar" },
    "9610": { nomi: "Foizlar ko'rinishidagi xarajatlar", turi: "A", bolim: "Moliyaviy xarajatlar" },
    "9640": { nomi: "Valyutalar kurs farqidan zararlar", turi: "A", bolim: "Moliyaviy xarajatlar" },
    "9910": { nomi: "Yakuniy moliyaviy natija (Foyda va zararlar)", turi: "P", bolim: "Moliyaviy natija" }
  };

  window.BUXGALTERIYA_SCHYOTLAR_FULL = BUXGALTERIYA_SCHYOTLAR_FULL;

  function getSchyotNomi(code) {
    if (!code) return "";
    const clean = String(code).trim();
    if (clean === "9999") return "Barcha hisoblar bo'yicha";
    if (BUXGALTERIYA_SCHYOTLAR_FULL[clean]) return BUXGALTERIYA_SCHYOTLAR_FULL[clean].nomi;
    if (window.BUXGALTERIYA_SCHYOTLAR && window.BUXGALTERIYA_SCHYOTLAR[clean]) {
      return window.BUXGALTERIYA_SCHYOTLAR[clean];
    }
    return "Noma'lum schyot";
  }

  function getSchyotTuri(code) {
    const clean = String(code).trim();
    if (BUXGALTERIYA_SCHYOTLAR_FULL[clean]) return BUXGALTERIYA_SCHYOTLAR_FULL[clean].turi;
    if (/^(01|04|08|10|20|21|23|25|28|29|40|41|42|43|44|45|48|50|51|52|55|57|58|91|94|96)/.test(clean)) return "A";
    if (/^(02|05)/.test(clean)) return "KA";
    return "P";
  }

  /* --------------------------------------------------------------------------
     2. MA'LUMOTLARNI SAQLASH VA YUKLASH (STORAGE)
     -------------------------------------------------------------------------- */

  function getFirmaKey(prefix) {
    const fId = (typeof ACTIVE_FIRMA_ID !== "undefined" && ACTIVE_FIRMA_ID) ? ACTIVE_FIRMA_ID : "default";
    return `${prefix}_${fId}`;
  }

  function initBuxgalteriyaStore() {
    if (typeof STORE === "undefined") return;
    if (!Array.isArray(STORE.operatsiyalar)) STORE.operatsiyalar = [];
    if (!STORE.boshlangichQoldiqlar || typeof STORE.boshlangichQoldiqlar !== "object") STORE.boshlangichQoldiqlar = {};

    try {
      const savedOps = localStorage.getItem(getFirmaKey("forget_operatsiyalar"));
      if (savedOps) {
        const parsed = JSON.parse(savedOps);
        if (Array.isArray(parsed) && parsed.length > 0) {
          STORE.operatsiyalar = parsed;
        }
      }
    } catch (_) {}

    try {
      const savedQoldiq = localStorage.getItem(getFirmaKey("forget_boshlangich"));
      if (savedQoldiq) {
        const parsedQ = JSON.parse(savedQoldiq);
        if (parsedQ && typeof parsedQ === "object") {
          STORE.boshlangichQoldiqlar = parsedQ;
        }
      }
    } catch (_) {}
  }

  function saveBuxgalteriyaStore() {
    if (typeof STORE === "undefined") return;
    try {
      localStorage.setItem(getFirmaKey("forget_operatsiyalar"), JSON.stringify(STORE.operatsiyalar || []));
      localStorage.setItem(getFirmaKey("forget_boshlangich"), JSON.stringify(STORE.boshlangichQoldiqlar || {}));
    } catch (e) {
      console.warn("Buxgalteriya ma'lumotlarini saqlashda xatolik:", e);
    }
    if (typeof updateNavBadges === "function") updateNavBadges();
  }

  /* --------------------------------------------------------------------------
     3. BARCHA OPERATSIYALARNI YIG'ISH (UNIFIED POSTING ENGINE)
     -------------------------------------------------------------------------- */

  function getAllBuxgalteriyaOperatsiyalar() {
    initBuxgalteriyaStore();
    const list = [];

    // 1. Manual va Exceldan import qilingan operatsiyalar
    if (Array.isArray(STORE.operatsiyalar)) {
      STORE.operatsiyalar.forEach((op) => {
        list.push({
          id: op.id || ("op_" + Math.random().toString(36).slice(2, 9)),
          sana: op.sana || "",
          oy: op.oy || (op.sana ? parseInt(op.sana.split("-")[1], 10) : 1),
          hujjat: op.hujjat || "",
          mazmuni: op.mazmuni || "",
          summa: toNum(op.summa),
          dt: String(op.dt || "").trim(),
          kt: String(op.kt || "").trim(),
          izoh: op.izoh || "",
          isManual: true,
          source: op.source || "manual"
        });
      });
    }

    // 2. Faktura kirim (avtomatik provodkalar)
    if (Array.isArray(STORE.kirim)) {
      STORE.kirim.forEach((r) => {
        if (!isValidStatus(r.status)) return;
        const qqsSiz = toNum(r.summaQQSsiz);
        const qqs = toNum(r.qqsSumma);
        const invSch = (r.turi === "xomashyo" || (r.izoh && /xomashyo|material/i.test(r.izoh))) ? "1010" : "2910";
        const sana = r.sana || "";
        const oy = sana ? parseInt(sana.split("-")[1], 10) : 1;
        const docName = `Faktura #${r.fakturaRaqami || r.id}`;

        if (qqsSiz > 0) {
          list.push({
            id: `auto_kirim_${r.id}_inv`,
            sana, oy,
            hujjat: docName,
            mazmuni: `${r.kontragentNomi || "Yetkazib beruvchi"}dan moddiy zaxiralar kirimi (QQSsiz)`,
            summa: qqsSiz,
            dt: invSch,
            kt: "6010",
            izoh: "Avtomatik kirim faktura",
            isManual: false,
            source: "kirim",
            rawId: r.id
          });
        }
        if (qqs > 0) {
          list.push({
            id: `auto_kirim_${r.id}_qqs`,
            sana, oy,
            hujjat: docName,
            mazmuni: `Fakturadan hisobga olinadigan QQS summasi`,
            summa: qqs,
            dt: "4410",
            kt: "6010",
            izoh: "Avtomatik kirim QQS",
            isManual: false,
            source: "kirim",
            rawId: r.id
          });
        }
      });
    }

    // 3. Faktura chiqim (avtomatik provodkalar)
    if (Array.isArray(STORE.chiqim)) {
      STORE.chiqim.forEach((r) => {
        if (!isValidStatus(r.status)) return;
        const qqsSiz = toNum(r.summaQQSsiz);
        const qqs = toNum(r.qqsSumma);
        const revSch = r.tovarsiz ? "9030" : "9010";
        const sana = r.sana || "";
        const oy = sana ? parseInt(sana.split("-")[1], 10) : 1;
        const docName = `Faktura #${r.fakturaRaqami || r.id}`;

        if (qqsSiz > 0) {
          list.push({
            id: `auto_chiqim_${r.id}_rev`,
            sana, oy,
            hujjat: docName,
            mazmuni: `${r.kontragentNomi || "Xaridor"}ga mahsulot/xizmat sotishdan daromad (QQSsiz)`,
            summa: qqsSiz,
            dt: "4010",
            kt: revSch,
            izoh: "Avtomatik chiqim faktura",
            isManual: false,
            source: "chiqim",
            rawId: r.id
          });
        }
        if (qqs > 0) {
          list.push({
            id: `auto_chiqim_${r.id}_qqs`,
            sana, oy,
            hujjat: docName,
            mazmuni: `Sotuvdan byudjetga hisoblangan QQS`,
            summa: qqs,
            dt: "4010",
            kt: "6413",
            izoh: "Avtomatik chiqim QQS",
            isManual: false,
            source: "chiqim",
            rawId: r.id
          });
        }
      });
    }

    // 4. Bank harakati (avtomatik provodkalar)
    if (Array.isArray(STORE.bank)) {
      STORE.bank.forEach((b) => {
        const kirim = toNum(b.kirim);
        const chiqim = toNum(b.chiqim);
        const isValyuta = b.schyot === "5210" || b.valyuta;
        const bSch = isValyuta ? "5210" : "5110";
        const sana = b.sana || "";
        const oy = sana ? parseInt(sana.split("-")[1], 10) : 1;
        const docName = `To'lov topsh. #${b.hujjatRaqami || b.id}`;
        const desc = b.tavsif || b.kontragent || "Bank to'lovi";

        if (kirim > 0) {
          list.push({
            id: `auto_bank_${b.id}_in`,
            sana, oy,
            hujjat: docName,
            mazmuni: `${b.kontragent || "Mijoz"}dan bank hisobiga to'lov tushishi: ${desc}`,
            summa: kirim,
            dt: bSch,
            kt: "4010",
            izoh: "Avtomatik bank kirim",
            isManual: false,
            source: "bank",
            rawId: b.id
          });
        } else if (chiqim > 0) {
          let dtSch = "6010";
          if (/oylik|ish\s*haqi|maosh|avans\s*xodim/i.test(desc)) dtSch = "6710";
          else if (/soliq|qqs|ndfl|foyda|byudjet|pensiya|inps/i.test(desc)) dtSch = "6411";
          else if (/ijtimoiy\s*soliq/i.test(desc)) dtSch = "6520";
          else if (/bank\s*xizmat|komissiya|obslujivaniye/i.test(desc)) dtSch = "9430";
          else if (/kredit|ssuda|foiz/i.test(desc)) dtSch = "7810";

          list.push({
            id: `auto_bank_${b.id}_out`,
            sana, oy,
            hujjat: docName,
            mazmuni: `Bankdan to'lov o'tkazish (${b.kontragent || ""}): ${desc}`,
            summa: chiqim,
            dt: dtSch,
            kt: bSch,
            izoh: "Avtomatik bank chiqim",
            isManual: false,
            source: "bank",
            rawId: b.id
          });
        }
      });
    }

    // 5. Kassa operatsiyalari (avtomatik provodkalar)
    if (Array.isArray(STORE.kassa)) {
      STORE.kassa.forEach((k) => {
        const kirim = toNum(k.kirim);
        const chiqim = toNum(k.chiqim);
        const sana = k.sana || "";
        const oy = sana ? parseInt(sana.split("-")[1], 10) : 1;
        const docName = `${k.turi === "kirim" ? "PKO" : "RKO"} #${k.raqam || k.id}`;
        const desc = k.mazmuni || k.izoh || k.kontragent || "Kassa harakati";

        if (kirim > 0) {
          let ktSch = "4010";
          if (/bank|inkassatsiya|hisob\s*raqam/i.test(desc)) ktSch = "5110";
          list.push({
            id: `auto_kassa_${k.id}_in`,
            sana, oy,
            hujjat: docName,
            mazmuni: `Kassaga naqd pul kirimi: ${desc}`,
            summa: kirim,
            dt: "5010",
            kt: ktSch,
            izoh: "Avtomatik kassa PKO",
            isManual: false,
            source: "kassa",
            rawId: k.id
          });
        } else if (chiqim > 0) {
          let dtSch = "6010";
          if (/oylik|ish\s*haqi|maosh|avans/i.test(desc)) dtSch = "6710";
          else if (/xizmat|kanselyariya|mayda\s*xarajat/i.test(desc)) dtSch = "9420";
          else if (/bank|inkassatsiya/i.test(desc)) dtSch = "5110";
          list.push({
            id: `auto_kassa_${k.id}_out`,
            sana, oy,
            hujjat: docName,
            mazmuni: `Kassadan naqd pul chiqimi: ${desc}`,
            summa: chiqim,
            dt: dtSch,
            kt: "5010",
            izoh: "Avtomatik kassa RKO",
            isManual: false,
            source: "kassa",
            rawId: k.id
          });
        }
      });
    }

    // 6. Ish haqi hisoboti (avtomatik provodkalar)
    if (Array.isArray(STORE.ishHaqi)) {
      STORE.ishHaqi.forEach((w) => {
        const oylik = toNum(w.oylik);
        if (oylik <= 0) return;
        const sana = w.sana || (w.oy ? `${w.oy}-28` : "");
        const oy = sana ? parseInt(sana.split("-")[1], 10) : 1;
        const docName = `Ish haqi vedomosti #${w.oy || ""}`;
        const xodim = w.xodim || "Xodim";

        // Hisoblangan maosh: Dt 2010 (yoki 9420) - Kt 6710
        const expSch = (w.lavozim && /ishchi|usta|haydovchi|mexanik/i.test(w.lavozim)) ? "2010" : "9420";
        list.push({
          id: `auto_ishhaqi_${w.id}_sal`,
          sana, oy,
          hujjat: docName,
          mazmuni: `${xodim}ga hisoblangan oylik ish haqi`,
          summa: oylik,
          dt: expSch,
          kt: "6710",
          izoh: "Avtomatik ish haqi",
          isManual: false,
          source: "ishHaqi",
          rawId: w.id
        });

        // JShDS (NDFL) 12% dan 0.1% INPS ayirib: Dt 6710 - Kt 6412
        const ndfl = toNum(w.ndfl) || Math.round(oylik * 0.12);
        const inps = toNum(w.inps) || Math.round(oylik * 0.001);
        const ndflSof = Math.max(0, ndfl - inps);
        if (ndflSof > 0) {
          list.push({
            id: `auto_ishhaqi_${w.id}_ndfl`,
            sana, oy,
            hujjat: docName,
            mazmuni: `${xodim} maoshidan ushlab qolingan daromad solig'i (NDFL 11.9%)`,
            summa: ndflSof,
            dt: "6710",
            kt: "6412",
            izoh: "Avtomatik NDFL",
            isManual: false,
            source: "ishHaqi",
            rawId: w.id
          });
        }
        if (inps > 0) {
          list.push({
            id: `auto_ishhaqi_${w.id}_inps`,
            sana, oy,
            hujjat: docName,
            mazmuni: `${xodim} maoshidan Xalq bankiga INPS badali (0.1%)`,
            summa: inps,
            dt: "6710",
            kt: "6530",
            izoh: "Avtomatik INPS",
            isManual: false,
            source: "ishHaqi",
            rawId: w.id
          });
        }
        // Ijtimoiy soliq 12%: Dt 2010/9420 - Kt 6520
        const ijSoliq = toNum(w.ijtimoiySoliq) || Math.round(oylik * 0.12);
        if (ijSoliq > 0) {
          list.push({
            id: `auto_ishhaqi_${w.id}_soc`,
            sana, oy,
            hujjat: docName,
            mazmuni: `${xodim} maoshiga hisoblangan ijtimoiy soliq (12%)`,
            summa: ijSoliq,
            dt: expSch,
            kt: "6520",
            izoh: "Avtomatik ijtimoiy soliq",
            isManual: false,
            source: "ishHaqi",
            rawId: w.id
          });
        }
      });
    }

    // Sanasi bo'yicha saralash
    list.sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));
    return list;
  }

  window.getAllBuxgalteriyaOperatsiyalar = getAllBuxgalteriyaOperatsiyalar;
  window.getBuxgalteriyaOperatsiyalarCount = function () {
    return getAllBuxgalteriyaOperatsiyalar().length;
  };

  /* --------------------------------------------------------------------------
     4. SCHYOTLAR BO'YICHA AYLANMA VA QOLDIQ HISOB-KITOBI (OSV ENGINE)
     -------------------------------------------------------------------------- */

  function computeSchyotAylanma(targetSchyot, filterOy, filterChorak) {
    const isAll = !targetSchyot || targetSchyot === "9999";
    const allOps = getAllBuxgalteriyaOperatsiyalar();
    const qoldiqlar = STORE.boshlangichQoldiqlar || {};

    let startMonth = 1;
    let endMonth = 12;

    if (filterOy && filterOy !== "all") {
      startMonth = parseInt(filterOy, 10);
      endMonth = startMonth;
    } else if (filterChorak && filterChorak !== "all") {
      const q = parseInt(filterChorak, 10);
      startMonth = (q - 1) * 3 + 1;
      endMonth = q * 3;
    }

    // 1. Davr boshiga boshlang'ich qoldiqni hisoblash
    let boshlangichDt = 0;
    let boshlangichKt = 0;

    if (!isAll) {
      const initQ = qoldiqlar[targetSchyot] || { dt: 0, kt: 0 };
      boshlangichDt = toNum(initQ.dt);
      boshlangichKt = toNum(initQ.kt);

      // Agar davr 1-oydan keyin boshlansa, oldingi oylar aylanmasini qo'shamiz
      if (startMonth > 1) {
        allOps.forEach((op) => {
          if (op.oy < startMonth) {
            if (op.dt === targetSchyot) boshlangichDt += op.summa;
            if (op.kt === targetSchyot) boshlangichKt += op.summa;
          }
        });
      }

      // Saldoni net holatga keltirish (Aktiv yoki Passiv bo'yicha)
      const schTuri = getSchyotTuri(targetSchyot);
      if (schTuri === "A") {
        const net = boshlangichDt - boshlangichKt;
        boshlangichDt = Math.max(0, net);
        boshlangichKt = Math.max(0, -net);
      } else {
        const net = boshlangichKt - boshlangichDt;
        boshlangichKt = Math.max(0, net);
        boshlangichDt = Math.max(0, -net);
      }
    }

    // 2. Davr ichidagi operatsiyalarni filtrlash va running balance hisoblash
    const filteredOps = allOps.filter((op) => {
      if (op.oy < startMonth || op.oy > endMonth) return false;
      if (isAll) return true;
      return op.dt === targetSchyot || op.kt === targetSchyot;
    });

    let currentBalance = !isAll ? (getSchyotTuri(targetSchyot) === "A" ? (boshlangichDt - boshlangichKt) : (boshlangichKt - boshlangichDt)) : 0;
    let oborotDt = 0;
    let oborotKt = 0;

    const rows = filteredOps.map((op, idx) => {
      let isDt = isAll || op.dt === targetSchyot;
      let isKt = isAll || op.kt === targetSchyot;

      if (!isAll) {
        const schTuri = getSchyotTuri(targetSchyot);
        if (schTuri === "A") {
          if (op.dt === targetSchyot) {
            oborotDt += op.summa;
            currentBalance += op.summa;
          }
          if (op.kt === targetSchyot) {
            oborotKt += op.summa;
            currentBalance -= op.summa;
          }
        } else {
          if (op.kt === targetSchyot) {
            oborotKt += op.summa;
            currentBalance += op.summa;
          }
          if (op.dt === targetSchyot) {
            oborotDt += op.summa;
            currentBalance -= op.summa;
          }
        }
      } else {
        oborotDt += op.summa;
        oborotKt += op.summa;
      }

      const qoldiqDt = !isAll ? (currentBalance >= 0 ? currentBalance : 0) : 0;
      const qoldiqKt = !isAll ? (currentBalance < 0 ? -currentBalance : 0) : 0;

      return {
        tr: idx + 1,
        sana: op.sana,
        oy: op.oy,
        hujjat: op.hujjat,
        mazmuni: op.mazmuni,
        summa: op.summa,
        dt: op.dt,
        kt: op.kt,
        qoldiqDt,
        qoldiqKt,
        isManual: op.isManual,
        source: op.source,
        id: op.id
      };
    });

    // 3. Yakuniy qoldiq
    let oxirgiDt = 0;
    let oxirgiKt = 0;

    if (!isAll) {
      const schTuri = getSchyotTuri(targetSchyot);
      if (schTuri === "A") {
        const net = (boshlangichDt + oborotDt) - (boshlangichKt + oborotKt);
        oxirgiDt = Math.max(0, net);
        oxirgiKt = Math.max(0, -net);
      } else {
        const net = (boshlangichKt + oborotKt) - (boshlangichDt + oborotDt);
        oxirgiKt = Math.max(0, net);
        oxirgiDt = Math.max(0, -net);
      }
    }

    return {
      targetSchyot,
      isAll,
      startMonth,
      endMonth,
      boshlangichDt,
      boshlangichKt,
      oborotDt,
      oborotKt,
      oxirgiDt,
      oxirgiKt,
      rows
    };
  }

  window.computeSchyotAylanma = computeSchyotAylanma;

  /* --------------------------------------------------------------------------
     5. SHAXMATKA VEDOMOSTI MATRITSASI (CHESSBOARD MATRIX)
     -------------------------------------------------------------------------- */

  function computeShaxmatka(filterOy) {
    const allOps = getAllBuxgalteriyaOperatsiyalar();
    const ops = (filterOy && filterOy !== "all") ? allOps.filter((o) => o.oy === parseInt(filterOy, 10)) : allOps;

    const dtSet = new Set();
    const ktSet = new Set();
    const matrix = {}; // [dt][kt] = sum
    const dtTotals = {};
    const ktTotals = {};
    let grandTotal = 0;

    ops.forEach((op) => {
      const dt = op.dt || "Noma'lum";
      const kt = op.kt || "Noma'lum";
      const sum = toNum(op.summa);
      if (sum <= 0) return;

      dtSet.add(dt);
      ktSet.add(kt);

      if (!matrix[dt]) matrix[dt] = {};
      matrix[dt][kt] = (matrix[dt][kt] || 0) + sum;

      dtTotals[dt] = (dtTotals[dt] || 0) + sum;
      ktTotals[kt] = (ktTotals[kt] || 0) + sum;
      grandTotal += sum;
    });

    const dtAccounts = Array.from(dtSet).sort();
    const ktAccounts = Array.from(ktSet).sort();

    return {
      filterOy,
      dtAccounts,
      ktAccounts,
      matrix,
      dtTotals,
      ktTotals,
      grandTotal,
      opsCount: ops.length
    };
  }

  window.computeShaxmatka = computeShaxmatka;

  /* --------------------------------------------------------------------------
     6. BOSH KITOB (GLAVNAYA KNIGA)
     -------------------------------------------------------------------------- */

  function computeBoshKitob(targetSchyot) {
    const allOps = getAllBuxgalteriyaOperatsiyalar();
    const schOps = allOps.filter((o) => o.dt === targetSchyot || o.kt === targetSchyot);
    const corrSet = new Set();

    // 12 oylik aylanmalar [corrSchyot][oy] = { dtSum, ktSum }
    const monthsData = {};

    schOps.forEach((op) => {
      const isDt = op.dt === targetSchyot;
      const corr = isDt ? op.kt : op.dt;
      if (!corr) return;
      corrSet.add(corr);

      if (!monthsData[corr]) {
        monthsData[corr] = {};
        for (let m = 1; m <= 12; m++) monthsData[corr][m] = { dt: 0, kt: 0 };
      }

      if (isDt) {
        monthsData[corr][op.oy].dt += op.summa;
      } else {
        monthsData[corr][op.oy].kt += op.summa;
      }
    });

    const corrAccounts = Array.from(corrSet).sort();
    return {
      targetSchyot,
      corrAccounts,
      monthsData,
      totalOps: schOps.length
    };
  }

  window.computeBoshKitob = computeBoshKitob;

  /* --------------------------------------------------------------------------
     7. EXCEL 20.XLSX IMPORT VA EKSPORT ENGINE
     -------------------------------------------------------------------------- */

  function importUzbBuxgalteriyaXlsx(wb) {
    if (!wb || !wb.SheetNames) throw new Error("Yaroqsiz Excel kitobi!");

    let companyName = "";
    let hisobotYili = 2019;
    const newBoshlangich = {};
    const newOperatsiyalar = [];

    // 1. "Маълумот" varag'ini o'qish
    const malumotSheetName = wb.SheetNames.find((n) => /маълумот|malumot/i.test(n));
    if (malumotSheetName) {
      const ws = wb.Sheets[malumotSheetName];
      const c2 = ws["C2"] ? String(ws["C2"].v || "").trim() : "";
      const c3 = ws["C3"] ? parseInt(ws["C3"].v, 10) : 0;
      if (c2) companyName = c2;
      if (c3 && c3 > 2000) hisobotYili = c3;
    }

    // 2. "Йил бошига колдик" varag'ini o'qish
    const qoldiqSheetName = wb.SheetNames.find((n) => /йил.*бошига.*колдик|qoldiq/i.test(n));
    if (qoldiqSheetName) {
      const ws = wb.Sheets[qoldiqSheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      for (let i = 7; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 2) continue;
        const sch = String(r[1] || "").trim();
        const dtVal = toNum(r[4]);
        const ktVal = toNum(r[5]);
        if (sch.length >= 4 && (dtVal > 0 || ktVal > 0)) {
          newBoshlangich[sch] = { dt: dtVal, kt: ktVal };
        }
      }
    }

    // 3. 1..12 oylik jurnallarni o'qish
    for (let m = 1; m <= 12; m++) {
      const sheetName = wb.SheetNames.find((n) => String(n).trim() === String(m));
      if (!sheetName) continue;
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      for (let i = 8; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 5) continue;

        const mazmun = String(r[3] || "").trim();
        const sumVal = toNum(r[4]);
        const dtSch = String(r[5] || "").trim();
        const ktSch = String(r[6] || "").trim();

        if (mazmun.length > 0 || sumVal > 0 || dtSch.length > 0) {
          let sanaStr = "";
          const rawSana = r[1];
          if (typeof rawSana === "number" && rawSana > 30000) {
            // Excel serial date number -> YYYY-MM-DD
            const dtObj = new Date(Math.round((rawSana - 25569) * 86400 * 1000));
            sanaStr = dtObj.toISOString().slice(0, 10);
          } else if (rawSana && String(rawSana).length >= 8) {
            sanaStr = String(rawSana).trim();
          } else {
            sanaStr = `${hisobotYili}-${String(m).padStart(2, "0")}-15`;
          }

          const hujjat = String(r[2] || "").trim();

          newOperatsiyalar.push({
            id: `excel_${m}_${i}`,
            sana: sanaStr,
            oy: m,
            hujjat,
            mazmuni: mazmun,
            summa: sumVal,
            dt: dtSch,
            kt: ktSch,
            izoh: `Excel 20.xlsx (${m}-oy)`,
            isManual: true,
            source: "excel_import"
          });
        }
      }
    }

    // Dastur Store ga yozish
    initBuxgalteriyaStore();
    if (companyName && !STORE.settings.companyName) {
      STORE.settings.companyName = companyName;
    }
    STORE.boshlangichQoldiqlar = Object.assign(STORE.boshlangichQoldiqlar || {}, newBoshlangich);

    // Takror bo'lmagan operatsiyalarni qo'shish
    const existingIds = new Set((STORE.operatsiyalar || []).map((o) => o.id));
    let addedCount = 0;
    newOperatsiyalar.forEach((op) => {
      if (!existingIds.has(op.id)) {
        STORE.operatsiyalar.push(op);
        existingIds.add(op.id);
        addedCount++;
      }
    });

    saveBuxgalteriyaStore();

    return {
      companyName,
      hisobotYili,
      boshlangichCount: Object.keys(newBoshlangich).length,
      totalOpsCount: newOperatsiyalar.length,
      addedOpsCount: addedCount
    };
  }

  window.importUzbBuxgalteriyaXlsx = importUzbBuxgalteriyaXlsx;

  function exportUzbBuxgalteriyaXlsx() {
    if (typeof XLSX === "undefined") {
      toast("XLSX kutubxonasi mavjud emas!", "warn");
      return;
    }

    const allOps = getAllBuxgalteriyaOperatsiyalar();
    const wb = XLSX.utils.book_new();

    // 1. Operatsiyalar varag'i
    const opHeaders = ["T/r", "Sana", "Oy", "Birlamchi hisob hujjati", "Operatsiya mazmuni", "Summa (so'm)", "Debet", "Kredit", "Manbasi", "Izoh"];
    const opData = [opHeaders];
    allOps.forEach((op, idx) => {
      opData.push([
        idx + 1,
        op.sana,
        op.oy,
        op.hujjat,
        op.mazmuni,
        op.summa,
        op.dt,
        op.kt,
        op.source || "manual",
        op.izoh || ""
      ]);
    });
    const wsOps = XLSX.utils.aoa_to_sheet(opData);
    XLSX.utils.book_append_sheet(wb, wsOps, "Xo'jalik operatsiyalari");

    // 2. Shaxmatka varag'i
    const shx = computeShaxmatka("all");
    const shxData = [["Шахматка ведомости (Дт х Кт)", `Жами сумма: ${shx.grandTotal}`], []];
    const headerRow = ["Дебет \\ Кредит", ...shx.ktAccounts, "ЖАМИ ДЕБЕТ"];
    shxData.push(headerRow);

    shx.dtAccounts.forEach((dt) => {
      const row = [`${dt} ${getSchyotNomi(dt)}`];
      shx.ktAccounts.forEach((kt) => {
        const val = (shx.matrix[dt] && shx.matrix[dt][kt]) || 0;
        row.push(val);
      });
      row.push(shx.dtTotals[dt] || 0);
      shxData.push(row);
    });

    const bottomRow = ["ЖАМИ КРЕДИТ"];
    shx.ktAccounts.forEach((kt) => {
      bottomRow.push(shx.ktTotals[kt] || 0);
    });
    bottomRow.push(shx.grandTotal);
    shxData.push(bottomRow);

    const wsShx = XLSX.utils.aoa_to_sheet(shxData);
    XLSX.utils.book_append_sheet(wb, wsShx, "Шахматка");

    // 3. Hisoblar bo'yicha aylanma (OSV)
    const osvData = [
      ["Ҳисоблар бўйича айланма ведомости (ОСВ)", `Сана: ${todayISO()}`],
      ["Счёт", "Номи", "Бошл. Дебет", "Бошл. Кредит", "Айл. Дебет", "Айл. Кредит", "Охир. Дебет", "Охир. Кредит"]
    ];

    Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).forEach((sch) => {
      const res = computeSchyotAylanma(sch, "all");
      if (res.boshlangichDt > 0 || res.boshlangichKt > 0 || res.oborotDt > 0 || res.oborotKt > 0) {
        osvData.push([
          sch,
          getSchyotNomi(sch),
          res.boshlangichDt,
          res.boshlangichKt,
          res.oborotDt,
          res.oborotKt,
          res.oxirgiDt,
          res.oxirgiKt
        ]);
      }
    });

    const wsOsv = XLSX.utils.aoa_to_sheet(osvData);
    XLSX.utils.book_append_sheet(wb, wsOsv, "ОСВ Айланма");

    // Faylni yuklab berish
    const fName = `FORGET_Buxgalteriya_kitobi_${todayISO()}.xlsx`;
    XLSX.writeFile(wb, fName);
    toast(`${fName} muvaffaqiyatli eksport qilindi!`, "ok");
  }

  window.exportUzbBuxgalteriyaXlsx = exportUzbBuxgalteriyaXlsx;

  /* --------------------------------------------------------------------------
     8. 1-KLIKDA NAMUNAVIY BAZANI YUKLASH (PRESET LOADER)
     -------------------------------------------------------------------------- */

  function loadBuxgalteriyaPreset() {
    if (!window.BUXGALTERIYA_20_PRESET) {
      toast("Namunaviy baza ma'lumotlari topilmadi!", "warn");
      return;
    }
    const preset = window.BUXGALTERIYA_20_PRESET;
    initBuxgalteriyaStore();

    if (preset.companyName) {
      STORE.settings.companyName = preset.companyName;
    }
    if (preset.boshlangichQoldiqlar) {
      STORE.boshlangichQoldiqlar = Object.assign(STORE.boshlangichQoldiqlar || {}, preset.boshlangichQoldiqlar);
    }
    if (Array.isArray(preset.operatsiyalar)) {
      const existingIds = new Set((STORE.operatsiyalar || []).map((o) => o.id));
      let added = 0;
      preset.operatsiyalar.forEach((op) => {
        if (!existingIds.has(op.id)) {
          STORE.operatsiyalar.push(op);
          existingIds.add(op.id);
          added++;
        }
      });
      saveBuxgalteriyaStore();
      toast(`"Бухгалтерская программа 20.xlsx" bazasidan ${added} ta operatsiya muvaffaqiyatli yuklandi!`, "ok");
      if (CURRENT_PAGE === "operatsiyalar" || CURRENT_PAGE === "aylanma" || CURRENT_PAGE === "shaxmatka") {
        PAGES[CURRENT_PAGE].render();
      } else {
        navigate("operatsiyalar");
      }
    }
  }

  window.loadBuxgalteriyaPreset = loadBuxgalteriyaPreset;

  /* --------------------------------------------------------------------------
     8.5 YAGONA BUXGALTERIYA ISH PANELI (WORKSTATION) VA DASHBOARD XULOSASI
     -------------------------------------------------------------------------- */

  function getBuxgalteriyaSummary() {
    initBuxgalteriyaStore();
    const ops = getAllBuxgalteriyaOperatsiyalar();
    let jamiDt = 0;
    let jamiKt = 0;
    ops.forEach((op) => {
      jamiDt += toNum(op.summa);
      jamiKt += toNum(op.summa);
    });

    const b5110 = computeSchyotAylanma("5110", "all");
    const b5010 = computeSchyotAylanma("5010", "all");
    const b4010 = computeSchyotAylanma("4010", "all");
    const b6010 = computeSchyotAylanma("6010", "all");
    const b2910 = computeSchyotAylanma("2910", "all");
    const b0100 = computeSchyotAylanma("0100", "all");

    const bankKassa = (b5110.oxirgiDt - b5110.oxirgiKt) + (b5010.oxirgiDt - b5010.oxirgiKt);
    const debitorlik = (b4010.oxirgiDt - b4010.oxirgiKt);
    const kreditorlik = (b6010.oxirgiKt - b6010.oxirgiDt);
    const tovarlar = (b2910.oxirgiDt - b2910.oxirgiKt);
    const mulk = (b0100.oxirgiDt - b0100.oxirgiKt);

    return {
      opsCount: ops.length,
      jamiAylanma: jamiDt,
      isBalanced: Math.abs(jamiDt - jamiKt) < 0.01,
      bankKassa,
      debitorlik,
      kreditorlik,
      tovarlar,
      mulk
    };
  }

  function renderBuxWorkstationHeader(activeTab) {
    const allOps = getAllBuxgalteriyaOperatsiyalar();
    const opsCount = allOps.length;
    return `
      <div class="bux-workstation-nav">
        <div class="bux-workstation-tabs">
          <button class="bux-wtab ${activeTab === 'operatsiyalar' ? 'active' : ''}" data-nav="operatsiyalar" title="Xo'jalik operatsiyalari jurnali (12 oylik order-jurnallar)">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-clipboard"/></svg>
            <span>Operatsiyalar jurnali</span>
            <span class="bux-wtab-badge">${opsCount}</span>
          </button>
          <button class="bux-wtab ${activeTab === 'aylanma' ? 'active' : ''}" data-nav="aylanma" title="Hisoblar bo'yicha aylanma vedomost (OSV)">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-scale"/></svg>
            <span>Schyotlar aylanmasi (OSV)</span>
          </button>
          <button class="bux-wtab ${activeTab === 'shaxmatka' ? 'active' : ''}" data-nav="shaxmatka" title="Shaxmatka va Bosh kitob (Главная книга)">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-chart"/></svg>
            <span>Shaxmatka & Bosh kitob</span>
          </button>
          <button class="bux-wtab ${activeTab === 'boshlangich' ? 'active' : ''}" data-nav="boshlangich" title="Boshlang'ich qoldiqlar (Balans nazorati)">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-wallet"/></svg>
            <span>Boshlang'ich qoldiqlar</span>
          </button>
        </div>
        <div class="bux-workstation-actions">
          <button class="btn btn-sm btn-primary" id="btnBuxQuickUnifiedExportXlsx" title="Бухгалтерская_программа_УЗБ_версия 20.xlsx andazasi bo'yicha to'liq 20 ta varaqli kitobni yuklab olish">
            <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;margin-right:4px;"><use href="#i-cloud-download"/></svg>20.xlsx Kitobini yuklash
          </button>
        </div>
      </div>
    `;
  }

  function bindBuxWorkstationEvents() {
    const btnQuickXlsx = document.getElementById("btnBuxQuickUnifiedExportXlsx");
    if (btnQuickXlsx) {
      btnQuickXlsx.addEventListener("click", () => {
        exportUzbBuxgalteriyaXlsx();
      });
    }
  }

  function renderBuxgalteriyaHub(tab = "operatsiyalar") {
    if (tab === "aylanma") return renderAylanma();
    if (tab === "shaxmatka") return renderShaxmatka();
    if (tab === "boshlangich") return renderBoshlangichQoldiqlar();
    return renderOperatsiyalar();
  }

  /* --------------------------------------------------------------------------
     9. UI SAHIFA 1: OPERATSIYALAR JURNALI (RENDER OPERATSIYALAR)
     -------------------------------------------------------------------------- */

  let SELECTED_MONTH = "all";
  let SELECTED_SCHYOT_FILTER = "";
  let SELECTED_SOURCE_FILTER = "all";
  let SEARCH_QUERY = "";

  function renderOperatsiyalar() {
    initBuxgalteriyaStore();
    const main = document.getElementById("main");
    if (!main) return;

    const allOps = getAllBuxgalteriyaOperatsiyalar();

    // Filtirlash
    const filtered = allOps.filter((op) => {
      if (SELECTED_MONTH !== "all" && op.oy !== parseInt(SELECTED_MONTH, 10)) return false;
      if (SELECTED_SCHYOT_FILTER && op.dt !== SELECTED_SCHYOT_FILTER && op.kt !== SELECTED_SCHYOT_FILTER) return false;
      if (SELECTED_SOURCE_FILTER === "manual" && !op.isManual) return false;
      if (SELECTED_SOURCE_FILTER === "auto" && op.isManual) return false;
      if (SELECTED_SOURCE_FILTER === "excel" && op.source !== "excel_import") return false;
      if (SEARCH_QUERY) {
        const q = SEARCH_QUERY.toLowerCase();
        const hay = `${op.hujjat} ${op.mazmuni} ${op.dt} ${op.kt} ${op.izoh}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Statistika
    let jamiDt = 0;
    let jamiKt = 0;
    filtered.forEach((op) => {
      jamiDt += op.summa;
      jamiKt += op.summa;
    });
    const diff = jamiDt - jamiKt;

    // Oylar tugmalari
    const months = [
      { id: "all", label: "Barchasi" },
      { id: "1", label: "1-Yan" },
      { id: "2", label: "2-Fev" },
      { id: "3", label: "3-Mar" },
      { id: "4", label: "4-Apr" },
      { id: "5", label: "5-May" },
      { id: "6", label: "6-Iyn" },
      { id: "7", label: "7-Iyl" },
      { id: "8", label: "8-Avg" },
      { id: "9", label: "9-Sen" },
      { id: "10", label: "10-Okt" },
      { id: "11", label: "11-Noy" },
      { id: "12", label: "12-Dek" }
    ];

    const monthTabsHtml = months.map((m) => {
      const activeClass = SELECTED_MONTH === m.id ? "active" : "";
      const count = m.id === "all" ? allOps.length : allOps.filter((o) => o.oy === parseInt(m.id, 10)).length;
      return `<button class="bux-tab-btn ${activeClass}" data-month="${m.id}">${m.label} <span class="bux-tab-badge">${count}</span></button>`;
    }).join("");

    // Schyotlar tanlovi
    const schyotOptions = Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).map((sch) => {
      const selected = SELECTED_SCHYOT_FILTER === sch ? "selected" : "";
      return `<option value="${sch}" ${selected}>${sch} — ${escapeHtml(BUXGALTERIYA_SCHYOTLAR_FULL[sch].nomi)}</option>`;
    }).join("");

    main.innerHTML = `
      ${renderBuxWorkstationHeader("operatsiyalar")}
      <div class="page-header">
        <div>
          <h1 class="page-title">Xo'jalik Operatsiyalari Jurnali (Order-jurnal)</h1>
          <p class="page-desc">O'zbekiston BHMS 21 hisoblar rejasi bo'yicha birlamchi hujjatlar va erkin buxgalteriya provodkalarining yagona jurnali (Excel 20.xlsx andazasi).</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnYangiOperatsiya">+ Yangi operatsiya</button>
          <label class="btn" style="cursor:pointer;" title="Бухгалтерская_программа_УЗБ_версия 20.xlsx faylini to'g'ridan-to'g'ri yuklash">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-in"/></svg> Excel Import (20.xlsx)
            <input type="file" id="inputExcelBuxImport" accept=".xlsx,.xls" style="display:none;">
          </label>
          <button class="btn" id="btnLoadPreset" title="Мохларойим Ривож Транс МЧЖ 2019-yil 170 ta operatsiyasini yuklash">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-package"/></svg> Namuna bazani yuklash
          </button>
          <button class="btn" id="btnExcelExportBux" title="Shu andaza bo'yicha Excelga eksport">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-out"/></svg> Excel Eksport
          </button>
          <button class="btn" id="btnPrintOperatsiyalarPdf" title="Chop etish yoki PDF sifatida saqlash">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg> PDF (chop etish)
          </button>
        </div>
      </div>

      <!-- Oylik tablar (Order-jurnallar 1..12) -->
      <div class="bux-month-tabs" id="buxMonthTabs">
        ${monthTabsHtml}
      </div>

      <!-- KPI Kartalari -->
      <div class="grid grid-4" style="margin-bottom:18px;">
        <div class="card stat-card">
          <div class="stat-label">Jami operatsiyalar</div>
          <div class="stat-value">${formatSum(filtered.length)} ta</div>
          <div class="stat-sub">Jami mavjud: ${allOps.length} ta</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Jami Debet aylanma</div>
          <div class="stat-value pos">${formatSum(jamiDt)} so'm</div>
          <div class="stat-sub">Dt schyotlar bo'yicha</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Jami Kredit aylanma</div>
          <div class="stat-value" style="color:var(--accent);">${formatSum(jamiKt)} so'm</div>
          <div class="stat-sub">Kt schyotlar bo'yicha</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Balans muvozanati</div>
          <div class="stat-value ${diff === 0 ? "pos" : "neg"}">${diff === 0 ? "0 so'm (OK)" : formatSum(diff) + " so'm"}</div>
          <div class="stat-sub">${diff === 0 ? "Dt = Kt muvozanatda" : "Diqqat: Farq mavjud!"}</div>
        </div>
      </div>

      <!-- Filtrlar paneli -->
      <div class="bux-filter-bar">
        <div class="bux-filter-group">
          <select id="selSchyotFilter" class="select" style="min-width:240px;">
            <option value="">Barcha schyotlar (Dt / Kt)</option>
            ${schyotOptions}
          </select>

          <select id="selSourceFilter" class="select">
            <option value="all" ${SELECTED_SOURCE_FILTER === "all" ? "selected" : ""}>Barcha manbalar</option>
            <option value="manual" ${SELECTED_SOURCE_FILTER === "manual" ? "selected" : ""}>Qo'lda kiritilgan</option>
            <option value="excel" ${SELECTED_SOURCE_FILTER === "excel" ? "selected" : ""}>Excel import (20.xlsx)</option>
            <option value="auto" ${SELECTED_SOURCE_FILTER === "auto" ? "selected" : ""}>Birlamchi hujjatlardan</option>
          </select>
        </div>

        <div class="bux-filter-group" style="flex:1; max-width:340px;">
          <input type="text" id="inputSearchOps" class="search-input" style="width:100%;" placeholder="Hujjat, mazmuni, schyot qidirish…" value="${escapeHtml(SEARCH_QUERY)}">
        </div>
      </div>

      <!-- Jadval -->
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:50px;">T/r</th>
              <th style="width:95px;">Sana</th>
              <th style="width:50px;">Oy</th>
              <th style="min-width:180px;">Birlamchi hisob hujjati</th>
              <th style="min-width:260px;">Operatsiyaning mazmuni</th>
              <th style="width:140px;text-align:right;">Summa (so'm)</th>
              <th style="width:90px;text-align:center;">Debet (Dt)</th>
              <th style="width:90px;text-align:center;">Kredit (Kt)</th>
              <th style="width:110px;">Manbasi</th>
              <th style="width:70px;text-align:center;">Amal</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length > 0 ? filtered.map((op, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(op.sana)}</td>
                <td style="text-align:center;font-weight:600;">${op.oy}</td>
                <td><strong>${escapeHtml(op.hujjat || "—")}</strong></td>
                <td>${escapeHtml(op.mazmuni || "—")}</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:700;">${formatSum(op.summa)}</td>
                <td style="text-align:center;">
                  <span class="bux-running-dt" title="${escapeHtml(getSchyotNomi(op.dt))}">${escapeHtml(op.dt)}</span>
                </td>
                <td style="text-align:center;">
                  <span class="bux-running-kt" title="${escapeHtml(getSchyotNomi(op.kt))}">${escapeHtml(op.kt)}</span>
                </td>
                <td>
                  ${op.source === "excel_import"
                    ? `<span class="bux-tag-excel">Excel 20.xlsx</span>`
                    : op.isManual
                      ? `<span class="bux-tag-manual">Qo'lda</span>`
                      : `<span class="bux-tag-auto">${escapeHtml(op.source || "Avto")}</span>`}
                </td>
                <td style="text-align:center;">
                  ${op.isManual ? `
                    <button class="icon-btn btn-del-op" data-id="${escapeHtml(op.id)}" title="O'chirish" style="color:var(--danger);">
                      <svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg>
                    </button>
                  ` : `
                    <button class="icon-btn" title="Birlamchi hujjatni ochish" onclick="navigate('${op.source}')">
                      <svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg>
                    </button>
                  `}
                </td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="10" class="empty-state" style="padding:40px;text-align:center;color:var(--text-faint);">
                  Tanlangan parametrlar bo'yicha operatsiyalar topilmadi.
                  <br><br>
                  <button class="btn btn-primary" id="btnEmptyPresetLoad">+ Namunaviy bazani yuklash (170 ta provodka)</button>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;

    // Event listenerlar
    const monthTabBtns = main.querySelectorAll(".bux-tab-btn");
    monthTabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        SELECTED_MONTH = btn.getAttribute("data-month");
        renderOperatsiyalar();
      });
    });

    const selSch = document.getElementById("selSchyotFilter");
    if (selSch) {
      selSch.addEventListener("change", (e) => {
        SELECTED_SCHYOT_FILTER = e.target.value;
        renderOperatsiyalar();
      });
    }

    const selSrc = document.getElementById("selSourceFilter");
    if (selSrc) {
      selSrc.addEventListener("change", (e) => {
        SELECTED_SOURCE_FILTER = e.target.value;
        renderOperatsiyalar();
      });
    }

    const inputSearch = document.getElementById("inputSearchOps");
    if (inputSearch) {
      inputSearch.addEventListener("input", (e) => {
        SEARCH_QUERY = e.target.value;
        renderOperatsiyalar();
      });
    }

    const btnYangi = document.getElementById("btnYangiOperatsiya");
    if (btnYangi) btnYangi.addEventListener("click", openYangiOperatsiyaModal);

    const btnPreset = document.getElementById("btnLoadPreset");
    if (btnPreset) btnPreset.addEventListener("click", loadBuxgalteriyaPreset);

    const btnEmptyPreset = document.getElementById("btnEmptyPresetLoad");
    if (btnEmptyPreset) btnEmptyPreset.addEventListener("click", loadBuxgalteriyaPreset);

    const btnExport = document.getElementById("btnExcelExportBux");
    if (btnExport) btnExport.addEventListener("click", exportUzbBuxgalteriyaXlsx);

    const btnPrintOps = document.getElementById("btnPrintOperatsiyalarPdf");
    if (btnPrintOps) btnPrintOps.addEventListener("click", () => printOperatsiyalarPdf(filtered, SELECTED_MONTH));

    const fileInput = document.getElementById("inputExcelBuxImport");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: "array" });
            const res = importUzbBuxgalteriyaXlsx(wb);
            toast(`Excel import yakunlandi: ${res.addedOpsCount} ta yangi operatsiya, ${res.boshlangichCount} ta boshlang'ich qoldiq yuklandi!`, "ok");
            renderOperatsiyalar();
          } catch (err) {
            toast(`Excel importda xatolik: ${err.message}`, "warn");
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    // O'chirish tugmalari
    const delBtns = main.querySelectorAll(".btn-del-op");
    delBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const opId = btn.getAttribute("data-id");
        if (!confirm("Ushbu buxgalteriya operatsiyasini o'chirishni tasdiqlaysizmi?")) return;
        STORE.operatsiyalar = (STORE.operatsiyalar || []).filter((o) => o.id !== opId);
        saveBuxgalteriyaStore();
        toast("Operatsiya muvaffaqiyatli o'chirildi", "ok");
        renderOperatsiyalar();
      });
    });

    bindBuxWorkstationEvents();
  }

  window.renderOperatsiyalar = renderOperatsiyalar;

  /* --------------------------------------------------------------------------
     10. MODAL: YANGI BUXGALTERIYA OPERATSIYASI QO'SHISH
     -------------------------------------------------------------------------- */

  function openYangiOperatsiyaModal() {
    const schyotOptions = Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).map((sch) => {
      return `<option value="${sch}">${sch} — ${escapeHtml(BUXGALTERIYA_SCHYOTLAR_FULL[sch].nomi)}</option>`;
    }).join("");

    const html = `
      <div class="modal-box" style="max-width:540px;">
        <div class="modal-head">
          <h2 class="modal-title">+ Yangi Buxgalteriya Operatsiyasi (Dt / Kt)</h2>
          <button class="modal-close" id="modalCloseBtn">&times;</button>
        </div>
        <form id="formYangiOperatsiya" class="form-grid" style="display:grid;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Sana *</label>
              <input type="date" id="newOpSana" class="input" style="width:100%;" required value="${todayISO()}">
            </div>
            <div>
              <label class="form-label">Birlamchi hisob hujjati *</label>
              <input type="text" id="newOpHujjat" class="input" style="width:100%;" required placeholder="Masalan: M-12, Faktura #45, Kassa orderi">
            </div>
          </div>

          <div>
            <label class="form-label">Operatsiyaning mazmuni *</label>
            <input type="text" id="newOpMazmun" class="input" style="width:100%;" required placeholder="Xo'jalik operatsiyasi qisqacha tavsifi">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label class="form-label">Debet schyot (Dt) *</label>
              <select id="newOpDt" class="select" style="width:100%;" required>
                <option value="">Schyotni tanlang...</option>
                ${schyotOptions}
              </select>
            </div>
            <div>
              <label class="form-label">Kredit schyot (Kt) *</label>
              <select id="newOpKt" class="select" style="width:100%;" required>
                <option value="">Schyotni tanlang...</option>
                ${schyotOptions}
              </select>
            </div>
          </div>

          <div>
            <label class="form-label">Summa (so'm) *</label>
            <input type="number" id="newOpSumma" class="input" style="width:100%;" required min="1" step="any" placeholder="0">
          </div>

          <div>
            <label class="form-label">Qo'shimcha izoh</label>
            <input type="text" id="newOpIzoh" class="input" style="width:100%;" placeholder="Ixtiyoriy izoh">
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
            <button type="button" class="btn" id="btnCancelModal">Bekor qilish</button>
            <button type="submit" class="btn btn-primary">Saqlash</button>
          </div>
        </form>
      </div>
    `;

    openModal(html);

    const close = () => {
      const root = document.getElementById("modalRoot");
      if (root) root.innerHTML = "";
    };

    const btnClose = document.getElementById("modalCloseBtn");
    if (btnClose) btnClose.addEventListener("click", close);
    const btnCancel = document.getElementById("btnCancelModal");
    if (btnCancel) btnCancel.addEventListener("click", close);

    const form = document.getElementById("formYangiOperatsiya");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const sana = document.getElementById("newOpSana").value;
        const hujjat = document.getElementById("newOpHujjat").value.trim();
        const mazmuni = document.getElementById("newOpMazmun").value.trim();
        const dt = document.getElementById("newOpDt").value;
        const kt = document.getElementById("newOpKt").value;
        const summa = toNum(document.getElementById("newOpSumma").value);
        const izoh = document.getElementById("newOpIzoh").value.trim();

        if (summa <= 0) {
          toast("Operatsiya summasi 0 dan katta bo'lishi kerak!", "warn");
          return;
        }

        const oy = sana ? parseInt(sana.split("-")[1], 10) : 1;

        initBuxgalteriyaStore();
        STORE.operatsiyalar.push({
          id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sana,
          oy,
          hujjat,
          mazmuni,
          summa,
          dt,
          kt,
          izoh,
          isManual: true,
          source: "manual"
        });

        saveBuxgalteriyaStore();
        toast("Yangi buxgalteriya operatsiyasi muvaffaqiyatli saqlandi!", "ok");
        close();
        if (CURRENT_PAGE === "operatsiyalar") renderOperatsiyalar();
      });
    }
  }

  /* --------------------------------------------------------------------------
     11. UI SAHIFA 2: SCHYOTLAR BO'YICHA AYLANMA (RENDER AYLANMA / OSV)
     -------------------------------------------------------------------------- */

  let AYLANMA_TARGET_SCHYOT = "5110";
  let AYLANMA_OY = "all";

  function renderAylanma() {
    initBuxgalteriyaStore();
    const main = document.getElementById("main");
    if (!main) return;

    const osvRes = computeSchyotAylanma(AYLANMA_TARGET_SCHYOT, AYLANMA_OY);

    const schyotOptions = Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).map((sch) => {
      const selected = AYLANMA_TARGET_SCHYOT === sch ? "selected" : "";
      return `<option value="${sch}" ${selected}>${sch} — ${escapeHtml(BUXGALTERIYA_SCHYOTLAR_FULL[sch].nomi)}</option>`;
    }).join("");

    const months = [
      { id: "all", label: "Butun yil bo'yicha" },
      { id: "1", label: "1 - Yanvar" },
      { id: "2", label: "2 - Fevral" },
      { id: "3", label: "3 - Mart" },
      { id: "4", label: "4 - Aprel" },
      { id: "5", label: "5 - May" },
      { id: "6", label: "6 - Iyun" },
      { id: "7", label: "7 - Iyul" },
      { id: "8", label: "8 - Avgust" },
      { id: "9", label: "9 - Sentyabr" },
      { id: "10", label: "10 - Oktyabr" },
      { id: "11", label: "11 - Noyabr" },
      { id: "12", label: "12 - Dekabr" }
    ];

    const oyOptions = months.map((m) => {
      const selected = AYLANMA_OY === m.id ? "selected" : "";
      return `<option value="${m.id}" ${selected}>${m.label}</option>`;
    }).join("");

    main.innerHTML = `
      ${renderBuxWorkstationHeader("aylanma")}
      <div class="page-header">
        <div>
          <h1 class="page-title">Hisoblar Bo'yicha Aylanma (Schyot Kartochkasi / ОСВ)</h1>
          <p class="page-desc">Tanlangan hisob bo'yicha boshlang'ich qoldiq, har bir operatsiyadan keyingi joriy qoldiq (running balance), jami aylanma va yakuniy saldo (Excel 20.xlsx andazasi).</p>
        </div>
        <div class="page-actions">
          <button class="btn" id="btnExportAylanmaXlsx" title="Ushbu hisobvaraq aylanmasini Excel formatida yuklash">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-out"/></svg> Excel'ga eksport
          </button>
          <button class="btn" id="btnPrintAylanmaPdf" title="Ushbu hisobvaraq aylanmasini PDF qilib chop etish">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg> PDF (chop etish)
          </button>
          <button class="btn btn-primary" onclick="navigate('operatsiyalar')">Operatsiyalar jurnali</button>
        </div>
      </div>

      <!-- Schyot va Davr tanlash -->
      <div class="bux-filter-bar">
        <div class="bux-filter-group">
          <label style="font-weight:700;font-size:13px;">Schyotni tanlang:</label>
          <select id="selAylanmaSchyot" class="select" style="min-width:320px;">
            <option value="9999" ${AYLANMA_TARGET_SCHYOT === "9999" ? "selected" : ""}>9999 — Hamma schyotlar bo'yicha</option>
            ${schyotOptions}
          </select>

          <label style="font-weight:700;font-size:13px;margin-left:12px;">Davr:</label>
          <select id="selAylanmaOy" class="select" style="min-width:180px;">
            ${oyOptions}
          </select>
        </div>
        <div class="faint" style="font-size:12px;">
          Turi: <strong>${getSchyotTuri(AYLANMA_TARGET_SCHYOT) === "A" ? "Aktiv (A)" : getSchyotTuri(AYLANMA_TARGET_SCHYOT) === "KA" ? "Kontraktiv (KA)" : "Passiv (P)"}</strong> | Bo'lim: <strong>${escapeHtml((BUXGALTERIYA_SCHYOTLAR_FULL[AYLANMA_TARGET_SCHYOT] || {}).bolim || "Buxgalteriya")}</strong>
        </div>
      </div>

      <!-- Saldo va Aylanma Kartochkasi -->
      <div class="grid grid-3" style="margin-bottom:18px;">
        <div class="card stat-card">
          <div class="stat-label">Davr boshiga qoldiq</div>
          <div class="stat-value" style="font-size:20px;">
            ${osvRes.boshlangichDt > 0 ? `<span class="pos">Dt: ${formatSum(osvRes.boshlangichDt)}</span>` : ""}
            ${osvRes.boshlangichKt > 0 ? `<span style="color:var(--accent);">Kt: ${formatSum(osvRes.boshlangichKt)}</span>` : ""}
            ${osvRes.boshlangichDt === 0 && osvRes.boshlangichKt === 0 ? "0 so'm" : ""}
          </div>
          <div class="stat-sub">${AYLANMA_OY === "all" ? "Yil boshiga qoldiq" : `${AYLANMA_OY}-oy boshiga qoldiq`}</div>
        </div>

        <div class="card stat-card">
          <div class="stat-label">Davr aylanmasi (Oborot)</div>
          <div class="stat-value" style="font-size:18px;">
            <div style="color:var(--ok);">Dt: +${formatSum(osvRes.oborotDt)} so'm</div>
            <div style="color:var(--accent);margin-top:2px;">Kt: -${formatSum(osvRes.oborotKt)} so'm</div>
          </div>
          <div class="stat-sub">Jami operatsiyalar soni: ${osvRes.rows.length} ta</div>
        </div>

        <div class="card stat-card">
          <div class="stat-label">Davr oxiriga qoldiq (Saldo)</div>
          <div class="stat-value" style="font-size:20px;">
            ${osvRes.oxirgiDt > 0 ? `<span class="pos">Dt: ${formatSum(osvRes.oxirgiDt)} so'm</span>` : ""}
            ${osvRes.oxirgiKt > 0 ? `<span style="color:var(--accent);">Kt: ${formatSum(osvRes.oxirgiKt)} so'm</span>` : ""}
            ${osvRes.oxirgiDt === 0 && osvRes.oxirgiKt === 0 ? "0 so'm" : ""}
          </div>
          <div class="stat-sub">Harakatlar yakuni bo'yicha</div>
        </div>
      </div>

      <!-- Aylanma Jadvali (Running Balance) -->
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:50px;">T/r</th>
              <th style="width:95px;">Sana</th>
              <th style="min-width:180px;">Birlamchi hisob hujjati</th>
              <th style="min-width:260px;">Operatsiyaning mazmuni</th>
              <th style="width:130px;text-align:right;">Summa (so'm)</th>
              <th style="width:80px;text-align:center;">Debet</th>
              <th style="width:80px;text-align:center;">Kredit</th>
              <th style="width:130px;text-align:right;">Qoldiq Debet</th>
              <th style="width:130px;text-align:right;">Qoldiq Kredit</th>
            </tr>
          </thead>
          <tbody>
            <!-- Boshlang'ich qoldiq qatori -->
            ${!osvRes.isAll ? `
              <tr style="background:var(--bg-sunken);font-weight:700;">
                <td>—</td>
                <td colspan="3"><strong>Davr boshiga qoldiq</strong></td>
                <td style="text-align:right;">—</td>
                <td style="text-align:center;">—</td>
                <td style="text-align:center;">—</td>
                <td style="text-align:right;color:var(--ok);font-family:var(--font-mono);">${formatSum(osvRes.boshlangichDt)}</td>
                <td style="text-align:right;color:var(--accent);font-family:var(--font-mono);">${formatSum(osvRes.boshlangichKt)}</td>
              </tr>
            ` : ""}

            ${osvRes.rows.length > 0 ? osvRes.rows.map((r) => `
              <tr>
                <td>${r.tr}</td>
                <td style="font-family:var(--font-mono);font-size:12px;">${escapeHtml(r.sana)}</td>
                <td><strong>${escapeHtml(r.hujjat || "—")}</strong></td>
                <td>${escapeHtml(r.mazmuni || "—")}</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:700;">${formatSum(r.summa)}</td>
                <td style="text-align:center;font-weight:600;color:var(--ok);">${escapeHtml(r.dt)}</td>
                <td style="text-align:center;font-weight:600;color:var(--accent);">${escapeHtml(r.kt)}</td>
                <td style="text-align:right;font-family:var(--font-mono);color:var(--ok);font-weight:600;">
                  ${r.qoldiqDt > 0 ? formatSum(r.qoldiqDt) : "—"}
                </td>
                <td style="text-align:right;font-family:var(--font-mono);color:var(--accent);font-weight:600;">
                  ${r.qoldiqKt > 0 ? formatSum(r.qoldiqKt) : "—"}
                </td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="9" class="empty-state" style="padding:30px;text-align:center;color:var(--text-faint);">
                  Tanlangan hisob va davr bo'yicha hech qanday operatsiya topilmadi.
                </td>
              </tr>
            `}

            <!-- Yakuniy qator -->
            ${!osvRes.isAll ? `
              <tr style="background:var(--bg-sunken);font-weight:800;border-top:2px solid var(--border-strong);">
                <td colspan="4"><strong>Davr bo'yicha jami aylanma va yakuniy qoldiq</strong></td>
                <td style="text-align:right;font-family:var(--font-mono);">${formatSum(osvRes.oborotDt + osvRes.oborotKt)}</td>
                <td style="text-align:center;color:var(--ok);">${formatSum(osvRes.oborotDt)}</td>
                <td style="text-align:center;color:var(--accent);">${formatSum(osvRes.oborotKt)}</td>
                <td style="text-align:right;color:var(--ok);font-family:var(--font-mono);">${formatSum(osvRes.oxirgiDt)}</td>
                <td style="text-align:right;color:var(--accent);font-family:var(--font-mono);">${formatSum(osvRes.oxirgiKt)}</td>
              </tr>
            ` : ""}
          </tbody>
        </table>
      </div>
    `;

    // Handlerlar
    const selSch = document.getElementById("selAylanmaSchyot");
    if (selSch) {
      selSch.addEventListener("change", (e) => {
        AYLANMA_TARGET_SCHYOT = e.target.value;
        renderAylanma();
      });
    }

    const selOy = document.getElementById("selAylanmaOy");
    if (selOy) {
      selOy.addEventListener("change", (e) => {
        AYLANMA_OY = e.target.value;
        renderAylanma();
      });
    }

    const btnExpAyl = document.getElementById("btnExportAylanmaXlsx");
    if (btnExpAyl) btnExpAyl.addEventListener("click", () => exportAylanmaXlsx(osvRes, AYLANMA_TARGET_SCHYOT, AYLANMA_OY));

    const btnPrnAyl = document.getElementById("btnPrintAylanmaPdf");
    if (btnPrnAyl) btnPrnAyl.addEventListener("click", () => printAylanmaPdf(osvRes, AYLANMA_TARGET_SCHYOT, AYLANMA_OY));

    bindBuxWorkstationEvents();
  }

  window.renderAylanma = renderAylanma;

  /* --------------------------------------------------------------------------
     12. UI SAHIFA 3: SHAXMATKA VA BOSH KITOB (RENDER SHAXMATKA)
     -------------------------------------------------------------------------- */

  let ACTIVE_SHAXMATKA_TAB = "shaxmatka"; // "shaxmatka" | "boshkitob"
  let SHAXMATKA_OY = "all";
  let BOSHKITOB_SCHYOT = "5110";

  function renderShaxmatka() {
    initBuxgalteriyaStore();
    const main = document.getElementById("main");
    if (!main) return;

    const shx = computeShaxmatka(SHAXMATKA_OY);
    const bk = computeBoshKitob(BOSHKITOB_SCHYOT);

    const months = [
      { id: "all", label: "Butun yil" },
      { id: "1", label: "1-Yan" },
      { id: "2", label: "2-Fev" },
      { id: "3", label: "3-Mar" },
      { id: "4", label: "4-Apr" },
      { id: "5", label: "5-May" },
      { id: "6", label: "6-Iyn" },
      { id: "7", label: "7-Iyl" },
      { id: "8", label: "8-Avg" },
      { id: "9", label: "9-Sen" },
      { id: "10", label: "10-Okt" },
      { id: "11", label: "11-Noy" },
      { id: "12", label: "12-Dek" }
    ];

    const oyOptions = months.map((m) => {
      const selected = SHAXMATKA_OY === m.id ? "selected" : "";
      return `<option value="${m.id}" ${selected}>${m.label}</option>`;
    }).join("");

    const bkSchyotOptions = Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).map((sch) => {
      const selected = BOSHKITOB_SCHYOT === sch ? "selected" : "";
      return `<option value="${sch}" ${selected}>${sch} — ${escapeHtml(BUXGALTERIYA_SCHYOTLAR_FULL[sch].nomi)}</option>`;
    }).join("");

    main.innerHTML = `
      ${renderBuxWorkstationHeader("shaxmatka")}
      <div class="page-header">
        <div>
          <h1 class="page-title">Shaxmatka va Bosh Kitob (Шахматка & Главная книга)</h1>
          <p class="page-desc">Debet va Kredit schyotlarning ikki o'lchovli o'zaro korrespondensiya matritsasi hamda oylik hisoblar tahlili (Excel 20.xlsx andazasi).</p>
        </div>
        <div class="page-actions">
          <button class="btn ${ACTIVE_SHAXMATKA_TAB === "shaxmatka" ? "btn-primary" : ""}" id="btnTabShaxmatka">Shaxmatka vedomosti</button>
          <button class="btn ${ACTIVE_SHAXMATKA_TAB === "boshkitob" ? "btn-primary" : ""}" id="btnTabBoshKitob">Bosh kitob (Главная книга)</button>
          <button class="btn" id="btnExportShaxmatkaXlsx" title="Excel formatida yuklab olish">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-out"/></svg> Excel'ga eksport
          </button>
          <button class="btn" id="btnPrintShaxmatkaPdf" title="Chop etish yoki PDF sifatida saqlash">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg> PDF (chop etish)
          </button>
        </div>
      </div>

      ${ACTIVE_SHAXMATKA_TAB === "shaxmatka" ? `
        <!-- Shaxmatka filtr va summary -->
        <div class="bux-filter-bar">
          <div class="bux-filter-group">
            <label style="font-weight:700;font-size:13px;">Hisobot davri:</label>
            <select id="selShaxmatkaOy" class="select">
              ${oyOptions}
            </select>
          </div>
          <div class="bux-filter-group">
            <span>Faol Debet schyotlar: <strong>${shx.dtAccounts.length} ta</strong></span> |
            <span>Faol Kredit schyotlar: <strong>${shx.ktAccounts.length} ta</strong></span> |
            <span>Umumiy aylanma: <strong class="pos">${formatSum(shx.grandTotal)} so'm</strong></span>
          </div>
        </div>

        <div class="bux-balance-banner ok">
          <div>
            <strong>✓ Shaxmatka balansi to'liq muvozanatda:</strong>
            Jami Debet aylanma = Jami Kredit aylanma = <strong>${formatSum(shx.grandTotal)} so'm</strong>.
          </div>
          <div style="font-size:12px;opacity:0.85;">Katakchani bosib, uning ichidagi barcha provodkalarni ko'rishingiz mumkin</div>
        </div>

        <!-- Shaxmatka matritsasi -->
        <div class="bux-matrix-table-wrap">
          <table class="bux-matrix-table">
            <thead>
              <tr>
                <th class="sticky-col">Debet \\ Kredit</th>
                ${shx.ktAccounts.map((kt) => `
                  <th title="${kt} — ${escapeHtml(getSchyotNomi(kt))}">${kt}</th>
                `).join("")}
                <th style="background:var(--accent-soft);color:var(--accent-text);">JAMI DEBET</th>
              </tr>
            </thead>
            <tbody>
              ${shx.dtAccounts.length > 0 ? shx.dtAccounts.map((dt) => `
                <tr>
                  <td class="sticky-col" title="${dt} — ${escapeHtml(getSchyotNomi(dt))}">
                    <strong>${dt}</strong> <span class="faint" style="font-size:11px;">${escapeHtml(getSchyotNomi(dt))}</span>
                  </td>
                  ${shx.ktAccounts.map((kt) => {
                    const sum = (shx.matrix[dt] && shx.matrix[dt][kt]) || 0;
                    return `
                      <td class="${sum > 0 ? "cell-val" : "faint"}" data-dt="${dt}" data-kt="${kt}">
                        ${sum > 0 ? formatSum(sum) : "—"}
                      </td>
                    `;
                  }).join("")}
                  <td style="font-weight:700;color:var(--ok);background:var(--bg-sunken);">
                    ${formatSum(shx.dtTotals[dt] || 0)}
                  </td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="${shx.ktAccounts.length + 2}" style="padding:40px;text-align:center;color:var(--text-faint);">
                    Ushbu davrda provodkalar mavjud emas.
                  </td>
                </tr>
              `}

              <!-- Jami Kredit qatori -->
              <tr class="total-row">
                <td class="sticky-col" style="background:var(--bg-sunken);font-weight:800;">JAMI KREDIT</td>
                ${shx.ktAccounts.map((kt) => `
                  <td style="color:var(--accent);">${formatSum(shx.ktTotals[kt] || 0)}</td>
                `).join("")}
                <td class="grand-total">${formatSum(shx.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ` : `
        <!-- Bosh kitob filtri -->
        <div class="bux-filter-bar">
          <div class="bux-filter-group">
            <label style="font-weight:700;font-size:13px;">Bosh kitob schyoti:</label>
            <select id="selBoshKitobSchyot" class="select" style="min-width:320px;">
              ${bkSchyotOptions}
            </select>
          </div>
          <div class="faint">
            Ushbu schyot bilan bog'liq korrespondent schyotlar: <strong>${bk.corrAccounts.length} ta</strong>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:200px;">Korrespondent schyot</th>
                <th style="width:70px;text-align:center;">Yo'nalish</th>
                <th>1-Yan</th>
                <th>2-Fev</th>
                <th>3-Mar</th>
                <th>4-Apr</th>
                <th>5-May</th>
                <th>6-Iyn</th>
                <th>7-Iyl</th>
                <th>8-Avg</th>
                <th>9-Sen</th>
                <th>10-Okt</th>
                <th>11-Noy</th>
                <th>12-Dek</th>
                <th style="text-align:right;">JAMI</th>
              </tr>
            </thead>
            <tbody>
              ${bk.corrAccounts.length > 0 ? bk.corrAccounts.map((corr) => {
                const mData = bk.monthsData[corr];
                let totalDtSum = 0;
                let totalKtSum = 0;
                for (let m = 1; m <= 12; m++) {
                  totalDtSum += mData[m].dt;
                  totalKtSum += mData[m].kt;
                }
                const hasDt = totalDtSum > 0;
                const hasKt = totalKtSum > 0;

                const dtRow = hasDt ? `
                  <tr>
                    <td rowspan="${hasDt && hasKt ? 2 : 1}">
                      <strong>${corr}</strong> — <span class="faint" style="font-size:11.5px;">${escapeHtml(getSchyotNomi(corr))}</span>
                    </td>
                    <td style="text-align:center;color:var(--ok);font-weight:700;">Dt</td>
                    ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `
                      <td style="text-align:right;font-family:var(--font-mono);font-size:11.5px;">
                        ${mData[m].dt > 0 ? formatSum(mData[m].dt) : "—"}
                      </td>
                    `).join("")}
                    <td style="text-align:right;font-weight:700;color:var(--ok);">${formatSum(totalDtSum)}</td>
                  </tr>
                ` : "";

                const ktRow = hasKt ? `
                  <tr>
                    ${!hasDt ? `<td><strong>${corr}</strong> — <span class="faint" style="font-size:11.5px;">${escapeHtml(getSchyotNomi(corr))}</span></td>` : ""}
                    <td style="text-align:center;color:var(--accent);font-weight:700;">Kt</td>
                    ${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `
                      <td style="text-align:right;font-family:var(--font-mono);font-size:11.5px;">
                        ${mData[m].kt > 0 ? formatSum(mData[m].kt) : "—"}
                      </td>
                    `).join("")}
                    <td style="text-align:right;font-weight:700;color:var(--accent);">${formatSum(totalKtSum)}</td>
                  </tr>
                ` : "";

                return dtRow + ktRow;
              }).join("") : `
                <tr>
                  <td colspan="15" class="empty-state" style="padding:30px;text-align:center;color:var(--text-faint);">
                    Ushbu schyot bo'yicha hech qanday aylanma mavjud emas.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      `}
    `;

    // Eventlar
    const tabShx = document.getElementById("btnTabShaxmatka");
    if (tabShx) {
      tabShx.addEventListener("click", () => {
        ACTIVE_SHAXMATKA_TAB = "shaxmatka";
        renderShaxmatka();
      });
    }

    const tabBk = document.getElementById("btnTabBoshKitob");
    if (tabBk) {
      tabBk.addEventListener("click", () => {
        ACTIVE_SHAXMATKA_TAB = "boshkitob";
        renderShaxmatka();
      });
    }

    const selOy = document.getElementById("selShaxmatkaOy");
    if (selOy) {
      selOy.addEventListener("change", (e) => {
        SHAXMATKA_OY = e.target.value;
        renderShaxmatka();
      });
    }

    const selBkSch = document.getElementById("selBoshKitobSchyot");
    if (selBkSch) {
      selBkSch.addEventListener("change", (e) => {
        BOSHKITOB_SCHYOT = e.target.value;
        renderShaxmatka();
      });
    }

    // Katakchani bosganda operatsiyalarni ko'rsatish (drill-down modal)
    const valCells = main.querySelectorAll("td.cell-val");
    valCells.forEach((cell) => {
      cell.addEventListener("click", () => {
        const dt = cell.getAttribute("data-dt");
        const kt = cell.getAttribute("data-kt");
        openShaxmatkaDrillDown(dt, kt, SHAXMATKA_OY);
      });
    });

    const btnExpShx = document.getElementById("btnExportShaxmatkaXlsx");
    if (btnExpShx) btnExpShx.addEventListener("click", () => exportShaxmatkaXlsx(shx, bk, ACTIVE_SHAXMATKA_TAB, SHAXMATKA_OY));

    const btnPrnShx = document.getElementById("btnPrintShaxmatkaPdf");
    if (btnPrnShx) btnPrnShx.addEventListener("click", () => printShaxmatkaPdf(shx, bk, ACTIVE_SHAXMATKA_TAB, SHAXMATKA_OY));

    bindBuxWorkstationEvents();
  }

  window.renderShaxmatka = renderShaxmatka;

  function openShaxmatkaDrillDown(dt, kt, oy) {
    const allOps = getAllBuxgalteriyaOperatsiyalar();
    const ops = allOps.filter((o) => {
      if (o.dt !== dt || o.kt !== kt) return false;
      if (oy && oy !== "all" && o.oy !== parseInt(oy, 10)) return false;
      return true;
    });

    let jami = 0;
    ops.forEach((o) => jami += o.summa);

    const html = `
      <div class="modal-box" style="max-width:760px;">
        <div class="modal-head">
          <h2 class="modal-title">Dt ${dt} — Kt ${kt} Operatsiyalari ro'yxati</h2>
          <button class="modal-close" id="modalCloseBtn">&times;</button>
        </div>
        <div style="font-size:13px;margin-bottom:12px;color:var(--text-muted);">
          Debet: <strong>${dt} — ${escapeHtml(getSchyotNomi(dt))}</strong><br>
          Kredit: <strong>${kt} — ${escapeHtml(getSchyotNomi(kt))}</strong><br>
          Jami operatsiyalar: <strong>${ops.length} ta</strong>, Umumiy summa: <strong class="pos">${formatSum(jami)} so'm</strong>
        </div>

        <div class="table-wrap" style="max-height:360px;">
          <table>
            <thead>
              <tr>
                <th>T/r</th>
                <th>Sana</th>
                <th>Hujjat</th>
                <th>Mazmuni</th>
                <th style="text-align:right;">Summa</th>
              </tr>
            </thead>
            <tbody>
              ${ops.map((o, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${escapeHtml(o.sana)}</td>
                  <td><strong>${escapeHtml(o.hujjat)}</strong></td>
                  <td>${escapeHtml(o.mazmuni)}</td>
                  <td style="text-align:right;font-family:var(--font-mono);font-weight:700;">${formatSum(o.summa)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
          <button class="btn btn-primary" id="btnCloseDrillDown">Yopish</button>
        </div>
      </div>
    `;

    openModal(html);

    const close = () => {
      const root = document.getElementById("modalRoot");
      if (root) root.innerHTML = "";
    };

    const btnClose = document.getElementById("modalCloseBtn");
    if (btnClose) btnClose.addEventListener("click", close);
    const btnClose2 = document.getElementById("btnCloseDrillDown");
    if (btnClose2) btnClose2.addEventListener("click", close);
  }

  /* --------------------------------------------------------------------------
     13. UI SAHIFA 4: BOSHLANG'ICH QOLDIQLAR (RENDER BOSHLANG'ICH)
     -------------------------------------------------------------------------- */

  let BOSHLANGICH_SEARCH = "";

  function renderBoshlangichQoldiqlar() {
    initBuxgalteriyaStore();
    const main = document.getElementById("main");
    if (!main) return;

    const qoldiqlar = STORE.boshlangichQoldiqlar || {};
    let totalDt = 0;
    let totalKt = 0;

    Object.keys(qoldiqlar).forEach((sch) => {
      totalDt += toNum(qoldiqlar[sch].dt);
      totalKt += toNum(qoldiqlar[sch].kt);
    });

    const diff = totalDt - totalKt;

    const allSchyotlar = Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL);
    const filteredSchyotlar = allSchyotlar.filter((sch) => {
      if (!BOSHLANGICH_SEARCH) return true;
      const q = BOSHLANGICH_SEARCH.toLowerCase();
      const hay = `${sch} ${BUXGALTERIYA_SCHYOTLAR_FULL[sch].nomi} ${BUXGALTERIYA_SCHYOTLAR_FULL[sch].bolim}`.toLowerCase();
      return hay.includes(q);
    });

    main.innerHTML = `
      ${renderBuxWorkstationHeader("boshlangich")}
      <div class="page-header">
        <div>
          <h1 class="page-title">Boshlang'ich Qoldiqlar (Йил бошига қолдиқ)</h1>
          <p class="page-desc">Korxonaning yil boshidagi (yoki faoliyat boshidagi) hisoblar qoldig'i. Debet va Kredit tengligi qat'iy nazorat qilinadi (Excel 20.xlsx andazasi).</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnSaveBoshlangich">Barchasini saqlash</button>
          <button class="btn" id="btnExportBoshlangichXlsx" title="Excel formatida yuklab olish">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-out"/></svg> Excel'ga eksport
          </button>
          <button class="btn" id="btnPrintBoshlangichPdf" title="Chop etish yoki PDF sifatida saqlash">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg> PDF (chop etish)
          </button>
          <button class="btn btn-danger" id="btnClearBoshlangich">Qoldiqlarni tozalash</button>
          <button class="btn" onclick="navigate('operatsiyalar')">Operatsiyalar jurnali</button>
        </div>
      </div>

      <!-- Balans tengligi nazorati -->
      <div class="bux-balance-banner ${diff === 0 ? "ok" : "warning"}">
        <div>
          <strong>Balans tengligi:</strong>
          Jami Debet qoldiq: <strong>${formatSum(totalDt)} so'm</strong> |
          Jami Kredit qoldiq: <strong>${formatSum(totalKt)} so'm</strong> |
          Farq: <strong style="${diff === 0 ? "" : "color:var(--danger);"}">${formatSum(Math.abs(diff))} so'm ${diff === 0 ? "(Muvozanatda ✓)" : "(Farq bor!)"}</strong>
        </div>
        <div class="faint" style="font-size:12px;">Qoldiqlar kiritilgan hisoblar soni: ${Object.keys(qoldiqlar).filter((k) => qoldiqlar[k].dt > 0 || qoldiqlar[k].kt > 0).length} ta</div>
      </div>

      <!-- Qidiruv paneli -->
      <div class="bux-filter-bar">
        <div class="bux-filter-group" style="flex:1; max-width:400px;">
          <input type="text" id="inputSearchBoshlangich" class="search-input" style="width:100%;" placeholder="Schyot kodi yoki nomini qidirish…" value="${escapeHtml(BOSHLANGICH_SEARCH)}">
        </div>
        <div class="faint" style="font-size:12px;">
          Har bir katakchaga kiritilgan o'zgarishlar "Barchasini saqlash" bosilganda bazaga saqlanadi.
        </div>
      </div>

      <!-- Qoldiqlar jadvali -->
      <div class="table-wrap" style="max-height:65vh;">
        <table>
          <thead>
            <tr>
              <th style="width:90px;">Schyot</th>
              <th style="min-width:280px;">Hisobvaraq nomi</th>
              <th style="width:90px;text-align:center;">Turi</th>
              <th style="min-width:180px;">Bo'limi</th>
              <th style="width:180px;text-align:right;">Yil boshiga Debet (so'm)</th>
              <th style="width:180px;text-align:right;">Yil boshiga Kredit (so'm)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSchyotlar.map((sch) => {
              const meta = BUXGALTERIYA_SCHYOTLAR_FULL[sch];
              const q = qoldiqlar[sch] || { dt: 0, kt: 0 };
              return `
                <tr>
                  <td><strong style="font-size:13.5px;font-family:var(--font-mono);">${sch}</strong></td>
                  <td>${escapeHtml(meta.nomi)}</td>
                  <td style="text-align:center;">
                    <span class="badge" style="font-size:11px;">${meta.turi}</span>
                  </td>
                  <td class="faint" style="font-size:12px;">${escapeHtml(meta.bolim)}</td>
                  <td style="text-align:right;">
                    <input type="number" step="any" min="0" class="input input-qoldiq-dt" data-sch="${sch}" value="${q.dt || ""}" placeholder="0" style="text-align:right;width:100%;max-width:160px;font-family:var(--font-mono);font-weight:600;">
                  </td>
                  <td style="text-align:right;">
                    <input type="number" step="any" min="0" class="input input-qoldiq-kt" data-sch="${sch}" value="${q.kt || ""}" placeholder="0" style="text-align:right;width:100%;max-width:160px;font-family:var(--font-mono);font-weight:600;">
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    // Eventlar
    const inputSearch = document.getElementById("inputSearchBoshlangich");
    if (inputSearch) {
      inputSearch.addEventListener("input", (e) => {
        BOSHLANGICH_SEARCH = e.target.value;
        renderBoshlangichQoldiqlar();
      });
    }

    const btnSave = document.getElementById("btnSaveBoshlangich");
    if (btnSave) {
      btnSave.addEventListener("click", () => {
        const dtInputs = main.querySelectorAll(".input-qoldiq-dt");
        const ktInputs = main.querySelectorAll(".input-qoldiq-kt");

        const updated = Object.assign({}, STORE.boshlangichQoldiqlar || {});

        dtInputs.forEach((inp) => {
          const sch = inp.getAttribute("data-sch");
          const val = toNum(inp.value);
          if (!updated[sch]) updated[sch] = { dt: 0, kt: 0 };
          updated[sch].dt = val;
        });

        ktInputs.forEach((inp) => {
          const sch = inp.getAttribute("data-sch");
          const val = toNum(inp.value);
          if (!updated[sch]) updated[sch] = { dt: 0, kt: 0 };
          updated[sch].kt = val;
        });

        // Bo'shlarini tozalash
        Object.keys(updated).forEach((k) => {
          if (updated[k].dt <= 0 && updated[k].kt <= 0) delete updated[k];
        });

        STORE.boshlangichQoldiqlar = updated;
        saveBuxgalteriyaStore();
        toast("Boshlang'ich qoldiqlar muvaffaqiyatli saqlandi!", "ok");
        renderBoshlangichQoldiqlar();
      });
    }

    const btnClear = document.getElementById("btnClearBoshlangich");
    if (btnClear) {
      btnClear.addEventListener("click", () => {
        if (!confirm("Barcha boshlang'ich qoldiqlarni tozalashni tasdiqlaysizmi?")) return;
        STORE.boshlangichQoldiqlar = {};
        saveBuxgalteriyaStore();
        toast("Boshlang'ich qoldiqlar tozalandi", "ok");
        renderBoshlangichQoldiqlar();
      });
    }

    const btnExpBsh = document.getElementById("btnExportBoshlangichXlsx");
    if (btnExpBsh) btnExpBsh.addEventListener("click", () => exportBoshlangichXlsx(STORE.boshlangichQoldiqlar || {}));

    const btnPrnBsh = document.getElementById("btnPrintBoshlangichPdf");
    if (btnPrnBsh) btnPrnBsh.addEventListener("click", () => printBoshlangichPdf(STORE.boshlangichQoldiqlar || {}));

    bindBuxWorkstationEvents();
  }

  window.renderBoshlangichQoldiqlar = renderBoshlangichQoldiqlar;

  /* --------------------------------------------------------------------------
     14. BUXGALTERIYA MODULLARI UCHUN EXCEL VA PDF EKSPORT
     -------------------------------------------------------------------------- */

  function safeOpenPrintWindow(html) {
    if (typeof window.openPrintWindow === "function") {
      window.openPrintWindow(html);
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      alert("Chop etish oynasi ochilmadi — brauzer popup bloklagan bo'lishi mumkin");
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 300);
  }

  function printOperatsiyalarPdf(ops, monthId) {
    const s = STORE.settings || {};
    const monthText = monthId === "all" ? "Butun yil davomi" : `${monthId}-oy (Order-jurnal)`;
    let totalSum = 0;
    ops.forEach((o) => { totalSum += toNum(o.summa); });

    const rowsHtml = ops.map((o, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(o.sana || "")}</td>
        <td>${escapeHtml(o.hujjat || "—")}</td>
        <td>${escapeHtml(o.mazmuni || "—")}</td>
        <td class="num font-bold">${formatSum(o.summa)}</td>
        <td style="text-align:center;font-weight:bold;color:#2f6f5e;">${escapeHtml(o.dt || "")}</td>
        <td style="text-align:center;font-weight:bold;color:#c25e2e;">${escapeHtml(o.kt || "")}</td>
      </tr>
    `).join("");

    const html = `
      <!doctype html>
      <html lang="uz">
      <head>
        <meta charset="UTF-8">
        <title>Xo'jalik Operatsiyalari Jurnali — ${escapeHtml(monthText)}</title>
        <style>
          body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px; color: #1c2530; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .sub { font-size: 12px; color: #5b6b7b; margin: 0 0 4px; }
          .period { font-size: 12px; color: #5b6b7b; margin: 0 0 16px; }
          .kpi-row { display: flex; gap: 16px; margin-bottom: 16px; }
          .kpi-card { border: 1px solid #ccd3da; border-radius: 6px; padding: 8px 12px; background: #f8fafc; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ccd3da; padding: 5px 7px; text-align: left; }
          th { background: #eceff2; font-weight: bold; }
          td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
          .font-bold { font-weight: bold; }
          tfoot td { font-weight: 700; border-top: 2px solid #1c2530; background: #f8fafc; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(s.companyName || "FORGET")}</h1>
        <div class="sub">INN: ${escapeHtml(s.inn || "—")} &middot; Buxgalteriya hisobi (BHMS 21)</div>
        <div class="period">Xo'jalik operatsiyalari jurnali &middot; ${escapeHtml(monthText)} &middot; Chop etilgan sana: ${todayISO()}</div>
        <div class="kpi-row">
          <div class="kpi-card">Jami operatsiyalar: <b>${ops.length} ta</b></div>
          <div class="kpi-card">Jami aylanma: <b>${formatSum(totalSum)} so'm</b></div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="num" style="width:35px;">T/r</th>
              <th style="width:75px;">Sana</th>
              <th style="width:110px;">Hujjat №</th>
              <th>Operatsiyaning mazmuni</th>
              <th class="num" style="width:110px;">Summa (so'm)</th>
              <th style="width:60px;text-align:center;">Debet</th>
              <th style="width:60px;text-align:center;">Kredit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="7" style="text-align:center;padding:15px;">Operatsiyalar mavjud emas</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"><b>Jami aylanma</b></td>
              <td class="num"><b>${formatSum(totalSum)}</b></td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;
    safeOpenPrintWindow(html);
  }

  function exportAylanmaXlsx(osvRes, targetSch, monthId) {
    const s = STORE.settings || {};
    const schMeta = BUXGALTERIYA_SCHYOTLAR_FULL[targetSch] || {};
    const schLabel = targetSch === "9999" ? "Barcha hisoblar" : `${targetSch} — ${schMeta.nomi || ""}`;
    const monthText = monthId === "all" ? "Butun yil" : `${monthId}-oy`;

    const aoa = [
      [s.companyName || "FORGET"],
      [`INN: ${s.inn || "—"}   Hisobot: Schyot bo'yicha aylanma (ОСВ)   Davr: ${monthText}`],
      [`Hisobvaraq: ${schLabel}`],
      [],
      ["T/r", "Sana", "Birlamchi hisob hujjati", "Operatsiyaning mazmuni", "Summa (so'm)", "Debet", "Kredit", "Qoldiq Debet (so'm)", "Qoldiq Kredit (so'm)"]
    ];

    if (!osvRes.isAll) {
      aoa.push(["—", "", "Davr boshiga qoldiq", "", 0, "", "", osvRes.boshlangichDt, osvRes.boshlangichKt]);
    }

    osvRes.rows.forEach((r) => {
      aoa.push([
        r.tr,
        r.sana,
        r.hujjat || "",
        r.mazmuni || "",
        toNum(r.summa),
        r.dt,
        r.kt,
        r.qoldiqDt > 0 ? r.qoldiqDt : 0,
        r.qoldiqKt > 0 ? r.qoldiqKt : 0
      ]);
    });

    if (!osvRes.isAll) {
      aoa.push([
        "JAMI",
        "",
        "Davr bo'yicha jami aylanma va oxirgi saldo",
        "",
        osvRes.oborotDt + osvRes.oborotKt,
        osvRes.oborotDt,
        osvRes.oborotKt,
        osvRes.oxirgiDt,
        osvRes.oxirgiKt
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 38 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Aylanma_${targetSch}`);
    XLSX.writeFile(wb, `FORGET_aylanma_${targetSch}_${todayISO()}.xlsx`);
    toast("Schyot aylanmasi Excel formatida yuklab olindi", "ok");
  }

  function printAylanmaPdf(osvRes, targetSch, monthId) {
    const s = STORE.settings || {};
    const schMeta = BUXGALTERIYA_SCHYOTLAR_FULL[targetSch] || {};
    const schLabel = targetSch === "9999" ? "Barcha hisoblar" : `${targetSch} — ${schMeta.nomi || ""}`;
    const monthText = monthId === "all" ? "Butun yil" : `${monthId}-oy`;

    const bodyRows = osvRes.rows.map((r) => `
      <tr>
        <td class="num">${r.tr}</td>
        <td>${escapeHtml(r.sana || "")}</td>
        <td>${escapeHtml(r.hujjat || "—")}</td>
        <td>${escapeHtml(r.mazmuni || "—")}</td>
        <td class="num font-bold">${formatSum(r.summa)}</td>
        <td style="text-align:center;font-weight:600;color:#2f6f5e;">${escapeHtml(r.dt)}</td>
        <td style="text-align:center;font-weight:600;color:#c25e2e;">${escapeHtml(r.kt)}</td>
        <td class="num" style="color:#2f6f5e;">${r.qoldiqDt > 0 ? formatSum(r.qoldiqDt) : "—"}</td>
        <td class="num" style="color:#c25e2e;">${r.qoldiqKt > 0 ? formatSum(r.qoldiqKt) : "—"}</td>
      </tr>
    `).join("");

    const html = `
      <!doctype html>
      <html lang="uz">
      <head>
        <meta charset="UTF-8">
        <title>Schyot Aylanmasi (ОСВ) — ${escapeHtml(targetSch)}</title>
        <style>
          body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px; color: #1c2530; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .sub { font-size: 12px; color: #5b6b7b; margin: 0 0 4px; }
          .period { font-size: 12px; color: #5b6b7b; margin: 0 0 16px; }
          .grid-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
          .card { border: 1px solid #ccd3da; border-radius: 6px; padding: 8px 12px; background: #f8fafc; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ccd3da; padding: 5px 7px; text-align: left; }
          th { background: #eceff2; font-weight: bold; }
          td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
          .font-bold { font-weight: bold; }
          tfoot td { font-weight: 700; border-top: 2px solid #1c2530; background: #f8fafc; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(s.companyName || "FORGET")}</h1>
        <div class="sub">INN: ${escapeHtml(s.inn || "—")} &middot; Buxgalteriya hisobi (BHMS 21)</div>
        <div class="period">Hisoblar bo'yicha aylanma vedomosti (ОСВ) &middot; <b>${escapeHtml(schLabel)}</b> &middot; Davr: ${escapeHtml(monthText)}</div>
        
        <div class="grid-cards">
          <div class="card">
            <div>Boshlang'ich qoldiq:</div>
            <b>Dt: ${formatSum(osvRes.boshlangichDt)} | Kt: ${formatSum(osvRes.boshlangichKt)}</b>
          </div>
          <div class="card">
            <div>Davr aylanmasi (Oborot):</div>
            <b>Dt: +${formatSum(osvRes.oborotDt)} | Kt: -${formatSum(osvRes.oborotKt)}</b>
          </div>
          <div class="card">
            <div>Oxirgi qoldiq (Saldo):</div>
            <b>Dt: ${formatSum(osvRes.oxirgiDt)} | Kt: ${formatSum(osvRes.oxirgiKt)}</b>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="num" style="width:35px;">T/r</th>
              <th style="width:75px;">Sana</th>
              <th style="width:110px;">Hujjat</th>
              <th>Operatsiyaning mazmuni</th>
              <th class="num" style="width:100px;">Summa</th>
              <th style="width:55px;text-align:center;">Debet</th>
              <th style="width:55px;text-align:center;">Kredit</th>
              <th class="num" style="width:105px;">Qoldiq Dt</th>
              <th class="num" style="width:105px;">Qoldiq Kt</th>
            </tr>
          </thead>
          <tbody>
            ${!osvRes.isAll ? `
              <tr style="background:#f1f5f9;font-weight:bold;">
                <td>—</td>
                <td colspan="3">Davr boshiga qoldiq</td>
                <td class="num">—</td>
                <td></td><td></td>
                <td class="num">${formatSum(osvRes.boshlangichDt)}</td>
                <td class="num">${formatSum(osvRes.boshlangichKt)}</td>
              </tr>
            ` : ""}
            ${bodyRows || `<tr><td colspan="9" style="text-align:center;padding:15px;">Operatsiyalar mavjud emas</td></tr>`}
          </tbody>
          ${!osvRes.isAll ? `
            <tfoot>
              <tr>
                <td colspan="4"><b>Jami aylanma va yakuniy qoldiq</b></td>
                <td class="num"><b>${formatSum(osvRes.oborotDt + osvRes.oborotKt)}</b></td>
                <td style="text-align:center;">${formatSum(osvRes.oborotDt)}</td>
                <td style="text-align:center;">${formatSum(osvRes.oborotKt)}</td>
                <td class="num"><b>${formatSum(osvRes.oxirgiDt)}</b></td>
                <td class="num"><b>${formatSum(osvRes.oxirgiKt)}</b></td>
              </tr>
            </tfoot>
          ` : ""}
        </table>
      </body>
      </html>
    `;
    safeOpenPrintWindow(html);
  }

  function exportShaxmatkaXlsx(shx, bk, activeTab, monthId) {
    const s = STORE.settings || {};
    const monthText = monthId === "all" ? "Butun yil" : `${monthId}-oy`;

    if (activeTab === "shaxmatka") {
      const aoa = [
        [s.companyName || "FORGET"],
        [`INN: ${s.inn || "—"}   Shaxmatka vedomosti (Debet x Kredit)   Davr: ${monthText}`],
        [`Jami aylanma: ${shx.grandTotal}`],
        [],
        ["Debet \\ Kredit", ...shx.ktAccounts, "JAMI DEBET"]
      ];

      shx.dtAccounts.forEach((dt) => {
        const row = [`${dt} ${getSchyotNomi(dt)}`];
        shx.ktAccounts.forEach((kt) => {
          const val = (shx.matrix[dt] && shx.matrix[dt][kt]) || 0;
          row.push(val);
        });
        row.push(shx.dtTotals[dt] || 0);
        aoa.push(row);
      });

      const bottomRow = ["JAMI KREDIT"];
      shx.ktAccounts.forEach((kt) => {
        bottomRow.push(shx.ktTotals[kt] || 0);
      });
      bottomRow.push(shx.grandTotal);
      aoa.push(bottomRow);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shaxmatka");
      XLSX.writeFile(wb, `FORGET_shaxmatka_${todayISO()}.xlsx`);
      toast("Shaxmatka vedomosti Excel formatida yuklab olindi", "ok");
    } else {
      // Bosh kitob
      const aoa = [
        [s.companyName || "FORGET"],
        [`INN: ${s.inn || "—"}   Bosh Kitob (Главная книга)`],
        [`Hisobvaraq: ${bk.schyot} — ${bk.nomi}`],
        [],
        ["Oy", "Debet aylanma (so'm)", "Kredit aylanma (so'm)", "Qoldiq Debet (so'm)", "Qoldiq Kredit (so'm)"]
      ];

      bk.rows.forEach((r) => {
        aoa.push([
          `${r.oy}-oy`,
          toNum(r.dtOborot),
          toNum(r.ktOborot),
          toNum(r.qoldiqDt),
          toNum(r.qoldiqKt)
        ]);
      });

      aoa.push([
        "JAMI YILLIK",
        bk.totalDt,
        bk.totalKt,
        bk.oxirgiDt,
        bk.oxirgiKt
      ]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `BoshKitob_${bk.schyot}`);
      XLSX.writeFile(wb, `FORGET_bosh_kitob_${bk.schyot}_${todayISO()}.xlsx`);
      toast("Bosh kitob Excel formatida yuklab olindi", "ok");
    }
  }

  function printShaxmatkaPdf(shx, bk, activeTab, monthId) {
    const s = STORE.settings || {};
    const monthText = monthId === "all" ? "Butun yil" : `${monthId}-oy`;

    if (activeTab === "shaxmatka") {
      const headerCols = shx.ktAccounts.map((kt) => `<th>${escapeHtml(kt)}</th>`).join("");
      const bodyRows = shx.dtAccounts.map((dt) => {
        const cells = shx.ktAccounts.map((kt) => {
          const val = (shx.matrix[dt] && shx.matrix[dt][kt]) || 0;
          return `<td class="num">${val > 0 ? formatSum(val) : "—"}</td>`;
        }).join("");
        return `
          <tr>
            <td><b>${escapeHtml(dt)}</b> <span style="font-size:10px;color:#5b6b7b;">${escapeHtml(getSchyotNomi(dt))}</span></td>
            ${cells}
            <td class="num font-bold">${formatSum(shx.dtTotals[dt] || 0)}</td>
          </tr>
        `;
      }).join("");

      const footerCells = shx.ktAccounts.map((kt) => `<td class="num font-bold">${formatSum(shx.ktTotals[kt] || 0)}</td>`).join("");

      const html = `
        <!doctype html>
        <html lang="uz">
        <head>
          <meta charset="UTF-8">
          <title>Shaxmatka Vedomosti</title>
          <style>
            body { font-family: Arial, "Segoe UI", sans-serif; padding: 20px; color: #1c2530; }
            h1 { font-size: 17px; margin: 0 0 4px; }
            .sub { font-size: 11.5px; color: #5b6b7b; margin: 0 0 4px; }
            .period { font-size: 11.5px; color: #5b6b7b; margin: 0 0 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; }
            th, td { border: 1px solid #ccd3da; padding: 4px 6px; }
            th { background: #eceff2; font-weight: bold; text-align: center; }
            td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
            .font-bold { font-weight: bold; }
            tfoot td { font-weight: 700; border-top: 2px solid #1c2530; background: #f8fafc; }
            @media print { body { padding: 0; } @page { size: landscape; margin: 10mm; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(s.companyName || "FORGET")}</h1>
          <div class="sub">INN: ${escapeHtml(s.inn || "—")} &middot; Buxgalteriya hisobi (BHMS 21)</div>
          <div class="period">Shaxmat aylanma vedomosti (Шахматка) &middot; Davr: ${escapeHtml(monthText)} &middot; Jami aylanma: <b>${formatSum(shx.grandTotal)} so'm</b></div>
          <table>
            <thead>
              <tr>
                <th>Debet \\ Kredit</th>
                ${headerCols}
                <th class="num">JAMI DEBET</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <td><b>JAMI KREDIT</b></td>
                ${footerCells}
                <td class="num"><b>${formatSum(shx.grandTotal)}</b></td>
              </tr>
            </tfoot>
          </table>
        </body>
        </html>
      `;
      safeOpenPrintWindow(html);
    } else {
      // Bosh kitob
      const bodyRows = bk.rows.map((r) => `
        <tr>
          <td><b>${r.oy}-oy</b></td>
          <td class="num">${formatSum(r.dtOborot)}</td>
          <td class="num">${formatSum(r.ktOborot)}</td>
          <td class="num" style="color:#2f6f5e;">${r.qoldiqDt > 0 ? formatSum(r.qoldiqDt) : "—"}</td>
          <td class="num" style="color:#c25e2e;">${r.qoldiqKt > 0 ? formatSum(r.qoldiqKt) : "—"}</td>
        </tr>
      `).join("");

      const html = `
        <!doctype html>
        <html lang="uz">
        <head>
          <meta charset="UTF-8">
          <title>Bosh Kitob — ${escapeHtml(bk.schyot)}</title>
          <style>
            body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px; color: #1c2530; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .sub { font-size: 12px; color: #5b6b7b; margin: 0 0 4px; }
            .period { font-size: 12px; color: #5b6b7b; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
            th, td { border: 1px solid #ccd3da; padding: 6px 8px; }
            th { background: #eceff2; font-weight: bold; }
            td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
            tfoot td { font-weight: 700; border-top: 2px solid #1c2530; background: #f8fafc; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(s.companyName || "FORGET")}</h1>
          <div class="sub">INN: ${escapeHtml(s.inn || "—")} &middot; Buxgalteriya hisobi (BHMS 21)</div>
          <div class="period">Bosh Kitob (Главная книга) &middot; <b>${escapeHtml(bk.schyot)} — ${escapeHtml(bk.nomi)}</b></div>
          <table>
            <thead>
              <tr>
                <th>Davr (Oy)</th>
                <th class="num">Debet aylanma (so'm)</th>
                <th class="num">Kredit aylanma (so'm)</th>
                <th class="num">Oxirgi qoldiq Dt</th>
                <th class="num">Oxirgi qoldiq Kt</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <td><b>JAMI YILLIK</b></td>
                <td class="num"><b>${formatSum(bk.totalDt)}</b></td>
                <td class="num"><b>${formatSum(bk.totalKt)}</b></td>
                <td class="num"><b>${formatSum(bk.oxirgiDt)}</b></td>
                <td class="num"><b>${formatSum(bk.oxirgiKt)}</b></td>
              </tr>
            </tfoot>
          </table>
        </body>
        </html>
      `;
      safeOpenPrintWindow(html);
    }
  }

  function exportBoshlangichXlsx(qoldiqlar) {
    const s = STORE.settings || {};
    const aoa = [
      [s.companyName || "FORGET"],
      [`INN: ${s.inn || "—"}   Boshlang'ich qoldiqlar (Йил бошига қолдиқ)   Sana: ${todayISO()}`],
      [],
      ["Schyot", "Hisobvaraq nomi", "Turi", "Bo'limi", "Yil boshiga Debet (so'm)", "Yil boshiga Kredit (so'm)"]
    ];

    let totalDt = 0;
    let totalKt = 0;
    Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).forEach((sch) => {
      const meta = BUXGALTERIYA_SCHYOTLAR_FULL[sch];
      const q = (qoldiqlar && qoldiqlar[sch]) || { dt: 0, kt: 0 };
      const dt = toNum(q.dt);
      const kt = toNum(q.kt);
      if (dt > 0 || kt > 0) {
        totalDt += dt;
        totalKt += kt;
        aoa.push([sch, meta.nomi, meta.turi, meta.bolim, dt, kt]);
      }
    });

    aoa.push(["JAMI", "Balans jami", "", "", totalDt, totalKt]);
    aoa.push(["FARQ", totalDt === totalKt ? "Muvozanatda (0)" : `Farq: ${Math.abs(totalDt - totalKt)}`, "", "", "", ""]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 10 }, { wch: 38 }, { wch: 8 }, { wch: 28 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Boshlangich_qoldiqlar");
    XLSX.writeFile(wb, `FORGET_boshlangich_qoldiqlar_${todayISO()}.xlsx`);
    toast("Boshlang'ich qoldiqlar Excel formatida yuklab olindi", "ok");
  }

  function printBoshlangichPdf(qoldiqlar) {
    const s = STORE.settings || {};
    let totalDt = 0;
    let totalKt = 0;
    const rows = [];

    Object.keys(BUXGALTERIYA_SCHYOTLAR_FULL).forEach((sch) => {
      const meta = BUXGALTERIYA_SCHYOTLAR_FULL[sch];
      const q = (qoldiqlar && qoldiqlar[sch]) || { dt: 0, kt: 0 };
      const dt = toNum(q.dt);
      const kt = toNum(q.kt);
      if (dt > 0 || kt > 0) {
        totalDt += dt;
        totalKt += kt;
        rows.push(`
          <tr>
            <td><b>${sch}</b></td>
            <td>${escapeHtml(meta.nomi)}</td>
            <td style="text-align:center;">${meta.turi}</td>
            <td>${escapeHtml(meta.bolim)}</td>
            <td class="num" style="color:#2f6f5e;">${dt > 0 ? formatSum(dt) : "—"}</td>
            <td class="num" style="color:#c25e2e;">${kt > 0 ? formatSum(kt) : "—"}</td>
          </tr>
        `);
      }
    });

    const diff = totalDt - totalKt;

    const html = `
      <!doctype html>
      <html lang="uz">
      <head>
        <meta charset="UTF-8">
        <title>Boshlang'ich Qoldiqlar Vedomosti</title>
        <style>
          body { font-family: Arial, "Segoe UI", sans-serif; padding: 24px; color: #1c2530; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .sub { font-size: 12px; color: #5b6b7b; margin: 0 0 4px; }
          .period { font-size: 12px; color: #5b6b7b; margin: 0 0 16px; }
          .banner { padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 12.5px; border: 1px solid #ccd3da; background: #f8fafc; }
          table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
          th, td { border: 1px solid #ccd3da; padding: 5px 8px; }
          th { background: #eceff2; font-weight: bold; }
          td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
          tfoot td { font-weight: 700; border-top: 2px solid #1c2530; background: #f8fafc; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(s.companyName || "FORGET")}</h1>
        <div class="sub">INN: ${escapeHtml(s.inn || "—")} &middot; Buxgalteriya hisobi (BHMS 21)</div>
        <div class="period">Boshlang'ich qoldiqlar (Йил бошига қолдиқ) &middot; Sana: ${todayISO()}</div>
        
        <div class="banner">
          <b>Balans tengligi:</b> Jami Debet: <b>${formatSum(totalDt)} so'm</b> | Jami Kredit: <b>${formatSum(totalKt)} so'm</b> | Farq: <b>${diff === 0 ? "Muvozanatda (0) ✓" : formatSum(Math.abs(diff)) + " so'm"}</b>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:70px;">Schyot</th>
              <th>Hisobvaraq nomi</th>
              <th style="width:55px;text-align:center;">Turi</th>
              <th>Bo'limi</th>
              <th class="num" style="width:130px;">Boshlang'ich Dt</th>
              <th class="num" style="width:130px;">Boshlang'ich Kt</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join("") || `<tr><td colspan="6" style="text-align:center;padding:15px;">Boshlang'ich qoldiqlar kiritilmagan</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"><b>JAMI BALANS</b></td>
              <td class="num"><b>${formatSum(totalDt)}</b></td>
              <td class="num"><b>${formatSum(totalKt)}</b></td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;
    safeOpenPrintWindow(html);
  }

  // Tashqi chaqiruvlar uchun eksportlar
  window.exportAylanmaXlsx = exportAylanmaXlsx;
  window.printAylanmaPdf = printAylanmaPdf;
  window.exportShaxmatkaXlsx = exportShaxmatkaXlsx;
  window.printShaxmatkaPdf = printShaxmatkaPdf;
  window.exportBoshlangichXlsx = exportBoshlangichXlsx;
  window.printBoshlangichPdf = printBoshlangichPdf;
  window.printOperatsiyalarPdf = printOperatsiyalarPdf;

  window.getBuxgalteriyaSummary = getBuxgalteriyaSummary;
  window.renderBuxgalteriyaHub = renderBuxgalteriyaHub;
  window.renderBuxWorkstationHeader = renderBuxWorkstationHeader;

  // Ilova ishga tushganda avtomatik saqlangan ma'lumotlarni tekshirish
  initBuxgalteriyaStore();

})();

