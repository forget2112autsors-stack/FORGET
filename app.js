/* ==========================================================================
   FORGET — real vaqtda sinxronlanadigan buxgalteriya bazasi.
   Ma'lumotlar Supabase (PostgreSQL) bulut bazasida saqlanadi va barcha
   ulangan brauzerlarda real vaqtda (realtime) sinxronlanadi. Kirish uchun
   umumiy parol (Supabase Auth) talab qilinadi.
   Bo'limlar: Faktura kirim / Faktura chiqim / Bank / Ish haqi -> shulardan
   F2, QQS, Foyda solig'i, Ish haqi hisoboti va F1 hisobotlari avtomatik hisoblanadi.
   ========================================================================== */

const THEME_KEY = "bux2112_theme";
const FILTERS_KEY = "bux2112_filters";

function normStatus(s) {
  if (s == null) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

const STATUS_INVALID = [
  "отказ",
  "bekor qilingan",
  "отменен",
  "отклонен",
  "отозван",
  "rad etilgan",
  "не настоящий"
];
const STATUS_INVALID_SET = new Set(STATUS_INVALID.map(normStatus));

// Bitta umumiy Supabase loyihasiga ulanadigan client (index.html'dagi
// SUPABASE_URL/SUPABASE_ANON_KEY orqali) — initSupabaseClient() ishga
// tushiradi, script yuklanganda bir marta.
let sbClient = null;

// Foydalanuvchi login qilgandan keyin ruxsat berilgan firmalar orasida
// (chiqmasdan) almashtiradigan "joriy firma" holati. Bitta bazada bir nechta
// firmaning ma'lumotlari firma_id ustuni orqali ajratiladi — RLS foydalanuvchi
// a'zo bo'lgan HAR QANDAY firmaga ruxsat beradi, shu sabab "joriy firma"
// tushunchasi faqat mijoz (client) tomonida bo'ladi va har bir o'qish/yozishda
// aniq firma_id filtri sifatida qo'llanadi — qarang: switchFirma, toDbRow,
// fetchAllRows.
let ACTIVE_FIRMA_ID = null;
const ACTIVE_FIRMA_KEY = "bux2112_active_firma";
let AVAILABLE_FIRMALAR = []; // [{id, nomi}] — joriy foydalanuvchi kira oladigan firmalar

/* ---------------------------- DB <-> JS maydon moslashtirish ---------------------------- */

const INVOICE_DB_MAP = {
  sana: "sana", hujjatRaqami: "hujjat_raqami", status: "status",
  kontragentInn: "kontragent_inn", kontragentNomi: "kontragent_nomi",
  summaQQSsiz: "summa_qqssiz", qqsStavka: "qqs_stavka", qqsSumma: "qqs_summa",
  jamiSumma: "jami_summa", tolandi: "tolandi", tolandiOverride: "tolandi_override", faylId: "fayl_id",
  // Faqat "chiqim" uchun ma'noli: tovarsiz (xizmat/vositachilik) sotuv — kelgusi
  // "yumshoq tasdiq" bosqichida kalkulyatsiya talab qilinmaydi. Qarang:
  // migration_fifo_tasdiq.sql. "kirim"da doim bo'sh qoladi.
  tovarsiz: "tovarsiz"
};
const BANK_DB_MAP = {
  sana: "sana", hujjatRaqami: "hujjat_raqami", kontragent: "kontragent",
  kontragentInn: "kontragent_inn", tavsif: "tavsif", kirim: "kirim", chiqim: "chiqim", faylId: "fayl_id",
  xizmat: "xizmat",
  schyot: "schyot", valyuta: "valyuta", valyutaSumma: "valyuta_summa", kurs: "kurs"
};
const KASSA_DB_MAP = {
  sana: "sana", hujjatRaqami: "hujjat_raqami", turi: "turi",
  kontragent: "kontragent", kontragentInn: "kontragent_inn",
  schyot: "schyot", summa: "summa", tavsif: "tavsif",
  kimdanKimga: "kimdan_kimga", hujjatAsosi: "hujjat_asosi",
  pasport: "pasport", faylId: "fayl_id", createdAt: "created_at"
};
const FAYL_DB_MAP = { bolim: "bolim", faylNomi: "fayl_nomi", hajmi: "hajmi", sana: "sana" };
const ISHHAQI_DB_MAP = {
  sana: "sana", fio: "fio", lavozimi: "lavozimi", pinfl: "pinfl",
  turi: "turi", holati: "holati", oyliqSumma: "oyliq_summa", imtiyozSumma: "imtiyoz_summa", faylId: "fayl_id"
};
const TABEL_DB_MAP = {
  yil: "yil", oy: "oy", xodimId: "xodim_id", fio: "fio", lavozimi: "lavozimi", pinfl: "pinfl",
  oklad: "oklad", stavka: "stavka", grafik: "grafik", kunlar: "kunlar",
  ishlanganKun: "ishlangan_kun", ishlanganSoat: "ishlangan_soat",
  tatilKun: "tatil_kun", tatilSumma: "tatil_summa",
  kasallikKun: "kasallik_kun", kasallikSumma: "kasallik_summa",
  mukofot: "mukofot", faktikOylik: "faktik_oylik", jamiHisoblandi: "jami_hisoblandi", izoh: "izoh"
};
const OMBOR_DB_MAP = {
  sana: "sana", hujjatRaqami: "hujjat_raqami",
  kontragentInn: "kontragent_inn", kontragentNomi: "kontragent_nomi",
  nomi: "nomi", birlik: "birlik", miqdor: "miqdor", narx: "narx",
  yetkazibBerishNarxi: "yetkazib_berish_narxi", qqsSumma: "qqs_summa",
  yetkazibBerishNarxiQQSBilan: "yetkazib_berish_narxi_qqs_bilan", turi: "turi", faylId: "fayl_id",
  // Bu qator qaysi "Faktura kirim" hujjatidan (handleInvoiceImport orqali,
  // avtomatik) hosil bo'lganini bildiradi — eski (kirim_id'siz) yozuvlar yoki
  // alohida "Ombor" sahifasidan qo'lda import qilinganlar uchun bo'sh (null)
  // qoladi. Qarang: handleInvoiceImport, openKirimDetailModal.
  kirimId: "kirim_id",
  // Bir kun ichidagi kirim/chiqim harakatlarini FIFO navbatida deterministik
  // tartiblash uchun (sana bir xil bo'lganda). Faqat o'qish uchun ishlatiladi
  // (baza o'zi to'ldiradi). Qarang: cmpOmbor, buildFifoLedger.
  createdAt: "created_at"
};

const MAHSULOT_DB_MAP = { nomi: "nomi", birlik: "birlik", tarkib: "tarkib", standartNarxi: "standart_narxi", foydaNormasi: "foyda_normasi" };
const ISHLAB_CHIQARISH_DB_MAP = {
  sana: "sana", mahsulotId: "mahsulot_id", mahsulotNomi: "mahsulot_nomi",
  miqdor: "miqdor", birlik: "birlik", tannarx: "tannarx", izoh: "izoh",
  foydaNormasi: "foyda_normasi"
};
// Chiqim faktura import qilinganda har bir sotilgan mahsulot qatori shu
// jadvalga yoziladi va "Mahsulotlar" kalkulyatsiyasi bilan avtomat (yoki
// qo'lda) bog'lanadi — qarang: matchMahsulotForChiqimLine, handleInvoiceImport.
const CHIQIM_TAFSIL_DB_MAP = {
  chiqimId: "chiqim_id", hujjatRaqami: "hujjat_raqami", sana: "sana",
  nomi: "nomi", birlik: "birlik", miqdor: "miqdor", narx: "narx", summa: "summa",
  mahsulotId: "mahsulot_id", mosTuri: "mos_turi", faylId: "fayl_id"
};
const KONTRAGENT_DB_MAP = {
  nomi: "nomi", inn: "inn", manzil: "manzil", telefon: "telefon",
  bankHisob: "bank_hisob", bankMfo: "bank_mfo", bankNomi: "bank_nomi",
  turi: "turi", izoh: "izoh", boshlangichQarz: "boshlangich_qarz"
};
const ASOSIY_VOSITA_DB_MAP = {
  nomi: "nomi", inventarRaqami: "inventar_raqami", ishgaTushirishSanasi: "ishga_tushirish_sanasi",
  boshlangichQiymati: "boshlangich_qiymati", amortizatsiyaStavkasi: "amortizatsiya_stavkasi",
  holati: "holati", izoh: "izoh"
};
// Fayl yuklamalariga ulanish konvensiyasi: agar kelajakda yangi bo'lim ham
// Excel/fayl import qilsa, uning DB_MAP'iga "faylId: \"fayl_id\"" qo'shing,
// jadvalga "fayl_id uuid references public.fayllar(id) on delete cascade"
// ustunini qo'shing va import handler'da har bir yangi qatorni bazaga
// yozishdan OLDIN "await registerFaylUpload(<STORE kaliti>, file)" chaqirib,
// natijadagi .id'ni qatorlarga "faylId" sifatida biriktiring (pastdagi
// handleOmborImport/handleIshHaqiImport shu andozaga misol). STORE kaliti
// "fayllar.bolim" qiymati bilan bir xil bo'lishi shart — shunda "Fayl
// yuklamalari" sahifasi va faylni o'chirishda kaskadli tozalash hech qanday
// qo'shimcha kod yozmasdan avtomat ishlab ketadi.
const TABLE_MAPS = {
  kirim: INVOICE_DB_MAP, chiqim: INVOICE_DB_MAP, bank: BANK_DB_MAP, kassa: KASSA_DB_MAP, ishHaqi: ISHHAQI_DB_MAP, tabel: TABEL_DB_MAP, ombor: OMBOR_DB_MAP,
  mahsulotlar: MAHSULOT_DB_MAP, ishlabChiqarish: ISHLAB_CHIQARISH_DB_MAP, fayllar: FAYL_DB_MAP,
  kontragentlar: KONTRAGENT_DB_MAP, asosiyVositalar: ASOSIY_VOSITA_DB_MAP, chiqimTafsil: CHIQIM_TAFSIL_DB_MAP
};
const TABLE_NAMES = {
  kirim: "kirim", chiqim: "chiqim", bank: "bank", kassa: "kassa", ishHaqi: "ish_haqi", tabel: "tabel", ombor: "ombor",
  mahsulotlar: "mahsulotlar", ishlabChiqarish: "ishlab_chiqarish", fayllar: "fayllar",
  kontragentlar: "kontragentlar", asosiyVositalar: "asosiy_vositalar", chiqimTafsil: "chiqim_tafsil"
};

const SETTINGS_DB_MAP = {
  companyName: "company_name", inn: "inn", address: "address",
  qqsStavka: "qqs_stavka", foydaStavka: "foyda_stavka", period: "period",
  davrXarajati: "davr_xarajati", moliyaviyXarajat: "moliyaviy_xarajat",
  ishHaqiAvtoXarajat: "ish_haqi_avto_xarajat",
  boshqaDaromad: "boshqa_daromad", imtiyozlar: "imtiyozlar", tannarxManual: "tannarx_manual",
  bankOpeningBalance: "bank_opening_balance",
  kassaOpeningBalance: "kassa_opening_balance",
  f1AsosiyVositalar: "f1_asosiy_vositalar", f1TovarZaxira: "f1_tovar_zaxira", f1Kassa: "f1_kassa",
  f1UstavKapitali: "f1_ustav_kapitali", f1OldingiFoyda: "f1_oldingi_foyda", f1UzoqMajburiyat: "f1_uzoq_majburiyat",
  ijtimoiySoliqStavka: "ijtimoiy_soliq_stavka", ndflStavka: "ndfl_stavka", inpsStavka: "inps_stavka",
  ishHaqiTolovKuni: "ish_haqi_tolov_kuni",
  rahbar: "rahbar",
  // Ombor tannarx hisobi usuli: "fifo" (partiyalar bo'yicha, standart) yoki
  // "ortacha" (eski o'rtacha xarid narxi). defaultFoydaNormasi — kalkulyatsiya
  // bilan bog'lanmagan sotuv qatori uchun taxminiy tannarx koeffitsiyenti
  // (tannarx = summa * (1 - normasi)). Qarang: migration_fifo_tasdiq.sql,
  // computeMahsulotConsumption, computeTotals.
  tannarxUsuli: "tannarx_usuli",
  defaultFoydaNormasi: "default_foyda_normasi",
  // Faoliyat yo'nalishi ("Funksionallik") — qarang: migration_faoliyat_yonalishi.sql,
  // YONALISHLAR, applyModuleVisibility. modul* null bo'lsa "ko'rinadi" deb qaraladi.
  yonalish: "yonalish",
  modulOmbor: "modul_ombor",
  modulIshlabChiqarish: "modul_ishlab_chiqarish",
  modulAsosiyVositalar: "modul_asosiy_vositalar",
  // Didox / E-Faktura API integratsiyasi
  didoxToken: "didox_token",
  didoxApiUrl: "didox_api_url",
  didoxAutoOmbor: "didox_auto_ombor",
  valyutaOpeningBalance: "valyuta_opening_balance"
};

// Excel/CSV fayllardan o'qilgan matnlarda ba'zan uzilgan unicode surrogate
// juftlik uchraydi (eski bank ko'chirmalarida ko'p). Bunday belgi bazaga
// yozilganda audit_log trigger'i to_jsonb() chaqirganda "invalid input
// syntax for type json" xatoligi bilan butun yozuvni bekor qiladi — shu
// sabab har bir matnni bazaga yuborishdan oldin tozalab olamiz.
function stripLoneSurrogates(str) {
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, (m) => m.length > 1 ? m[0] : "");
}

function toDbRow(map, obj) {
  const out = {};
  Object.keys(map).forEach((k) => {
    if (obj[k] === undefined) return;
    out[map[k]] = typeof obj[k] === "string" ? stripLoneSurrogates(obj[k]) : obj[k];
  });
  // Yagona joy — har bir insert/update shu orqali o'tadi, shu sabab har bir
  // qatorga joriy firma avtomat biriktiriladi (alohida-alohida call site'larda
  // qo'lda qo'shish shart emas). settings jadvali bundan mustasno — u
  // saveSettingsToDb() orqali, alohida (SETTINGS_DB_MAP bilan) yoziladi.
  if (ACTIVE_FIRMA_ID) out.firma_id = ACTIVE_FIRMA_ID;
  return out;
}

function fromDbRow(map, row) {
  const out = { id: row.id };
  Object.keys(map).forEach((k) => { out[k] = row[map[k]]; });
  return out;
}

function fromDbSettings(row) {
  const out = {};
  Object.keys(SETTINGS_DB_MAP).forEach((k) => { out[k] = row[SETTINGS_DB_MAP[k]]; });
  return out;
}

async function saveSettingsToDb(partial) {
  const dbPartial = {};
  Object.keys(partial).forEach((k) => {
    if (!SETTINGS_DB_MAP[k]) return;
    dbPartial[SETTINGS_DB_MAP[k]] = typeof partial[k] === "string" ? stripLoneSurrogates(partial[k]) : partial[k];
  });
  if (!Object.keys(dbPartial).length) return;
  // Yangi qo'shilgan ustunlar (masalan "rahbar") migratsiyasi hali ishga
  // tushirilmagan bazada butun sozlamalar saqlanishini buzmasligi uchun,
  // "column does not exist" xatosida shu ustunni chiqarib tashlab qayta
  // urinamiz — qolgan maydonlar baribir saqlanadi.
  let attempt = dbPartial;
  for (let i = 0; i < 5; i++) {
    const { error } = await sbClient.from("settings").update(attempt).eq("firma_id", ACTIVE_FIRMA_ID);
    if (!error) return;
    const missingCol = isMissingColumnError(error) && extractMissingColumnName(error);
    if (missingCol && attempt[missingCol] !== undefined) {
      const rest = { ...attempt };
      delete rest[missingCol];
      attempt = rest;
      if (!Object.keys(attempt).length) return;
      continue;
    }
    console.error(error);
    toast("Sozlamani saqlashda xatolik", "err");
    return;
  }
}

// Sozlama qiymatlariga qo'yiladigan cheklovlar. "Stavka" maydonlari 0..100
// oralig'ida, "summa" maydonlari manfiy bo'lmasligi kerak. INN va korxona nomi
// faqat ogohlantiradi (saqlashni bloklamaydi).
const SETTINGS_RATE_FIELDS = ["qqsStavka", "foydaStavka", "ijtimoiySoliqStavka", "ndflStavka", "inpsStavka"];
const SETTINGS_AMOUNT_FIELDS = [
  "davrXarajati", "moliyaviyXarajat", "boshqaDaromad", "imtiyozlar", "bankOpeningBalance", "kassaOpeningBalance",
  "f1AsosiyVositalar", "f1TovarZaxira", "f1Kassa", "f1UstavKapitali", "f1OldingiFoyda", "f1UzoqMajburiyat"
];

function isBlank(v) {
  return v === undefined || v === null || v === "";
}

// Sozlamalarning to'liq yoki qisman obyektini tekshiradi.
// -> { ok, errors: {maydon: xabar}, warnings: {maydon: xabar} }
function validateSettings(s) {
  const errors = {};
  const warnings = {};
  SETTINGS_RATE_FIELDS.forEach((k) => {
    if (isBlank(s[k])) return;
    const n = Number(s[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100) errors[k] = "0 dan 100 gacha bo'lgan son bo'lishi kerak";
  });
  SETTINGS_AMOUNT_FIELDS.forEach((k) => {
    if (isBlank(s[k])) return;
    const n = Number(s[k]);
    if (!Number.isFinite(n) || n < 0) errors[k] = "Manfiy bo'lmagan son bo'lishi kerak";
  });
  if (!isBlank(s.tannarxManual)) {
    const n = Number(s.tannarxManual);
    if (!Number.isFinite(n) || n < 0) errors.tannarxManual = "Bo'sh qoldiring yoki manfiy bo'lmagan son kiriting";
  }
  if (!isBlank(s.ishHaqiTolovKuni)) {
    const n = Number(s.ishHaqiTolovKuni);
    if (!Number.isInteger(n) || n < 1 || n > 31) errors.ishHaqiTolovKuni = "1 dan 31 gacha bo'lgan butun son bo'lishi kerak";
  }
  if (!isBlank(s.defaultFoydaNormasi)) {
    const n = Number(s.defaultFoydaNormasi);
    if (!Number.isFinite(n) || n < 0 || n > 0.95) errors.defaultFoydaNormasi = "0 dan 0.95 gacha bo'lgan son bo'lishi kerak";
  }
  if (s.inn !== undefined && String(s.inn).trim() && !/^\d{9}$/.test(String(s.inn).trim())) {
    warnings.inn = "Odatda INN 9 ta raqamdan iborat bo'ladi";
  }
  if (s.companyName !== undefined && !String(s.companyName).trim()) {
    warnings.companyName = "Korxona nomi kiritilmagan — hisobot sarlavhalarida bo'sh ko'rinadi";
  }
  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

// Hisobot ichidagi tez tahrirlagichlar (Foyda, F1, Bank) uchun: berilgan qisman
// o'zgarish sozlamalar cheklovini buzmasligini tekshiradi. Buzsa — toast + false.
function guardSettingsPartial(partial) {
  // Faqat shu o'zgarish tekshiriladi (validateSettings bo'sh maydonlarni o'tkazib
  // yuboradi, cross-field qoida yo'q) — begona eski qiymat saqlashni bloklamaydi.
  const { ok, errors } = validateSettings(partial);
  if (ok) return true;
  toast(errors[Object.keys(errors)[0]] || "Qiymat noto'g'ri", "err");
  return false;
}

/* --------- Umumiy maydon validatsiyasi (butun ilova bo'ylab) --------- */
// Bitta qiymatni turi bo'yicha tekshiradi. -> { ok, msg, warn }
// warn=true bo'lsa: xato emas, faqat ogohlantirish (saqlashni bloklamaydi).
function validateField(kind, value) {
  const raw = value === undefined || value === null ? "" : String(value).trim();
  switch (kind) {
    case "inn":
      if (!raw) return { ok: true };
      return /^\d{9}$/.test(raw) ? { ok: true } : { ok: false, msg: "INN 9 ta raqamdan iborat bo'lishi kerak" };
    case "pinfl":
      if (!raw) return { ok: true };
      return /^\d{14}$/.test(raw) ? { ok: true } : { ok: false, msg: "PINFL 14 ta raqamdan iborat bo'lishi kerak" };
    case "amount": {
      if (raw === "") return { ok: true };
      if (!/^-?[\d\s.,]+$/.test(raw)) return { ok: false, msg: "Faqat son kiriting" };
      const n = toNum(value);
      if (!Number.isFinite(n)) return { ok: false, msg: "Son kiriting" };
      if (n < 0) return { ok: false, msg: "Manfiy bo'lmagan son bo'lishi kerak" };
      return { ok: true };
    }
    case "percent": {
      if (raw === "") return { ok: true };
      if (!/^-?[\d\s.,]+$/.test(raw)) return { ok: false, msg: "Faqat son kiriting" };
      const n = toNum(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, msg: "0 dan 100 gacha bo'lishi kerak" };
      return { ok: true };
    }
    case "sana": {
      if (!raw) return { ok: true };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || isNaN(Date.parse(raw))) return { ok: false, msg: "Sana noto'g'ri (YYYY-MM-DD)" };
      const { filterFrom, filterTo } = STORE.settings;
      if ((filterFrom && raw < filterFrom) || (filterTo && raw > filterTo)) {
        return { ok: true, warn: true, msg: "Sana tanlangan davr oralig'idan tashqarida" };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

// Modal/forma maydoniga (`.field > input`) xato/ogohlantirish belgisini qo'yadi
// yoki tozalaydi (msg bo'sh bo'lsa).
function markFieldError(inputEl, msg, isWarn) {
  if (!inputEl) return;
  const field = inputEl.closest(".field") || inputEl.parentElement;
  if (!field) return;
  field.classList.remove("invalid", "warned");
  field.querySelectorAll(".field-error").forEach((n) => n.remove());
  if (!msg) return;
  field.classList.add(isWarn ? "warned" : "invalid");
  const d = document.createElement("div");
  d.className = "field-error" + (isWarn ? " warn" : "");
  d.textContent = msg;
  field.appendChild(d);
}

// Jadval katagi (`input.cell-input`) uchun: xato bo'lsa qizil belgilaydi,
// toast chiqaradi, qiymatni prevValue'ga qaytaradi va false qaytaradi
// (chaqiruvchi bazaga yozmasligi kerak). Ogohlantirish bloklamaydi.
function guardCell(inputEl, kind, prevValue) {
  const res = validateField(kind, inputEl.value);
  if (res.ok && !res.warn) { inputEl.classList.remove("cell-invalid"); return true; }
  if (res.warn) {
    inputEl.classList.remove("cell-invalid");
    toast(res.msg, "err");
    return true;
  }
  inputEl.classList.add("cell-invalid");
  toast(res.msg, "err");
  if (prevValue !== undefined) inputEl.value = prevValue;
  return false;
}

// Jadval katagi `data-f` maydon nomi -> validateField turi. Xaritada bo'lmagan
// maydon (matn: nomi, lavozimi, tavsif, ...) tekshirilmaydi.
const CELL_VALIDATION_KIND = {
  // faktura kirim/chiqim
  summaQQSsiz: "amount", qqsSumma: "amount", qqsStavka: "percent", jamiSumma: "amount",
  kontragentInn: "inn", sana: "sana",
  // ish haqi va tabel
  oyliqSumma: "amount", imtiyozSumma: "amount", pinfl: "pinfl",
  oklad: "amount", tatilSumma: "amount", kasallikSumma: "amount", mukofot: "amount",
  // bank
  kirim: "amount", chiqim: "amount", valyutaSumma: "amount", kurs: "amount"
};

// Katak `change` ishlovchisi boshida chaqiriladi: tahrirlanган maydon turi bo'yicha
// tekshiriladi. Xato bo'lsa katakни qizil qiladi, oldingi qiymatni qaytaradi (row'dan)
// va false qaytaradi — chaqiruvchi shu yerda return qilishi kerak.
function guardRowCell(inputEl, field, row) {
  const kind = CELL_VALIDATION_KIND[field];
  if (!kind) return true;
  let prev;
  if (kind === "inn" || kind === "pinfl" || kind === "sana") prev = row[field] == null ? "" : String(row[field]);
  else prev = fmt(row[field]);
  return guardCell(inputEl, kind, prev);
}

// Sozlama o'zgarishini YAGONA yo'l orqali qo'llaydi: STORE'ni yangilaydi, bazaga
// yozadi, keshni saqlaydi va (rerender=true bo'lsa) joriy sahifani qayta chizadi —
// shu orqali ochiq turgan hisobot darhol yangi qiymat bilan qayta hisoblanadi.
function applySettingsChange(partial, { rerender = true } = {}) {
  Object.assign(STORE.settings, partial);
  saveSettingsToDb(partial);
  saveStore();
  if (["yonalish", "modulOmbor", "modulIshlabChiqarish", "modulAsosiyVositalar"].some((k) => k in partial)) {
    applyModuleVisibility();
  }
  if (rerender && PAGES[CURRENT_PAGE]) PAGES[CURRENT_PAGE].render();
}

// Bitta qatordagi bir yoki bir nechta maydonni bazaga yozadi (fire-and-forget).
function pushFieldsUpdate(type, id, partial) {
  const dbPartial = toDbRow(TABLE_MAPS[type], partial);
  if (!Object.keys(dbPartial).length) return;
  // toDbRow() har bir qatorga ACTIVE_FIRMA_ID'ni avtomat stamplaydi — shu
  // sabab yozuv aniq JORIY firmaga tegishli bo'lgandagina yangilanishi
  // uchun ".eq(\"firma_id\", ...)" ham qo'shiladi (aks holda, nazariy jihatdan,
  // boshqa firmaga tegishli qator RLS orqali o'tib, joriy firmaga "ko'chib"
  // qolishi mumkin edi).
  sbClient.from(TABLE_NAMES[type]).update(dbPartial).eq("id", id).eq("firma_id", ACTIVE_FIRMA_ID).then(({ error }) => {
    if (error) { reportError(error, "Saqlashda xatolik"); }
  });
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "Izlash va almashtirish" — tanlangan matn maydonida qidiruv so'zini yangi matn
// bilan almashtiradi (bitta qatorda bir necha marta uchrasa — hammasida).
// rows — operatsiya bajariladigan aniq massiv (masalan Ombor uchun joriy tab
// bo'yicha filtrlangan qism); storeType — pushFieldsUpdate uchun jadval kaliti;
// fields — [{key,label}] tanlash mumkin bo'lgan matn ustunlari; onDone — muvaffaqiyatli
// almashtirishdan keyin chaqiriladi (odatda joriy sahifani qayta chizadi).
function openFindReplaceModal({ title, rows, storeType, fields, onDone }) {
  openModal(`
    <h3>${escapeHtml(title || "Izlash va almashtirish")}</h3>
    <div class="field"><label>Maydon</label>
      <select id="frField">${fields.map((f) => `<option value="${f.key}">${escapeHtml(f.label)}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Qidiriladigan matn</label><input id="frSearch" placeholder="masalan: eski nom"></div>
    <div class="field"><label>Yangi matn</label><input id="frReplace" placeholder="masalan: yangi nom"></div>
    <label style="display:flex;align-items:center;gap:6px;margin:4px 0 10px;font-size:13px;">
      <input type="checkbox" id="frCaseSensitive"> Katta-kichik harfni farqlash
    </label>
    <p class="modal-sub" id="frMatchInfo">Qidiriladigan matnni kiriting.</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mConfirm" disabled>Almashtirish</button>
    </div>
  `);
  const fieldEl = document.getElementById("frField");
  const searchEl = document.getElementById("frSearch");
  const caseEl = document.getElementById("frCaseSensitive");
  const info = document.getElementById("frMatchInfo");
  const confirmBtn = document.getElementById("mConfirm");

  function countMatches() {
    const field = fieldEl.value, q = searchEl.value;
    if (!q) { info.textContent = "Qidiriladigan matnni kiriting."; confirmBtn.disabled = true; return; }
    const needle = caseEl.checked ? q : q.toLowerCase();
    const count = rows.filter((r) => {
      const val = r[field];
      if (val === undefined || val === null) return false;
      const hay = caseEl.checked ? String(val) : String(val).toLowerCase();
      return hay.includes(needle);
    }).length;
    info.textContent = count ? `${count} ta qatorda topildi.` : "Hech qanday qator topilmadi.";
    confirmBtn.disabled = count === 0;
  }
  fieldEl.addEventListener("change", countMatches);
  searchEl.addEventListener("input", countMatches);
  caseEl.addEventListener("change", countMatches);

  document.getElementById("mCancel").addEventListener("click", closeModal);
  confirmBtn.addEventListener("click", () => {
    const field = fieldEl.value, q = searchEl.value;
    const replaceText = document.getElementById("frReplace").value;
    if (!q) return;
    const re = new RegExp(escapeRegExp(q), caseEl.checked ? "g" : "gi");
    let count = 0;
    rows.forEach((r) => {
      const val = r[field];
      if (val === undefined || val === null) return;
      const str = String(val);
      const newVal = str.replace(re, replaceText);
      if (newVal === str) return;
      r[field] = newVal;
      pushFieldsUpdate(storeType, r.id, { [field]: newVal });
      count++;
    });
    closeModal();
    if (onDone) onDone();
    toast(`${count} ta qatorda almashtirildi`);
  });
}

// RLS policy o'chirishni rad etganda (masalan, faqat admin o'chira oladigan
// qatorni oddiy xodim o'chirishga urinishi) Supabase/Postgres "42501" xato
// kodini qaytaradi — buni tushunarli xabarga aylantiramiz.
function isPermissionError(error) {
  return !!(error && (error.code === "42501" || /permission|policy|rls/i.test(String(error.message || ""))));
}

// Supabase/tarmoq xatosini bitta joyda log qiladi va foydalanuvchiga izchil
// xabar ko'rsatadi (ruxsat xatosi bo'lsa — alohida matn).
function reportError(err, userMsg) {
  console.error(err);
  toast(isPermissionError(err) ? `${userMsg} — ruxsat yo'q (faqat admin)` : userMsg, "err");
}

// STORE'dan optimistik ravishda o'chiradi (UI darhol yangilanadi), lekin
// bazaga yozish muvaffaqiyatsiz bo'lsa (masalan RLS ruxsat bermasa) qatorni
// JOYIGA qaytaradi — aks holda foydalanuvchi "o'chirildi" deb o'ylab qoladi,
// aslida qator bazada saqlanib qolgan bo'ladi (va keyingi sinxronlashda yoki
// sahifani yangilaganda kutilmaganda "qayta paydo bo'ladi").
async function deleteRowSafe(table, type, id, rerender) {
  const idx = STORE[type].findIndex((r) => r.id === id);
  if (idx === -1) return true;
  const row = STORE[type][idx];
  RECENTLY_DELETED.add(id);
  STORE[type] = STORE[type].filter((r) => r.id !== id);
  updateNavBadges();
  if (rerender) rerender();
  const { error } = await sbClient.from(table).delete().eq("id", id).eq("firma_id", ACTIVE_FIRMA_ID);
  if (error) {
    console.error(error);
    RECENTLY_DELETED.delete(id);
    STORE[type].splice(Math.min(idx, STORE[type].length), 0, row);
    updateNavBadges();
    if (rerender) rerender();
    toast(isPermissionError(error) ? "Sizda bu qatorni o'chirish huquqi yo'q (faqat admin)" : "O'chirishda xatolik", "err");
    return false;
  }
  saveStore();
  return true;
}

/* ---------------------------- default data ---------------------------- */

function defaultStore() {
  return {
    settings: {
      companyName: "",
      inn: "",
      address: "",
      qqsStavka: 12,
      foydaStavka: 15,
      period: "",
      davrXarajati: 0,
      moliyaviyXarajat: 0,
      // Yoqilsa, "Ish haqi" bo'limidagi hisoblangan ish beruvchi xarajati
      // (ish haqi + ijtimoiy soliq) F2'dagi "Davr xarajatlari"ga avtomatik
      // qo'shiladi — qarang: computeTotals. Standart FALSE — mavjud
      // firmalarning F2 raqamlarini o'zgartirib qo'ymaslik uchun.
      ishHaqiAvtoXarajat: false,
      boshqaDaromad: 0,
      imtiyozlar: 0,
      tannarxManual: null,
      bankOpeningBalance: 0,
      kassaOpeningBalance: 0,
      filterFrom: "",
      filterTo: "",
      // F1 uchun qo'lda kiritiladigan ko'rsatkichlar
      f1AsosiyVositalar: 0,
      f1TovarZaxira: 0,
      f1Kassa: 0,
      f1UstavKapitali: 0,
      f1OldingiFoyda: 0,
      f1UzoqMajburiyat: 0,
      // Ish haqi hisoboti uchun soliq stavkalari
      ijtimoiySoliqStavka: 12,
      ndflStavka: 12,
      inpsStavka: 0.1,
      // Ish haqi to'lov kuni (oyning 1-31 kuni, ixtiyoriy) — diqqat
      // qo'ng'irog'ida "to'lov muddati yaqinlashmoqda" eslatmasi uchun.
      ishHaqiTolovKuni: null,
      // Kalkulyatsiya blankasi (chop etish) "UTVERJDAYU" bandida ko'rsatiladi
      rahbar: "",
      // Ombor tannarx hisobi — qarang: SETTINGS_DB_MAP, computeMahsulotConsumption.
      tannarxUsuli: "fifo",
      defaultFoydaNormasi: 0.2,
      // Faoliyat yo'nalishi — qarang: applyModuleVisibility, YONALISHLAR.
      yonalish: "",
      modulOmbor: null,
      modulIshlabChiqarish: null,
      modulAsosiyVositalar: null,
      didoxToken: "",
      didoxApiUrl: "https://api.didox.uz/v1",
      didoxAutoOmbor: true,
      valyutaOpeningBalance: 0
    },
    kirim: [],
    chiqim: [],
    bank: [],
    kassa: [],
    ishHaqi: [],
    tabel: [],
    ombor: [],
    mahsulotlar: [],
    ishlabChiqarish: [],
    fayllar: [],
    kontragentlar: [],
    asosiyVositalar: [],
    chiqimTafsil: []
  };
}

let STORE = defaultStore();
let THEME = localStorage.getItem(THEME_KEY) || "light";
let CURRENT_PAGE = "dashboard";
// Sozlamalar sahifasida saqlanmagan tahrir bor-yo'qligi — navigate() va
// beforeunload shu bayroq bo'yicha ogohlantiradi.
let SETTINGS_DIRTY = false;

// Kirishdan keyingi birinchi "loadAllData" tugaguncha CRUD amallar (masalan,
// Excel import'dagi takror tekshiruvi yoki Sozlamalarni saqlash) STORE hali
// to'liq yuklanmagan (hali bo'sh) holatda ishlab, mavjud ma'lumotni bo'sh
// qiymat bilan ustidan yozib qo'ymasligi uchun shu signaldan foydalanamiz.
let DATA_LOADED = false;
let markDataReady;
const dataReady = new Promise((resolve) => { markDataReady = resolve; });

function requireDataReady() {
  if (!DATA_LOADED) {
    toast("Ma'lumotlar hali to'liq yuklanmadi — bir necha soniyadan so'ng qayta urining", "err");
    return false;
  }
  return true;
}

// Davr filtri (Sana oralig'i) — bu shaxsiy ko'rish sozlamasi, shu sabab umumiy
// bazaga emas, faqat shu brauzerga (localStorage) saqlanadi.
function loadLocalFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? JSON.parse(raw) : { filterFrom: "", filterTo: "" };
  } catch (e) {
    return { filterFrom: "", filterTo: "" };
  }
}

function saveLocalFilters() {
  localStorage.setItem(FILTERS_KEY, JSON.stringify({ filterFrom: STORE.settings.filterFrom, filterTo: STORE.settings.filterTo }));
}

// Supabase/PostgREST standart bo'yicha bitta so'rovdan qaytadigan qatorlar sonini
// 1000 tagacha cheklaydi ("db-max-rows"). Shu sabab jadvalda 1000 dan ortiq
// yozuv bo'lsa, oddiy ".select(\"*\")" faqat birinchi 1000 tasini qaytarardi —
// qolganlari "yo'qolganday" ko'rinardi (aslida bazada bor, shunchaki yuklanmagan
// edi). Bu funksiya ".range()" yordamida sahifalab, JADVALDAGI BARCHA qatorlarni
// (nechta bo'lishidan qat'i nazar) yig'ib qaytaradi.
const SUPABASE_PAGE_SIZE = 1000;

// Sessiya tokeni (JWT) muddati tugaganda Supabase 401 bilan javob beradi —
// bu odatda brauzer tabini uzoq vaqt (bir necha soat) fon rejimida ochiq
// qoldirib, keyin qaytib import/saqlash qilishga urinishda uchraydi (tab fon
// rejimida bo'lganda avtomatik token yangilash pauza qilinishi mumkin). Bunday
// holatda tushunarsiz "Bazaga yozishda xatolik" o'rniga foydalanuvchini aniq
// qayta kirishga yo'naltiramiz.
function isAuthExpiredError(error) {
  return !!(error && /jwt|token/i.test(String(error.message || "")));
}

// scope: "local" — FAQAT shu tab/brauzerdagi sessiyani tugatadi. Standart
// signOut() "global" scope bilan ishlaydi (refresh tokenni serverda ham bekor
// qiladi) — persistSession: true bo'lgani uchun bitta tabda vaqtinchalik/tasodifiy
// 401 xatosi butun foydalanuvchining BOSHQA barcha tab/qurilmalaridagi haqiqiy
// sessiyasini ham o'chirib qo'yishi mumkin edi. Qarang: reconcileData.
async function forceReauth() {
  toast("Sessiya muddati tugadi — qayta kiring", "err");
  try { await sbClient.auth.signOut({ scope: "local" }); } catch (e) { console.error(e); }
}

// Har doim faqat JORIY firmaning qatorlarini o'qiydi. RLS foydalanuvchi
// a'zo bo'lgan HAR QANDAY firmaga ruxsat berishi mumkin (bir nechta firmaga
// kirish huquqi bo'lsa) — shu sabab bu aniq filtr shart, RLS'ning o'ziga
// tayanib bo'lmaydi (qarang: ACTIVE_FIRMA_ID izohi, yuqorida).
async function fetchAllRows(table) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sbClient.from(table).select("*").eq("firma_id", ACTIVE_FIRMA_ID).range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) { if (isAuthExpiredError(error)) forceReauth(); throw error; }
    all = all.concat(data || []);
    if (!data || data.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}

// Xuddi shu 1000 qatorlik chegara ".insert().select()" javobiga ham taalluqli
// bo'lgani uchun, katta fayl (masalan 1000+ qatorli bank ko'chirmasi) import
// qilinganda kichik bo'laklarga bo'lib yozamiz — shunda bazaga yozilgan HAR
// bir qator to'liq qaytariladi va joriy sahifada ham darhol ko'rinadi.
const DB_INSERT_CHUNK_SIZE = 500;

async function insertRowsChunked(table, dbRows) {
  const all = [];
  for (let i = 0; i < dbRows.length; i += DB_INSERT_CHUNK_SIZE) {
    const chunk = dbRows.slice(i, i + DB_INSERT_CHUNK_SIZE);
    const { data, error } = await sbClient.from(table).insert(chunk).select();
    if (error) { if (isAuthExpiredError(error)) forceReauth(); throw error; }
    all.push(...(data || []));
  }
  return all;
}

async function loadAllData() {
  const [settingsRes, kirim, chiqim, bank, ishHaqi, ombor, mahsulotlar, ishlabChiqarish, fayllar, kontragentlar, asosiyVositalar] = await Promise.all([
    // .single() emas .maybeSingle() — "settings" qatori yo'q firma uchun (masalan
    // eski/qo'lda yaratilgan firmalar) .single() 0-qatorda PGRST116 xatosi
    // tashlaydi, bu esa Promise.all()dagi BARCHA jadvallarni (kirim/chiqim/ombor
    // va h.k.) yuklashni to'xtatib qo'yardi — pastda shu holat o'zi tuzatiladi.
    sbClient.from("settings").select("*").eq("firma_id", ACTIVE_FIRMA_ID).maybeSingle(),
    fetchAllRows("kirim"),
    fetchAllRows("chiqim"),
    fetchAllRows("bank"),
    fetchAllRows("ish_haqi"),
    fetchAllRows("ombor"),
    fetchAllRows("mahsulotlar"),
    fetchAllRows("ishlab_chiqarish"),
    fetchAllRows("fayllar"),
    fetchAllRows("kontragentlar"),
    fetchAllRows("asosiy_vositalar")
  ]);
  if (settingsRes.error) throw settingsRes.error;
  let settingsRow = settingsRes.data;
  if (!settingsRow) {
    const { data, error } = await sbClient.from("settings").insert({ firma_id: ACTIVE_FIRMA_ID }).select().single();
    if (error) throw error;
    settingsRow = data;
  }
  STORE.settings = Object.assign(defaultStore().settings, fromDbSettings(settingsRow), loadLocalFilters());
  STORE.kirim = kirim.map((r) => fromDbRow(INVOICE_DB_MAP, r));
  STORE.chiqim = chiqim.map((r) => fromDbRow(INVOICE_DB_MAP, r));
  STORE.bank = bank.map((r) => fromDbRow(BANK_DB_MAP, r));
  STORE.ishHaqi = ishHaqi.map((r) => fromDbRow(ISHHAQI_DB_MAP, r));
  STORE.ombor = ombor.map((r) => fromDbRow(OMBOR_DB_MAP, r));
  STORE.mahsulotlar = mahsulotlar.map((r) => fromDbRow(MAHSULOT_DB_MAP, r));
  STORE.ishlabChiqarish = ishlabChiqarish.map((r) => fromDbRow(ISHLAB_CHIQARISH_DB_MAP, r));
  STORE.fayllar = fayllar.map((r) => fromDbRow(FAYL_DB_MAP, r));
  STORE.kontragentlar = kontragentlar.map((r) => fromDbRow(KONTRAGENT_DB_MAP, r));
  STORE.asosiyVositalar = asosiyVositalar.map((r) => fromDbRow(ASOSIY_VOSITA_DB_MAP, r));
  // "chiqim_tafsil" jadvali migratsiyasi hali ishga tushirilmagan bazalarda
  // ham ilova to'liq ishlashda davom etishi uchun (fayllar jadvali kabi)
  // xatolik alohida ushlanadi — asosiy Promise.all'ni buzmaydi.
  try {
    const chiqimTafsil = await fetchAllRows("chiqim_tafsil");
    STORE.chiqimTafsil = chiqimTafsil.map((r) => fromDbRow(CHIQIM_TAFSIL_DB_MAP, r));
  } catch (err) {
    console.error(err);
    STORE.chiqimTafsil = [];
  }
  try {
    const kassa = await fetchAllRows("kassa");
    STORE.kassa = kassa.map((r) => fromDbRow(KASSA_DB_MAP, r));
  } catch (err) {
    console.error(err);
    STORE.kassa = [];
  }
  try {
    const tabel = await fetchAllRows("tabel");
    STORE.tabel = tabel.map((r) => fromDbRow(TABEL_DB_MAP, r));
  } catch (err) {
    console.error(err);
    STORE.tabel = [];
  }
  recomputeAllPaymentStatus();
  DATA_LOADED = true;
  if (markDataReady) { markDataReady(); markDataReady = null; }
}

// To'lov moslashtirish (recomputeAllPaymentStatus) natijasida BOSHQA qatorlarning
// "tolandi" holati o'zgarishi mumkin (masalan, bank ma'lumoti yangilanganda) —
// shu o'zgarishlarni bazaga qaytarib yozadi. To'g'ridan-to'g'ri kiritilgan
// o'zgarishlar (masalan, foydalanuvchi checkbox bosishi) tegishli handler'ning
// o'zida alohida bazaga yuboriladi.
function saveStore() {
  invalidateFifo();
  const prevTolandi = {};
  ["kirim", "chiqim"].forEach((type) => STORE[type].forEach((r) => { prevTolandi[type + ":" + r.id] = r.tolandi; }));
  recomputeAllPaymentStatus();
  const pushes = [];
  ["kirim", "chiqim"].forEach((type) => STORE[type].forEach((r) => {
    if (prevTolandi[type + ":" + r.id] !== r.tolandi) {
      pushes.push(sbClient.from(TABLE_NAMES[type]).update({ tolandi: r.tolandi }).eq("id", r.id).eq("firma_id", ACTIVE_FIRMA_ID));
    }
  }));
  if (pushes.length) Promise.allSettled(pushes);
  updateNavBadges();
}

// Chiqim faktura (mijozga sotuv) to'lovi bizning hisobimizga KIRIM sifatida tushadi,
// Kirim faktura (ta'minotchidan xarid) to'lovi bizning hisobimizdan CHIQIM sifatida ketadi.
function recomputePaymentStatusForType(type) {
  const bankCol = type === "chiqim" ? "kirim" : "chiqim";
  const availableByInn = {};
  STORE.bank.forEach((b) => {
    const inn = (b.kontragentInn || "").trim();
    if (!inn) return;
    availableByInn[inn] = (availableByInn[inn] || 0) + toNum(b[bankCol]);
  });

  const byInn = {};
  STORE[type].forEach((r) => {
    const inn = (r.kontragentInn || "").trim();
    if (!inn) return; // INN yo'q qatorlar qo'lda boshqariladi
    if (!isValidStatus(r.status)) { r.tolandi = false; return; }
    // Foydalanuvchi "To'landi" holatini qo'lda ustidan yozgan (tolandiOverride)
    // qatorlar avtomatik FIFO hisobidan butunlay chiqarib tashlanadi — ular
    // bank mablag'ini "band qilib qo'ymaydi" (qolgan mablag' boshqa fakturalarga
    // to'liq tegishli bo'lib qoladi), qiymati esa bazadan o'qilganicha saqlanadi.
    // Qarang: tolandiCellHtml, toggleTolandiOverride.
    if (r.tolandiOverride) return;
    (byInn[inn] = byInn[inn] || []).push(r);
  });

  Object.keys(byInn).forEach((inn) => {
    let avail = availableByInn[inn] || 0;
    const list = byInn[inn].slice().sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));
    list.forEach((r) => {
      const amt = toNum(r.jamiSumma);
      if (amt > 0 && avail >= amt - 1) {
        r.tolandi = true;
        avail -= amt;
      } else {
        r.tolandi = false;
      }
    });
  });
}

function recomputeAllPaymentStatus() {
  recomputePaymentStatusForType("kirim");
  recomputePaymentStatusForType("chiqim");
}

function tolanmaganQoldiqAsOf(type, asOfDate) {
  const bankCol = type === "chiqim" ? "kirim" : "chiqim";
  const availableByInn = {};
  STORE.bank.forEach((b) => {
    if (asOfDate && b.sana && b.sana > asOfDate) return;
    const inn = (b.kontragentInn || "").trim();
    if (!inn) return;
    availableByInn[inn] = (availableByInn[inn] || 0) + toNum(b[bankCol]);
  });

  let totalUnpaid = 0;
  const byInn = {};

  STORE[type].forEach((r) => {
    if (asOfDate && r.sana && r.sana > asOfDate) return;
    if (!isValidStatus(r.status)) return;
    const inn = (r.kontragentInn || "").trim();
    if (!inn) {
      if (!r.tolandi) totalUnpaid += toNum(r.jamiSumma);
      return;
    }
    if (r.tolandiOverride) {
      if (!r.tolandi) totalUnpaid += toNum(r.jamiSumma);
      return;
    }
    (byInn[inn] = byInn[inn] || []).push(r);
  });

  Object.keys(byInn).forEach((inn) => {
    let avail = availableByInn[inn] || 0;
    const list = byInn[inn].slice().sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));
    list.forEach((r) => {
      const amt = toNum(r.jamiSumma);
      if (amt > 0 && avail >= amt - 1) {
        avail -= amt;
      } else {
        totalUnpaid += amt;
      }
    });
  });

  return totalUnpaid;
}

/* ------------------------------ utilities ------------------------------ */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function toNum(v) {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s+/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") < s.lastIndexOf(".")) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (s.includes(",")) {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1 || /^\d{1,3},\d{3}$/.test(s)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(/,/g, ".");
    }
  } else if (s.includes(".")) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, "");
    }
  }
  const cleaned = s.replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

// Ming ajratuvchi sifatida bo'sh joy (NBSP), kasr ajratuvchi sifatida "." ishlatiladi
// — "ru-RU" locale (avvalgi variant) vergulni kasr ajratuvchi sifatida ishlatgani
// uchun uch xonali miqdorlar (masalan "837,000") "837 ming" deb chalkash o'qilishi
// mumkin edi, aslida "837.000" (ya'ni 837) degani edi. "." bilan bunday chalkashlik
// bo'lmaydi, ming ajratuvchi bo'sh joy bilan aniq ajralib turadi.
function fmt(n, digits = 0) {
  n = toNum(n);
  const fixed = Math.abs(n).toFixed(digits);
  const neg = n < 0 && parseFloat(fixed) !== 0;
  const [intPart, fracPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + grouped + (fracPart ? "." + fracPart : "");
}

function fmtSum(n) {
  return fmt(n, 0) + " so'm";
}

// Grafik o'q belgilari va qator oxiridagi qiymatlar uchun qisqartirilgan
// format (masalan "5 mln", "500 ming") — to'liq summa tooltip/jadvalda
// ko'rinadi.
function fmtCompact(n) {
  n = toNum(n);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${fmt(n / 1e9, 1).replace(/\.0$/, "")} mlrd`;
  if (abs >= 1e6) return `${fmt(n / 1e6, 1).replace(/\.0$/, "")} mln`;
  if (abs >= 1e3) return `${fmt(n / 1e3, 0)} ming`;
  return fmt(n, 0);
}

function escapeHtml(s) {
  return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Mahalliy (brauzer vaqt zonasidagi) kalendar sanasini YYYY-MM-DD shaklida
// beradi. toISOString() avval UTC'ga o'giradi — musbat UTC siljishli
// zonalarda (masalan O'zbekiston, UTC+5) bu mahalliy yarim tunni oldingi
// kunga "siljitib" qo'yishi mumkin, shuning uchun aniq kalendar sana kerak
// bo'lgan joylarda (masalan eslatma sanasi) shu funksiya ishlatiladi.
function localDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isValidStatus(status) {
  if (status == null) return true;
  const n = normStatus(status);
  if (!n) return true;
  return !STATUS_INVALID_SET.has(n);
}

function inRange(sana, from, to) {
  if (!sana) return false;
  if (from && sana < from) return false;
  if (to && sana > to) return false;
  return true;
}

function getFilteredRows(rows) {
  const { filterFrom, filterTo } = STORE.settings;
  if (!filterFrom && !filterTo) return rows;
  return rows.filter((r) => inRange(r.sana, filterFrom, filterTo));
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Katta jadvallarni bitta ulkan innerHTML satrida emas, kichik bo'laklarga
// bo'lib (requestAnimationFrame orqali) DOMga qo'shadi. Voqealar tbody emas,
// uni chaqirgan konteynerga (delegation) osilgani uchun bo'lib-bo'lib qo'shish
// mavjud klik/o'zgarish handlerlariga ta'sir qilmaydi.
function renderRowsChunked(tbody, rows, rowHtmlFn, { chunkSize = 200, onDone } = {}) {
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!rows.length) { if (onDone) onDone(); return; }
  tbody.innerHTML = rows.slice(0, chunkSize).map(rowHtmlFn).join("");
  let i = chunkSize;
  function step() {
    if (i >= rows.length) { if (onDone) onDone(); return; }
    tbody.insertAdjacentHTML("beforeend", rows.slice(i, i + chunkSize).map(rowHtmlFn).join(""));
    i += chunkSize;
    requestAnimationFrame(step);
  }
  if (i < rows.length) requestAnimationFrame(step); else if (onDone) onDone();
}

function toast(msg, type = "ok") {
  const stack = document.getElementById("toastStack");
  const node = el(`<div class="toast ${type}">${escapeHtml(msg)}</div>`);
  stack.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

// Yuklanish paytida jadval o'rniga ko'rsatiladigan "skelet" qatorlar.
function skeletonRows(cols, n = 6) {
  const cells = Array.from({ length: cols }, () => `<td><span class="skeleton"></span></td>`).join("");
  return Array.from({ length: n }, () => `<tr class="skeleton-row">${cells}</tr>`).join("");
}

let MODAL_KEY_HANDLER = null;

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
  if (MODAL_KEY_HANDLER) { document.removeEventListener("keydown", MODAL_KEY_HANDLER, true); MODAL_KEY_HANDLER = null; }
}

// opts.focus (default true) — ochilganda birinchi maydonga fokus.
// Esc — yopadi; Enter (input'da, textarea/select'dan tashqari) — asosiy tugmani
// bosadi (xavfli .btn-danger bundan mustasno).
function openModal(html, opts = {}) {
  const { focus = true } = opts;
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;
  const backdrop = document.getElementById("modalBackdrop");
  const modal = backdrop.querySelector(".modal");
  backdrop.addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });

  MODAL_KEY_HANDLER = (e) => {
    if (!document.getElementById("modalBackdrop")) return;
    if (e.key === "Escape") { e.preventDefault(); closeModal(); return; }
    if (e.key === "Enter") {
      const t = e.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const primary = modal.querySelector("#mSave, #mConfirm, .modal-actions .btn-primary");
      if (primary && !primary.classList.contains("btn-danger")) { e.preventDefault(); primary.click(); }
    }
  };
  document.addEventListener("keydown", MODAL_KEY_HANDLER, true);

  if (focus) {
    const first = modal.querySelector("input:not([type=hidden]):not([disabled]), select, textarea");
    if (first) setTimeout(() => { try { first.focus(); } catch (e) {} }, 0);
  }
}

/* ---------------------------- sana oralig'i filtri ---------------------------- */

function dateRangeBarHtml() {
  const s = STORE.settings;
  const active = s.filterFrom || s.filterTo;
  return `
    <svg class="ic" viewBox="0 0 24 24" style="color:var(--text-faint);"><use href="#i-calendar"/></svg>
    <input type="date" class="search-input" id="filterFrom" style="min-width:128px" value="${escapeHtml(s.filterFrom || "")}">
    <span class="faint">—</span>
    <input type="date" class="search-input" id="filterTo" style="min-width:128px" value="${escapeHtml(s.filterTo || "")}">
    <button class="btn btn-sm" id="filterThisMonth">Joriy oy</button>
    <button class="btn btn-sm" id="filterThisQuarter">Joriy chorak</button>
    ${active ? `<button class="btn btn-sm" id="filterClear">Tozalash</button>` : ""}
  `;
}

function renderTopbarPeriod() {
  const wrap = document.getElementById("topbarPeriod");
  if (!wrap) return;
  wrap.innerHTML = dateRangeBarHtml();
  bindDateRangeBar(() => {
    renderTopbarPeriod();
    if (PAGES[CURRENT_PAGE]) PAGES[CURRENT_PAGE].render();
  });
}

function bindDateRangeBar(rerender) {
  const from = document.getElementById("filterFrom");
  const to = document.getElementById("filterTo");
  const clearBtn = document.getElementById("filterClear");
  const monthBtn = document.getElementById("filterThisMonth");
  const quarterBtn = document.getElementById("filterThisQuarter");
  const iso = (d) => d.toISOString().slice(0, 10);

  if (from) from.addEventListener("change", () => { STORE.settings.filterFrom = from.value; saveLocalFilters(); rerender(); });
  if (to) to.addEventListener("change", () => { STORE.settings.filterTo = to.value; saveLocalFilters(); rerender(); });
  if (clearBtn) clearBtn.addEventListener("click", () => { STORE.settings.filterFrom = ""; STORE.settings.filterTo = ""; saveLocalFilters(); rerender(); });
  if (monthBtn) monthBtn.addEventListener("click", () => {
    const d = new Date();
    STORE.settings.filterFrom = iso(new Date(d.getFullYear(), d.getMonth(), 1));
    STORE.settings.filterTo = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    saveLocalFilters(); rerender();
  });
  if (quarterBtn) quarterBtn.addEventListener("click", () => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3);
    STORE.settings.filterFrom = iso(new Date(d.getFullYear(), q * 3, 1));
    STORE.settings.filterTo = iso(new Date(d.getFullYear(), q * 3 + 3, 0));
    saveLocalFilters(); rerender();
  });
}

/* ------------------------------ computations ---------------------------- */

// "Bank harakati"da "Xizmat" deb belgilangan chiqimlar (masalan oylik
// interaktiv xizmat to'lovi, bank komissiyasi va h.k.) — ishlab chiqarishning
// biror aniq mahsulotiga bevosita bog'lanmagan, lekin davriy xarajat. Har bir
// sotuv qatorining tannarxiga ULUSH sifatida qo'shish uchun, YIL bo'yicha
// (chiqim_tafsil.sana bo'yicha) sotilgan/kalkulyatsiya qilingan mahsulot
// miqdoriga bo'linadi. OYLIK emas, aynan YILLIK guruhlash ishlatiladi —
// aks holda mahsulot sotilmagan (yoki hali kalkulyatsiya bilan bog'lanmagan)
// oydagi xizmat xarajati HECH QAYSI sotuvga taqsimlanmay, hisobdan butunlay
// tushib qolar edi. Bu qiymatlar SAQLANMAYDI (STORE.bank/chiqimTafsil
// o'zgargan zahoti avtomatik qayta hisoblanadi) — shu sabab alohida "qayta
// hisoblash" tugmasi shart emas.
function bankXizmatXarajatiYil(year) {
  return STORE.bank.reduce((sum, r) => {
    if (!r.xizmat || !r.sana || r.sana.slice(0, 4) !== year) return sum;
    return sum + toNum(r.chiqim);
  }, 0);
}

function yillikSotilganMiqdorJami(year) {
  return STORE.chiqimTafsil.reduce((sum, t) => {
    if (!t.mahsulotId || !t.sana || t.sana.slice(0, 4) !== year) return sum;
    return sum + toNum(t.miqdor);
  }, 0);
}

// Bitta sotuv qatori uchun (sanasi bo'yicha aniqlangan YILning) xizmat
// xarajatidan tegishli ulush: (yillik xizmat xarajati / yillik jami sotilgan
// miqdor) * shu qatorning miqdori. Turli mahsulotlar turli birlikda
// bo'lganda ham "miqdor" ustunlari to'g'ridan-to'g'ri qo'shiladi — agar
// asosiy faoliyat bitta dominant birlikda bo'lmasa, bu taxminiy natija beradi.
function xizmatTannarxUlushi(sana, miqdor) {
  if (!sana) return 0;
  const year = sana.slice(0, 4);
  const jamiMiqdor = yillikSotilganMiqdorJami(year);
  if (!jamiMiqdor) return 0;
  return (bankXizmatXarajatiYil(year) / jamiMiqdor) * toNum(miqdor);
}

function sumRows(rows, field, onlyValid = true) {
  return rows.reduce((acc, r) => {
    if (onlyValid && !isValidStatus(r.status)) return acc;
    return acc + toNum(r[field]);
  }, 0);
}

function computeTotals() {
  const s = STORE.settings;
  const to = s.filterTo;
  invalidateFifo();

  // Davr (from-to) bo'yicha — F2/QQS/Foyda solig'i uchun (davr natijasi)
  const periodKirim = getFilteredRows(STORE.kirim);
  const periodChiqim = getFilteredRows(STORE.chiqim);

  const kirimBase = sumRows(periodKirim, "summaQQSsiz");
  const kirimQQS = sumRows(periodKirim, "qqsSumma");
  const kirimJami = sumRows(periodKirim, "jamiSumma");

  const chiqimBase = sumRows(periodChiqim, "summaQQSsiz");
  const chiqimQQS = sumRows(periodChiqim, "qqsSumma");
  const chiqimJami = sumRows(periodChiqim, "jamiSumma");

  // "to" sanasiga nisbatan (as-of) — F1 balans uchun (bir kunlik holat, davr emas)
  const asOfKirim = STORE.kirim.filter((r) => !to || r.sana <= to);
  const asOfChiqim = STORE.chiqim.filter((r) => !to || r.sana <= to);
  const asOfBank = STORE.bank.filter((r) => !to || r.sana <= to);
  const asOfKassa = (STORE.kassa || []).filter((r) => !to || r.sana <= to);

  const bankKirim = asOfBank.reduce((a, r) => a + toNum(r.kirim), 0);
  const bankChiqim = asOfBank.reduce((a, r) => a + toNum(r.chiqim), 0);
  const bankOpening = toNum(s.bankOpeningBalance);
  const bankQoldiq = bankOpening + bankKirim - bankChiqim;

  const kassaKirim = asOfKassa.reduce((a, r) => r.turi === "kirim" ? a + toNum(r.summa) : a, 0);
  const kassaChiqim = asOfKassa.reduce((a, r) => r.turi === "chiqim" ? a + toNum(r.summa) : a, 0);
  const kassaOpening = toNum(s.kassaOpeningBalance);
  const kassaQoldiq = kassaOpening + kassaKirim - kassaChiqim;

  const kreditorlik = tolanmaganQoldiqAsOf("kirim", to);
  const debitorlik = tolanmaganQoldiqAsOf("chiqim", to);

  // Kalkulyatsiya (chiqim_tafsil) asosida davr uchun sotilgan mahsulotlarning
  // xomashyo tannarxi — F2/Foyda solig'ida "Sotilgan mahsulot tannarxi"
  // (020-qator) manbai sifatida ishlatiladi (avvalgi "kirim fakturalar
  // summasi" taxminidan aniqroq, chunki faqat HAQIQATDA sotilgan mahsulotning
  // o'zi uchun ketgan xomashyo hisoblanadi). Kalkulyatsiya bilan bog'lanmagan
  // (mahsulotId=null) qatorlar uchun tannarx noma'lum — ular butunlay 0
  // hisoblanib foydani sun'iy oshirmasligi uchun, TAXMINIY tannarx qo'llanadi:
  // summa * (1 - defaultFoydaNormasi). Bu taxminiy qism alohida
  // (taxminiyTannarx) kuzatiladi — F2/Foyda solig'i sahifasi "taxminiy" degan
  // ogohlantirish ko'rsatishi uchun.
  const periodChiqimTafsil = getFilteredRows(STORE.chiqimTafsil);
  const defFoyda = Math.max(0, Math.min(0.95, toNum(s.defaultFoydaNormasi != null ? s.defaultFoydaNormasi : 0.2)));
  let taxminiyTannarx = 0;
  let kalkulyatsiyasizSoni = 0;
  let omborKamomadSoni = 0;
  const kalkulyatsiyaTannarx = periodChiqimTafsil.reduce((sum, t) => {
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    if (!mahsulot) {
      kalkulyatsiyasizSoni++;
      const savdo = toNum(t.summa) || toNum(t.miqdor) * toNum(t.narx);
      const est = savdo * (1 - defFoyda);
      taxminiyTannarx += est;
      return sum + est;
    }
    const cc = computeMahsulotConsumption(mahsulot, t.miqdor, t.sana, { docRef: "CHT-" + t.id });
    if (cc.kamomadlar.length) omborKamomadSoni++;
    return sum + cc.tannarx + xizmatTannarxUlushi(t.sana, t.miqdor);
  }, 0);
  // Bosh sahifadagi "Kalkulyatsiya bo'yicha foyda" statistika kartasi uchun —
  // faqat kalkulyatsiya bilan bog'langan chiqim_tafsil qatorlarining o'zidan
  // (davr bo'yicha), kirim/chiqim fakturalar jamisidan emas.
  const kalkulyatsiyaSavdo = periodChiqimTafsil.reduce((sum, t) => sum + (toNum(t.summa) || toNum(t.miqdor) * toNum(t.narx)), 0);
  const kalkulyatsiyaFoyda = kalkulyatsiyaSavdo - kalkulyatsiyaTannarx;
  // Bosh sahifadagi "Foyda solig'i" yorlig'i uchun — rasmiy "Foyda solig'i
  // hisob-kitobi" sahifasidagi (010-080 qator, deklaratsiya shakli) to'liq
  // zanjirdan FARQLI, soddalashtirilgan taxmin: to'g'ridan-to'g'ri yuqoridagi
  // "Kalkulyatsiya bo'yicha foyda"dan (davr xarajati/moliyaviy xarajat/boshqa
  // daromadsiz) hisoblanadi — buxgalterga davr yakunigacha tezkor mo'ljal
  // beradi. Rasmiy hisobot hamon computeTotals()dagi to'liq zanjirni ishlatadi.
  const kalkulyatsiyaSoliqBazasi = Math.max(kalkulyatsiyaFoyda - toNum(s.imtiyozlar), 0);
  const kalkulyatsiyaFoydaSoligi = kalkulyatsiyaSoliqBazasi * (toNum(s.foydaStavka) / 100);

  // Kurs farqlari (BHMS 22: 9540 Daromad / 9640 Zarar)
  const kf = typeof computeKursFarqlari === "function" ? computeKursFarqlari(to) : { jamiIjobiy: 0, jamiSalbiy: 0, details: [] };
  const ijobiyKursFarqi = kf.jamiIjobiy || 0;
  const salbiyKursFarqi = kf.jamiSalbiy || 0;
  const valyuta5210SomQoldiq = (kf.details || []).reduce((sum, d) => sum + d.qaytaBaholanganQiymat, 0);

  // 5110 va 5210 hisobvaraqlarining ajratilgan va jami qayta baholangan qoldig'i
  const bank5110Kirim = asOfBank.filter((r) => !r.schyot || r.schyot === "5110" || (!r.valyuta || r.valyuta === "UZS")).reduce((a, r) => a + toNum(r.kirim), 0);
  const bank5110Chiqim = asOfBank.filter((r) => !r.schyot || r.schyot === "5110" || (!r.valyuta || r.valyuta === "UZS")).reduce((a, r) => a + toNum(r.chiqim), 0);
  const bank5110Qoldiq = bankOpening + bank5110Kirim - bank5110Chiqim;
  const joriyBankQoldiq = ((kf.details && kf.details.length) || toNum(s.valyutaOpeningBalance) > 0)
    ? (bank5110Qoldiq + valyuta5210SomQoldiq)
    : bankQoldiq;

  // ---- F2: Moliyaviy natijalar ----
  const revenue = chiqimBase;
  const tannarx = s.tannarxManual !== null && s.tannarxManual !== undefined && s.tannarxManual !== "" ? toNum(s.tannarxManual) : kalkulyatsiyaTannarx;
  const yalpiFoyda = revenue - tannarx;
  // Ish haqi bo'limi (xodimlarga hisoblangan ish haqi + ijtimoiy soliq)
  // standart holatda F2'ga kirmaydi — buxgalter buni ilgari alohida, qo'lda
  // "Davr xarajatlari"ga qo'shishi kerak edi (yoki umuman unutib qo'yishi
  // mumkin edi). Sozlamalardagi "ishHaqiAvtoXarajat" tumbler yoqilsa, shu
  // joyning o'zida avtomatik qo'shiladi. Qarang: computeIshHaqiTotals,
  // renderSettings.
  const ishHaqiXarajati = s.ishHaqiAvtoXarajat ? computeIshHaqiTotals().ishBeruvchiXarajati : 0;
  const davrXarajati = toNum(s.davrXarajati) + ishHaqiXarajati;
  const asosiyFaoliyatFoyda = yalpiFoyda - davrXarajati;
  const moliyaviyXarajat = toNum(s.moliyaviyXarajat);
  const soliqqachaFoyda = asosiyFaoliyatFoyda - moliyaviyXarajat + ijobiyKursFarqi - salbiyKursFarqi;

  // ---- Foyda solig'i (F2 va Foyda solig'i hisoboti bitta manbadan hisoblanadi) ----
  const jamiDaromad = revenue + toNum(s.boshqaDaromad) + ijobiyKursFarqi;
  const chegiriladiXarajat = tannarx + davrXarajati + moliyaviyXarajat + salbiyKursFarqi;
  const soliqqaTortiladiganFoyda = jamiDaromad - chegiriladiXarajat;
  const imtiyozlar = toNum(s.imtiyozlar);
  const soliqBazasi = Math.max(soliqqaTortiladiganFoyda - imtiyozlar, 0);
  const foydaStavka = toNum(s.foydaStavka);
  const foydaSoligi = soliqBazasi * (foydaStavka / 100);

  const sofFoyda = soliqqachaFoyda - foydaSoligi;

  // ---- QQS ----
  const qqsInput = kirimQQS;
  const qqsOutput = chiqimQQS;
  const qqsToPay = qqsOutput - qqsInput;

  // ---- F1 ----
  const pulMablaglari = joriyBankQoldiq + ((STORE.kassa && STORE.kassa.length) || kassaOpening ? kassaQoldiq : toNum(s.f1Kassa));
  // "Asosiy vositalar" sahifasidagi ro'yxat asosida, "to" (davr oxiri) sanasiga
  // nisbatan hisoblangan qoldiq qiymatlar yig'indisi — endi qo'lda kiritilmaydi.
  const asosiyVositalar = STORE.asosiyVositalar.reduce((sum, a) => sum + asosiyVositaQoldiqQiymati(a, to), 0);
  // "Ombor" sahifasidagi kirim/chiqim yozuvlari asosida, "to" (davr oxiri)
  // sanasiga nisbatan hisoblangan tovar-moddiy zaxiralar qiymati — endi
  // qo'lda kiritilmaydi.
  const tovarZaxira = omborQoldiqQiymatiAsOf(to);
  const aktivJami = asosiyVositalar + tovarZaxira + debitorlik + pulMablaglari;

  const ustavKapitali = toNum(s.f1UstavKapitali);
  const oldingiFoyda = toNum(s.f1OldingiFoyda);
  const jamgarilganFoyda = oldingiFoyda + sofFoyda;
  const uzoqMajburiyat = toNum(s.f1UzoqMajburiyat);
  const passivJami = ustavKapitali + jamgarilganFoyda + uzoqMajburiyat + kreditorlik;

  return {
    kirimBase, kirimQQS, kirimJami,
    chiqimBase, chiqimQQS, chiqimJami,
    bankKirim, bankChiqim, bankOpening, bankQoldiq: joriyBankQoldiq, bank5110Qoldiq,
    kassaKirim, kassaChiqim, kassaOpening, kassaQoldiq,
    kreditorlik, debitorlik,
    revenue, tannarx, kalkulyatsiyaTannarx, taxminiyTannarx, kalkulyatsiyasizSoni, omborKamomadSoni, kalkulyatsiyaSavdo, kalkulyatsiyaFoyda, kalkulyatsiyaSoliqBazasi, kalkulyatsiyaFoydaSoligi, yalpiFoyda, davrXarajati, ishHaqiXarajati, asosiyFaoliyatFoyda,
    moliyaviyXarajat, soliqqachaFoyda, foydaSoligi, sofFoyda,
    jamiDaromad, chegiriladiXarajat, soliqqaTortiladiganFoyda, imtiyozlar, soliqBazasi, foydaStavka,
    qqsInput, qqsOutput, qqsToPay,
    pulMablaglari, asosiyVositalar, tovarZaxira, aktivJami,
    ustavKapitali, oldingiFoyda, jamgarilganFoyda, uzoqMajburiyat, passivJami,
    ijobiyKursFarqi, salbiyKursFarqi, valyuta5210SomQoldiq, kursFarqlari: kf
  };
}

/* -------------------------------- routing -------------------------------- */

const PAGES = {
  dashboard: { render: renderDashboard },
  kirim: { render: () => renderInvoiceTable("kirim") },
  chiqim: { render: () => renderInvoiceTable("chiqim") },
  bank: { render: renderBank },
  kassa: { render: renderKassa },
  ombor: { render: renderOmbor },
  kontragentlar: { render: renderKontragentlar },
  asosiyvositalar: { render: renderAsosiyVositalar },
  ishlabchiqarish: { render: renderIshlabChiqarish },
  fayllar: { render: renderFayllar },
  ishhaqi: { render: renderIshHaqi },
  tabel: { render: renderTabel },
  f2: { render: renderF2 },
  qqs: { render: renderQQS },
  foyda: { render: renderFoyda },
  ishhaqihisobot: { render: renderIshHaqiHisoboti },
  f1: { render: renderF1 },
  kreditorlik: { render: () => renderAgingReport("kirim") },
  debitorlik: { render: () => renderAgingReport("chiqim") },
  sverka: { render: renderSverka },
  sverkaDetail: { render: renderSverkaDetail },
  settings: { render: renderSettings },
  audit: { render: renderAudit },
  // "Firmalar" endi Sozlamalar ichidagi bo'lim — eski havolalar sinmasligi
  // uchun alias sifatida qoldiriladi (navigate() uni "settings"ga yo'naltiradi).
  firmalar: { render: renderSettings }
};

function navigate(page) {
  // Firma boshqaruvi Sozlamalar ichiga ko'chirildi.
  if (page === "firmalar") page = "settings";
  // Yo'nalish bo'yicha o'chirilgan bo'lim — bosh sahifaga qaytaramiz.
  if (MODUL_NAV_PAGE[page] && !moduleEnabled(MODUL_NAV_PAGE[page])) page = "dashboard";
  // Sozlamalarda saqlanmagan o'zgarish bo'lsa, chiqishdan oldin tasdiqlatamiz.
  if (CURRENT_PAGE === "settings" && page !== "settings" && SETTINGS_DIRTY) {
    if (!confirm("Sozlamalarda saqlanmagan o'zgarishlar bor. Ularni tashlab chiqilsinmi?")) return;
    SETTINGS_DIRTY = false;
  }
  CURRENT_PAGE = page;
  if (page === "sverka") SVERKA_STATUS_FILTER = null;
  invalidateFifo();
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  PAGES[page].render();
}

/* ------------------- Faoliyat yo'nalishi ("Funksionallik") ------------------- */
// 1C uslubida: yo'nalish tanlansa unga tegishli modullar standart holatga
// o'rnatiladi, lekin foydalanuvchi har birini alohida yoqib/o'chira oladi.
// Modul o'chirilsa faqat sidebar bo'limi yashiriladi — ma'lumot/hisobot o'chmaydi.

const YONALISHLAR = [
  { id: "ishlabchiqarish", nomi: "Ishlab chiqarish" },
  { id: "xizmat", nomi: "Xizmat ko'rsatish" },
  { id: "savdo", nomi: "Savdo" },
  { id: "vositachilik", nomi: "Vositachilik" },
  { id: "qurilish", nomi: "Qurilish" }
];

// Yo'nalish tanlanganda modul bayroqlarining standart holati.
const YONALISH_PRESET = {
  ishlabchiqarish: { modulOmbor: true,  modulIshlabChiqarish: true,  modulAsosiyVositalar: true },
  xizmat:          { modulOmbor: false, modulIshlabChiqarish: false, modulAsosiyVositalar: true },
  savdo:           { modulOmbor: true,  modulIshlabChiqarish: false, modulAsosiyVositalar: true },
  vositachilik:    { modulOmbor: false, modulIshlabChiqarish: false, modulAsosiyVositalar: false },
  qurilish:        { modulOmbor: true,  modulIshlabChiqarish: true,  modulAsosiyVositalar: true }
};

// sidebar data-page -> uni boshqaradigan sozlama kaliti.
const MODUL_NAV_PAGE = {
  ombor: "modulOmbor",
  ishlabchiqarish: "modulIshlabChiqarish",
  asosiyvositalar: "modulAsosiyVositalar"
};

// null/undefined/true -> ko'rinadi; faqat aniq false -> yashirin.
function moduleEnabled(key) {
  return STORE.settings[key] !== false;
}

// Sidebar nav elementlarini (va bo'shab qolgan guruh sarlavhalarini) yo'nalish
// bo'yicha ko'rsatadi/yashiradi. loadAllData / switchFirma / settings o'zgarishi
// va realtime settings yangilanishidan keyin chaqiriladi.
function applyModuleVisibility() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;
  Object.keys(MODUL_NAV_PAGE).forEach((page) => {
    const item = sidebar.querySelector(`.nav-item[data-page="${page}"]`);
    if (item) item.hidden = !moduleEnabled(MODUL_NAV_PAGE[page]);
  });
  // Har bir guruh sarlavhasi — undan keyingi barcha nav-item'lar yashirin bo'lsa,
  // o'zi ham yashiriladi (masalan "Ombor" guruhi).
  const nodes = [...sidebar.children];
  nodes.forEach((node, i) => {
    if (!node.classList || !node.classList.contains("nav-group-label")) return;
    let anyVisible = false;
    for (let j = i + 1; j < nodes.length; j++) {
      const n = nodes[j];
      if (n.classList && n.classList.contains("nav-group-label")) break;
      if (n.classList && n.classList.contains("nav-item") && !n.hidden) { anyVisible = true; break; }
    }
    node.hidden = !anyVisible;
  });
  // Joriy sahifa endi yashirin bo'lib qolgan bo'lsa — bosh sahifaga.
  if (MODUL_NAV_PAGE[CURRENT_PAGE] && !moduleEnabled(MODUL_NAV_PAGE[CURRENT_PAGE])) {
    navigate("dashboard");
  }
}

window.addEventListener("beforeunload", (e) => {
  if (SETTINGS_DIRTY) { e.preventDefault(); e.returnValue = ""; }
});

function updateNavBadges() {
  document.getElementById("navKirimCount").textContent = STORE.kirim.length;
  document.getElementById("navChiqimCount").textContent = STORE.chiqim.length;
  document.getElementById("navBankCount").textContent = STORE.bank.length;
  const elKassa = document.getElementById("navKassaCount");
  if (elKassa) elKassa.textContent = (STORE.kassa || []).length;
  document.getElementById("navIshHaqiCount").textContent = STORE.ishHaqi.length;
  const elTabel = document.getElementById("navTabelCount");
  if (elTabel) elTabel.textContent = (STORE.tabel || []).length;
  document.getElementById("navOmborCount").textContent = STORE.ombor.length;
  document.getElementById("navIshlabChiqarishCount").textContent = STORE.ishlabChiqarish.length;
  document.getElementById("navFayllarCount").textContent = STORE.fayllar.length;
  document.getElementById("brandCompany").textContent = STORE.settings.companyName.replace(/[“”"]/g, "");
  updateTopbarNotifBadge();
}

// Bildirishnoma qo'ng'irog'i — to'rtta manbadan yig'ilgan son: har biri
// alohida sahifada ko'rilishi kerak bo'lgan, o'z-o'zidan "yashirin" qolib
// ketishi mumkin bo'lgan holat. Bosilganda openAttentionModal ochilib, har
// bir toifani mos sahifaga yo'naltiradi.
function computeAttentionSummary() {
  const kalkulyatsiyasiz = STORE.chiqimTafsil.filter((tf) => !tf.mahsulotId).length;
  const tasdiqlanmaganChiqim = chiqimHolatSonlari().tasdiqlanmagan;
  const muddatiOtganKirim = computeKreditorlikAging().rows.filter((r) => r.daysOverdue > 30).length;
  const muddatiOtganChiqim = computeDebitorlikAging().rows.filter((r) => r.daysOverdue > 30).length;
  const innsiz = ["kirim", "chiqim"].reduce((a, type) =>
    a + STORE[type].filter((r) => isValidStatus(r.status) && !(r.kontragentInn && String(r.kontragentInn).trim())).length, 0);
  const takrorlar = ["kirim", "chiqim"].reduce((a, type) => a + findDuplicateInvoiceIds(type).groupCount, 0);
  const yaqinlashayotganKirim = computeUpcomingKreditorlik().length;
  const yaqinlashayotganChiqim = computeUpcomingDebitorlik().length;
  const ishHaqiReminder = computeIshHaqiPayReminder();
  return {
    kalkulyatsiyasiz, tasdiqlanmaganChiqim, muddatiOtganKirim, muddatiOtganChiqim, innsiz, takrorlar,
    yaqinlashayotganKirim, yaqinlashayotganChiqim, ishHaqiReminder,
    total: tasdiqlanmaganChiqim + muddatiOtganKirim + muddatiOtganChiqim + innsiz + takrorlar + yaqinlashayotganKirim + yaqinlashayotganChiqim + (ishHaqiReminder ? 1 : 0)
  };
}

function updateTopbarNotifBadge() {
  const badge = document.getElementById("topbarNotifBadge");
  if (!badge) return;
  const count = computeAttentionSummary().total;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function openAttentionModal() {
  const s = computeAttentionSummary();
  const items = [
    { count: s.tasdiqlanmaganChiqim, label: "Tasdiqlanmagan chiqim fakturalar", desc: "Kalkulyatsiyasiz yoki ombor zaxirasi yetishmaydigan savdo fakturalari — tannarx taxminiy hisoblanmoqda. \"Faktura chiqim\" sahifasida ko'ring.", action: () => { INVOICE_PROBLEM_FILTER.chiqim = true; navigate("chiqim"); } },
    { count: moduleEnabled("modulIshlabChiqarish") ? s.kalkulyatsiyasiz : 0, label: "Kalkulyatsiya bilan bog'lanmagan sotuv qatorlari", desc: "Sotilgan mahsulot ombordan hali sarflanmagan — \"Ishlab chiqarish\" bo'limida bog'lang.", action: () => navigate("ishlabchiqarish") },
    { count: s.muddatiOtganKirim, label: "30 kundan ortiq to'lanmagan kirim fakturalar", desc: "Muddati o'tgan kreditorlik — \"Kreditorlik muddati\" hisobotida ko'ring.", action: () => navigate("kreditorlik") },
    { count: s.muddatiOtganChiqim, label: "30 kundan ortiq to'lanmagan chiqim fakturalar", desc: "Muddati o'tgan debitorlik (xaridorlar qarzi) — \"Debitorlik muddati\" hisobotida ko'ring.", action: () => navigate("debitorlik") },
    { count: s.yaqinlashayotganKirim, label: "Kreditorlik: to'lov muddati yaqinlashmoqda", desc: `${REMINDER_LOOKAHEAD_DAYS} kun ichida 30 kunlik chegaraga yetadigan, hali to'lanmagan kirim fakturalar.`, action: () => navigate("kreditorlik") },
    { count: s.yaqinlashayotganChiqim, label: "Debitorlik: to'lov muddati yaqinlashmoqda", desc: `${REMINDER_LOOKAHEAD_DAYS} kun ichida 30 kunlik chegaraga yetadigan, hali to'lanmagan chiqim fakturalar.`, action: () => navigate("debitorlik") },
    { count: s.innsiz, label: "INN kiritilmagan kirim/chiqim yozuvlari", desc: "Bunday yozuvlarda to'lov holati avtomatik solishtirilmaydi, \"To'landi\" belgisi qo'lda qo'yiladi.", action: () => navigate("kirim") },
    { count: s.takrorlar, label: "Ehtimoliy takrorlangan hujjatlar", desc: "Hujjat №+sana+summa+kontragent bo'yicha bir xil yozuvlar — \"Faktura kirim/chiqim\" sahifasidagi \"Takrorlar\" tugmasi orqali tekshiring.", action: () => navigate("kirim") },
    ...(s.ishHaqiReminder ? [{ count: 1, label: "Ish haqi to'lov muddati yaqinlashmoqda", desc: `${s.ishHaqiReminder.daysUntil} kun qoldi (${s.ishHaqiReminder.date}).`, action: () => navigate("ishhaqi") }] : [])
  ].filter((it) => it.count > 0);

  openModal(`
    <h3>Diqqat talab qiladigan yozuvlar</h3>
    ${items.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nima</th><th class="num">Soni</th><th></th></tr></thead>
          <tbody>
            ${items.map((it, i) => `
              <tr>
                <td><div>${escapeHtml(it.label)}</div><div class="faint" style="font-size:11px;">${escapeHtml(it.desc)}</div></td>
                <td class="num" style="font-weight:700;">${it.count}</td>
                <td class="row-actions"><button class="btn btn-sm" data-attn-go="${i}">Ko'rish</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : `<p class="modal-sub">Hozircha diqqat talab qiladigan yozuv yo'q.</p>`}
    <div class="modal-actions"><button class="btn" id="mCancel">Yopish</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.querySelectorAll("[data-attn-go]").forEach((b) => b.addEventListener("click", () => {
    const it = items[Number(b.dataset.attnGo)];
    closeModal();
    it.action();
  }));
}

/* ------------------------------ global qidiruv ---------------------------- */

function computeGlobalSearchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];

  STORE.kontragentlar.forEach((k) => {
    if ((k.nomi || "").toLowerCase().includes(q) || (k.inn || "").toLowerCase().includes(q)) {
      results.push({ type: "Kontragent", label: `${k.nomi || "—"}${k.inn ? " · " + k.inn : ""}`, page: "kontragentlar", inn: (k.inn || "").trim() });
    }
  });
  STORE.kirim.forEach((r) => {
    if ((r.hujjatRaqami || "").toLowerCase().includes(q) || (r.kontragentNomi || "").toLowerCase().includes(q) || (r.kontragentInn || "").toLowerCase().includes(q)) {
      results.push({ type: "Kirim", label: `${r.hujjatRaqami || "—"} · ${r.kontragentNomi || ""}${r.kontragentInn ? ` (${r.kontragentInn})` : ""}`, page: "kirim" });
    }
  });
  STORE.chiqim.forEach((r) => {
    if ((r.hujjatRaqami || "").toLowerCase().includes(q) || (r.kontragentNomi || "").toLowerCase().includes(q) || (r.kontragentInn || "").toLowerCase().includes(q)) {
      results.push({ type: "Chiqim", label: `${r.hujjatRaqami || "—"} · ${r.kontragentNomi || ""}${r.kontragentInn ? ` (${r.kontragentInn})` : ""}`, page: "chiqim" });
    }
  });
  STORE.bank.forEach((r) => {
    if ((r.tavsif || "").toLowerCase().includes(q) || (r.kontragent || "").toLowerCase().includes(q) || (r.kontragentInn || "").toLowerCase().includes(q) || (r.hujjatRaqami || "").toLowerCase().includes(q)) {
      results.push({ type: "Bank", label: `${r.kontragent || r.tavsif || "—"}${r.kontragentInn ? ` (${r.kontragentInn})` : ""}`, page: "bank" });
    }
  });
  (STORE.kassa || []).forEach((r) => {
    if ((r.tavsif || "").toLowerCase().includes(q) || (r.kontragent || "").toLowerCase().includes(q) || (r.kontragentInn || "").toLowerCase().includes(q) || (r.hujjatRaqami || "").toLowerCase().includes(q) || (r.kimdanKimga || "").toLowerCase().includes(q)) {
      const turiLabel = r.turi === "chiqim" ? "KO-2 Chiqim" : "KO-1 Kirim";
      results.push({ type: "Kassa", label: `${r.hujjatRaqami ? r.hujjatRaqami + " · " : ""}${turiLabel} · ${r.kimdanKimga || r.kontragent || r.tavsif || "—"}`, page: "kassa" });
    }
  });
  STORE.ishHaqi.forEach((r) => {
    if ((r.fio || "").toLowerCase().includes(q) || (r.lavozimi || "").toLowerCase().includes(q) || (r.pinfl || "").toLowerCase().includes(q)) {
      results.push({ type: "Ish haqi", label: `${r.fio || "—"}${r.lavozimi ? " · " + r.lavozimi : ""}`, page: "ishhaqi" });
    }
  });

  return results.slice(0, 8);
}

function renderTopbarSearchResults(results, hasQuery) {
  const box = document.getElementById("topbarSearchResults");
  if (!box) return;
  if (!hasQuery) { box.classList.remove("show"); box.innerHTML = ""; return; }
  box.innerHTML = results.length
    ? results.map((r, i) => `
        <div class="tsr-item" data-idx="${i}">
          <span class="tsr-type">${escapeHtml(r.type)}</span>
          <span class="tsr-label">${escapeHtml(r.label)}</span>
        </div>
      `).join("")
    : `<div class="tsr-empty">Mos natija topilmadi</div>`;
  box.classList.add("show");
  box.querySelectorAll(".tsr-item").forEach((itemEl) => {
    itemEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const r = results[Number(itemEl.dataset.idx)];
      if (!r) return;
      if (r.type === "Kontragent" && r.inn && typeof openSverkaDetail === "function") {
        openSverkaDetail(r.inn, "kontragentlar");
      } else {
        navigate(r.page);
      }
      const input = document.getElementById("topbarSearchInput");
      if (input) input.value = "";
      box.classList.remove("show");
    });
  });
}

function bindGlobalSearch() {
  const input = document.getElementById("topbarSearchInput");
  const box = document.getElementById("topbarSearchResults");
  if (!input || !box) return;
  input.addEventListener("input", () => {
    renderTopbarSearchResults(computeGlobalSearchResults(input.value), input.value.trim().length > 0);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim()) renderTopbarSearchResults(computeGlobalSearchResults(input.value), true);
  });
  input.addEventListener("blur", () => { setTimeout(() => box.classList.remove("show"), 150); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; box.classList.remove("show"); input.blur(); }
  });

  // Global hotkeys: Ctrl+K / Cmd+K (qidiruv) va Escape (modal yopish)
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === "Escape") {
      const modal = document.querySelector(".modal");
      if (modal) closeModal();
    }
  });
}

/* ------------------------------- dashboard ------------------------------- */

/* ------------------------- Bosh sahifa: oylik trend grafigi ------------------------- */
// So'nggi N oy uchun savdo/tannarx/foyda — joriy "Davr" filtridan mustaqil
// (har doim eng so'nggi oylarni ko'rsatadi, tarixiy tendensiyani solishtirish
// uchun). Tannarx manbai computeTotals()dagi bilan bir xil (kalkulyatsiya
// asosida), shu sabab dashboard va Foyda solig'i hisoboti mos keladi.
const UZ_MONTH_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"];

function computeMonthlyTrend(monthsCount) {
  const now = new Date();
  const buckets = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: UZ_MONTH_SHORT[d.getMonth()],
      savdo: 0, tannarx: 0
    });
  }
  const byKey = {};
  buckets.forEach((b) => { byKey[b.key] = b; });

  STORE.chiqim.forEach((r) => {
    if (!isValidStatus(r.status) || !r.sana) return;
    const b = byKey[r.sana.slice(0, 7)];
    if (b) b.savdo += toNum(r.summaQQSsiz);
  });
  STORE.chiqimTafsil.forEach((tf) => {
    if (!tf.sana) return;
    const b = byKey[tf.sana.slice(0, 7)];
    if (!b) return;
    const mahsulot = tf.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === tf.mahsulotId) : null;
    if (mahsulot) b.tannarx += computeMahsulotConsumption(mahsulot, tf.miqdor, tf.sana, { docRef: "CHT-" + tf.id }).tannarx + xizmatTannarxUlushi(tf.sana, tf.miqdor);
  });

  buckets.forEach((b) => { b.foyda = b.savdo - b.tannarx; });
  return buckets;
}

// QQS (byudjetga to'lanadigan) trendi — computeTotals()dagi qqsInput/qqsOutput
// bilan bir xil mantiq (davr bo'yicha, isValidStatus), lekin oxirgi N oy
// kesimida. Joriy "Davr" filtridan mustaqil — computeMonthlyTrend kabi.
function computeMonthlyQqsTrend(monthsCount) {
  const now = new Date();
  const buckets = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: UZ_MONTH_SHORT[d.getMonth()],
      qqsInput: 0, qqsOutput: 0
    });
  }
  const byKey = {};
  buckets.forEach((b) => { byKey[b.key] = b; });

  STORE.kirim.forEach((r) => {
    if (!isValidStatus(r.status) || !r.sana) return;
    const b = byKey[r.sana.slice(0, 7)];
    if (b) b.qqsInput += toNum(r.qqsSumma);
  });
  STORE.chiqim.forEach((r) => {
    if (!isValidStatus(r.status) || !r.sana) return;
    const b = byKey[r.sana.slice(0, 7)];
    if (b) b.qqsOutput += toNum(r.qqsSumma);
  });

  buckets.forEach((b) => { b.qqsToPay = b.qqsOutput - b.qqsInput; });
  return buckets;
}

const DASHBOARD_QQS_SERIES = [
  { key: "qqsOutput", label: "Sotuvdan QQS", varName: "--chart-1" },
  { key: "qqsInput", label: "Xariddan QQS (zachyot)", varName: "--chart-2" },
  { key: "qqsToPay", label: "Byudjetga to'lov", varName: "--chart-3" }
];

// Har oy oxiridagi to'lanmagan kirim/chiqim fakturalar qoldig'i (aging emas —
// balans). computeTotals()dagi kreditorlik/debitorlik bilan BIR XIL yondashuv:
// joriy "tolandi" bayrog'idan foydalanadi (tarixiy FIFO simulyatsiyasi emas) —
// shu sabab, F1 balansdagi kabi, bu "hozirgi holat asosidagi taxminiy"
// ko'rsatkich, aynan o'sha oy oxiridagi holatning 100% aniq tarixiy tasviri emas.
function computeMonthlyDebtTrend(monthsCount) {
  const now = new Date();
  const buckets = [];
  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = i === 0 ? localDateISO(now) : localDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const kreditorlik = STORE.kirim.reduce((a, r) => (isValidStatus(r.status) && !r.tolandi && r.sana && r.sana <= monthEnd ? a + toNum(r.jamiSumma) : a), 0);
    const debitorlik = STORE.chiqim.reduce((a, r) => (isValidStatus(r.status) && !r.tolandi && r.sana && r.sana <= monthEnd ? a + toNum(r.jamiSumma) : a), 0);
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: UZ_MONTH_SHORT[d.getMonth()],
      kreditorlik, debitorlik
    });
  }
  return buckets;
}

const DASHBOARD_DEBT_SERIES = [
  { key: "debitorlik", label: "Debitorlik (bizga qarzdor)", varName: "--chart-1" },
  { key: "kreditorlik", label: "Kreditorlik (biz qarzdormiz)", varName: "--chart-2" }
];

// KPI kartasidagi mini-trend chizig'i (so'nggi oylar) — faqat vizual signal,
// sarlavhadagi asosiy raqam tanlangan davr filtriga bog'liq bo'lib qoladi.
function sparklineSvg(values, colorVar) {
  const w = 56, h = 22, pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (w - pad * 2) * (i / (values.length - 1 || 1));
    const y = h - pad - (h - pad * 2) * ((v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="stat-spark" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="var(${colorVar})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// Oxirgi ikki oy qiymati asosida foizli o'zgarish belgisi.
// goodWhenUp=false bo'lsa (masalan xarajat), kamayish "yaxshi" (yashil) deb ko'rsatiladi.
function trendDeltaChip(values, goodWhenUp) {
  if (values.length < 2) return "";
  const prev = values[values.length - 2];
  const curr = values[values.length - 1];
  if (!prev) return "";
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const good = goodWhenUp === false ? !up : up;
  const arrow = up
    ? `<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>`
    : `<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
  return `<span class="stat-delta ${good ? "good" : "bad"}">${arrow}${Math.abs(pct).toFixed(1)}%</span>`;
}

// "Chiroyli" (0/1000/2000 kabi) qadam bilan yaxlitlangan maksimal o'q qiymati —
// gridlinelar shu qadamda chiziladi.
function niceAxisMax(maxVal) {
  if (maxVal <= 0) return { max: 4, step: 1 };
  const rough = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { max: step * 4, step };
}

const DASHBOARD_TREND_SERIES = [
  { key: "savdo", label: "Savdo (sof tushum)", varName: "--chart-1" },
  { key: "tannarx", label: "Tannarx (kalkulyatsiya)", varName: "--chart-2" },
  { key: "foyda", label: "Foyda", varName: "--chart-3" }
];

// Dashboarddagi oylik trend grafiklari uchun umumiy SVG chizuvchi — har xil
// seriyalar to'plami (savdo/tannarx/foyda, QQS, kreditorlik/debitorlik va h.k.)
// bilan qayta ishlatiladi. idPrefix generatsiya qilinadigan elementlar ID'sini
// belgilaydi (masalan "dash" -> dashTrendSvg/dashChartWrap/...).
function buildTrendChartHtml(trend, series, opts = {}) {
  const idPrefix = opts.idPrefix || "dash";
  const cap = idPrefix.charAt(0).toUpperCase() + idPrefix.slice(1);
  const svgId = `${idPrefix}TrendSvg`, wrapId = `${idPrefix}ChartWrap`, tooltipId = `${idPrefix}ChartTooltip`,
    crosshairId = `${idPrefix}Crosshair`, tableBtnId = `btn${cap}ChartTable`, tableWrapId = `${idPrefix}ChartTableWrap`;

  const W = 640, H = 230, padL = 54, padR = 64, padT = 16, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(1, ...trend.flatMap((b) => series.map((s) => Math.abs(b[s.key]))));
  const { max: axisMax, step } = niceAxisMax(maxVal);
  const xAt = (i) => padL + (trend.length === 1 ? plotW / 2 : (plotW * i) / (trend.length - 1));
  const yAt = (v) => padT + plotH - (Math.max(0, v) / axisMax) * plotH;

  const gridLines = [];
  for (let v = 0; v <= axisMax + 0.0001; v += step) {
    const y = yAt(v);
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--chart-grid)" stroke-width="1"/>`);
    gridLines.push(`<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="var(--text-faint)">${fmtCompact(v)}</text>`);
  }

  const xLabels = trend.map((b, i) => `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--text-faint)">${escapeHtml(b.label)}</text>`).join("");

  const seriesPaths = series.map((s) => {
    const pts = trend.map((b, i) => `${xAt(i)},${yAt(b[s.key])}`).join(" ");
    const lastX = xAt(trend.length - 1);
    const lastY = yAt(trend[trend.length - 1][s.key]);
    const lastVal = trend[trend.length - 1][s.key];
    return `
      <polyline points="${pts}" fill="none" stroke="var(${s.varName})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-series="${s.key}"/>
      <circle cx="${lastX}" cy="${lastY}" r="6" fill="var(--bg-elevated)"/>
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="var(${s.varName})"/>
      <text x="${lastX + 8}" y="${lastY + 4}" font-size="11" fill="var(--text)" font-weight="600">${fmtCompact(lastVal)}</text>
    `;
  }).join("");

  const hitCols = trend.map((b, i) => `<rect data-month-idx="${i}" tabindex="0" role="button" aria-label="${escapeHtml(b.label)}" x="${xAt(i) - plotW / (trend.length * 2)}" y="${padT}" width="${plotW / trend.length}" height="${plotH}" fill="transparent"/>`).join("");

  const legend = series.map((s) => `
    <span class="chart-legend-item"><span class="chart-legend-key" style="background:var(${s.varName})"></span>${escapeHtml(s.label)}</span>
  `).join("");

  const tableRows = trend.map((b) => `
    <tr><td>${escapeHtml(b.label)}</td>${series.map((s) => `<td class="num">${fmtSum(b[s.key])}</td>`).join("")}</tr>
  `).join("");

  return `
    <div class="chart-legend">${legend}<button class="btn btn-sm" id="${tableBtnId}" style="margin-left:auto;">Jadval ko'rinishida</button></div>
    <div class="chart-wrap" id="${wrapId}" style="position:relative;">
      <svg id="${svgId}" viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">
        ${gridLines.join("")}
        ${xLabels}
        ${seriesPaths}
        <line id="${crosshairId}" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--border-strong)" stroke-width="1" style="display:none;"/>
        ${hitCols}
      </svg>
      <div id="${tooltipId}" class="chart-tooltip" style="display:none;"></div>
    </div>
    <div class="table-wrap" id="${tableWrapId}" style="display:none; margin-top:10px;">
      <table>
        <thead><tr><th>Oy</th>${series.map((s) => `<th class="num">${escapeHtml(s.label)}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function dashboardTrendChartHtml(trend) {
  return buildTrendChartHtml(trend, DASHBOARD_TREND_SERIES, { idPrefix: "dash" });
}
function dashboardQqsChartHtml(trend) {
  return buildTrendChartHtml(trend, DASHBOARD_QQS_SERIES, { idPrefix: "dashQqs" });
}
function dashboardDebtChartHtml(trend) {
  return buildTrendChartHtml(trend, DASHBOARD_DEBT_SERIES, { idPrefix: "dashDebt" });
}

// dashboardTrendChartHtml (yoki uning idPrefix bilan variantlari) tomonidan
// generatsiya qilingan grafikka hover/crosshair/tooltip va jadval-toggle bog'laydi.
function bindTrendChart(trend, series, opts = {}) {
  const idPrefix = opts.idPrefix || "dash";
  const cap = idPrefix.charAt(0).toUpperCase() + idPrefix.slice(1);
  const wrap = document.getElementById(`${idPrefix}ChartWrap`);
  const svg = document.getElementById(`${idPrefix}TrendSvg`);
  const crosshair = document.getElementById(`${idPrefix}Crosshair`);
  const tooltip = document.getElementById(`${idPrefix}ChartTooltip`);
  if (!wrap || !svg || !tooltip) return;

  const showForIndex = (idx, clientX) => {
    const b = trend[idx];
    if (!b) return;
    const rects = svg.querySelectorAll("[data-month-idx]");
    const rect = rects[idx];
    if (!rect) return;
    const x = rect.x.baseVal.value + rect.width.baseVal.value / 2;
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.style.display = "";
    tooltip.innerHTML = `
      <div class="chart-tooltip-title">${escapeHtml(b.label)}</div>
      ${series.map((s) => `
        <div class="chart-tooltip-row">
          <span class="chart-legend-key" style="background:var(${s.varName})"></span>
          <span class="chart-tooltip-label">${escapeHtml(s.label)}</span>
          <b>${fmtSum(b[s.key])}</b>
        </div>
      `).join("")}
    `;
    const wrapRect = wrap.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const relX = (clientX !== undefined ? clientX : svgRect.left + (x / 640) * svgRect.width) - wrapRect.left;
    tooltip.style.display = "";
    tooltip.style.left = `${Math.min(Math.max(relX + 10, 0), wrapRect.width - 170)}px`;
    tooltip.style.top = "6px";
  };

  svg.querySelectorAll("[data-month-idx]").forEach((rect) => {
    rect.addEventListener("pointermove", (e) => showForIndex(Number(rect.dataset.monthIdx), e.clientX));
    rect.addEventListener("pointerenter", (e) => showForIndex(Number(rect.dataset.monthIdx), e.clientX));
    rect.addEventListener("focus", () => showForIndex(Number(rect.dataset.monthIdx)));
  });
  svg.addEventListener("pointerleave", () => { crosshair.style.display = "none"; tooltip.style.display = "none"; });

  const tableBtn = document.getElementById(`btn${cap}ChartTable`);
  const tableWrap = document.getElementById(`${idPrefix}ChartTableWrap`);
  if (tableBtn && tableWrap) tableBtn.addEventListener("click", () => {
    const showingTable = tableWrap.style.display !== "none";
    tableWrap.style.display = showingTable ? "none" : "";
    wrap.style.display = showingTable ? "" : "none";
    tableBtn.textContent = showingTable ? "Jadval ko'rinishida" : "Grafik ko'rinishida";
  });
}

function bindDashboardChart(trend) {
  return bindTrendChart(trend, DASHBOARD_TREND_SERIES, { idPrefix: "dash" });
}
function bindDashboardQqsChart(trend) {
  return bindTrendChart(trend, DASHBOARD_QQS_SERIES, { idPrefix: "dashQqs" });
}
function bindDashboardDebtChart(trend) {
  return bindTrendChart(trend, DASHBOARD_DEBT_SERIES, { idPrefix: "dashDebt" });
}

function renderDashboard() {
  const t = computeTotals();
  const trend = computeMonthlyTrend(6);
  const qqsTrend = computeMonthlyQqsTrend(6);
  const debtTrend = computeMonthlyDebtTrend(6);
  const uncostedCount = STORE.chiqimTafsil.filter((tf) => !tf.mahsulotId).length;
  const ihq = computeIshHaqiTotals();
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Bosh sahifa</h1>
        <p class="page-desc">${escapeHtml(STORE.settings.companyName)} · INN ${escapeHtml(STORE.settings.inn)} · ${escapeHtml(STORE.settings.period)}</p>
      </div>
      <div class="page-actions">
        <button class="btn" data-nav="kirim">+ Kirim faktura</button>
        <button class="btn" data-nav="chiqim">+ Chiqim faktura</button>
        <button class="btn btn-primary" data-nav="bank">+ Bank harakati</button>
      </div>
    </div>

    ${(() => {
      const bInfo = checkBackupReminder();
      if (bInfo && bInfo.needsBackup) {
        const txt = bInfo.lastDate
          ? `Oxirgi to'liq zaxira olinganiga ${bInfo.daysSince} kun bo'ldi (${bInfo.lastDate}). Ma'lumotlar xavfsizligi uchun zaxira olish tavsiya etiladi.`
          : "Tizim ma'lumotlarining zaxira nusxasi hali olinmagan. Ma'lumotlar xavfsizligi uchun zaxira olish tavsiya etiladi.";
        return `
          <div class="backup-alert-banner" style="display:flex;align-items:center;justify-content:space-between;background:rgba(217,119,6,0.1);border:1px solid rgba(217,119,6,0.25);border-radius:8px;padding:10px 14px;margin:0 0 14px;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);">
              <svg class="ic" viewBox="0 0 24 24" style="color:#d97706;width:20px;height:20px;flex-shrink:0;"><use href="#i-warn"/></svg>
              <span><strong>Zaxira eslatmasi:</strong> ${txt}</span>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
              <button class="btn btn-sm btn-primary" id="btnDashQuickBackup" style="background:#d97706;border-color:#d97706;"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;margin-right:4px;"><use href="#i-doc"/></svg>Zaxiralash (.xlsx)</button>
            </div>
          </div>
        `;
      }
      return "";
    })()}

    <div class="note" style="margin:0 0 14px;">Ko'rsatkichlar yuqoridagi "Davr" filtriga mos ravishda hisoblanadi.</div>

    <div class="grid grid-4 section">
      <div class="card stat-card" data-nav="chiqim" style="cursor:pointer;" title="Chiqim fakturalar (savdo) ro'yxatiga o'tish">
        <div class="stat-top"><div class="stat-label">Sof tushum (savdo)</div>${sparklineSvg(trend.map((b) => b.savdo), "--ok")}</div>
        <div class="stat-value">${fmtSum(t.revenue)}</div>
        <div class="stat-sub">${trendDeltaChip(trend.map((b) => b.savdo), true)} ${getFilteredRows(STORE.chiqim).length} ta chiqim faktura</div>
      </div>
      <div class="card stat-card" data-nav="kirim" style="cursor:pointer;" title="Kirim fakturalar (xaridlar) ro'yxatiga o'tish">
        <div class="stat-top"><div class="stat-label">Xaridlar (tannarx)</div>${sparklineSvg(trend.map((b) => b.tannarx), "--accent")}</div>
        <div class="stat-value">${fmtSum(t.tannarx)}</div>
        <div class="stat-sub">${trendDeltaChip(trend.map((b) => b.tannarx), false)} ${getFilteredRows(STORE.kirim).length} ta kirim faktura</div>
      </div>
      <div class="card stat-card" data-nav="f2" style="cursor:pointer;" title="Moliyaviy natijalar (F2) hisobotiga o'tish">
        <div class="stat-top"><div class="stat-label">Sof foyda</div>${sparklineSvg(trend.map((b) => b.foyda), t.sofFoyda >= 0 ? "--ok" : "--danger")}</div>
        <div class="stat-value">${fmtSum(t.sofFoyda)}</div>
        <div class="stat-sub ${t.sofFoyda >= 0 ? "pos" : "neg"}">${trendDeltaChip(trend.map((b) => b.foyda), true)} ${t.sofFoyda >= 0 ? "Foyda" : "Zarar"}</div>
      </div>
      <div class="card stat-card" data-nav="bank" style="cursor:pointer;" title="Bank va Kassa (pul mablag'lari)">
        <div class="stat-label">Pul mablag'lari (Bank + Kassa)</div>
        <div class="stat-value">${fmtSum(t.pulMablaglari)}</div>
        <div class="stat-sub">Bank: ${fmtSum(t.bankQoldiq)} · Kassa: ${fmtSum(t.kassaQoldiq)}</div>
      </div>
    </div>

    <div class="grid grid-4 section">
      <div class="card stat-card" data-nav="qqs" style="cursor:pointer;" title="QQS hisobotiga o'tish">
        <div class="stat-label">QQS (byudjetga)</div>
        <div class="stat-value">${fmtSum(t.qqsToPay)}</div>
        <div class="stat-sub">Chiqim QQS ${fmtSum(t.qqsOutput)} − Kirim QQS ${fmtSum(t.qqsInput)}</div>
      </div>
      <div class="card stat-card" ${uncostedCount ? `id="tileFoydaSoligi" style="cursor:pointer;" title="Kalkulyatsiya bilan bog'lanmagan sotuvlarni ko'rish"` : `data-nav="foyda" style="cursor:pointer;" title="Foyda solig'i hisobotiga o'tish"`}>
        <div class="stat-label">Foyda solig'i</div>
        <div class="stat-value ${uncostedCount ? "neg" : ""}">${uncostedCount ? "—" : fmtSum(t.kalkulyatsiyaFoydaSoligi)}</div>
        <div class="stat-sub">${uncostedCount ? `${uncostedCount} ta sotuv kalkulyatsiya bilan bog'lanmagan — bosing` : "To'lanadigan summa, kalkulyatsiya bo'yicha foydadan"}</div>
      </div>
      <div class="card stat-card" data-nav="sverka" style="cursor:pointer;" title="Solishtirma dalolatnoma (Sverka)ga o'tish">
        <div class="stat-label">Debitor / Kreditor</div>
        <div class="stat-value" style="font-size:16px">${fmtSum(t.debitorlik)} / ${fmtSum(t.kreditorlik)}</div>
        <div class="stat-sub">Mijozlar qarzi / bizning qarzimiz</div>
      </div>
      <div class="card stat-card" data-nav="ishhaqi" style="cursor:pointer;" title="Ish haqi bo'limiga o'tish">
        <div class="stat-label">Ish haqi (ish beruvchi xarajati)</div>
        <div class="stat-value">${fmtSum(ihq.ishBeruvchiXarajati)}</div>
        <div class="stat-sub">${ihq.count} ta xodim yozuvi${t.ishHaqiXarajati > 0 ? " · F2'ga avtomatik qo'shilyapti" : ""}</div>
      </div>
    </div>

    <div class="grid grid-3 section">
      <div class="card stat-card" data-nav="ishlabchiqarish" style="cursor:pointer;" title="Ishlab chiqarish va kalkulyatsiyaga o'tish">
        <div class="stat-label">Kalkulyatsiya bo'yicha foyda</div>
        <div class="stat-value">${fmtSum(t.kalkulyatsiyaFoyda)}</div>
        <div class="stat-sub">Sotuv ${fmtSum(t.kalkulyatsiyaSavdo)} − tannarx ${fmtSum(t.kalkulyatsiyaTannarx)}</div>
      </div>
      <div class="card stat-card" ${uncostedCount && moduleEnabled("modulIshlabChiqarish") ? `data-nav="ishlabchiqarish" style="cursor:pointer;" title="Ishlab chiqarish sahifasida ko'rish"` : ""}>
        <div class="stat-label">Kalkulyatsiya qilinmagan sotuvlar</div>
        <div class="stat-value ${uncostedCount ? "neg" : ""}">${uncostedCount}</div>
        <div class="stat-sub">${uncostedCount ? (moduleEnabled("modulIshlabChiqarish") ? "Ishlab chiqarish sahifasida ko'rish uchun bosing" : "Kalkulyatsiya bilan bog'lanmagan") : "Barcha sotuvlar kalkulyatsiya bilan bog'langan"}</div>
      </div>
      <div class="card stat-card" ${moduleEnabled("modulOmbor") ? `data-nav="ombor" style="cursor:pointer;" title="Ombor qoldig'iga o'tish"` : ""}>
        <div class="stat-label">Ombor qoldig'i</div>
        <div class="stat-value">${fmtOgirlik(omborOgirlikQoldigiKg())}</div>
        <div class="stat-sub">${fmtSum(t.tovarZaxira)}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">So'nggi 6 oy — savdo, tannarx, foyda</h2>
      <div class="card" data-nav="f2" style="padding:18px;cursor:pointer;" title="Moliyaviy natijalar (F2) hisobotini ochish">
        ${dashboardTrendChartHtml(trend)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">So'nggi 6 oy — QQS (byudjetga to'lov)</h2>
      <div class="card" data-nav="qqs" style="padding:18px;cursor:pointer;" title="QQS hisobotini ochish">
        ${dashboardQqsChartHtml(qqsTrend)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">So'nggi 6 oy — Kreditorlik/Debitorlik qoldig'i</h2>
      <div class="card" data-nav="sverka" style="padding:18px;cursor:pointer;" title="Solishtirma dalolatnoma (Sverka)ni ochish">
        ${dashboardDebtChartHtml(debtTrend)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Bo'limlar orasidagi bog'liqlik</h2>
      <div class="card" style="padding:22px;">
        <div class="note" style="margin-top:0;">
          <b>Qanday ishlaydi:</b> Faktura kirim/chiqim va Bank bo'limlariga kiritilgan ma'lumotlar avtomatik ravishda
          <b>QQS</b>, <b>F2 (moliyaviy natija)</b>, <b>Foyda solig'i</b> va <b>F1 (balans)</b> hisobotlariga integratsiya bo'ladi —
          alohida qayta kiritish shart emas. Faqat har bir hujjatning holati (status) "Отказ/Bekor qilingan" bo'lmasa, hisobga olinadi.
          <b>Ish haqi</b> bo'limi doim <b>Ish haqi hisoboti</b>ga (NDFL/ijtimoiy soliq) avtomatik integratsiya bo'ladi; <b>F2</b>'ga esa
          faqat "Sozlamalar"da yoqilsa qo'shiladi (standart holatda o'chirilgan — mavjud hisob-kitoblarni o'zgartirib qo'ymaslik uchun).
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">So'nggi hujjatlar</h2>
      <div class="grid grid-2">
        ${recentList("kirim")}
        ${recentList("chiqim")}
      </div>
    </div>
  `;
  bindNavShortcuts(main);
  bindDashboardChart(trend);
  bindDashboardQqsChart(qqsTrend);
  bindDashboardDebtChart(debtTrend);
  const tileFoydaSoligi = document.getElementById("tileFoydaSoligi");
  if (tileFoydaSoligi) tileFoydaSoligi.addEventListener("click", () => openFoydaSoligiTalabModal(uncostedCount));
  const btnDashQuickBackup = document.getElementById("btnDashQuickBackup");
  if (btnDashQuickBackup) btnDashQuickBackup.addEventListener("click", exportFullBackupXlsx);
}

// Bosh sahifadagi "Foyda solig'i" yorlig'i kalkulyatsiya bo'yicha foydadan
// hisoblanadi (qarang: computeTotals -> kalkulyatsiyaFoydaSoligi), shuning
// uchun kalkulyatsiya bilan bog'lanmagan sotuv qatorlari bo'lsa aniq summa
// ko'rsatib bo'lmaydi — yorliq bosilganda shu qatorlarni bog'lash talab
// qilingani haqida oyna chiqadi ("Ishlab chiqarish" sahifasiga o'tkazadi).
function openFoydaSoligiTalabModal(uncostedCount) {
  openModal(`
    <h3>Aniq hisoblash uchun kerakli amal</h3>
    <p class="modal-sub">"Foyda solig'i" yorlig'i kalkulyatsiya bo'yicha foydadan (Savdo − kalkulyatsiya tannarxi) hisoblanadi. Hozircha <b>${uncostedCount} ta sotuv qatori</b> hech qanday mahsulot kalkulyatsiyasi bilan bog'lanmagan — shu qatorlarning tannarxi hisobga olinmagani uchun aniq soliq summasini ko'rsatib bo'lmaydi.</p>
    <p class="modal-sub">Davom etish uchun "Ishlab chiqarish" sahifasidagi "Kalkulyatsiya qilinmagan sotuvlar" ro'yxatida shu qatorlarni mos mahsulotga bog'lang.</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
      <button class="btn btn-primary" id="mGo">Ishlab chiqarishga o'tish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mGo").addEventListener("click", () => { closeModal(); navigate("ishlabchiqarish"); });
}

function recentList(type) {
  const rows = STORE[type].slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || "")).slice(0, 5);
  const title = type === "kirim" ? "Oxirgi kirim fakturalar" : "Oxirgi chiqim fakturalar";
  if (!rows.length) {
    return `<div class="card" data-nav="${type}" style="cursor:pointer;" title="${title} ro'yxatiga o'tish"><div class="card-title">${title}</div><div class="empty-state" style="padding:20px 0;"><div class="d">Hozircha hujjat yo'q — qo'shish uchun bosing</div></div></div>`;
  }
  return `
    <div class="card" data-nav="${type}" style="cursor:pointer;" title="${title} ro'yxatiga o'tish">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>${title}</span>
        <span class="faint" style="font-size:12px;font-weight:normal;">Barchasini ko'rish →</span>
      </div>
      ${rows.map((r) => `
        <div class="report-line cursor-pointer" style="grid-template-columns:70px 1fr 120px;" title="${escapeHtml(r.kontragentNomi || '')} (${fmtSum(r.jamiSumma)}) — ko'rish uchun bosing">
          <span class="faint mono">${escapeHtml(r.sana || "—")}</span>
          <span>${escapeHtml(r.kontragentNomi || "—")}</span>
          <span class="val">${fmtSum(r.jamiSumma)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

// data-nav="sahifa" bosilganda o'sha sahifaga o'tadi. Ixtiyoriy
// data-nav-section="..." bo'lsa (faqat "settings" uchun) — o'sha bo'limni ochadi.
let SETTINGS_TARGET_SECTION = null;
function bindNavShortcuts(scope) {
  scope.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.nav === "settings" && b.dataset.navSection) SETTINGS_TARGET_SECTION = b.dataset.navSection;
    navigate(b.dataset.nav);
  }));
}

/* ---------------------------- Faktura kirim/chiqim ---------------------------- */

const INVOICE_LABELS = {
  kirim: { title: "Faktura kirim", desc: "Sotuvchidan olingan xarid fakturalari (didox.uz eksportidan import qilinadi yoki qo'lda kiritiladi).", party: "Sotuvchi" },
  chiqim: { title: "Faktura chiqim", desc: "Xaridorlarga chiqarilgan savdo fakturalari (didox.uz eksportidan import qilinadi yoki qo'lda kiritiladi).", party: "Xaridor" }
};

// Hujjat raqami + sana + summa + kontragent nomi bo'yicha "identifikator" hosil
// qiladi — katta-kichik harf va ortiqcha bo'sh joylarga sezgir emas (Excel
// import qilingandagi ANIQ moslikka asoslangan tekshiruvdan ko'ra kengroq,
// chunki qo'lda kiritilgan yozuvlarda oz-moz farq bo'lishi mumkin).
function invoiceDuplicateKey(r) {
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(r.hujjatRaqami)}|${r.sana || ""}|${Math.round(toNum(r.jamiSumma))}|${norm(r.kontragentNomi)}`;
}

// Faqat KO'RSATISH uchun — hech narsani avtomat o'chirmaydi. Qaysi nusxa
// "asl" ekanini ishonchli aniqlash mumkin emas (kirim/chiqim jadvalida
// yaratilgan vaqti saqlanmaydi), shu sabab yakuniy qarorni odam qabul qilishi
// kerak — mavjud "O'chirish" tugmasi orqali (endi xatoni to'g'ri qaytaradigan).
function findDuplicateInvoiceIds(type) {
  const groups = new Map();
  STORE[type].forEach((r) => {
    if (!r.hujjatRaqami) return; // hujjat raqamisiz qatorlarni solishtirmaymiz
    const key = invoiceDuplicateKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const ids = new Set();
  let groupCount = 0;
  groups.forEach((list) => { if (list.length > 1) { groupCount++; list.forEach((r) => ids.add(r.id)); } });
  return { ids, groupCount };
}

let INVOICE_DUP_FILTER = { kirim: false, chiqim: false };
// "Faqat muammoli" filtri — faqat chiqim jadvalida (hisob holati qizil/sariq).
let INVOICE_PROBLEM_FILTER = { kirim: false, chiqim: false };
// computeChiqimHisobHolati render doirasidagi kesh — invalidateFifo() bo'shatadi.
let CHIQIM_HOLAT_CACHE = null;

/* ---------------- Chiqim faktura "hisob holati" (yumshoq tasdiq) ---------------- */
// Saqlanmaydi — tolandi kabi hisoblanadi. Faqat OGOHLANTIRISH: hisobotlardan
// (F2/QQS/Foyda) hech narsa chiqarilmaydi. Qarang: forget-fifo-tasdiq-plan.
const CHIQIM_HOLAT_META = {
  tasdiqlangan:   { pill: "pill-ok",     text: "Tasdiqlangan", rank: 0 },
  tovarsiz:       { pill: "pill-muted",  text: "Tovarsiz",      rank: 0 },
  bekor:          { pill: "pill-muted",  text: "Bekor",         rank: 0 },
  tekshirilsin:   { pill: "pill-warn",   text: "Tekshirilsin",  rank: 1 },
  tasdiqlanmagan: { pill: "pill-danger", text: "Tasdiqlanmagan", rank: 2 }
};

// Chiqim faktura sanasiga kelib, sarflangan xomashyolardan ombordа manfiy
// qoldiqда bo'lganlari — [{nomi, qoldiq, sabab}].
function chiqimOmborKamomadlari(chiqim) {
  const nomlar = new Set();
  STORE.chiqimTafsil.forEach((t) => {
    if (t.chiqimId !== chiqim.id || !t.mahsulotId) return;
    const m = STORE.mahsulotlar.find((x) => x.id === t.mahsulotId);
    if (m) (m.tarkib || []).forEach((tk) => { if (tk.nomi) nomlar.add(tk.nomi); });
  });
  const out = [];
  nomlar.forEach((nomi) => {
    // Belgili (signed) qoldiq — sotuv sanasiga kelib manfiyga tushган bo'lsa,
    // shu sotuv (yoki oldingi sotuvlar) ombordagi zaxiradan ko'p sarflagan.
    const qoldiq = omborQoldiqByNomiAsOf(nomi, chiqim.sana);
    if (qoldiq >= -1e-4) return;
    const kirimAsOf = STORE.ombor.some((r) => r.nomi === nomi && r.turi !== "chiqim" && toNum(r.miqdor) > 0
      && (!r.sana || !chiqim.sana || r.sana <= chiqim.sana));
    const kirimLifetime = kirimAsOf || STORE.ombor.some((r) => r.nomi === nomi && r.turi !== "chiqim" && toNum(r.miqdor) > 0);
    out.push({ nomi, qoldiq, sabab: kirimAsOf ? "kam" : (kirimLifetime ? "kirim_kech" : "kirim_yoq") });
  });
  return out;
}

// -> { holat, sabablar[] }
function computeChiqimHisobHolati(chiqimId) {
  if (!CHIQIM_HOLAT_CACHE) CHIQIM_HOLAT_CACHE = new Map();
  const cached = CHIQIM_HOLAT_CACHE.get(chiqimId);
  if (cached) return cached;

  const chiqim = STORE.chiqim.find((r) => r.id === chiqimId);
  let res;
  if (!chiqim) res = { holat: "tasdiqlangan", sabablar: [] };
  else if (!isValidStatus(chiqim.status)) res = { holat: "bekor", sabablar: [] };
  else if (chiqim.tovarsiz) res = { holat: "tovarsiz", sabablar: [] };
  else {
    const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);
    const sabablar = [];
    if (!rows.length) {
      if (toNum(chiqim.summaQQSsiz) > 0) sabablar.push({ turi: "qatorsiz" });
      res = { holat: sabablar.length ? "tasdiqlanmagan" : "tasdiqlangan", sabablar };
    } else {
      const kalkSiz = rows.filter((t) => !t.mahsulotId).length;
      if (kalkSiz) sabablar.push({ turi: "kalkulyatsiyasiz", soni: kalkSiz });
      const kamomadlar = chiqimOmborKamomadlari(chiqim);
      if (kamomadlar.length) sabablar.push({ turi: "ombor", xomashyolar: kamomadlar });
      if (sabablar.length) {
        res = { holat: "tasdiqlanmagan", sabablar };
      } else {
        const taxminiy = rows.filter((t) => ["narx", "avto", "taxminiy"].includes(t.mosTuri)).length;
        if (taxminiy) res = { holat: "tekshirilsin", sabablar: [{ turi: "taxminiy_moslik", soni: taxminiy }] };
        else res = { holat: "tasdiqlangan", sabablar: [] };
      }
    }
  }
  CHIQIM_HOLAT_CACHE.set(chiqimId, res);
  return res;
}

// sabablar -> qisqa matn (tooltip/banner uchun).
function chiqimHisobHolatiText(sabablar) {
  return (sabablar || []).map((s) => {
    if (s.turi === "kalkulyatsiyasiz") return `kalkulyatsiyasiz: ${s.soni} qator`;
    if (s.turi === "qatorsiz") return "mahsulot qatorlari import qilinmagan (yoki 'Tovarsiz' deb belgilang)";
    if (s.turi === "taxminiy_moslik") return `avtomatik taxminiy moslik: ${s.soni} qator — tekshiring`;
    if (s.turi === "ombor") {
      return s.xomashyolar.map((x) => `${x.nomi} (${OMBOR_KAMOMAD_LABEL[x.sabab] || "kam"})`).join(", ");
    }
    return "";
  }).filter(Boolean).join(" · ");
}

// Davr filtridagi chiqim fakturalar bo'yicha holat sonlari.
function chiqimHolatSonlari() {
  let tasdiqlanmagan = 0, tekshirilsin = 0;
  getFilteredRows(STORE.chiqim).forEach((r) => {
    const h = computeChiqimHisobHolati(r.id).holat;
    if (h === "tasdiqlanmagan") tasdiqlanmagan++;
    else if (h === "tekshirilsin") tekshirilsin++;
  });
  return { tasdiqlanmagan, tekshirilsin };
}

function renderInvoiceTable(type) {
  const info = INVOICE_LABELS[type];
  const filtered = getFilteredRows(STORE[type]);
  const { ids: dupIds, groupCount: dupGroupCount } = findDuplicateInvoiceIds(type);
  let visibleRows = INVOICE_DUP_FILTER[type] ? filtered.filter((r) => dupIds.has(r.id)) : filtered;
  // Chiqim hisob holati (yumshoq tasdiq) — sonlar + "faqat muammoli" filtri.
  const holatSon = type === "chiqim" ? chiqimHolatSonlari() : { tasdiqlanmagan: 0, tekshirilsin: 0 };
  const problemActive = type === "chiqim" && INVOICE_PROBLEM_FILTER.chiqim;
  if (problemActive) {
    visibleRows = visibleRows.filter((r) => {
      const h = computeChiqimHisobHolati(r.id).holat;
      return h === "tasdiqlanmagan" || h === "tekshirilsin";
    });
  }
  const rows = visibleRows.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");

  const totalBase = sumRows(filtered, "summaQQSsiz");
  const totalQQS = sumRows(filtered, "qqsSumma");
  const totalJami = sumRows(filtered, "jamiSumma");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${info.title}</h1>
        <p class="page-desc">${info.desc}</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnFindReplace">Izlash va almashtirish</button>
        <button class="btn" id="btnDidoxSync" title="Didox.uz orqali elektron hisobfakturalarni to'g'ridan-to'g'ri yuklab olish"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"><use href="#i-cloud-download"/></svg>Didox API</button>
        <button class="btn" id="btnImport">Excel'dan import</button>
        <button class="btn btn-primary" id="btnAddRow">+ Qo'lda qo'shish</button>
      </div>
    </div>
    <div class="grid grid-3 section">
      <div class="card stat-card"><div class="stat-label">Summa (QQSsiz)</div><div class="stat-value" id="statBase">${fmtSum(totalBase)}</div></div>
      <div class="card stat-card"><div class="stat-label">QQS summasi</div><div class="stat-value" id="statQQS">${fmtSum(totalQQS)}</div></div>
      <div class="card stat-card"><div class="stat-label">Jami (QQS bilan)</div><div class="stat-value" id="statJami">${fmtSum(totalJami)}</div></div>
    </div>

    ${type === "chiqim" && (holatSon.tasdiqlanmagan || holatSon.tekshirilsin) ? `
    <div class="note warn" style="margin:0 0 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span>${holatSon.tasdiqlanmagan ? `🔴 <b>${holatSon.tasdiqlanmagan}</b> ta faktura tasdiqlanmagan` : ""}${holatSon.tasdiqlanmagan && holatSon.tekshirilsin ? " · " : ""}${holatSon.tekshirilsin ? `⚠️ <b>${holatSon.tekshirilsin}</b> ta tekshirilsin` : ""} — kalkulyatsiyasiz yoki ombor zaxirasi yetishmaydi. Hisobotlar (F2/QQS) baribir shakllanadi, faqat tannarx taxminiy.</span>
      <button class="btn btn-sm ${problemActive ? "btn-primary" : ""}" id="btnProblemToggle">${problemActive ? "Hammasini ko'rsatish" : "Faqat muammolilarni ko'rsatish"}</button>
    </div>
    ` : ""}

    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: kontragent, hujjat raqami...">
      <button class="btn ${INVOICE_DUP_FILTER[type] ? "btn-primary" : ""}" id="btnDupToggle" title="Hujjat raqami+sana+summa+kontragent bo'yicha bir xil yozuvlarni ko'rsatadi">
        <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:3px;"><use href="#i-copy"/></svg>Takrorlar${dupGroupCount ? ` (${dupGroupCount})` : ""}
      </button>
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv${INVOICE_DUP_FILTER[type] ? " (faqat takrorlar)" : ""}${problemActive ? " (faqat muammoli)" : ""}</span>
    </div>

    <div class="bulk-bar" id="invBulkBar" style="display:none;">
      <span class="faint"><b id="invSelCount">0</b> ta belgilandi</span>
      <button class="btn btn-danger btn-sm" id="btnBulkDelInv">Belgilanganlarni o'chirish</button>
      <button class="btn btn-sm" id="btnBulkClearInv">Bekor qilish</button>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:32px"><input type="checkbox" id="selectAllInv" class="row-select" title="Barchasini belgilash"></th>
            <th>Sana</th>
            <th>Hujjat №</th>
            <th>${info.party}</th>
            <th>INN</th>
            <th>Status</th>
            <th>To'landi</th>
            <th class="num">Summa (QQSsiz)</th>
            <th class="num">QQS %</th>
            <th class="num">QQS summa</th>
            <th class="num">Jami</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="invoiceBody"></tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg><div class="t">${INVOICE_DUP_FILTER[type] ? "Takrorlangan hujjat topilmadi" : "Hujjatlar yo'q"}</div><div class="d">${INVOICE_DUP_FILTER[type] ? "Hujjat raqami+sana+summa+kontragent bo'yicha bir xil yozuv yo'q." : `"Excel'dan import" yoki "Didox API" tugmasi orqali hisobfakturalarni yuklang.`}</div></div>` : ""}
    ${kontragentlarDatalistHtml()}
  `;

  document.getElementById("btnAddRow").addEventListener("click", () => addInvoiceRow(type));
  document.getElementById("btnImport").addEventListener("click", () => openImportModal(type));
  const btnDidox = document.getElementById("btnDidoxSync");
  if (btnDidox) btnDidox.addEventListener("click", () => openDidoxSyncModal(type));
  document.getElementById("btnFindReplace").addEventListener("click", () => openFindReplaceModal({
    rows: STORE[type], storeType: type,
    fields: [{ key: "hujjatRaqami", label: "Hujjat №" }, { key: "kontragentNomi", label: "Kontragent nomi" }],
    onDone: () => renderInvoiceTable(type)
  }));
  document.getElementById("searchBox").addEventListener("input", (e) => filterInvoiceRows(e.target.value));
  document.getElementById("btnDupToggle").addEventListener("click", () => {
    INVOICE_DUP_FILTER[type] = !INVOICE_DUP_FILTER[type];
    renderInvoiceTable(type);
  });
  const btnProblem = document.getElementById("btnProblemToggle");
  if (btnProblem) btnProblem.addEventListener("click", () => {
    INVOICE_PROBLEM_FILTER.chiqim = !INVOICE_PROBLEM_FILTER.chiqim;
    renderInvoiceTable(type);
  });

  bindInvoiceRowEvents(type);
  bindInvoiceBulkSelect(type);
  renderRowsChunked(document.getElementById("invoiceBody"), rows, (r) => invoiceRowHtml(type, r, dupIds.has(r.id)), {
    onDone: () => filterInvoiceRows(document.getElementById("searchBox").value)
  });
}

// Faktura jadvalида qatorlarni belgilab ommaviy o'chirish.
function bindInvoiceBulkSelect(type) {
  const body = document.getElementById("invoiceBody");
  const bar = document.getElementById("invBulkBar");
  const cntEl = document.getElementById("invSelCount");
  const allBox = document.getElementById("selectAllInv");
  if (!body || !bar) return;
  const selected = () => [...body.querySelectorAll(".row-select:checked")].map((c) => c.dataset.select);
  const refresh = () => {
    const n = selected().length;
    cntEl.textContent = n;
    bar.style.display = n ? "" : "none";
  };
  body.addEventListener("change", (e) => { if (e.target.classList.contains("row-select")) refresh(); });
  allBox.addEventListener("change", () => {
    body.querySelectorAll(".row-select").forEach((c) => { c.checked = allBox.checked; });
    refresh();
  });
  document.getElementById("btnBulkClearInv").addEventListener("click", () => {
    body.querySelectorAll(".row-select").forEach((c) => { c.checked = false; });
    allBox.checked = false;
    refresh();
  });
  document.getElementById("btnBulkDelInv").addEventListener("click", async () => {
    const ids = selected();
    if (!ids.length) return;
    if (!confirm(`${ids.length} ta hujjatni o'chirmoqchimisiz?\n\nBu amalni ortga qaytarib bo'lmaydi.`)) return;
    for (const id of ids) await deleteRowSafe(TABLE_NAMES[type], type, id, null);
    renderInvoiceTable(type);
    toast(`${ids.length} ta hujjat o'chirildi`);
  });
}

function invoiceRowHtml(type, r, isDup) {
  const invalid = !isValidStatus(r.status);
  const statusPill = invalid ? "pill-danger" : (r.status === "Ожидает" ? "pill-warn" : "pill-ok");
  // Chiqim uchun — "hisob holati" chip (yumshoq tasdiq).
  let holatChip = "", holatTint = "", holatTitle = "";
  if (type === "chiqim" && !invalid) {
    const h = computeChiqimHisobHolati(r.id);
    const meta = CHIQIM_HOLAT_META[h.holat];
    if (meta && meta.rank > 0) {
      holatTitle = chiqimHisobHolatiText(h.sabablar);
      holatChip = `<span class="pill ${meta.pill}" style="margin-left:4px;" title="${escapeHtml(holatTitle)}">${meta.text}</span>`;
      holatTint = h.holat === "tasdiqlanmagan" ? "background:var(--danger-soft, #fdecec)" : "background:var(--warn-soft)";
    }
  }
  const rowStyle = [invalid ? "opacity:.55" : "", isDup ? "background:var(--warn-soft)" : holatTint].filter(Boolean).join(";");
  const rowTitle = isDup
    ? "Diqqat: bu hujjat raqami+sana+summa+kontragent bo'yicha boshqa yozuv(lar) bilan bir xil bo'lishi mumkin"
    : holatTitle;
  return `
    <tr data-id="${r.id}" style="${rowStyle}" title="${escapeHtml(rowTitle)}">
      <td style="text-align:center"><input type="checkbox" class="row-select" data-select="${r.id}"></td>
      <td><input type="date" class="cell-input" data-f="sana" value="${escapeHtml(r.sana || "")}"></td>
      <td><input class="cell-input" data-f="hujjatRaqami" value="${escapeHtml(r.hujjatRaqami || "")}" style="min-width:90px"></td>
      <td><input class="cell-input" data-f="kontragentNomi" list="kontragentlarList" value="${escapeHtml(r.kontragentNomi || "")}" style="min-width:170px"></td>
      <td><input class="cell-input" data-f="kontragentInn" value="${escapeHtml(r.kontragentInn || "")}" style="min-width:90px"></td>
      <td><span class="pill ${statusPill}">${escapeHtml(r.status || "Подписан")}</span>${holatChip}</td>
      <td style="text-align:center">${tolandiCellHtml(r)}</td>
      <td class="num"><input class="cell-input num num-fmt" data-f="summaQQSsiz" value="${fmt(r.summaQQSsiz)}"></td>
      <td class="num"><input class="cell-input num" data-f="qqsStavka" value="${fmt(r.qqsStavka)}" style="width:50px"></td>
      <td class="num"><input class="cell-input num num-fmt" data-f="qqsSumma" value="${fmt(r.qqsSumma)}"></td>
      <td class="num jami-cell" style="font-weight:700">${fmtSum(r.jamiSumma)}</td>
      <td class="row-actions">
        ${kontragentHistoryBtnHtml(r.kontragentInn, type)}
        ${type === "chiqim" ? `<button class="icon-btn" data-kalk="${r.id}" title="Kalkulyatsiya — sotilgan mahsulotlar va ombordan sarf"><svg class="ic" viewBox="0 0 24 24"><use href="#i-calc"/></svg></button>` : ""}
        ${type === "kirim" ? `<button class="icon-btn" data-view="${r.id}" title="Hujjatni ko'rish — mahsulot tarkibi va chop etish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg></button>` : ""}
        <button class="icon-btn" data-del="${r.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function refreshInvoiceSummary(type) {
  const filtered = getFilteredRows(STORE[type]);
  const totalBase = sumRows(filtered, "summaQQSsiz");
  const totalQQS = sumRows(filtered, "qqsSumma");
  const totalJami = sumRows(filtered, "jamiSumma");
  const elBase = document.getElementById("statBase");
  const elQQS = document.getElementById("statQQS");
  const elJami = document.getElementById("statJami");
  if (elBase) elBase.textContent = fmtSum(totalBase);
  if (elQQS) elQQS.textContent = fmtSum(totalQQS);
  if (elJami) elJami.textContent = fmtSum(totalJami);
}

// "To'landi" avtomatik (bank bilan INN+summa solishtirib, recomputePaymentStatusForType
// orqali) hisoblanadi, lekin avtomat xato moslashtirsa (masalan bir kontragentning
// bir necha fakturasi bir xil summada bo'lganda) foydalanuvchi pillni bosib qo'lda
// ustidan yozib qo'yishi (override) mumkin — shunda qator avtomatik hisobdan butunlay
// chiqariladi (qarang: recomputePaymentStatusForType). "Avtomatga qaytarish" tugmasi
// override'ni bekor qiladi. Qarang: setTolandiOverride, resetTolandiToAuto.
function tolandiCellHtml(r) {
  const hasInn = !!(r.kontragentInn && String(r.kontragentInn).trim());
  if (!hasInn) {
    return `<input type="checkbox" data-f="tolandi" ${r.tolandi ? "checked" : ""} title="INN kiritilmagani uchun qo'lda belgilanadi">`;
  }
  if (r.tolandiOverride) {
    return `
      <span class="pill ${r.tolandi ? "pill-ok" : "pill-muted"}" data-tolandi-toggle="${r.id}" style="cursor:pointer;" title="Qo'lda belgilangan — bosib qiymatini almashtiring">${r.tolandi ? "To'landi" : "Ochiq"} <span class="faint" style="font-size:10px;">(qo'lda)</span></span>
      <button class="icon-btn icon-btn-sync" data-tolandi-auto="${r.id}" title="Avtomatik (bank bilan solishtirish) rejimiga qaytarish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg></button>
    `;
  }
  return `<span class="pill ${r.tolandi ? "pill-ok" : "pill-muted"}" data-tolandi-toggle="${r.id}" style="cursor:pointer;" title="Bank harakati bilan avtomatik solishtirildi (INN + summa). Bosib qo'lda ustidan yozish mumkin.">${r.tolandi ? "To'landi" : "Ochiq"}</span>`;
}

function setTolandiOverride(type, id, newTolandi) {
  const row = STORE[type].find((r) => r.id === id);
  if (!row) return;
  row.tolandiOverride = true;
  row.tolandi = newTolandi;
  pushFieldsUpdate(type, id, { tolandiOverride: true, tolandi: newTolandi });
  saveStore(); // boshqa qatorlarning avtomatik holatini ham qayta hisoblab, o'zgarganlarini bazaga yozadi
  renderInvoiceTable(type);
}

function resetTolandiToAuto(type, id) {
  const row = STORE[type].find((r) => r.id === id);
  if (!row) return;
  row.tolandiOverride = false;
  pushFieldsUpdate(type, id, { tolandiOverride: false });
  saveStore(); // avtomatik qiymatni qayta hisoblaydi va o'zgargan bo'lsa (shu qator ham) bazaga yozadi
  renderInvoiceTable(type);
}

function refreshTolandiCellsForInn(type, inn) {
  if (!inn) return;
  document.querySelectorAll(`#invoiceBody tr[data-id]`).forEach((tr) => {
    const row = STORE[type].find((r) => r.id === tr.dataset.id);
    if (!row || (row.kontragentInn || "").trim() !== inn) return;
    const cell = tr.children[5];
    if (cell) cell.innerHTML = tolandiCellHtml(row);
  });
}

function bindInvoiceRowEvents(type) {
  const body = document.getElementById("invoiceBody");
  if (!body) return;
  body.addEventListener("change", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    const row = STORE[type].find((r) => r.id === id);
    if (!row) return;
    const field = e.target.dataset.f;
    if (!field) return;
    if (field !== "tolandi" && !guardRowCell(e.target, field, row)) return;
    if (field === "tolandi") {
      row.tolandi = e.target.checked;
      pushFieldsUpdate(type, id, { tolandi: row.tolandi });
      saveStore();
    } else if (["summaQQSsiz", "qqsStavka", "qqsSumma"].includes(field)) {
      row[field] = toNum(e.target.value);
      if (field === "summaQQSsiz" || field === "qqsStavka") {
        row.qqsSumma = Math.round(row.summaQQSsiz * row.qqsStavka / 100);
        const qqsCell = tr.querySelector('[data-f="qqsSumma"]');
        if (qqsCell) qqsCell.value = fmt(row.qqsSumma);
      }
      row.jamiSumma = row.summaQQSsiz + row.qqsSumma;
      pushFieldsUpdate(type, id, { summaQQSsiz: row.summaQQSsiz, qqsStavka: row.qqsStavka, qqsSumma: row.qqsSumma, jamiSumma: row.jamiSumma });
      saveStore();
      const jamiCell = tr.querySelector(".jami-cell");
      if (jamiCell) jamiCell.textContent = fmtSum(row.jamiSumma);
      refreshInvoiceSummary(type);
      refreshTolandiCellsForInn(type, (row.kontragentInn || "").trim());
    } else if (field === "kontragentInn") {
      row.kontragentInn = e.target.value;
      pushFieldsUpdate(type, id, { kontragentInn: row.kontragentInn });
      saveStore();
      ensureKontragentAutoAdded(row.kontragentInn, row.kontragentNomi);
      renderInvoiceTable(type);
      return;
    } else if (field === "kontragentNomi") {
      row.kontragentNomi = e.target.value;
      pushFieldsUpdate(type, id, { kontragentNomi: row.kontragentNomi });
      const match = resolveKontragentByNomi(row.kontragentNomi);
      if (match && match.inn && !(row.kontragentInn || "").trim()) {
        row.kontragentInn = match.inn;
        pushFieldsUpdate(type, id, { kontragentInn: row.kontragentInn });
        saveStore();
        renderInvoiceTable(type);
        return;
      }
      ensureKontragentAutoAdded(row.kontragentInn, row.kontragentNomi);
      saveStore();
    } else {
      row[field] = e.target.value;
      pushFieldsUpdate(type, id, { [field]: row[field] });
      saveStore();
    }
  });
  body.addEventListener("click", (e) => {
    const delId = e.target.dataset.del;
    if (delId) { deleteRowSafe(TABLE_NAMES[type], type, delId, () => renderInvoiceTable(type)); return; }
    const kalkId = e.target.dataset.kalk;
    if (kalkId) { openChiqimKalkulyatsiyaModal(kalkId); return; }
    const viewId = e.target.dataset.view;
    if (viewId) { openKirimDetailModal(viewId); return; }
    const toggleBtn = e.target.closest("[data-tolandi-toggle]");
    if (toggleBtn) {
      const row = STORE[type].find((r) => r.id === toggleBtn.dataset.tolandiToggle);
      if (row) setTolandiOverride(type, row.id, !row.tolandi);
      return;
    }
    const autoBtn = e.target.closest("[data-tolandi-auto]");
    if (autoBtn) { resetTolandiToAuto(type, autoBtn.dataset.tolandiAuto); return; }
  });
}

function filterInvoiceRows(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll("#invoiceBody tr").forEach((tr) => {
    const inputValues = Array.from(tr.querySelectorAll("input")).map((i) => i.value).join(" ");
    const text = (tr.textContent + " " + inputValues).toLowerCase();
    tr.style.display = !q || text.includes(q) ? "" : "none";
  });
}

async function addInvoiceRow(type) {
  const s = STORE.settings;
  const newRow = {
    sana: todayISO(), hujjatRaqami: "", status: "Подписан", kontragentInn: "", kontragentNomi: "",
    summaQQSsiz: 0, qqsStavka: s.qqsStavka, qqsSumma: 0, jamiSumma: 0, tolandi: false
  };
  const { data, error } = await sbClient.from(TABLE_NAMES[type]).insert(toDbRow(TABLE_MAPS[type], newRow)).select().single();
  if (error) { reportError(error, "Qo'shishda xatolik"); return; }
  const row = fromDbRow(TABLE_MAPS[type], data);
  if (!STORE[type].some((r) => r.id === row.id)) STORE[type].push(row);
  saveStore();
  renderInvoiceTable(type);
  toast("Yangi qator qo'shildi");
}

/* ---------------------------- Faktura kirim: hujjat ko'rinishi ---------------------------- */
// Jadvaldagi qator o'zi "hujjat" emas — shu sabab bitta kirim fakturasini
// mahsulot tarkibi bilan birga ko'rish/chop etish uchun alohida modal.
// Bog'langan mahsulot qatorlarini AVVAL kirim_id orqali (yangi, avtomatik
// bog'langan importlar) qidiramiz; agar topilmasa (masalan migration_kirim_
// yaxshilash.sql hali ishga tushirilmagan yoki hujjat eski, alohida "Ombor"
// importi orqali qo'shilgan) — hujjat№+sana bo'yicha TAXMINIY moslikka
// o'tamiz va buni foydalanuvchiga ochiq aytamiz.
function findOmborLinesForKirim(kirimRow) {
  const linked = STORE.ombor.filter((r) => r.kirimId === kirimRow.id);
  if (linked.length) return { rows: linked, exact: true };
  const guessed = STORE.ombor.filter((r) => !r.kirimId && r.turi !== "chiqim" &&
    r.hujjatRaqami === kirimRow.hujjatRaqami && r.sana === kirimRow.sana);
  return { rows: guessed, exact: false };
}

function openKirimDetailModal(kirimId) {
  const kirimRow = STORE.kirim.find((r) => r.id === kirimId);
  if (!kirimRow) return;
  const { rows, exact } = findOmborLinesForKirim(kirimRow);

  const lineItemsHtml = rows.length ? `
    ${!exact ? `<div class="note" style="margin-bottom:10px;">Mahsulot qatorlari hujjat raqami+sana bo'yicha TAXMINIY moslashtirildi (aniq bog'lanish yo'q — ehtimol bu hujjat eski import orqali qo'shilgan).</div>` : ""}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Mahsulot nomi</th><th>Birlik</th><th class="num">Miqdor</th><th class="num">Narx</th><th class="num">Summa (QQSsiz)</th><th class="num">QQS</th><th class="num">Jami</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.nomi)}</td>
              <td>${escapeHtml(r.birlik || "")}</td>
              <td class="num">${fmt(r.miqdor, 3)}</td>
              <td class="num">${fmtSum(r.narx)}</td>
              <td class="num">${fmtSum(r.yetkazibBerishNarxi)}</td>
              <td class="num">${fmtSum(r.qqsSumma)}</td>
              <td class="num">${fmtSum(r.yetkazibBerishNarxiQQSBilan)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<p class="modal-sub">Bu hujjat uchun mahsulot tarkibi topilmadi — qo'lda kiritilgan hujjat bo'lishi yoki asl import faylida mahsulot ustunlari (nomi/miqdor/narx) bo'lmagan bo'lishi mumkin.</p>`;

  openModal(`
    <h3>Kirim fakturasi ${escapeHtml(kirimRow.hujjatRaqami || "")}</h3>
    <p class="modal-sub">${escapeHtml(kirimRow.sana || "")} &middot; ${escapeHtml(kirimRow.kontragentNomi || "")} ${kirimRow.kontragentInn ? `(INN: ${escapeHtml(kirimRow.kontragentInn)})` : ""}</p>
    <div class="note" style="margin-bottom:12px;">
      <div class="report-line"><span class="label">Status</span><span class="code"></span><span class="val">${escapeHtml(kirimRow.status || "Подписан")}</span></div>
      <div class="report-line"><span class="label">Summa (QQSsiz)</span><span class="code"></span><span class="val">${fmtSum(kirimRow.summaQQSsiz)}</span></div>
      <div class="report-line"><span class="label">QQS (${fmt(kirimRow.qqsStavka)}%)</span><span class="code"></span><span class="val">${fmtSum(kirimRow.qqsSumma)}</span></div>
      <div class="report-line"><span class="label"><b>Jami</b></span><span class="code"></span><span class="val"><b>${fmtSum(kirimRow.jamiSumma)}</b></span></div>
      <div class="report-line"><span class="label">To'lov holati</span><span class="code"></span><span class="val">${kirimRow.tolandi ? "To'landi" : "Ochiq"}${kirimRow.tolandiOverride ? " (qo'lda belgilangan)" : ""}</span></div>
    </div>
    ${lineItemsHtml}
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
      <button class="btn btn-primary" id="mPrint">Chop etish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mPrint").addEventListener("click", () => printKirimBlanka(kirimId));
}

// openKirimDetailModal bilan bir xil ma'lumot, lekin chop etish uchun —
// printSverkaPdf/printChiqimKalkulyatsiyaBlanka bilan bir xil window.open+print naqshi.
function printKirimBlanka(kirimId) {
  const kirimRow = STORE.kirim.find((r) => r.id === kirimId);
  if (!kirimRow) return;
  const { rows } = findOmborLinesForKirim(kirimRow);
  const s = STORE.settings;

  const bodyRows = rows.map((r, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(r.nomi)}</td>
      <td>${escapeHtml(r.birlik || "")}</td>
      <td class="num">${fmt(r.miqdor, 3)}</td>
      <td class="num">${fmtSum(r.narx)}</td>
      <td class="num">${fmtSum(r.yetkazibBerishNarxiQQSBilan)}</td>
    </tr>
  `).join("");

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Kirim fakturasi ${escapeHtml(kirimRow.hujjatRaqami || "")}</title>
      <style>
        body{font-family:Arial, "Segoe UI", sans-serif; padding:28px; color:#1c2530;}
        h1{font-size:18px; margin:0 0 4px;}
        .sub{font-size:12px; color:#5b6b7b; margin:0 0 4px;}
        .meta{font-size:12px; color:#5b6b7b; margin:0 0 18px;}
        table{width:100%; border-collapse:collapse; font-size:11.5px;}
        th, td{border:1px solid #ccd3da; padding:6px 8px; text-align:left;}
        th{background:#eceff2;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        tfoot td{font-weight:700; border-top:2px solid #1c2530;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(s.companyName)}</h1>
      <div class="sub">INN: ${escapeHtml(s.inn)}</div>
      <div class="meta">Kirim fakturasi &middot; № ${escapeHtml(kirimRow.hujjatRaqami || "—")} &middot; ${escapeHtml(kirimRow.sana || "")} &middot; Sotuvchi: ${escapeHtml(kirimRow.kontragentNomi || "")} (INN: ${escapeHtml(kirimRow.kontragentInn || "—")})</div>
      ${rows.length ? `
        <table>
          <thead><tr><th class="num">№</th><th>Nomi</th><th>Birlik</th><th class="num">Miqdor</th><th class="num">Narx</th><th class="num">Jami</th></tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      ` : ""}
      <table style="margin-top:14px;">
        <tfoot>
          <tr><td colspan="3">Summa (QQSsiz)</td><td class="num" colspan="3">${fmtSum(kirimRow.summaQQSsiz)}</td></tr>
          <tr><td colspan="3">QQS (${fmt(kirimRow.qqsStavka)}%)</td><td class="num" colspan="3">${fmtSum(kirimRow.qqsSumma)}</td></tr>
          <tr><td colspan="3">Jami</td><td class="num" colspan="3">${fmtSum(kirimRow.jamiSumma)}</td></tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

/* --------------------------------- Ombor --------------------------------- */
// Ombor — "Faktura kirim" hujjatlaridagi har bir mahsulot qatorini alohida
// saqlaydi (hujjat darajasida emas, mahsulot darajasida). didox.uz eksport
// faylini to'g'ridan-to'g'ri shu bo'limga ham import qilish mumkin.

// Ombor endi ikki turdagi qatorlarni saqlaydi: turi="kirim" (xarid qilingan
// xomashyo/mahsulot — "Faktura kirim" fayllaridan import qilinadi yoki qo'lda
// kiritiladi) va turi="chiqim" (Ishlab chiqarish bo'limida mahsulot
// ishlab chiqarilganda/sotilganda kalkulyatsiya asosida avtomat yoziladigan
// sarf qatori). Asosiy jurnalda faqat "kirim" qatorlari ko'rsatiladi, "Qoldiq"
// jadvalida esa har ikkisi ham hisobga olinib joriy zaxira chiqariladi.
function omborKirimRows() {
  return STORE.ombor.filter((r) => r.turi !== "chiqim");
}

function omborQoldiqList() {
  const map = {};
  STORE.ombor.forEach((r) => {
    if (!r.nomi) return;
    const key = r.nomi + "||" + (r.birlik || "");
    if (!map[key]) map[key] = { nomi: r.nomi, birlik: r.birlik, kirim: 0, chiqim: 0 };
    if (r.turi === "chiqim") map[key].chiqim += toNum(r.miqdor);
    else map[key].kirim += toNum(r.miqdor);
  });
  return Object.values(map)
    .map((x) => Object.assign(x, { qoldiq: x.kirim - x.chiqim }))
    .sort((a, b) => a.nomi.localeCompare(b.nomi));
}

// Bosh sahifadagi "Ombor qoldig'i" yorlig'i uchun — faqat OG'IRLIK birligida
// (kg/kilogramm/tonna, lotin/kirill yozuvida) yuritiladigan xomashyolarning
// jami qoldig'ini kg holida qaytaradi ("tonna" birlikdagilar 1000ga
// ko'paytirilib qo'shiladi). Dona/metr kabi og'irlik bo'lmagan birliklar
// mazmunsiz yig'indi bermasligi uchun hisobga olinmaydi.
const OMBOR_OGIRLIK_BIRLIK_KEYWORDS = ["kg", "кг", "kilogramm", "килограмм", "tonna", "тонна"];
function omborOgirlikQoldigiKg() {
  return omborQoldiqList().reduce((sum, q) => {
    const b = String(q.birlik || "").toLowerCase();
    if (!OMBOR_OGIRLIK_BIRLIK_KEYWORDS.some((k) => b.includes(k))) return sum;
    const isTonna = b.includes("tonna") || b.includes("тонна");
    return sum + q.qoldiq * (isTonna ? 1000 : 1);
  }, 0);
}

// Kg qiymatini o'qishga qulay birlikda ko'rsatadi — 1000 kg va undan ko'p
// bo'lsa tonnada, aks holda kg'da.
function fmtOgirlik(kg) {
  if (Math.abs(kg) >= 1000) return `${fmt(kg / 1000, 2)} t`;
  return `${fmt(kg, 1)} kg`;
}

// Xomashyoning o'rtacha xarid narxi (QQSsiz, 1 birlik uchun) — barcha "kirim"
// qatorlaridagi shu nomdagi yozuvlar bo'yicha. Mahsulot kalkulyatsiyasi va
// Ishlab chiqarish tannarxini hisoblashda ishlatiladi.
// asOfDate berilsa, faqat shu sanagacha (shu kunni ham qo'shib) bo'lgan kirim
// qatorlari bo'yicha o'rtacha narx hisoblanadi — masalan eski faktura
// kalkulyatsiyasi keyinchalik narxlar o'zgargan bo'lsa ham o'sha davrdagi
// haqiqiy tannarxni ko'rsatishi uchun. Shu sanagacha kirim topilmasa (masalan
// eng birinchi operatsiya), noaniqlikdan ko'ra yaqinroq bo'lgani uchun butun
// tarix bo'yicha o'rtachaga qaytiladi.
function avgOmborNarx(nomi, asOfDate) {
  let rows = omborKirimRows().filter((r) => r.nomi === nomi);
  if (asOfDate) {
    const uptoDate = rows.filter((r) => !r.sana || r.sana <= asOfDate);
    if (uptoDate.length) rows = uptoDate;
  }
  const totalMiqdor = rows.reduce((a, r) => a + toNum(r.miqdor), 0);
  if (!totalMiqdor) return 0;
  const totalBaza = rows.reduce((a, r) => a + toNum(r.yetkazibBerishNarxi), 0);
  return totalBaza / totalMiqdor;
}

/* ===================== FIFO (partiyalar bo'yicha) ombor hisobi ===================== */
// STORE.ombor qatorlari ustida partiya (FIFO) bo'yicha tannarx hisoblaydi.
// Hech narsa saqlanmaydi — har chaqiruvda STORE.ombor'dan qaytadan quriladi,
// shu sabab keyinroq eski sanali kirim qo'shilsa, o'sha davrdagi tannarx ham
// avtomat to'g'rilanadi. Usul "ortacha" bo'lganda (Sozlamalar) bu dvigatel
// ishlatilmaydi — eski avgOmborNarx yo'li qoladi.
// Qarang: computeMahsulotConsumption, omborQoldiqQiymatiAsOf, computeTotals.

function fifoUsulActive() {
  return (STORE.settings.tannarxUsuli || "fifo") !== "ortacha";
}

// Bir kun ichidagi tartib: (sana ↑, kirim<chiqim, created_at ↑, id ↑). Shu kungi
// xarid shu kungi chiqimni qoplaydi; tartib to'liq deterministik.
function cmpOmbor(a, b) {
  const sa = a.sana || "", sb = b.sana || "";
  if (sa !== sb) return sa < sb ? -1 : 1;
  const ta = a.turi === "chiqim" ? 1 : 0, tb = b.turi === "chiqim" ? 1 : 0;
  if (ta !== tb) return ta - tb;
  const ca = a.createdAt || "", cb = b.createdAt || "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  const ia = a.id || "", ib = b.id || "";
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

// Bitta xomashyo/mahsulot nomi bo'yicha to'liq FIFO daftari.
//   byDoc          — Map(ombor.hujjatRaqami -> {tannarx, qty, kamomad, sabab})
//                    ya'ni har bir sarf hujjati (CHT-<tafsilId> / IC-<icId>) uchun
//                    aynan shu xomashyoga tegishli FIFO qiymati.
//   qiymatAsOf(d)  — d sanasiga (shu kun ham) qolgan partiyalar qiymati (QQSsiz)
//   qtyAsOf(d)     — d sanasiga qolgan miqdor
// kamomad (yetishmovchilik) bo'lsa: ilgari kirim bo'lgan bo'lsa sabab="kam" va
// yetmagan qism oxirgi ma'lum partiya narxida baholanadi (tannarx kam
// ko'rsatilmasin); umuman kirim bo'lmagan bo'lsa sabab="kirim_yoq", narx 0.
function buildFifoLedgerFromRows(rows) {
  const layers = [];        // {qty, unit}
  let lastUnit = 0, hadKirim = false;
  const byDoc = new Map();
  const snaps = [];         // {sana, qty, qiymat} — sana bo'yicha o'smaydigan emas, o'suvchi

  for (const r of rows) {
    const qty = toNum(r.miqdor);
    if (r.turi !== "chiqim") {
      const unit = qty > 0 ? toNum(r.yetkazibBerishNarxi) / qty : 0;
      if (qty > 0) { layers.push({ qty, unit }); lastUnit = unit; hadKirim = true; }
    } else {
      let need = qty, cost = 0;
      while (need > 1e-9 && layers.length) {
        const L = layers[0];
        const take = Math.min(L.qty, need);
        cost += take * L.unit; L.qty -= take; need -= take;
        if (L.qty <= 1e-9) layers.shift();
      }
      let sabab = null, kamomad = 0;
      if (need > 1e-9) {
        kamomad = need;
        if (hadKirim) { sabab = "kam"; cost += need * lastUnit; }
        else sabab = "kirim_yoq";
      }
      if (r.hujjatRaqami) {
        const cur = byDoc.get(r.hujjatRaqami) || { tannarx: 0, qty: 0, kamomad: 0, sabab: null };
        cur.tannarx += cost; cur.qty += qty; cur.kamomad += kamomad;
        if (sabab) cur.sabab = (cur.sabab === "kirim_yoq" || sabab === "kirim_yoq") ? "kirim_yoq" : "kam";
        byDoc.set(r.hujjatRaqami, cur);
      }
    }
    snaps.push({
      sana: r.sana || "",
      qty: layers.reduce((s, L) => s + L.qty, 0),
      qiymat: layers.reduce((s, L) => s + L.qty * L.unit, 0)
    });
  }

  const pick = (field, sana) => {
    if (!snaps.length) return 0;
    if (!sana) return snaps[snaps.length - 1][field];
    let v = 0;
    for (const s of snaps) { if (s.sana <= sana) v = s[field]; else break; }
    return v;
  };
  return {
    byDoc, hadKirim,
    qiymatAsOf: (sana) => pick("qiymat", sana),
    qtyAsOf: (sana) => pick("qty", sana)
  };
}

function buildAllFifoLedgers() {
  const byName = new Map();
  STORE.ombor.forEach((r) => {
    const n = (r.nomi || "").trim();
    if (!n) return;
    let list = byName.get(n);
    if (!list) { list = []; byName.set(n, list); }
    list.push(r);
  });
  const ledgers = new Map();
  byName.forEach((rows, n) => {
    rows.sort(cmpOmbor);
    ledgers.set(n, buildFifoLedgerFromRows(rows));
  });
  return ledgers;
}

function buildFifoLedger(nomi) {
  return fifoLedger(nomi);
}

// Render doirasidagi kesh — invalidateFifo() har mutatsiyada (yoki sahifa
// qayta chizilishida) uni bo'shatadi.
let FIFO_LEDGERS = null;
function invalidateFifo() { FIFO_LEDGERS = null; CHIQIM_HOLAT_CACHE = null; }
function fifoLedger(nomi) {
  if (!FIFO_LEDGERS) FIFO_LEDGERS = buildAllFifoLedgers();
  const key = (nomi || "").trim();
  let l = FIFO_LEDGERS.get(key);
  if (!l) {
    l = buildFifoLedgerFromRows([]);
    FIFO_LEDGERS.set(key, l);
  }
  return l;
}

// Gipotetik sarf: "nomi"dan "need" birlik "sana"gacha bo'lgan partiyalardan
// yechilsa qancha turadi (bazaga yozilmagan — oldindan ko'rish / hali CHT-
// qatori yaratilmagan holatlar uchun).
function fifoHypotheticalCost(nomi, need, sana) {
  const rows = STORE.ombor
    .filter((r) => r.nomi === nomi && (!sana || (r.sana || "") <= sana))
    .slice().sort(cmpOmbor);
  const layers = [];
  let lastUnit = 0, hadKirim = false;
  for (const r of rows) {
    const qty = toNum(r.miqdor);
    if (r.turi !== "chiqim") {
      const unit = qty > 0 ? toNum(r.yetkazibBerishNarxi) / qty : 0;
      if (qty > 0) { layers.push({ qty, unit }); lastUnit = unit; hadKirim = true; }
    } else {
      let n = qty;
      while (n > 1e-9 && layers.length) {
        const L = layers[0]; const t = Math.min(L.qty, n); L.qty -= t; n -= t;
        if (L.qty <= 1e-9) layers.shift();
      }
    }
  }
  let n = need, cost = 0;
  while (n > 1e-9 && layers.length) {
    const L = layers[0]; const t = Math.min(L.qty, n);
    cost += t * L.unit; L.qty -= t; n -= t;
    if (L.qty <= 1e-9) layers.shift();
  }
  let sabab = null, kamomad = 0;
  if (n > 1e-9) {
    kamomad = n;
    if (hadKirim) { sabab = "kam"; cost += n * lastUnit; }
    else sabab = "kirim_yoq";
  }
  return { tannarx: cost, kamomad, sabab };
}

// Ombordagi joriy tovar-moddiy zaxiralar qiymati (QQSsiz) — "asOfDate"
// sanasiga nisbatan (F1 balans uchun). Har bir nom bo'yicha shu sanagacha
// bo'lgan kirim/chiqim miqdorlari asosida qoldiq va o'rtacha xarid narxi
// hisoblanadi, so'ng qoldiq * o'rtacha narx yig'indisi qaytariladi.
function omborQoldiqQiymatiAsOf(asOfDate) {
  if (fifoUsulActive()) {
    const names = new Set(STORE.ombor.map((r) => r.nomi).filter(Boolean));
    let sum = 0;
    names.forEach((nomi) => { sum += fifoLedger(nomi).qiymatAsOf(asOfDate); });
    return sum;
  }
  // Eski usul: har nom bo'yicha (kirim − chiqim) miqdor * o'rtacha xarid narxi.
  const rows = !asOfDate ? STORE.ombor : STORE.ombor.filter((r) => !r.sana || r.sana <= asOfDate);
  const map = {};
  rows.forEach((r) => {
    if (!r.nomi) return;
    if (!map[r.nomi]) map[r.nomi] = { kirimMiqdor: 0, kirimBaza: 0, chiqimMiqdor: 0 };
    if (r.turi === "chiqim") map[r.nomi].chiqimMiqdor += toNum(r.miqdor);
    else {
      map[r.nomi].kirimMiqdor += toNum(r.miqdor);
      map[r.nomi].kirimBaza += toNum(r.yetkazibBerishNarxi);
    }
  });
  return Object.values(map).reduce((sum, x) => {
    const qoldiq = x.kirimMiqdor - x.chiqimMiqdor;
    if (qoldiq <= 0 || !x.kirimMiqdor) return sum;
    return sum + qoldiq * (x.kirimBaza / x.kirimMiqdor);
  }, 0);
}

// Ombor sahifasi uch kichik bo'limga (tab) bo'lingan: "Ombor kirimi" (xarid
// qilingan xomashyo jurnali), "Ombor chiqimi" (sarflangan/sotilgan
// xomashyo-mahsulot jurnali) va "Ombor qoldig'i" (joriy zaxira). OMBOR_TAB
// hozir qaysi tab ochiqligini eslab qoladi, realtime qayta chizishda ham
// saqlanadi (rerenderCurrentPage -> PAGES.ombor.render -> renderOmbor).
let OMBOR_TAB = "kirim";

function omborTabBarHtml() {
  const tabs = [
    { key: "kirim", label: "Ombor kirimi" },
    { key: "chiqim", label: "Ombor chiqimi" },
    { key: "qoldiq", label: "Ombor qoldig'i" }
  ];
  return `
    <div class="page-actions section" style="margin-bottom:6px;">
      ${tabs.map((t) => `<button class="btn ${OMBOR_TAB === t.key ? "btn-primary" : ""}" data-ombor-tab="${t.key}">${t.label}</button>`).join("")}
    </div>
  `;
}

function bindOmborTabBar(main) {
  main.querySelectorAll("[data-ombor-tab]").forEach((b) => b.addEventListener("click", () => {
    OMBOR_TAB = b.dataset.omborTab;
    renderOmbor();
  }));
}

function renderOmbor() {
  if (OMBOR_TAB === "chiqim") return renderOmborChiqim();
  if (OMBOR_TAB === "qoldiq") return renderOmborQoldiq();
  return renderOmborKirim();
}

function renderOmborKirim() {
  const kirimAll = omborKirimRows();
  const filtered = getFilteredRows(kirimAll);
  const rows = filtered.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");

  const totalBaza = sumRows(filtered, "yetkazibBerishNarxi");
  const totalQQS = sumRows(filtered, "qqsSumma");
  const totalJami = sumRows(filtered, "yetkazibBerishNarxiQQSBilan");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ombor</h1>
        <p class="page-desc">Faktura kirim fayllaridan import qilingan mahsulotlar ro'yxati (kirim jurnali) — har bir qator bitta mahsulot yetkazib berilishini bildiradi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnFindReplace">Izlash va almashtirish</button>
        <button class="btn" id="btnImport">Excel'dan import</button>
        <button class="btn" id="btnUnifyNomi">Nomlarni birlashtirish</button>
        <button class="btn" id="btnQaytaIshlashKirim">🔄 Qayta ishlash</button>
        <button class="btn btn-primary" id="btnAddRow">+ Qo'lda qo'shish</button>
      </div>
    </div>

    ${omborTabBarHtml()}

    <div class="grid grid-3 section">
      <div class="card stat-card"><div class="stat-label">Yetkazib berish narxi (QQSsiz)</div><div class="stat-value" id="statBaza">${fmtSum(totalBaza)}</div></div>
      <div class="card stat-card"><div class="stat-label">QQS summasi</div><div class="stat-value" id="statQQS">${fmtSum(totalQQS)}</div></div>
      <div class="card stat-card"><div class="stat-label">Yetkazib berish narxi (QQS bilan)</div><div class="stat-value" id="statJami">${fmtSum(totalJami)}</div></div>
    </div>

    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: mahsulot nomi, hujjat raqami...">
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sana</th>
            <th>Hujjat №</th>
            <th>Maxsulot nomi</th>
            <th>O'lchov birligi</th>
            <th class="num">Miqdori</th>
            <th class="num">Narxi</th>
            <th class="num">Yetkazib berish narxi</th>
            <th class="num">QQS summasi</th>
            <th class="num">Yetkazib berish narxi (QQS bilan)</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="omborBody"></tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-package"/></svg><div class="t">Ombor bo'sh</div><div class="d">"Excel'dan import" tugmasi orqali didox.uz "faktura kirim" eksport faylini yuklang yoki qo'lda qo'shing.</div></div>` : ""}
  `;

  bindOmborTabBar(main);
  document.getElementById("btnAddRow").addEventListener("click", () => addOmborRow());
  document.getElementById("btnImport").addEventListener("click", () => openOmborImportModal());
  document.getElementById("btnUnifyNomi").addEventListener("click", () => openOmborMergeNomiModal("kirim"));
  document.getElementById("btnQaytaIshlashKirim").addEventListener("click", () => openOmborQaytaIshlashModal());
  document.getElementById("btnFindReplace").addEventListener("click", () => openFindReplaceModal({
    rows: omborKirimRows(), storeType: "ombor",
    fields: [{ key: "hujjatRaqami", label: "Hujjat №" }, { key: "nomi", label: "Nomi" }],
    onDone: renderOmbor
  }));
  document.getElementById("searchBox").addEventListener("input", (e) => filterOmborRows(e.target.value));

  bindOmborRowEvents();
  renderRowsChunked(document.getElementById("omborBody"), rows, (r) => omborRowHtml(r), {
    onDone: () => filterOmborRows(document.getElementById("searchBox").value)
  });
}

function omborChiqimRowHtml(r) {
  const icId = (r.hujjatRaqami || "").startsWith("IC-") ? r.hujjatRaqami.slice(3) : "";
  const qiDoc = (r.hujjatRaqami || "").startsWith("QI-") ? r.hujjatRaqami : "";
  return `
    <tr data-id="${r.id}">
      <td class="mono">${escapeHtml(r.sana || "—")}</td>
      <td>${escapeHtml(r.hujjatRaqami || "")}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(r.nomi || "")}">${escapeHtml(r.nomi || "")}</td>
      <td>${escapeHtml(r.birlik || "")}</td>
      <td class="num">${fmt(r.miqdor, 3)}</td>
      <td class="num">${fmt(r.narx, 2)}</td>
      <td class="num">${fmtSum(r.yetkazibBerishNarxi)}</td>
      <td class="num">${fmtSum(r.qqsSumma)}</td>
      <td class="num" style="font-weight:700">${fmtSum(r.yetkazibBerishNarxiQQSBilan)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(r.kontragentNomi || "")}">${escapeHtml(r.kontragentNomi || "")}</td>
      <td class="row-actions">
        ${qiDoc ? `<button class="icon-btn" data-print-qi="${escapeHtml(qiDoc)}" title="Qayta ishlash dalolatnomasi"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg></button>` : ""}
        <button class="icon-btn" data-del-chiqim="${r.id}" data-ic="${icId}" data-qi="${escapeHtml(qiDoc)}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function renderOmborChiqim() {
  const chiqimRows = STORE.ombor.filter((r) => r.turi === "chiqim");
  const filtered = getFilteredRows(chiqimRows);
  const rows = filtered.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ombor</h1>
        <p class="page-desc">Ombordan chiqarilgan (sarflangan yoki sotilgan) xomashyo va mahsulotlar tarixi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnFindReplaceChiqim">Izlash va almashtirish</button>
        <button class="btn" id="btnImportChiqim">Excel'dan import</button>
        <button class="btn" id="btnUnifyNomiChiqim">Nomlarni birlashtirish</button>
        <button class="btn" id="btnQaytaIshlashChiqim">🔄 Qayta ishlash</button>
        <button class="btn btn-primary" id="btnAddChiqim">+ Chiqim qo'shish</button>
      </div>
    </div>

    ${omborTabBarHtml()}

    <div class="toolbar">
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sana</th><th>Hujjat №</th><th>Nomi</th><th>O'lchov birligi</th>
            <th class="num">Miqdor</th><th class="num">Narxi</th>
            <th class="num">Yetkazib berish narxi</th><th class="num">QQS summasi</th>
            <th class="num">Yetkazib berish narxi (QQS bilan)</th>
            <th>Manba / izoh</th><th></th>
          </tr>
        </thead>
        <tbody id="omborChiqimBody">${rows.length ? rows.map(omborChiqimRowHtml).join("") : ""}</tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-package"/></svg><div class="t">Chiqim yo'q</div><div class="d">"+ Chiqim qo'shish" tugmasi yoki "Excel'dan import" orqali xomashyo yoki mahsulot chiqimini qayd eting.</div></div>` : ""}
  `;

  bindOmborTabBar(main);
  document.getElementById("btnAddChiqim").addEventListener("click", () => openOmborChiqimModal());
  document.getElementById("btnImportChiqim").addEventListener("click", () => openOmborChiqimImportModal());
  document.getElementById("btnUnifyNomiChiqim").addEventListener("click", () => openOmborMergeNomiModal("chiqim"));
  document.getElementById("btnQaytaIshlashChiqim").addEventListener("click", () => openOmborQaytaIshlashModal());
  document.getElementById("btnFindReplaceChiqim").addEventListener("click", () => openFindReplaceModal({
    rows: chiqimRows, storeType: "ombor",
    fields: [{ key: "nomi", label: "Nomi" }, { key: "kontragentNomi", label: "Manba / izoh" }],
    onDone: renderOmbor
  }));
  const body = document.getElementById("omborChiqimBody");
  if (body) body.addEventListener("click", (e) => {
    const printQi = e.target.closest("[data-print-qi]");
    if (printQi) {
      printQaytaIshlashDalolatnomaByDoc(printQi.dataset.printQi);
      return;
    }
    const delBtn = e.target.closest("[data-del-chiqim]");
    if (!delBtn) return;
    const delId = delBtn.dataset.delChiqim;
    if (!delId) return;
    const icId = delBtn.dataset.ic;
    const qiDoc = delBtn.dataset.qi;
    if (icId) deleteIshlabChiqarishEntry(icId);
    else if (qiDoc) deleteQaytaIshlashEntry(qiDoc);
    else deleteOmborChiqimRow(delId);
  });
}

async function deleteOmborChiqimRow(id) {
  const ok = await deleteRowSafe("ombor", "ombor", id, renderOmborChiqim);
  if (ok) toast("O'chirildi, ombor qoldig'i yangilandi");
}

function renderOmborQoldiq() {
  const main = document.getElementById("main");
  const fifo = fifoUsulActive();
  // Qoldiq qiymati nomi bo'yicha hisoblanadi (FIFO/o'rtacha ikkalasi ham nomi
  // bo'yicha ishlaydi). Bir nomning turli "birlik" yozuvlari bo'lsa — qiymat
  // faqat birinchi qatorga biriktiriladi, jami esa alohida to'g'ri hisoblanadi.
  const seenNomi = new Set();
  const qoldiq = omborQoldiqList().map((q) => {
    let qiymat = 0;
    if (!seenNomi.has(q.nomi)) {
      seenNomi.add(q.nomi);
      qiymat = fifo ? fifoLedger(q.nomi).qiymatAsOf(null) : (q.qoldiq > 0 ? q.qoldiq * avgOmborNarx(q.nomi) : 0);
    }
    return Object.assign(q, { qiymat });
  });
  const negativlar = qoldiq.filter((q) => q.qoldiq < 0);
  const jamiQiymat = omborQoldiqQiymatiAsOf(null);
  const kirimYoqNeg = negativlar.filter((q) => q.kirim <= 1e-9);
  const nomiMosEmasNeg = negativlar.filter((q) => q.kirim > 1e-9);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ombor</h1>
        <p class="page-desc">Har bir xomashyo/mahsulot bo'yicha joriy zaxira — jami kirim va sarflangan (chiqim) miqdor asosida, barcha davr uchun.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btnQaytaIshlashQoldiq">🔄 Qayta ishlash</button>
        <button class="btn" id="btnPrintOmborQoldiq">PDF (chop etish)</button>
        <button class="btn" id="btnExportOmborQoldiq">Excel'ga eksport</button>
      </div>
    </div>

    ${omborTabBarHtml()}

    ${negativlar.length ? `<div class="note" style="border-color:var(--danger);color:var(--danger);margin-bottom:14px;">
      Diqqat: ${negativlar.length} ta pozitsiyada qoldiq manfiy — chiqim kirimdan ko'p.
      ${kirimYoqNeg.length ? `<div style="margin-top:4px;"><b>Kirim faktura kiritilmagan (${kirimYoqNeg.length}):</b> ${kirimYoqNeg.slice(0, 5).map((q) => escapeHtml(q.nomi)).join(", ")}${kirimYoqNeg.length > 5 ? "…" : ""}</div>` : ""}
      ${nomiMosEmasNeg.length ? `<div style="margin-top:4px;"><b>Kirim bor, lekin kam / nomi mos emas (${nomiMosEmasNeg.length}):</b> ${nomiMosEmasNeg.slice(0, 5).map((q) => escapeHtml(q.nomi)).join(", ")}${nomiMosEmasNeg.length > 5 ? "…" : ""} — "Nomlarni birlashtirish" tugmasi bilan tekshiring.</div>` : ""}
    </div>` : ""}

    <div class="grid grid-3 section">
      <div class="card stat-card"><div class="stat-label">Pozitsiyalar</div><div class="stat-value">${qoldiq.length}</div></div>
      <div class="card stat-card"><div class="stat-label">Manfiy qoldiq</div><div class="stat-value ${negativlar.length ? "neg" : ""}">${negativlar.length}</div></div>
      <div class="card stat-card"><div class="stat-label">Jami qoldiq qiymati (${fifo ? "FIFO" : "o'rtacha"})</div><div class="stat-value">${fmtSum(jamiQiymat)}</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Maxsulot nomi</th><th>O'lchov birligi</th><th class="num">Kirim (jami)</th><th class="num">Sarflandi (chiqim)</th><th class="num">Qoldiq</th><th class="num">Qoldiq qiymati (so'm)</th><th style="width:110px;text-align:center;">Amal</th></tr>
        </thead>
        <tbody>
          ${qoldiq.length ? qoldiq.map((q) => `
            <tr>
              <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(q.nomi)}">${escapeHtml(q.nomi)}</td>
              <td>${escapeHtml(q.birlik || "")}</td>
              <td class="num">${fmt(q.kirim, 3)}</td>
              <td class="num">${fmt(q.chiqim, 3)}</td>
              <td class="num" style="font-weight:700;${q.qoldiq < 0 ? "color:var(--danger,#e5484d)" : ""}">${fmt(q.qoldiq, 3)}</td>
              <td class="num">${fmtSum(q.qiymat)}</td>
              <td style="text-align:center;">
                ${q.qoldiq > 0 ? `<button class="btn btn-sm" data-qi-nomi="${escapeHtml(q.nomi)}" title="Ushbu mahsulotni qayta ishlash" style="padding:2px 8px;font-size:11.5px;white-space:nowrap;">🔄 Qayta ishlash</button>` : `<span class="faint">—</span>`}
              </td>
            </tr>
          `).join("") : `<tr><td colspan="7" class="faint" style="text-align:center;padding:16px;">Hozircha ma'lumot yo'q</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  bindOmborTabBar(main);
  document.getElementById("btnQaytaIshlashQoldiq").addEventListener("click", () => openOmborQaytaIshlashModal());
  main.querySelectorAll("[data-qi-nomi]").forEach((b) => b.addEventListener("click", () => openOmborQaytaIshlashModal(b.dataset.qiNomi)));
  document.getElementById("btnExportOmborQoldiq").addEventListener("click", () => exportOmborQoldiqXlsx(qoldiq));
  document.getElementById("btnPrintOmborQoldiq").addEventListener("click", () => printOmborQoldiqPdf(qoldiq));
}

function exportOmborQoldiqXlsx(qoldiq) {
  const s = STORE.settings;
  const aoa = [
    [s.companyName],
    [`INN: ${s.inn}   Sana: ${todayISO()}`],
    ["Ombor qoldig'i"],
    [],
    ["Maxsulot nomi", "O'lchov birligi", "Kirim (jami)", "Sarflandi (chiqim)", "Qoldiq", "Qoldiq qiymati (so'm)"]
  ];
  qoldiq.forEach((q) => aoa.push([q.nomi, q.birlik || "", q.kirim, q.chiqim, q.qoldiq, Math.round(toNum(q.qiymat))]));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ombor qoldig'i");
  XLSX.writeFile(wb, `FORGET_ombor_qoldiq_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function printOmborQoldiqPdf(qoldiq) {
  const s = STORE.settings;
  const jamiQiymat = qoldiq.reduce((sum, q) => sum + toNum(q.qiymat), 0);
  const bodyRows = qoldiq.map((q) => `
    <tr>
      <td>${escapeHtml(q.nomi)}</td>
      <td>${escapeHtml(q.birlik || "")}</td>
      <td class="num">${fmt(q.kirim, 3)}</td>
      <td class="num">${fmt(q.chiqim, 3)}</td>
      <td class="num"><b>${fmt(q.qoldiq, 3)}</b></td>
      <td class="num">${fmt(q.qiymat)}</td>
    </tr>
  `).join("");

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Ombor qoldig'i</title>
      <style>
        body{font-family:Arial, "Segoe UI", sans-serif; padding:28px; color:#1c2530;}
        h1{font-size:18px; margin:0 0 4px;}
        .sub{font-size:12px; color:#5b6b7b; margin:0 0 4px;}
        .period{font-size:12px; color:#5b6b7b; margin:0 0 18px;}
        table{width:100%; border-collapse:collapse; font-size:11.5px;}
        th, td{border:1px solid #ccd3da; padding:6px 8px; text-align:left;}
        th{background:#eceff2;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(s.companyName)}</h1>
      <div class="sub">INN: ${escapeHtml(s.inn)}</div>
      <div class="period">Ombor qoldig'i &middot; Sana: ${escapeHtml(todayISO())}</div>
      <table>
        <thead>
          <tr><th>Maxsulot nomi</th><th>O'lchov birligi</th><th class="num">Kirim (jami)</th><th class="num">Sarflandi (chiqim)</th><th class="num">Qoldiq</th><th class="num">Qoldiq qiymati (so'm)</th></tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot><tr><th colspan="5" style="text-align:right;">Jami qoldiq qiymati:</th><th class="num">${fmt(jamiQiymat)}</th></tr></tfoot>
      </table>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

function omborRowHtml(r) {
  const qiDoc = (r.hujjatRaqami || "").startsWith("QI-") ? r.hujjatRaqami : "";
  return `
    <tr data-id="${r.id}">
      <td><input type="date" class="cell-input" data-f="sana" value="${escapeHtml(r.sana || "")}"></td>
      <td><input class="cell-input" data-f="hujjatRaqami" value="${escapeHtml(r.hujjatRaqami || "")}" style="min-width:90px"></td>
      <td><input class="cell-input" data-f="nomi" value="${escapeHtml(r.nomi || "")}" title="${escapeHtml(r.nomi || "")}" style="min-width:160px;max-width:240px;overflow:hidden;text-overflow:ellipsis;"></td>
      <td><input class="cell-input" data-f="birlik" value="${escapeHtml(r.birlik || "")}" style="width:80px"></td>
      <td class="num"><input class="cell-input num" data-f="miqdor" value="${fmt(r.miqdor, 3)}" style="width:80px"></td>
      <td class="num"><input class="cell-input num" data-f="narx" value="${fmt(r.narx, 2)}"></td>
      <td class="num"><input class="cell-input num" data-f="yetkazibBerishNarxi" value="${fmt(r.yetkazibBerishNarxi)}"></td>
      <td class="num"><input class="cell-input num" data-f="qqsSumma" value="${fmt(r.qqsSumma)}"></td>
      <td class="num jami-cell" style="font-weight:700">${fmtSum(r.yetkazibBerishNarxiQQSBilan)}</td>
      <td class="row-actions">
        ${qiDoc ? `<button class="icon-btn" data-print-qi="${escapeHtml(qiDoc)}" title="Qayta ishlash dalolatnomasi"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg></button>` : ""}
        <button class="icon-btn" data-del="${r.id}" data-qi="${escapeHtml(qiDoc)}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function refreshOmborSummary() {
  const filtered = getFilteredRows(omborKirimRows());
  const totalBaza = sumRows(filtered, "yetkazibBerishNarxi");
  const totalQQS = sumRows(filtered, "qqsSumma");
  const totalJami = sumRows(filtered, "yetkazibBerishNarxiQQSBilan");
  const elBaza = document.getElementById("statBaza");
  const elQQS = document.getElementById("statQQS");
  const elJami = document.getElementById("statJami");
  if (elBaza) elBaza.textContent = fmtSum(totalBaza);
  if (elQQS) elQQS.textContent = fmtSum(totalQQS);
  if (elJami) elJami.textContent = fmtSum(totalJami);
}

function bindOmborRowEvents() {
  const body = document.getElementById("omborBody");
  if (!body) return;
  body.addEventListener("change", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;
    const row = STORE.ombor.find((r) => r.id === id);
    if (!row) return;
    const field = e.target.dataset.f;
    if (!field) return;
    if (["miqdor", "narx", "yetkazibBerishNarxi", "qqsSumma"].includes(field)) {
      row[field] = toNum(e.target.value);
      row.yetkazibBerishNarxiQQSBilan = row.yetkazibBerishNarxi + row.qqsSumma;
      pushFieldsUpdate("ombor", id, { [field]: row[field], yetkazibBerishNarxiQQSBilan: row.yetkazibBerishNarxiQQSBilan });
      const jamiCell = tr.querySelector(".jami-cell");
      if (jamiCell) jamiCell.textContent = fmtSum(row.yetkazibBerishNarxiQQSBilan);
      refreshOmborSummary();
    } else {
      row[field] = e.target.value;
      pushFieldsUpdate("ombor", id, { [field]: row[field] });
    }
  });
  body.addEventListener("click", (e) => {
    const printQi = e.target.closest("[data-print-qi]");
    if (printQi) {
      printQaytaIshlashDalolatnomaByDoc(printQi.dataset.printQi);
      return;
    }
    const delBtn = e.target.closest("[data-del]");
    if (!delBtn) return;
    const delId = delBtn.dataset.del;
    const qiDoc = delBtn.dataset.qi;
    if (qiDoc) {
      deleteQaytaIshlashEntry(qiDoc);
    } else if (delId) {
      deleteRowSafe("ombor", "ombor", delId, renderOmbor);
    }
  });
}

function filterOmborRows(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll("#omborBody tr").forEach((tr) => {
    const inputValues = Array.from(tr.querySelectorAll("input")).map((i) => i.value).join(" ");
    const text = (tr.textContent + " " + inputValues).toLowerCase();
    tr.style.display = !q || text.includes(q) ? "" : "none";
  });
}

async function addOmborRow() {
  const newRow = {
    sana: todayISO(), hujjatRaqami: "", kontragentInn: "", kontragentNomi: "",
    nomi: "", birlik: "", miqdor: 0, narx: 0, yetkazibBerishNarxi: 0, qqsSumma: 0, yetkazibBerishNarxiQQSBilan: 0, turi: "kirim"
  };
  const { data, error } = await sbClient.from("ombor").insert(toDbRow(OMBOR_DB_MAP, newRow)).select().single();
  if (error) { reportError(error, "Qo'shishda xatolik"); return; }
  const row = fromDbRow(OMBOR_DB_MAP, data);
  if (!STORE.ombor.some((r) => r.id === row.id)) STORE.ombor.push(row);
  updateNavBadges();
  renderOmbor();
  toast("Yangi qator qo'shildi");
}

function openOmborImportModal() {
  openModal(`
    <h3>Ombor — Excel'dan import</h3>
    <p class="modal-sub">Odatda bu alohida qadam shart emas — "Faktura kirim" sahifasidagi import shu faylni avtomatik o'qib, mahsulot qatorlarini bu yerga ham qo'shadi. Bu import faqat eski (kirim_id'siz) fayllarni orqaga qaytib qo'lda yuklash yoki "Faktura kirim" sahifasi orqali import qilinmagan faylni to'g'ridan-to'g'ri shu yerga qo'shish uchun qoldirilgan. didox.uz eksport qilgan "faktura kirim" .xlsx faylini yuklang (masalan: "kirim.xlsx"). Har bir hujjatdagi har bir mahsulot alohida qator sifatida qo'shiladi, takroriy qatorlar o'tkazib yuboriladi.</p>
    <div class="dropzone" id="dz">Faylni shu yerga tashlang yoki bosing<br><span class="faint">.xlsx / .xls</span></div>
    <input type="file" id="impFile" accept=".xlsx,.xls" style="display:none">
    <div class="modal-actions"><button class="btn" id="mCancel">Yopish</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const dz = document.getElementById("dz");
  const inp = document.getElementById("impFile");
  dz.addEventListener("click", () => inp.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    if (e.dataTransfer.files[0]) handleOmborImport(e.dataTransfer.files[0]);
  });
  inp.addEventListener("change", (e) => {
    if (e.target.files[0]) handleOmborImport(e.target.files[0]);
  });
}

// Didox.uz "faktura kirim" faylida bitta hujjat bir yoki bir nechta qator
// egallashi mumkin: agar hujjatda bitta mahsulot bo'lsa, mahsulot ma'lumoti
// sarlavha qatorining o'zida keladi; bir nechta mahsulot bo'lsa, sarlavha
// qatorida hujjat JAMI summasi, har bir mahsulot esa keyingi (hujjat
// ma'lumotlarisiz) qatorlarda alohida-alohida keladi. Shu sabab "hujjat
// konteksti" (sana/raqam/yetkazib beruvchi) oxirgi ko'rilgan sarlavha
// qatoridan olib, joriy qatordagi mahsulot nomi bo'lgan har bir qatordan
// bitta ombor yozuvi hosil qilamiz.
function parseOmborLineItems(rows, col) {
  let ctx = { sana: "", hujjatRaqami: "", status: "Подписан", kontragentInn: "", kontragentNomi: "" };
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[col.id]) {
      ctx = {
        sana: normalizeDate(row[col.sana]),
        hujjatRaqami: String(row[col.hujjat] || "").trim(),
        status: String(row[col.status] || "Подписан").trim(),
        kontragentInn: String(row[col.sellerInn] || "").trim(),
        kontragentNomi: String(row[col.sellerNomi] || "").trim()
      };
    }
    const nomi = String(row[col.nomi] || "").trim();
    if (!nomi || !isValidStatus(ctx.status)) continue;

    const yetkazibBerishNarxi = toNum(row[col.base]);
    const qqsSumma = toNum(row[col.qqsSumma]);
    const yetkazibBerishNarxiQQSBilan = toNum(row[col.jami]) || (yetkazibBerishNarxi + qqsSumma);

    items.push({
      sana: ctx.sana, hujjatRaqami: ctx.hujjatRaqami,
      kontragentInn: ctx.kontragentInn, kontragentNomi: ctx.kontragentNomi,
      nomi, birlik: String(row[col.birlik] || "").trim(),
      miqdor: toNum(row[col.miqdor]), narx: toNum(row[col.narx]),
      yetkazibBerishNarxi, qqsSumma, yetkazibBerishNarxiQQSBilan
    });
  }
  return items;
}

// parseOmborLineItems bilan bir xil naqsh, lekin chiqim (sotuv) fakturasi
// uchun — kontragent kontekstisiz, faqat "chiqim_tafsil" jadvaliga kerakli
// maydonlar (nomi/miqdor/narx/summa) va hujjat konteksti (sana/raqam/status).
// Bunda mahsulot nomi CANONICALIZE qilinmaydi (bu xomashyo emas, tayyor
// mahsulot nomi — Mahsulotlar bo'limidagi nomi bilan ANIQ solishtiriladi).
function parseChiqimLineItems(rows, col) {
  let ctx = { sana: "", hujjatRaqami: "", status: "Подписан" };
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[col.id]) {
      ctx = {
        sana: normalizeDate(row[col.sana]),
        hujjatRaqami: String(row[col.hujjat] || "").trim(),
        status: String(row[col.status] || "Подписан").trim()
      };
    }
    const nomi = String(row[col.nomi] || "").trim();
    const miqdor = toNum(row[col.miqdor]);
    if (!nomi || miqdor <= 0 || !isValidStatus(ctx.status)) continue;

    items.push({
      sana: ctx.sana, hujjatRaqami: ctx.hujjatRaqami,
      nomi, birlik: String(row[col.birlik] || "").trim(),
      miqdor, narx: toNum(row[col.narx]), summa: toNum(row[col.base])
    });
  }
  return items;
}

async function handleOmborImport(file) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) { toast("Fayl bo'sh", "err"); return; }

    const col = detectInvoiceColumns(rows[0]);
    if (col.id === -1 || col.hujjat === -1 || col.nomi === -1) {
      toast("Fayl tuzilishi tanilmadi — ustunlar mos kelmayapti", "err");
      return;
    }

    const items = parseOmborLineItems(rows, col);
    const candidates = [];
    let skipped = 0;
    for (const it of items) {
      const dupExists = STORE.ombor.some((r) => r.hujjatRaqami === it.hujjatRaqami && r.sana === it.sana && r.nomi === it.nomi && Math.abs(r.miqdor - it.miqdor) < 0.001);
      if (dupExists) { skipped++; continue; }
      // Agar shu hujjat "Faktura kirim" bo'limida allaqachon mavjud bo'lsa
      // (masalan avval faqat hujjat sarlavhasi import qilingan bo'lsa),
      // mahsulot qatorini o'sha kirim yozuviga bog'laymiz — qarang: kirimId,
      // openKirimDetailModal.
      const kirimRow = STORE.kirim.find((r) => r.hujjatRaqami === it.hujjatRaqami && r.sana === it.sana);
      candidates.push(Object.assign({}, it, { kirimId: kirimRow ? kirimRow.id : null }));
    }

    if (candidates.length) {
      const faylRow = await registerFaylUpload("ombor", file);
      if (faylRow) candidates.forEach((c) => { c.faylId = faylRow.id; });
    }

    let added = 0;
    if (candidates.length) {
      let data;
      try {
        try {
          data = await insertRowsChunked("ombor", candidates.map((r) => toDbRow(OMBOR_DB_MAP, r)));
        } catch (error) {
          if (isMissingColumnError(error) && extractMissingColumnName(error) === "kirim_id") {
            data = await insertRowsChunked("ombor", candidates.map((r) => {
              const dbRow = toDbRow(OMBOR_DB_MAP, r);
              delete dbRow.kirim_id;
              return dbRow;
            }));
          } else {
            throw error;
          }
        }
      } catch (error) { reportError(error, "Bazaga yozishda xatolik"); return; }
      data.forEach((row) => STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, row)));
      added = data.length;
    }

    updateNavBadges();
    closeModal();
    renderOmbor();
    toast(`Import: ${added} ta mahsulot qo'shildi, ${skipped} ta takror o'tkazib yuborildi`);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

// Ombordagi (kirim + chiqim) barcha mavjud mahsulot nomlarini ro'yxat qilib
// ko'rsatadi, foydalanuvchi ulardan bir nechtasini belgilab yangi bitta nom
// yozadi — "Birlashtirish" bosilganda belgilangan nomdagi barcha yozuvlarning
// "nomi" maydoni shu yangi nomga o'zgaradi (miqdorlar/qatorlar alohida qoladi,
// faqat nom bir xillashtiriladi).
// "turi" — "kirim" yoki "chiqim": faqat shu turdagi ombor qatorlari hisobga
// olinadi, shunda "Ombor kirimi"da qilingan birlashtirish faqat kirim
// qatorlariga, "Ombor chiqimi"da qilingani esa faqat chiqim qatorlariga
// tegishli bo'ladi (ikkisi bir-biriga aralashmaydi).
function omborRowsByTuri(turi) {
  return STORE.ombor.filter((r) => (turi === "chiqim" ? r.turi === "chiqim" : r.turi !== "chiqim"));
}

function omborUniqueNomiList(turi) {
  const map = new Map();
  omborRowsByTuri(turi).forEach((r) => {
    if (!r.nomi) return;
    map.set(r.nomi, (map.get(r.nomi) || 0) + 1);
  });
  return [...map.entries()]
    .map(([nomi, count]) => ({ nomi, count }))
    .sort((a, b) => a.nomi.localeCompare(b.nomi, "ru"));
}

function openOmborMergeNomiModal(turi) {
  const list = omborUniqueNomiList(turi);
  if (list.length < 2) { toast("Birlashtirish uchun ombordagi nomlar yetarli emas"); return; }
  openModal(`
    <h3>Nomlarni birlashtirish</h3>
    <p class="modal-sub">${turi === "chiqim" ? "Ombor chiqimi" : "Ombor kirimi"} ro'yxatidagi nomlardan birlashtiriladiganlarini belgilang, so'ng yangi nomni yozing — belgilangan nomdagi barcha yozuvlar shu yangi nomga o'tkaziladi:</p>
    <div class="merge-nomi-list">
      ${list.map((x) => `
        <label class="merge-nomi-item">
          <input type="checkbox" class="mMergeChk" value="${escapeHtml(x.nomi)}">
          <span class="merge-nomi-name">${escapeHtml(x.nomi)}</span>
          <span class="faint">${x.count} ta</span>
        </label>
      `).join("")}
    </div>
    <div class="field"><label>Yangi nom</label><input id="mMergeNewNomi" placeholder="Birlashtirilgan nom"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mConfirm">Birlashtirish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mConfirm").addEventListener("click", () => {
    const selected = [...document.querySelectorAll(".mMergeChk:checked")].map((c) => c.value);
    const newNomi = document.getElementById("mMergeNewNomi").value.trim();
    if (selected.length < 2) { toast("Birlashtirish uchun kamida 2 ta nom belgilang", "err"); return; }
    if (!newNomi) { toast("Yangi nomni kiriting", "err"); return; }
    const targets = omborRowsByTuri(turi).filter((r) => selected.includes(r.nomi));
    targets.forEach((r) => {
      r.nomi = newNomi;
      pushFieldsUpdate("ombor", r.id, { nomi: r.nomi });
    });
    closeModal();
    renderOmbor();
    toast(`${targets.length} ta yozuv "${newNomi}" nomiga birlashtirildi`);
  });
}

/* --------------------------------- Ishlab chiqarish --------------------------------- */
// Har bir mahsulot uchun "kalkulyatsiya" (tarkib) belgilanadi — 1 birlik
// tayyor mahsulot uchun qanday xomashyodan qancha miqdorda ketishi. Ishlab
// chiqarish/sotuv jurnaliga yozuv qo'shilganda shu kalkulyatsiya asosida
// tegishli xomashyo miqdori Ombordan avtomat ayiriladi (turi="chiqim" qatori
// sifatida) va mahsulotning taxminiy tannarxi hisoblanadi.

function mahsulotTannarx(m) {
  return (m.tarkib || []).reduce((sum, item) => sum + toNum(item.norma) * avgOmborNarx(item.nomi), 0);
}

function mahsulotCardHtml(m) {
  const tarkib = m.tarkib || [];
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(m.nomi || "(nomsiz)")} <span class="faint" style="font-weight:400;">/ ${escapeHtml(m.birlik || "")}</span></div>
      <div class="report-line"><span class="label">Tannarx (1 ${escapeHtml(m.birlik || "birlik")})</span><span class="code"></span><span class="val">${fmtSum(mahsulotTannarx(m))}</span></div>
      <div class="report-line"><span class="label">+ Foyda normasi</span><span class="code"></span><span class="val">${fmtSum(toNum(m.foydaNormasi))}</span></div>
      <div class="report-line"><span class="label">Tavsiya etilgan narx (QQSsiz)</span><span class="code"></span><span class="val">${fmtSum(mahsulotTannarx(m) + toNum(m.foydaNormasi))}</span></div>
      <div class="report-line"><span class="label">Standart sotuv narxi</span><span class="code"></span><span class="val">${toNum(m.standartNarxi) ? fmtSum(m.standartNarxi) : "—"}</span></div>
      <div class="note" style="margin-top:10px;">
        ${tarkib.length ? tarkib.map((t) => `<div>${escapeHtml(t.nomi)} — ${fmt(t.norma, 3)} ${escapeHtml(t.birlik || "")}</div>`).join("") : `<span class="faint">Tarkib kiritilmagan</span>`}
      </div>
      <div class="page-actions" style="margin-top:12px;">
        <button class="btn btn-sm" data-edit-m="${m.id}">Tahrirlash</button>
        <button class="btn btn-sm btn-danger" data-del-m="${m.id}">O'chirish</button>
      </div>
    </div>
  `;
}

function icRowHtml(r) {
  return `
    <tr data-id="${r.id}">
      <td class="mono">${escapeHtml(r.sana || "—")}</td>
      <td><b>${escapeHtml(r.mahsulotNomi || "—")}</b></td>
      <td class="num">${fmt(r.miqdor, 3)}</td>
      <td>${escapeHtml(r.birlik || "")}</td>
      <td class="num"><b>${fmtSum(r.tannarx)}</b></td>
      <td>${escapeHtml(getDisplayIzoh(r.izoh) || "—")}</td>
      <td class="row-actions">
        <button class="icon-btn" data-print-ic="${r.id}" title="Ishlab chiqarish dalolatnomasi (chop etish)"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg></button>
        <button class="icon-btn" data-print-kalk="${r.id}" title="1 birlik mahsulot tannarxi kalkulyatsiyasi (chop etish)"><svg class="ic" viewBox="0 0 24 24"><use href="#i-calc"/></svg></button>
        <button class="icon-btn" data-del-ic="${r.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function renderIshlabChiqarish() {
  const main = document.getElementById("main");
  const icRows = STORE.ishlabChiqarish.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const uncostedRows = STORE.chiqimTafsil.filter((t) => !t.mahsulotId).sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ishlab chiqarish</h1>
        <p class="page-desc">Mahsulot kalkulyatsiyasi — 1 birlik tayyor mahsulot uchun qanday xomashyo va qancha miqdorda ketishi. Har safar sotuv/ishlab chiqarish yozuvi qo'shilganda ombordagi tegishli xomashyo avtomat kamaytiriladi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportKg1" title="KG 1 (Polietilen trubalar PE 80 / PE 100) kalkulyatsiyasini yuklash"><svg class="ic" viewBox="0 0 24 24"><use href="#i-down"/></svg>KG 1 Kalkulyatsiyasini yuklash (353 ta)</button>
        <button class="btn btn-primary" id="btnAddMahsulot">+ Mahsulot va kalkulyatsiya</button>
      </div>
    </div>

    ${uncostedRows.length ? `
    <div class="section">
      <div class="page-header" style="margin-bottom:6px;">
        <h2 class="section-title" style="margin:0;color:var(--warn,#b8860b);"><svg class="ic" viewBox="0 0 24 24" style="width:17px;height:17px;vertical-align:-3px;margin-right:4px;"><use href="#i-warn"/></svg>Kalkulyatsiya qilinmagan sotuvlar (${uncostedRows.length})</h2>
        <div class="page-actions"><button class="btn btn-sm" id="btnRematchAll">Barchasini qayta moslashtirish</button></div>
      </div>
      <p class="page-desc">Chiqim fakturadan import qilingan bu mahsulotlar nomi yoki narxi bo'yicha hech qanday kalkulyatsiyaga mos kelmadi — ombordan hech narsa ayrilmagan. Mos mahsulot/kalkulyatsiya qo'shgach, "Yangilash" yoki "Barchasini qayta moslashtirish" tugmasini bosing.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Sana</th><th>Hujjat</th><th>Nomi (facturada)</th><th class="num">Miqdor</th><th class="num">Narx</th><th>Eng yaqin nomzod</th><th></th></tr></thead>
          <tbody id="uncostedBody">
            ${uncostedRows.map((t) => {
              const closest = findClosestMahsulotYokiXomashyo(t.nomi);
              const closestHtml = closest
                ? `${escapeHtml(closest.nomi)} <span class="faint">(${Math.round(closest.score * 100)}% · ${closest.kind === "mahsulot" ? "mahsulot" : "xomashyo"})</span>`
                : `<span class="faint">Hech narsa topilmadi — yangi mahsulot kerak</span>`;
              return `
              <tr data-id="${t.id}">
                <td class="mono">${escapeHtml(t.sana || "")}</td>
                <td>${escapeHtml(t.hujjatRaqami || "")}</td>
                <td>${escapeHtml(t.nomi || "")}</td>
                <td class="num">${fmt(t.miqdor, 3)} ${escapeHtml(t.birlik || "")}</td>
                <td class="num">${fmtSum(t.narx)}</td>
                <td>${closestHtml}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-rematch="${t.id}" title="Qayta moslashtirishga urinish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg></button>
                  <button class="icon-btn" data-open-kalk="${t.chiqimId}" title="Kalkulyatsiyaga o'tish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-calc"/></svg></button>
                </td>
              </tr>
            `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
    ` : ""}

    <div class="section">
      <h2 class="section-title">Mahsulotlar</h2>
      ${STORE.mahsulotlar.length ? `<div class="grid grid-3">${STORE.mahsulotlar.map((m) => mahsulotCardHtml(m)).join("")}</div>` : `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-factory"/></svg><div class="t">Mahsulot yo'q</div><div class="d">"+ Mahsulot va kalkulyatsiya" tugmasi orqali birinchi mahsulotingizni qo'shing.</div></div>`}
    </div>

    <div class="section">
      <div class="page-header" style="margin-bottom:12px;">
        <h2 class="section-title" style="margin:0;">Ishlab chiqarish / sotuv jurnali</h2>
        <div class="page-actions">
          <button class="btn" id="btnFindReplaceIC">Izlash va almashtirish</button>
          <button class="btn" id="btnExportIC">Excel'ga eksport</button>
          <button class="btn" id="btnIcQaytaIshlash">🔄 Mahsulotni qayta ishlash</button>
          <button class="btn btn-primary" id="btnAddIC">+ Yozuv qo'shish</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Sana</th><th>Mahsulot</th><th class="num">Miqdor</th><th>Birlik</th><th class="num">Tannarx</th><th>Izoh</th><th></th></tr></thead>
          <tbody id="icBody">${icRows.length ? icRows.map((r) => icRowHtml(r)).join("") : ""}</tbody>
        </table>
      </div>
      ${!icRows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-clipboard"/></svg><div class="t">Hozircha yozuv yo'q</div><div class="d">"+ Yozuv qo'shish" orqali sotilgan/ishlab chiqarilgan mahsulotni qayd eting.</div></div>` : ""}
    </div>
  `;

  document.getElementById("btnAddMahsulot").addEventListener("click", () => openMahsulotModal(null));
  const btnImportKg1 = document.getElementById("btnImportKg1");
  if (btnImportKg1) btnImportKg1.addEventListener("click", function() { importKg1Kalkulyatsiya(this); });
  document.getElementById("btnIcQaytaIshlash").addEventListener("click", () => openOmborQaytaIshlashModal());
  document.getElementById("btnAddIC").addEventListener("click", () => openIshlabChiqarishModal());
  document.getElementById("btnExportIC").addEventListener("click", () => exportIshlabChiqarishXlsx(icRows));
  document.getElementById("btnFindReplaceIC").addEventListener("click", () => openFindReplaceModal({
    rows: STORE.ishlabChiqarish, storeType: "ishlabChiqarish",
    fields: [{ key: "mahsulotNomi", label: "Mahsulot nomi" }, { key: "izoh", label: "Izoh" }],
    onDone: renderIshlabChiqarish
  }));
  const rematchAllBtn = document.getElementById("btnRematchAll");
  if (rematchAllBtn) rematchAllBtn.addEventListener("click", () => rematchAllChiqimTafsil(rematchAllBtn));
  main.querySelectorAll("[data-edit-m]").forEach((b) => b.addEventListener("click", () => openMahsulotModal(b.dataset.editM)));
  main.querySelectorAll("[data-del-m]").forEach((b) => b.addEventListener("click", () => deleteMahsulot(b.dataset.delM)));
  const icBody = document.getElementById("icBody");
  if (icBody) icBody.addEventListener("click", (e) => {
    const delId = e.target.dataset.delIc;
    if (delId) { deleteIshlabChiqarishEntry(delId); return; }
    const printId = e.target.dataset.printIc;
    if (printId) { printIshlabChiqarishDalolatnoma(printId); return; }
    const printKalkId = e.target.dataset.printKalk;
    if (printKalkId) { printIshlabChiqarishKalkulyatsiya(printKalkId); return; }
  });
  const uncostedBody = document.getElementById("uncostedBody");
  if (uncostedBody) uncostedBody.addEventListener("click", (e) => {
    const rematchId = e.target.dataset.rematch;
    if (rematchId) { rematchChiqimTafsil(rematchId).then(() => renderIshlabChiqarish()); return; }
    const kalkChiqimId = e.target.dataset.openKalk;
    if (kalkChiqimId) openChiqimKalkulyatsiyaModal(kalkChiqimId);
  });
}

function exportIshlabChiqarishXlsx(rows) {
  const s = STORE.settings;
  const aoa = [[s.companyName], [`Sana: ${todayISO()}`], ["Ishlab chiqarish / sotuv jurnali"], [],
    ["Sana", "Mahsulot", "Miqdor", "Birlik", "Tannarx", "Izoh"]];
  rows.forEach((r) => aoa.push([r.sana, r.mahsulotNomi, toNum(r.miqdor), r.birlik, toNum(r.tannarx), r.izoh]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ishlab chiqarish");
  XLSX.writeFile(wb, `FORGET_ishlab_chiqarish_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function omborNomiDatalistHtml() {
  const names = [...new Set(omborKirimRows().map((r) => r.nomi).filter(Boolean))].sort();
  return `<datalist id="omborNomiList">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>`;
}

// Kirim/Chiqim/Bank formalarida kontragent nomi kiritilayotganda Kontragentlar
// spravochnigidan taklif ko'rsatish uchun. Matn maydonlarining o'zi (kontragentNomi/
// kontragent) o'zgarmaydi — bu faqat brauzer darajasidagi taklif ro'yxati.
function kontragentlarDatalistHtml() {
  const names = [...new Set(STORE.kontragentlar.map((k) => k.nomi).filter(Boolean))].sort();
  return `<datalist id="kontragentlarList">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>`;
}

// Kiritilgan nomga aniq (katta-kichik harfga sezgir bo'lmagan) mos keladigan
// kontragent yozuvini topadi — topilsa, uning INN'i avtomat to'ldiriladi.
function resolveKontragentByNomi(nomi) {
  const q = String(nomi || "").trim().toLowerCase();
  if (!q) return null;
  return STORE.kontragentlar.find((k) => String(k.nomi || "").trim().toLowerCase() === q) || null;
}

// Bank ko'chirmasida ba'zi operatsiya turlari uchun kontragent INN'i
// "000000000" kabi PLACEHOLDER (haqiqiy emas) bo'lib keladi. Bunday INN'ni
// bo'sh bilan bir xil deb hisoblaymiz — "hammasi nol" yoki "bitta raqam
// takrorlangan" (masalan 111111111) qatorlari. Qarang: resolveRealInnByNomi.
function isPlaceholderInn(inn) {
  const s = String(inn || "").trim();
  if (!s) return true;
  return /^0+$/.test(s) || /^(\d)\1+$/.test(s);
}

function normalizeKontragentNomi(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Berilgan kontragent nomi uchun HAQIQIY (placeholder bo'lmagan) INN'ni
// quyidagi manbalardan, shu tartibda birinchi topilganini qaytaradi:
// 1) joriy import partiyasidagi boshqa qatorlar (masalan bitta faylda bir
//    xil kontragentning bir operatsiyasida INN bor, boshqasida yo'q);
// 2) bazadagi mavjud Bank yozuvlari; 3) Kontragentlar spravochnigi.
// Hech qayerda topilmasa null — soxta INN o'ylab topilmaydi, chaqiruvchi
// (handleBankImport) buni foydalanuvchidan so'raydi.
function resolveRealInnByNomi(nomi, batchCandidates) {
  const key = normalizeKontragentNomi(nomi);
  if (!key) return null;
  const inBatch = (batchCandidates || []).find((c) => normalizeKontragentNomi(c.kontragent) === key && !isPlaceholderInn(c.kontragentInn));
  if (inBatch) return String(inBatch.kontragentInn).trim();
  const inBank = STORE.bank.find((b) => normalizeKontragentNomi(b.kontragent) === key && !isPlaceholderInn(b.kontragentInn));
  if (inBank) return String(inBank.kontragentInn).trim();
  const kontragent = STORE.kontragentlar.find((k) => normalizeKontragentNomi(k.nomi) === key && !isPlaceholderInn(k.inn));
  if (kontragent) return String(kontragent.inn).trim();
  return null;
}

// Faktura kirim, Faktura chiqim va Bank harakati bo'limlarida kontragent nomi/INN
// kiritilganda (qo'lda yozilganda ham, fayldan import qilinganda ham) Kontragentlar
// spravochnigini avtomatik to'ldiradi: agar shu INN (yoki, INN bo'lmasa, shu nom)
// bilan yozuv hali yo'q bo'lsa — yangi kontragent qo'shiladi; mavjud bo'lsa, faqat
// undagi bo'sh INN maydoni to'ldiriladi (boshqa maydonlar qo'lda kiritilgan holda
// qoladi, ustidan yozilmaydi).
async function ensureKontragentAutoAdded(inn, nomi) {
  const innTrim = String(inn || "").trim();
  const nomiTrim = String(nomi || "").trim();
  if (!nomiTrim) return null;

  let existing = innTrim ? STORE.kontragentlar.find((k) => String(k.inn || "").trim() === innTrim) : null;
  if (!existing) existing = resolveKontragentByNomi(nomiTrim);
  if (existing) {
    if (innTrim && !String(existing.inn || "").trim()) {
      existing.inn = innTrim;
      pushFieldsUpdate("kontragentlar", existing.id, { inn: innTrim });
      if (CURRENT_PAGE === "kontragentlar") renderKontragentlar();
    }
    return existing;
  }

  const payload = { nomi: nomiTrim, inn: innTrim, manzil: "", telefon: "", bankHisob: "", bankMfo: "", bankNomi: "", turi: "", izoh: "" };
  const { data, error } = await sbClient.from("kontragentlar").insert(toDbRow(KONTRAGENT_DB_MAP, payload)).select().single();
  if (error) { console.error(error); return null; }
  const newK = fromDbRow(KONTRAGENT_DB_MAP, data);
  STORE.kontragentlar.push(newK);
  if (CURRENT_PAGE === "kontragentlar") renderKontragentlar();
  return newK;
}


function tarkibRowHtml(item) {
  item = item || {};
  return `
    <div class="tarkib-row-wrap" style="margin-bottom:8px;">
      <div class="tarkib-row" style="display:flex;gap:8px;align-items:center;">
        <input class="search-input tarkib-nomi" list="omborNomiList" placeholder="Xomashyo nomi (Ombordagi nomi bilan bir xil bo'lishi kerak)" value="${escapeHtml(item.nomi || "")}" style="flex:2">
        <input class="search-input tarkib-birlik" placeholder="Birlik" value="${escapeHtml(item.birlik || "")}" style="width:90px">
        <input class="search-input tarkib-norma" placeholder="Norma" value="${item.norma ? fmt(item.norma, 4) : ""}" style="width:110px">
        <button type="button" class="icon-btn tarkib-del" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </div>
      <div class="tarkib-hint faint" style="font-size:11.5px;margin-top:4px;"></div>
    </div>
  `;
}

// Tarkib qatoridagi xomashyo nomi/normasi asosida — Ombordagi joriy o'rtacha
// narxni (avgOmborNarx) va shu normaga ko'ra 1 birlik tayyor mahsulot uchun
// taxminiy tannarxni jonli ko'rsatadi (masalan "1 metr trubaga 8 kg" kabi
// normalar kiritilganda, ombordagi HAQIQIY narx bo'yicha bu qancha turishini
// darhol ko'rish uchun — noto'g'ri norma/narx kiritilganini shu yerdayoq
// sezish mumkin). Faqat ko'rsatadi, hisoblashga ta'sir qilmaydi — saqlashda
// baribir saveMahsulotFromModal xomashyo nomi/normasini o'qiydi.
function updateTarkibRowHint(rowWrapEl) {
  const nomi = rowWrapEl.querySelector(".tarkib-nomi").value.trim();
  const norma = toNum(rowWrapEl.querySelector(".tarkib-norma").value);
  const hintEl = rowWrapEl.querySelector(".tarkib-hint");
  if (!hintEl) return;
  if (!nomi || !norma) { hintEl.textContent = ""; return; }
  const narx = avgOmborNarx(nomi);
  if (!narx) { hintEl.textContent = `"${nomi}" uchun Ombor kirimida narx topilmadi.`; return; }
  hintEl.textContent = `Omborda 1 ${rowWrapEl.querySelector(".tarkib-birlik").value.trim() || "birlik"} narxi: ${fmtSum(narx)} · shu normaga (${fmt(norma, 4)}) ko'ra 1 mahsulot uchun taxminiy tannarx: ${fmtSum(norma * narx)}`;
}

function openMahsulotModal(existingId) {
  const existing = existingId ? STORE.mahsulotlar.find((m) => m.id === existingId) : null;
  const tarkib = existing ? (existing.tarkib || []).slice() : [];
  if (!tarkib.length) tarkib.push({});

  openModal(`
    <h3>${existing ? "Mahsulotni tahrirlash" : "Yangi mahsulot va kalkulyatsiya"}</h3>
    <div class="field"><label>Mahsulot nomi</label><input id="mNomi" value="${escapeHtml(existing ? existing.nomi : "")}" placeholder="masalan: Polietilen truba 100mm"></div>
    <div class="field"><label>O'lchov birligi</label><input id="mBirlik" value="${escapeHtml(existing ? existing.birlik : "")}" placeholder="masalan: metr, dona"></div>
    <div class="field"><label>Standart sotuv narxi (1 birlik uchun, ixtiyoriy)</label><input id="mStandartNarxi" value="${existing && toNum(existing.standartNarxi) ? fmt(existing.standartNarxi) : ""}" placeholder="Chiqim fakturada nomi mos kelmagan mahsulotni narxi bo'yicha topish uchun ishlatiladi"></div>
    <div class="card-title" style="margin-top:16px;">Tarkibi (1 birlik mahsulot uchun ketadigan xomashyo)</div>
    <div id="tarkibRows">${tarkib.map((t) => tarkibRowHtml(t)).join("")}</div>
    <button type="button" class="btn btn-sm" id="btnAddTarkibRow" style="margin-top:4px;">+ Xomashyo qo'shish</button>
    ${omborNomiDatalistHtml()}
    <div class="card-title" style="margin-top:16px;">Narx kalkulyatsiyasi (1 birlik uchun)</div>
    <div class="field"><label>Foyda normasi (1 birlik uchun, so'm)</label><input id="mFoydaNormasi" value="${fmt(existing && toNum(existing.foydaNormasi) ? existing.foydaNormasi : 100)}" placeholder="masalan: 100"></div>
    <div class="note" id="narxKalkulyatsiyasiPanel" style="margin-top:8px;"></div>
    <button type="button" class="btn btn-sm" id="btnQollashNarx" style="margin-top:8px;">Tavsiya etilgan narxni "Standart sotuv narxi"ga qo'yish</button>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("btnAddTarkibRow").addEventListener("click", () => {
    document.getElementById("tarkibRows").insertAdjacentHTML("beforeend", tarkibRowHtml({}));
    updateNarxKalkulyatsiyasiPanel();
  });
  const tarkibRowsEl = document.getElementById("tarkibRows");
  tarkibRowsEl.addEventListener("click", (e) => {
    if (e.target.classList.contains("tarkib-del")) {
      e.target.closest(".tarkib-row-wrap").remove();
      updateNarxKalkulyatsiyasiPanel();
    }
  });
  tarkibRowsEl.addEventListener("input", (e) => {
    const wrap = e.target.closest(".tarkib-row-wrap");
    if (wrap) updateTarkibRowHint(wrap);
    updateNarxKalkulyatsiyasiPanel();
  });
  tarkibRowsEl.querySelectorAll(".tarkib-row-wrap").forEach((wrap) => updateTarkibRowHint(wrap));
  document.getElementById("mFoydaNormasi").addEventListener("input", updateNarxKalkulyatsiyasiPanel);
  updateNarxKalkulyatsiyasiPanel();
  document.getElementById("btnQollashNarx").addEventListener("click", () => {
    const narxExVat = computeNarxKalkulyatsiyasi().narxQqssiz;
    document.getElementById("mStandartNarxi").value = fmt(narxExVat);
    toast("Qo'yildi — \"Saqlash\"ni bosishni unutmang");
  });
  document.getElementById("mSave").addEventListener("click", () => saveMahsulotFromModal(existingId));
}

// Joriy modal formadagi tarkib qatorlari (nomi/norma) va "Foyda normasi"
// maydoni asosida: xomashyo tannarxi (Ombordagi HAQIQIY o'rtacha narx bo'yicha,
// qarang avgOmborNarx) + foyda normasi = tavsiya etilgan sotish narxi (QQSsiz),
// so'ngra joriy QQS stavkasi (Sozlamalar) qo'shilib QQS bilan narx chiqadi.
// Bu — ishlab chiqarish/umumxo'jalik xarajatlarini emas, faqat XOMASHYO
// tannarxini hisobga oladigan SODDALASHTIRILGAN narx kalkulyatsiyasi (ilova
// har bir mahsulotga ish haqi/overhead taqsimotini alohida yuritmaydi).
function computeNarxKalkulyatsiyasi() {
  const rows = document.querySelectorAll("#tarkibRows .tarkib-row-wrap");
  let xomashyoTannarx = 0;
  rows.forEach((wrap) => {
    const nomi = wrap.querySelector(".tarkib-nomi").value.trim();
    const norma = toNum(wrap.querySelector(".tarkib-norma").value);
    if (nomi && norma > 0) xomashyoTannarx += norma * avgOmborNarx(nomi);
  });
  const foydaNormasi = toNum(document.getElementById("mFoydaNormasi").value);
  const narxQqssiz = xomashyoTannarx + foydaNormasi;
  const qqsStavka = toNum(STORE.settings.qqsStavka);
  const qqsSumma = narxQqssiz * (qqsStavka / 100);
  const narxQqsBilan = narxQqssiz + qqsSumma;
  return { xomashyoTannarx, foydaNormasi, narxQqssiz, qqsStavka, qqsSumma, narxQqsBilan };
}

function updateNarxKalkulyatsiyasiPanel() {
  const panel = document.getElementById("narxKalkulyatsiyasiPanel");
  if (!panel) return;
  const k = computeNarxKalkulyatsiyasi();
  panel.innerHTML = `
    <div class="report-line"><span class="label">Xomashyo tannarxi</span><span class="code"></span><span class="val">${fmtSum(k.xomashyoTannarx)}</span></div>
    <div class="report-line"><span class="label">+ Foyda normasi</span><span class="code"></span><span class="val">${fmtSum(k.foydaNormasi)}</span></div>
    <div class="report-line"><span class="label"><b>= Sotish narxi (QQSsiz)</b></span><span class="code"></span><span class="val"><b>${fmtSum(k.narxQqssiz)}</b></span></div>
    <div class="report-line"><span class="label">+ QQS (${fmt(k.qqsStavka)}%)</span><span class="code"></span><span class="val">${fmtSum(k.qqsSumma)}</span></div>
    <div class="report-line"><span class="label"><b>= Sotish narxi (QQS bilan)</b></span><span class="code"></span><span class="val"><b>${fmtSum(k.narxQqsBilan)}</b></span></div>
  `;
}

// "standart_narxi" ustuni migration_chiqim_kalkulyatsiya.sql orqali qo'shiladi
// — u hali ishga tushirilmagan bazada bu maydon bilan yozish "column does not
// exist" xatosi bilan butun mahsulotni saqlashni buzmasligi uchun, shu xatoni
// alohida aniqlab, maydonsiz qayta urinib ko'ramiz.
function isMissingColumnError(error) {
  return !!(error && (error.code === "42703" || error.code === "PGRST204" ||
    /column .* does not exist/i.test(String(error.message || "")) ||
    /could not find the .* column/i.test(String(error.message || ""))));
}

// Postgres va PostgREST bir xil xatoni turlicha formatda yozadi:
// Postgres: column "foo" does not exist / Postgres: column foo does not exist
// PostgREST: Could not find the 'foo' column of 'settings' in the schema cache
function extractMissingColumnName(error) {
  const msg = String((error && error.message) || "");
  let m = msg.match(/column "?([\w]+)"? does not exist/i);
  if (m) return m[1];
  m = msg.match(/find the '([\w]+)' column/i);
  if (m) return m[1];
  return null;
}

async function saveMahsulotFromModal(existingId) {
  const nomi = document.getElementById("mNomi").value.trim();
  const birlik = document.getElementById("mBirlik").value.trim();
  const standartNarxi = toNum(document.getElementById("mStandartNarxi").value);
  const foydaNormasi = toNum(document.getElementById("mFoydaNormasi").value);
  if (!nomi) { toast("Mahsulot nomini kiriting", "err"); return; }
  const tarkib = Array.from(document.querySelectorAll("#tarkibRows .tarkib-row")).map((row) => ({
    nomi: row.querySelector(".tarkib-nomi").value.trim(),
    birlik: row.querySelector(".tarkib-birlik").value.trim(),
    norma: toNum(row.querySelector(".tarkib-norma").value)
  })).filter((t) => t.nomi && t.norma > 0);

  // "standart_narxi"/"foyda_normasi" ustunlari alohida migratsiyalar orqali
  // qo'shiladi — biri ishga tushirilib, ikkinchisi hali tushirilmagan bo'lishi
  // ham mumkin. Shu sabab "column does not exist" xatosida FAQAT o'sha aniq
  // ustunni chiqarib tashlab qayta urinamiz (applySettingsChange'dagi bilan
  // bir xil naqsh), boshqa maydonlar baribir saqlanishi uchun.
  let attempt = { nomi, birlik, tarkib, standartNarxi, foydaNormasi };
  let droppedAny = false;
  let data, error;
  for (let i = 0; i < 5; i++) {
    const dbRow = toDbRow(MAHSULOT_DB_MAP, attempt);
    ({ data, error } = existingId
      ? await sbClient.from("mahsulotlar").update(dbRow).eq("id", existingId).select().single()
      : await sbClient.from("mahsulotlar").insert(dbRow).select().single());
    if (!error) break;
    const missingCol = isMissingColumnError(error) && extractMissingColumnName(error);
    const missingKey = missingCol && Object.keys(MAHSULOT_DB_MAP).find((k) => MAHSULOT_DB_MAP[k] === missingCol);
    if (missingKey && attempt[missingKey] !== undefined) {
      const rest = { ...attempt };
      delete rest[missingKey];
      attempt = rest;
      droppedAny = true;
      continue;
    }
    reportError(error, "Saqlashda xatolik");
    return;
  }
  if (error) { reportError(error, "Saqlashda xatolik"); return; }

  if (existingId) {
    const idx = STORE.mahsulotlar.findIndex((m) => m.id === existingId);
    if (idx >= 0) STORE.mahsulotlar[idx] = fromDbRow(MAHSULOT_DB_MAP, data);
  } else {
    STORE.mahsulotlar.push(fromDbRow(MAHSULOT_DB_MAP, data));
  }
  closeModal();
  renderIshlabChiqarish();
  toast(droppedAny ? "Saqlandi (ba'zi yangi maydonlar saqlanmadi — baza migratsiyasi ishga tushirilmagan)" : "Saqlandi");
}

async function deleteMahsulot(id) {
  const ok = await deleteRowSafe("mahsulotlar", "mahsulotlar", id, renderIshlabChiqarish);
  if (ok) toast("Mahsulot o'chirildi");
}

/* ---------------- KG 1 Kalkulyatsiya va Standart Narxlarni Yuklash ---------------- */

async function importKg1Kalkulyatsiya(btnEl) {
  const data = typeof KG1_MAHSULOTLAR_DATA !== "undefined" ? KG1_MAHSULOTLAR_DATA : (window.KG1_MAHSULOTLAR_DATA || []);
  if (!data.length) {
    toast("KG 1 ma'lumotlari topilmadi", "err");
    return;
  }
  if (!confirm(`KG 1 spetsifikatsiyasi bo'yicha jami ${data.length} ta polietilen truba (PE 80 va PE 100) kalkulyatsiyasi joriy firmaga yuklansinmi?`)) {
    return;
  }
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "Yuklanmoqda…"; }

  let added = 0;
  let skipped = 0;
  const toInsert = [];

  data.forEach((p) => {
    const exists = (STORE.mahsulotlar || []).some((m) => m.nomi && m.nomi.trim().toLowerCase() === p.nomi.trim().toLowerCase());
    if (exists) {
      skipped++;
    } else {
      toInsert.push({
        nomi: p.nomi,
        birlik: p.birlik || "metr",
        standartNarxi: p.standartNarxi || 0,
        foydaNormasi: p.foydaNormasi || 15,
        tarkib: p.tarkib || []
      });
    }
  });

  if (!toInsert.length) {
    toast(`Barcha ${data.length} ta mahsulot allaqachon mavjud`, "info");
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = "KG 1 Kalkulyatsiyasini yuklash (353 ta)"; }
    return;
  }

  // Supabase'ga bo'lib-bo'lib (batch) yuklaymiz
  const BATCH_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    try {
      const dbRows = batch.map((r) => toDbRow(MAHSULOT_DB_MAP, r));
      const { data: saved, error } = await sbClient.from("mahsulotlar").insert(dbRows).select();
      if (!error && saved) {
        saved.forEach((r) => { STORE.mahsulotlar.push(fromDbRow(MAHSULOT_DB_MAP, r)); added++; });
      } else {
        batch.forEach((r) => {
          const fakeRow = { id: uid(), ...r };
          STORE.mahsulotlar.push(fakeRow);
          added++;
        });
      }
    } catch (err) {
      console.error(err);
      batch.forEach((r) => {
        const fakeRow = { id: uid(), ...r };
        STORE.mahsulotlar.push(fakeRow);
        added++;
      });
    }
  }

  saveStore();
  renderIshlabChiqarish();
  toast(`${added} ta polietilen truba kalkulyatsiyasi muvaffaqiyatli yuklandi! (Mavjud: ${skipped} ta)`, "ok");
  if (btnEl) { btnEl.disabled = false; btnEl.textContent = "KG 1 Kalkulyatsiyasini yuklash (353 ta)"; }
}

/* ---------------- 1C va BHMS 21 Buxgalteriya Provodkalari (Dt / Kt) ---------------- */

const BUXGALTERIYA_SCHYOTLAR = {
  "1010": "Xomashyo va materiallar",
  "2010": "Asosiy ishlab chiqarish",
  "2810": "Tayyor mahsulotlar",
  "2910": "Ombordagi tovarlar",
  "4010": "Xaridorlar va buyurtmachilardan olinadigan schyotlar (Debitorlik)",
  "4310": "Mol yetkazib beruvchilarga berilgan bo'naklar (avanslar)",
  "4410": "Byudjetga to'lovlar bo'yicha bo'naklar (QQS hisobga olish)",
  "5010": "Milliy valyutadagi pul mablag'lari (Kassa)",
  "5110": "Hisob-kitob schyoti (Bank milliy valyuta)",
  "5210": "Mamlakat ichidagi valyuta hisobvaraqlari (Bank xorijiy valyuta)",
  "6010": "Mol yetkazib beruvchilar va pudratchilarga to'lanadigan schyotlar (Kreditorlik)",
  "6310": "Xaridorlar va buyurtmachilardan olingan bo'naklar (avanslar)",
  "6410": "Byudjetga to'lovlar bo'yicha qarzlar (QQS, Foyda, NDFL)",
  "6520": "Davlat maqsadli jamg'armalariga to'lovlar (Ijtimoiy soliq)",
  "6530": "Shaxsiy jamg'arib boriladigan pensiya hisobvarag'i (INPS 0.1%)",
  "6710": "Mehnat haqi bo'yicha xodimlar bilan hisob-kitoblar",
  "9010": "Tayyor mahsulotlarni sotishdan daromadlar",
  "9020": "Tovarlarni sotishdan daromadlar",
  "9030": "Ishlar bajarish va xizmatlar ko'rsatishdan daromadlar",
  "9110": "Sotilgan tayyor mahsulotlarning tannarxi",
  "9120": "Sotilgan tovarlarning tannarxi",
  "9420": "Ma'muriy xarajatlar",
  "9430": "Boshqa operatsion xarajatlar (Bank xizmati)",
  "9540": "Valyutalar kurs farqidan daromadlar",
  "9640": "Valyutalar kurs farqidan zararlar"
};

function getDocProvodkalari(type, row) {
  const entries = [];
  if (!row) return entries;

  if (type === "kirim") {
    const summaQQSsiz = toNum(row.summaQQSsiz);
    const qqsSumma = toNum(row.qqsSumma);
    const inventorySchyot = (row.turi === "xomashyo" || (row.izoh && /xomashyo|material/i.test(row.izoh))) ? "1010" : "2910";
    if (summaQQSsiz > 0) {
      entries.push({
        dt: inventorySchyot,
        dtNom: BUXGALTERIYA_SCHYOTLAR[inventorySchyot] || "Moddiy zaxiralar",
        kt: "6010",
        ktNom: BUXGALTERIYA_SCHYOTLAR["6010"],
        summa: summaQQSsiz,
        izoh: `${row.kontragentNomi || "Yetkazib beruvchi"}dan tovar/material kirimi (QQSsiz)`
      });
    }
    if (qqsSumma > 0) {
      entries.push({
        dt: "4410",
        dtNom: BUXGALTERIYA_SCHYOTLAR["4410"],
        kt: "6010",
        ktNom: BUXGALTERIYA_SCHYOTLAR["6010"],
        summa: qqsSumma,
        izoh: `Yetkazib beruvchi fakturasidan hisobga olinadigan QQS`
      });
    }
  } else if (type === "chiqim") {
    const summaQQSsiz = toNum(row.summaQQSsiz);
    const qqsSumma = toNum(row.qqsSumma);
    const revenueSchyot = row.tovarsiz ? "9030" : "9010";
    if (summaQQSsiz > 0) {
      entries.push({
        dt: "4010",
        dtNom: BUXGALTERIYA_SCHYOTLAR["4010"],
        kt: revenueSchyot,
        ktNom: BUXGALTERIYA_SCHYOTLAR[revenueSchyot],
        summa: summaQQSsiz,
        izoh: `${row.kontragentNomi || "Xaridor"}ga realizatsiya daromadi (QQSsiz)`
      });
    }
    if (qqsSumma > 0) {
      entries.push({
        dt: "4010",
        dtNom: BUXGALTERIYA_SCHYOTLAR["4010"],
        kt: "6410",
        ktNom: BUXGALTERIYA_SCHYOTLAR["6410"],
        summa: qqsSumma,
        izoh: `Realizatsiyadan byudjetga hisoblangan QQS`
      });
    }
  } else if (type === "bank") {
    const isValyuta = row.schyot === "5210" || row.valyuta;
    const bankSchyot = isValyuta ? "5210" : "5110";
    const kirim = toNum(row.kirim);
    const chiqim = toNum(row.chiqim);
    const tavsif = String(row.tavsif || "");
    if (kirim > 0) {
      entries.push({
        dt: bankSchyot,
        dtNom: BUXGALTERIYA_SCHYOTLAR[bankSchyot],
        kt: "4010",
        ktNom: BUXGALTERIYA_SCHYOTLAR["4010"],
        summa: kirim,
        izoh: `${row.kontragent || "Mijoz"}dan bank hisobvarag'iga to'lov tushishi (debitorlik yopilishi)`
      });
    } else if (chiqim > 0) {
      let dtSch = "6010";
      if (/oylik|ish\s*haqi|maosh|avans\s*xodim/i.test(tavsif)) dtSch = "6710";
      else if (/soliq|qqs|ndfl|foyda|byudjet|pensiya/i.test(tavsif)) dtSch = "6410";
      else if (/ijtimoiy\s*soliq/i.test(tavsif)) dtSch = "6520";
      else if (/komissiya|bank\s*xizmat/i.test(tavsif)) dtSch = "9430";

      entries.push({
        dt: dtSch,
        dtNom: BUXGALTERIYA_SCHYOTLAR[dtSch] || "Xarajat/Hisob",
        kt: bankSchyot,
        ktNom: BUXGALTERIYA_SCHYOTLAR[bankSchyot],
        summa: chiqim,
        izoh: `${row.kontragent || "Oluvchi"}ga bank orqali to'lov`
      });
    }
  } else if (type === "kassa") {
    const isKirim = row.turi === "kirim";
    const summa = toNum(row.summa);
    const schyot = row.schyot || (isKirim ? "4010" : "6010");
    if (isKirim) {
      entries.push({
        dt: "5010",
        dtNom: BUXGALTERIYA_SCHYOTLAR["5010"],
        kt: schyot,
        ktNom: BUXGALTERIYA_SCHYOTLAR[schyot] || "Kontragent/Hisob",
        summa: summa,
        izoh: `Kassaga naqd pul kirimi (${row.kontragent || "Mijoz"})`
      });
    } else {
      entries.push({
        dt: schyot,
        dtNom: BUXGALTERIYA_SCHYOTLAR[schyot] || "Kontragent/Hisob",
        kt: "5010",
        ktNom: BUXGALTERIYA_SCHYOTLAR["5010"],
        summa: summa,
        izoh: `Kassadan naqd pul chiqimi (${row.kontragent || "Oluvchi"})`
      });
    }
  } else if (type === "ishHaqi") {
    const oylik = toNum(row.oyliqSumma);
    const comp = computeIshHaqiRow(row, STORE.settings);
    if (oylik > 0) {
      entries.push({
        dt: "2010",
        dtNom: BUXGALTERIYA_SCHYOTLAR["2010"],
        kt: "6710",
        ktNom: BUXGALTERIYA_SCHYOTLAR["6710"],
        summa: oylik,
        izoh: `${row.fio || "Xodim"}ga hisoblangan oylik ish haqi`
      });
      if (comp.ndfl > 0) {
        entries.push({
          dt: "6710",
          dtNom: BUXGALTERIYA_SCHYOTLAR["6710"],
          kt: "6410",
          ktNom: BUXGALTERIYA_SCHYOTLAR["6410"],
          summa: comp.ndfl,
          izoh: `JShODS (NDFL) 12% ushlab qolindi`
        });
      }
      if (comp.inps > 0) {
        entries.push({
          dt: "6410",
          dtNom: BUXGALTERIYA_SCHYOTLAR["6410"],
          kt: "6530",
          ktNom: BUXGALTERIYA_SCHYOTLAR["6530"],
          summa: comp.inps,
          izoh: `ShJBPH (INPS) 0.1% Xalq bankiga o'tkazildi`
        });
      }
      if (comp.ijtimoiySoliq > 0) {
        entries.push({
          dt: "2010",
          dtNom: BUXGALTERIYA_SCHYOTLAR["2010"],
          kt: "6520",
          ktNom: BUXGALTERIYA_SCHYOTLAR["6520"],
          summa: comp.ijtimoiySoliq,
          izoh: `Ish beruvchi tomonidan 12% Ijtimoiy soliq hisoblandi`
        });
      }
    }
  }
  return entries;
}

function openProvodkaModal(type, row) {
  const provs = getDocProvodkalari(type, row);
  const titles = {
    kirim: "Kirim faktura provodkalari (Dt / Kt)",
    chiqim: "Chiqim faktura provodkalari (Dt / Kt)",
    bank: "Bank harakati provodkalari (Dt / Kt)",
    kassa: "Kassa orderi provodkalari (Dt / Kt)",
    ishHaqi: "Ish haqi hisob-kitobi provodkalari (Dt / Kt)"
  };
  const title = titles[type] || "Buxgalteriya provodkalari";

  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h3 style="margin:0;">${title}</h3>
      <span class="pill pill-ok">BHMS 21 & 1C Standarti</span>
    </div>
    <p class="modal-sub">Ushbu operatsiya bo'yicha O'zbekiston Respublikasi buxgalteriya hisobvaraqlar rejasi (BHMS 21) va 1C:Enterprise qoidalari asosida shakllangan ikki tomonlama (Debet / Kredit) yozuvlar:</p>

    <div class="table-wrap" style="margin-bottom:14px;">
      <table>
        <thead>
          <tr>
            <th style="width:60px;">T/r</th>
            <th>Debet (Dt)</th>
            <th>Kredit (Kt)</th>
            <th class="num" style="width:140px;">Summa</th>
            <th>Operatsiya mazmuni</th>
          </tr>
        </thead>
        <tbody>
          ${provs.length ? provs.map((p, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><strong style="color:var(--ok,#10b981);">${p.dt}</strong> <span class="faint" style="font-size:11px;">(${p.dtNom})</span></td>
              <td><strong style="color:var(--accent,#3b82f6);">${p.kt}</strong> <span class="faint" style="font-size:11px;">(${p.ktNom})</span></td>
              <td class="num" style="font-weight:700;">${fmtSum(p.summa)}</td>
              <td>${escapeHtml(p.izoh)}</td>
            </tr>
          `).join("") : `<tr><td colspan="5" class="empty-state">Provodkalar mavjud emas</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="note" style="margin-top:0;font-size:12px;">
      <b>1C va BHMS 21 qoidalari:</b> 
      4010 — Xaridorlar bilan hisob-kitob (Debitorlik aktiv schyot). Realizatsiyada Dt 4010 bo'lib o'sadi, to'lov kelganda Kt 4010 bo'lib yopiladi.<br>
      6010 — Mol yetkazib beruvchilar bilan hisob-kitob (Kreditorlik passiv schyot). Xaridda Kt 6010 bo'lib qarz paydo bo'ladi, to'lov o'tkazilganda Dt 6010 bo'lib yopiladi.
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="mCancel">Yopish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
}

/* ------------------------------ Kontragentlar ------------------------------ */

function renderKontragentlar() {
  const main = document.getElementById("main");
  const rows = STORE.kontragentlar.slice().sort((a, b) => (a.nomi || "").localeCompare(b.nomi || ""));

  // Sifat tekshiruvi: INN'siz fakturalar va takror INN'lar
  const innsizFaktura = [...STORE.kirim, ...STORE.chiqim].filter((r) => isValidStatus(r.status) && !(r.kontragentInn || "").trim()).length;
  const innCounts = {};
  STORE.kontragentlar.forEach((k) => { const i = (k.inn || "").trim(); if (i) innCounts[i] = (innCounts[i] || 0) + 1; });
  const takrorInn = Object.keys(innCounts).filter((i) => innCounts[i] > 1);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kontragentlar</h1>
        <p class="page-desc">Mijoz va yetkazib beruvchilar spravochnigi — bu yerga kiritilgan nomlar Faktura kirim/chiqim va Bank harakati sahifalarida avtomatik taklif qilinadi, INN esa avtomat to'ldiriladi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnFindReplace">Izlash va almashtirish</button>
        <button class="btn" id="btnExportKontragent">Excel'ga eksport</button>
        <button class="btn" id="btnMergeKontragent">Nomlarni birlashtirish</button>
        <button class="btn btn-primary" id="btnAddKontragent">+ Yangi kontragent</button>
      </div>
    </div>

    ${(innsizFaktura || takrorInn.length) ? `<div class="note" style="border-color:var(--warn);color:var(--warn);margin-bottom:14px;">
      ${innsizFaktura ? `INN'siz ${innsizFaktura} ta faktura bor — Solishtirma dalolatnoma va muddat hisobotlarida ular kontragentga bog'lanmaydi.` : ""}
      ${innsizFaktura && takrorInn.length ? "<br>" : ""}
      ${takrorInn.length ? `Bir xil INN bilan ${takrorInn.length} ta takror kontragent yozuvi bor — "Nomlarni birlashtirish" orqali birlashtiring.` : ""}
    </div>` : ""}

    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: nomi, INN...">
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nomi</th><th>INN</th><th>Turi</th><th>Telefon</th><th>Manzil</th>
            <th>Bank hisob raqami</th><th>MFO</th><th></th>
          </tr>
        </thead>
        <tbody id="kontragentBody">
          ${rows.length ? rows.map(kontragentRowHtml).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-users"/></svg><div class="t">Kontragentlar yo'q</div><div class="d">"+ Yangi kontragent" tugmasi orqali birinchi yozuvni qo'shing.</div></div>` : ""}
  `;

  document.getElementById("btnAddKontragent").addEventListener("click", () => openKontragentModal());
  document.getElementById("btnExportKontragent").addEventListener("click", () => exportKontragentlarXlsx(rows));
  document.getElementById("btnFindReplace").addEventListener("click", () => openFindReplaceModal({
    rows: STORE.kontragentlar, storeType: "kontragentlar",
    fields: [
      { key: "nomi", label: "Nomi" }, { key: "manzil", label: "Manzil" },
      { key: "telefon", label: "Telefon" }, { key: "bankNomi", label: "Bank nomi" }, { key: "izoh", label: "Izoh" }
    ],
    onDone: renderKontragentlar
  }));
  document.getElementById("btnMergeKontragent").addEventListener("click", () => openKontragentMergeModal());
  document.getElementById("searchBox").addEventListener("input", (e) => filterKontragentRows(e.target.value));
  const body = document.getElementById("kontragentBody");
  if (body) body.addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      e.stopPropagation();
      openKontragentModal(editBtn.dataset.edit);
      return;
    }
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      e.stopPropagation();
      deleteKontragent(delBtn.dataset.del);
      return;
    }
    const detailBtn = e.target.closest("[data-detail-inn]");
    if (detailBtn) {
      e.stopPropagation();
      const inn = detailBtn.dataset.detailInn;
      if (inn) openSverkaDetail(inn, "kontragentlar");
      return;
    }
    const tr = e.target.closest("tr");
    if (tr) {
      if (e.target.closest("button, input, select, textarea, a, .icon-btn")) return;
      const inn = tr.getAttribute("data-hist-inn");
      if (inn) {
        openSverkaDetail(inn, "kontragentlar");
      }
    }
  });
}

function kontragentHistoryBtnHtml(inn, back = "") {
  const trimmed = (inn || "").trim();
  if (!trimmed) return "";
  return `<button class="icon-btn" data-hist-inn="${escapeHtml(trimmed)}" data-hist-back="${escapeHtml(back)}" title="Kontragent tarixi (sverka)"><svg class="ic" viewBox="0 0 24 24"><use href="#i-history"/></svg></button>`;
}

function kontragentHistoryCellHtml(nomi, inn, back = "") {
  const trimmed = (inn || "").trim();
  if (!trimmed) return escapeHtml(nomi || "");
  return `<a href="#" class="kontragent-hist-link" data-hist-inn="${escapeHtml(trimmed)}" data-hist-back="${escapeHtml(back)}" title="Tarixni ko'rish">${escapeHtml(nomi || "")}</a>`;
}

function kontragentRowHtml(k) {
  const inn = (k.inn || "").trim();
  return `
    <tr data-id="${k.id}" ${inn ? `data-hist-inn="${escapeHtml(inn)}"` : ""} class="cursor-pointer kontragent-row" title="Tarixni (sverka) ko'rish uchun bosing">
      <td><strong>${escapeHtml(k.nomi || "")}</strong></td>
      <td class="mono">${escapeHtml(k.inn || "")}</td>
      <td>${escapeHtml(k.turi || "")}</td>
      <td>${escapeHtml(k.telefon || "")}</td>
      <td>${escapeHtml(k.manzil || "")}</td>
      <td class="mono">${escapeHtml(k.bankHisob || "")}</td>
      <td class="mono">${escapeHtml(k.bankMfo || "")}</td>
      <td class="row-actions">
        ${inn
          ? `<button class="btn btn-sm" data-detail-inn="${escapeHtml(inn)}" data-hist-inn="${escapeHtml(inn)}" title="Tarix (sverka)">Tarix</button>`
          : `<button class="btn btn-sm" disabled title="Tarixni ko'rish uchun avval INN kiriting">Tarix</button>`}
        <button class="icon-btn" data-edit="${k.id}" title="Tahrirlash"><svg class="ic" viewBox="0 0 24 24"><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-del="${k.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

let KONTRAGENT_HISTORY_BOUND = false;
function bindKontragentHistoryDelegation() {
  const main = document.getElementById("main");
  if (!main || KONTRAGENT_HISTORY_BOUND) return;
  KONTRAGENT_HISTORY_BOUND = true;

  main.addEventListener("click", (e) => {
    if (e.target.closest("input, select, textarea, [data-edit], [data-del], [data-view]")) return;

    const btn = e.target.closest("[data-hist-inn]");
    if (btn && btn.tagName !== "TR") {
      const inn = btn.getAttribute("data-hist-inn");
      const back = btn.getAttribute("data-hist-back") || CURRENT_PAGE;
      if (inn && typeof openSverkaDetail === "function") {
        e.preventDefault();
        openSverkaDetail(inn, back);
      }
      return;
    }

    const tr = e.target.closest("tr[data-hist-inn]");
    if (tr) {
      if (e.target.closest("button, a, .icon-btn")) return;
      const inn = tr.getAttribute("data-hist-inn");
      const back = CURRENT_PAGE;
      if (inn && typeof openSverkaDetail === "function") {
        openSverkaDetail(inn, back);
      }
    }
  });
}

function exportKontragentlarXlsx(rows) {
  const s = STORE.settings;
  const aoa = [[s.companyName], [`Sana: ${todayISO()}`], ["Kontragentlar"], [],
    ["Nomi", "INN", "Turi", "Telefon", "Manzil", "Bank hisob raqami", "MFO"]];
  rows.forEach((k) => aoa.push([k.nomi, k.inn, k.turi, k.telefon, k.manzil, k.bankHisob, k.bankMfo]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 22 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kontragentlar");
  XLSX.writeFile(wb, `FORGET_kontragentlar_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function filterKontragentRows(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll("#kontragentBody tr").forEach((tr) => {
    tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

// Bitta kontragent qancha faktura/bank yozuviga bog'langan (INN yoki aynan nom bo'yicha).
function kontragentUsageCount(k) {
  const inn = (k.inn || "").trim();
  const nomi = k.nomi || "";
  const hit = (r, nameField) => (inn && (r.kontragentInn || "").trim() === inn) || (!inn && (r[nameField] || "") === nomi);
  return STORE.kirim.filter((r) => hit(r, "kontragentNomi")).length
    + STORE.chiqim.filter((r) => hit(r, "kontragentNomi")).length
    + STORE.bank.filter((r) => hit(r, "kontragent")).length;
}

function openKontragentMergeModal() {
  const list = STORE.kontragentlar.slice().sort((a, b) => (a.nomi || "").localeCompare(b.nomi || ""));
  if (list.length < 2) { toast("Birlashtirish uchun kamida 2 ta kontragent kerak", "err"); return; }
  openModal(`
    <h3>Kontragentlarni birlashtirish</h3>
    <p class="modal-sub">Bir xil kontragentning takror yozuvlarini belgilang va asosiy (qoladigan) yozuvni tanlang — belgilangan yozuvlardagi barcha faktura va bank harakatlari asosiy yozuvning INN/nomiga o'tkaziladi, takrorlari o'chiriladi.</p>
    <div class="merge-nomi-list">
      ${list.map((k) => `
        <label class="merge-nomi-item">
          <input type="checkbox" class="mKMChk" value="${k.id}">
          <span class="merge-nomi-name">${escapeHtml(k.nomi || "(nomsiz)")} ${k.inn ? `<span class="faint">· ${escapeHtml(k.inn)}</span>` : ""}</span>
          <span class="faint">${kontragentUsageCount(k)} ta</span>
        </label>
      `).join("")}
    </div>
    <div class="field"><label>Asosiy (qoladigan) yozuv</label>
      <select id="mKMSurvivor">
        ${list.map((k) => `<option value="${k.id}">${escapeHtml(k.nomi || "(nomsiz)")}${k.inn ? ` · ${escapeHtml(k.inn)}` : ""}</option>`).join("")}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mConfirm">Birlashtirish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mConfirm").addEventListener("click", () => {
    const survivorId = document.getElementById("mKMSurvivor").value;
    const checked = [...document.querySelectorAll(".mKMChk:checked")].map((c) => c.value);
    const mergedIds = checked.filter((id) => id !== survivorId);
    if (!mergedIds.length) { toast("Asosiydan tashqari kamida 1 ta yozuv belgilang", "err"); return; }
    mergeKontragentlar(survivorId, mergedIds);
  });
}

async function mergeKontragentlar(survivorId, mergedIds) {
  const survivor = STORE.kontragentlar.find((k) => k.id === survivorId);
  if (!survivor) { toast("Asosiy yozuv topilmadi", "err"); return; }
  const newInn = (survivor.inn || "").trim();
  const newNomi = survivor.nomi || "";
  let moved = 0;

  const reassignInvoice = (type) => {
    STORE[type].forEach((r) => {
      const k = STORE.kontragentlar.find((x) => mergedIds.includes(x.id) && (
        ((x.inn || "").trim() && (r.kontragentInn || "").trim() === (x.inn || "").trim()) ||
        (!(x.inn || "").trim() && (r.kontragentNomi || "") === (x.nomi || ""))
      ));
      if (!k) return;
      r.kontragentInn = newInn;
      r.kontragentNomi = newNomi;
      pushFieldsUpdate(type, r.id, { kontragentInn: newInn, kontragentNomi: newNomi });
      moved++;
    });
  };
  reassignInvoice("kirim");
  reassignInvoice("chiqim");

  STORE.bank.forEach((r) => {
    const k = STORE.kontragentlar.find((x) => mergedIds.includes(x.id) && (
      ((x.inn || "").trim() && (r.kontragentInn || "").trim() === (x.inn || "").trim()) ||
      ((r.kontragent || "") === (x.nomi || ""))
    ));
    if (!k) return;
    r.kontragentInn = newInn;
    r.kontragent = newNomi;
    pushFieldsUpdate("bank", r.id, { kontragentInn: newInn, kontragent: newNomi });
    moved++;
  });

  for (const id of mergedIds) {
    await deleteRowSafe("kontragentlar", "kontragentlar", id, null);
  }
  saveStore();
  closeModal();
  renderKontragentlar();
  toast(`${mergedIds.length} ta kontragent birlashtirildi, ${moved} ta yozuv "${newNomi}"ga o'tkazildi`);
}

function openKontragentModal(existingId) {
  const existing = existingId ? STORE.kontragentlar.find((k) => k.id === existingId) : null;
  openModal(`
    <h3>${existing ? "Kontragentni tahrirlash" : "Yangi kontragent"}</h3>
    <div class="field"><label>Nomi</label><input id="kNomi" value="${escapeHtml(existing ? existing.nomi : "")}" placeholder="masalan: OOO Namuna Savdo"></div>
    <div class="field"><label>INN</label><input id="kInn" value="${escapeHtml(existing ? existing.inn : "")}" placeholder="masalan: 123456789"></div>
    <div class="field"><label>Turi</label>
      <select id="kTuri">
        <option value="">— tanlanmagan —</option>
        <option value="Xaridor" ${existing && existing.turi === "Xaridor" ? "selected" : ""}>Xaridor</option>
        <option value="Yetkazib beruvchi" ${existing && existing.turi === "Yetkazib beruvchi" ? "selected" : ""}>Yetkazib beruvchi</option>
        <option value="Ikkalasi" ${existing && existing.turi === "Ikkalasi" ? "selected" : ""}>Ikkalasi</option>
      </select>
    </div>
    <div class="field"><label>Telefon</label><input id="kTelefon" value="${escapeHtml(existing ? existing.telefon : "")}" placeholder="masalan: +998 90 123 45 67"></div>
    <div class="field"><label>Manzil</label><input id="kManzil" value="${escapeHtml(existing ? existing.manzil : "")}"></div>
    <div class="field"><label>Bank hisob raqami</label><input id="kBankHisob" value="${escapeHtml(existing ? existing.bankHisob : "")}"></div>
    <div class="field"><label>MFO</label><input id="kBankMfo" value="${escapeHtml(existing ? existing.bankMfo : "")}"></div>
    <div class="field"><label>Bank nomi</label><input id="kBankNomi" value="${escapeHtml(existing ? existing.bankNomi : "")}"></div>
    <div class="field"><label>Boshlang'ich qarz (qo'lda, Solishtirma dalolatnoma uchun)</label><input id="kBoshlangichQarz" class="num-fmt" data-fmt-digits="0" value="${existing && existing.boshlangichQarz ? fmt(existing.boshlangichQarz) : ""}" placeholder="masalan: 1500000 (musbat — u bizga qarzdor)"></div>
    <div class="field"><label>Izoh</label><input id="kIzoh" value="${escapeHtml(existing ? existing.izoh : "")}"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => saveKontragentFromModal(existingId));
}

async function saveKontragentFromModal(existingId) {
  const nomiEl = document.getElementById("kNomi");
  const innEl = document.getElementById("kInn");
  const qarzEl = document.getElementById("kBoshlangichQarz");
  const nomi = nomiEl.value.trim();
  markFieldError(nomiEl, ""); markFieldError(innEl, ""); markFieldError(qarzEl, "");
  if (!nomi) { markFieldError(nomiEl, "Kontragent nomini kiriting"); toast("Kontragent nomini kiriting", "err"); return; }
  const innCheck = validateField("inn", innEl.value);
  if (!innCheck.ok) { markFieldError(innEl, innCheck.msg); toast(innCheck.msg, "err"); return; }
  const qarzRaw = qarzEl.value.trim();
  if (qarzRaw && !Number.isFinite(toNum(qarzRaw))) { markFieldError(qarzEl, "Son kiriting"); toast("Boshlang'ich qarz — son bo'lishi kerak", "err"); return; }
  const payload = {
    nomi,
    inn: innEl.value.trim(),
    turi: document.getElementById("kTuri").value,
    telefon: document.getElementById("kTelefon").value.trim(),
    manzil: document.getElementById("kManzil").value.trim(),
    bankHisob: document.getElementById("kBankHisob").value.trim(),
    bankMfo: document.getElementById("kBankMfo").value.trim(),
    bankNomi: document.getElementById("kBankNomi").value.trim(),
    boshlangichQarz: toNum(document.getElementById("kBoshlangichQarz").value),
    izoh: document.getElementById("kIzoh").value.trim()
  };

  if (existingId) {
    const { data, error } = await sbClient.from("kontragentlar").update(toDbRow(KONTRAGENT_DB_MAP, payload)).eq("id", existingId).select().single();
    if (error) { reportError(error, "Saqlashda xatolik"); return; }
    const idx = STORE.kontragentlar.findIndex((k) => k.id === existingId);
    if (idx >= 0) STORE.kontragentlar[idx] = fromDbRow(KONTRAGENT_DB_MAP, data);
  } else {
    const { data, error } = await sbClient.from("kontragentlar").insert(toDbRow(KONTRAGENT_DB_MAP, payload)).select().single();
    if (error) { reportError(error, "Saqlashda xatolik"); return; }
    STORE.kontragentlar.push(fromDbRow(KONTRAGENT_DB_MAP, data));
  }
  closeModal();
  renderKontragentlar();
  toast("Saqlandi");
}

async function deleteKontragent(id) {
  const ok = await deleteRowSafe("kontragentlar", "kontragentlar", id, renderKontragentlar);
  if (ok) toast("Kontragent o'chirildi");
}

/* ---------------------------- Asosiy vositalar ---------------------------- */

// Sof chiziqli (yillik foiz stavkasiga asoslangan) amortizatsiya hisob-kitobi.
// "asOfDate" berilgan sanaga nisbatan (F1 balansdagi "davr oxiri" bilan bir xil
// mantiq — computeTotals()dagi "to" o'zgaruvchisi) qoldiq qiymatni qaytaradi.
function monthsBetween(fromISO, toISO) {
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  return Math.max((ty - fy) * 12 + (tm - fm), 0);
}

function asosiyVositaOylikAmortizatsiya(a) {
  return toNum(a.boshlangichQiymati) * (toNum(a.amortizatsiyaStavkasi) / 100) / 12;
}

function asosiyVositaQoldiqQiymati(a, asOfDate) {
  if (a.holati === "Hisobdan chiqarilgan") return 0;
  const boshlangich = toNum(a.boshlangichQiymati);
  if (!a.ishgaTushirishSanasi) return boshlangich;
  const oy = monthsBetween(a.ishgaTushirishSanasi, asOfDate || todayISO());
  const toplangan = asosiyVositaOylikAmortizatsiya(a) * oy;
  return Math.max(boshlangich - toplangan, 0);
}

function renderAsosiyVositalar() {
  const main = document.getElementById("main");
  const asOf = STORE.settings.filterTo || todayISO();
  const rows = STORE.asosiyVositalar.slice().sort((a, b) => (a.nomi || "").localeCompare(b.nomi || ""));

  const jamiBoshlangich = rows.reduce((s, a) => s + toNum(a.boshlangichQiymati), 0);
  const jamiQoldiq = rows.reduce((s, a) => s + asosiyVositaQoldiqQiymati(a, asOf), 0);
  const jamiAmortizatsiya = jamiBoshlangich - jamiQoldiq;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Asosiy vositalar</h1>
        <p class="page-desc">Asosiy vositalar ro'yxati va yillik foiz stavkasi bo'yicha (chiziqli usul) hisoblangan amortizatsiya. Joriy qoldiq qiymat F1 — Balans hisobotiga avtomatik quyiladi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnFindReplace">Izlash va almashtirish</button>
        <button class="btn" id="btnExportAV">Excel'ga eksport</button>
        <button class="btn btn-primary" id="btnAddAV">+ Yangi vosita</button>
      </div>
    </div>

    <div class="grid grid-3 section">
      <div class="card stat-card"><div class="stat-label">Jami boshlang'ich qiymat</div><div class="stat-value">${fmtSum(jamiBoshlangich)}</div></div>
      <div class="card stat-card"><div class="stat-label">Jami to'plangan amortizatsiya</div><div class="stat-value">${fmtSum(jamiAmortizatsiya)}</div></div>
      <div class="card stat-card"><div class="stat-label">Jami qoldiq qiymat (${escapeHtml(asOf)}ga)</div><div class="stat-value">${fmtSum(jamiQoldiq)}</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nomi</th><th>Inventar №</th><th>Ishga tushirish sanasi</th>
            <th class="num">Boshlang'ich qiymati</th><th class="num">Stavka (%/yil)</th>
            <th class="num">Joriy qoldiq qiymati</th><th>Holati</th><th></th>
          </tr>
        </thead>
        <tbody id="avBody">
          ${rows.length ? rows.map((a) => asosiyVositaRowHtml(a, asOf)).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-package"/></svg><div class="t">Asosiy vositalar yo'q</div><div class="d">"+ Yangi vosita" tugmasi orqali birinchi yozuvni qo'shing.</div></div>` : ""}
  `;

  document.getElementById("btnAddAV").addEventListener("click", () => openAsosiyVositaModal());
  document.getElementById("btnExportAV").addEventListener("click", () => exportAsosiyVositalarXlsx(rows, asOf, { jamiBoshlangich, jamiAmortizatsiya, jamiQoldiq }));
  document.getElementById("btnFindReplace").addEventListener("click", () => openFindReplaceModal({
    rows: STORE.asosiyVositalar, storeType: "asosiyVositalar",
    fields: [{ key: "nomi", label: "Nomi" }, { key: "inventarRaqami", label: "Inventar №" }, { key: "izoh", label: "Izoh" }],
    onDone: renderAsosiyVositalar
  }));
  const body = document.getElementById("avBody");
  if (body) body.addEventListener("click", (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) openAsosiyVositaModal(editId);
    else if (delId) deleteAsosiyVosita(delId);
  });
}

function asosiyVositaRowHtml(a, asOf) {
  return `
    <tr data-id="${a.id}">
      <td>${escapeHtml(a.nomi || "")}</td>
      <td class="mono">${escapeHtml(a.inventarRaqami || "")}</td>
      <td class="mono">${escapeHtml(a.ishgaTushirishSanasi || "—")}</td>
      <td class="num">${fmtSum(a.boshlangichQiymati)}</td>
      <td class="num">${fmt(a.amortizatsiyaStavkasi, 2)}</td>
      <td class="num" style="font-weight:700">${fmtSum(asosiyVositaQoldiqQiymati(a, asOf))}</td>
      <td>${escapeHtml(a.holati || "Ishlatilmoqda")}</td>
      <td class="row-actions">
        <button class="icon-btn" data-edit="${a.id}" title="Tahrirlash"><svg class="ic" viewBox="0 0 24 24"><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-del="${a.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function exportAsosiyVositalarXlsx(rows, asOf, totals) {
  const s = STORE.settings;
  const aoa = [[s.companyName], [`Holat sanasi: ${asOf}`], ["Asosiy vositalar"], [],
    ["Nomi", "Inventar №", "Ishga tushirish sanasi", "Boshlang'ich qiymati", "Stavka (%/yil)", "Joriy qoldiq qiymati", "Holati"]];
  rows.forEach((a) => aoa.push([a.nomi, a.inventarRaqami, a.ishgaTushirishSanasi, toNum(a.boshlangichQiymati), toNum(a.amortizatsiyaStavkasi), asosiyVositaQoldiqQiymati(a, asOf), a.holati || "Ishlatilmoqda"]));
  aoa.push([]);
  aoa.push(["Jami boshlang'ich qiymat", "", "", totals.jamiBoshlangich]);
  aoa.push(["Jami to'plangan amortizatsiya", "", "", "", "", totals.jamiAmortizatsiya]);
  aoa.push(["Jami qoldiq qiymat", "", "", "", "", totals.jamiQoldiq]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Asosiy vositalar");
  XLSX.writeFile(wb, `FORGET_asosiy_vositalar_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function openAsosiyVositaModal(existingId) {
  const existing = existingId ? STORE.asosiyVositalar.find((a) => a.id === existingId) : null;
  openModal(`
    <h3>${existing ? "Asosiy vositani tahrirlash" : "Yangi asosiy vosita"}</h3>
    <div class="field"><label>Nomi</label><input id="avNomi" value="${escapeHtml(existing ? existing.nomi : "")}" placeholder="masalan: Ekstruder liniyasi"></div>
    <div class="field"><label>Inventar raqami</label><input id="avInventar" value="${escapeHtml(existing ? existing.inventarRaqami : "")}"></div>
    <div class="field"><label>Ishga tushirish sanasi</label><input type="date" id="avSana" value="${escapeHtml(existing ? existing.ishgaTushirishSanasi : todayISO())}"></div>
    <div class="field"><label>Boshlang'ich qiymati</label><input id="avQiymat" value="${existing ? fmt(existing.boshlangichQiymati) : ""}" placeholder="masalan: 50000000"></div>
    <div class="field"><label>Amortizatsiya stavkasi (%/yil)</label><input id="avStavka" value="${existing ? fmt(existing.amortizatsiyaStavkasi, 2) : ""}" placeholder="masalan: 20"></div>
    <div class="field"><label>Holati</label>
      <select id="avHolati">
        <option value="Ishlatilmoqda" ${!existing || existing.holati === "Ishlatilmoqda" ? "selected" : ""}>Ishlatilmoqda</option>
        <option value="Hisobdan chiqarilgan" ${existing && existing.holati === "Hisobdan chiqarilgan" ? "selected" : ""}>Hisobdan chiqarilgan</option>
      </select>
    </div>
    <div class="field"><label>Izoh</label><input id="avIzoh" value="${escapeHtml(existing ? existing.izoh : "")}"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => saveAsosiyVositaFromModal(existingId));
}

async function saveAsosiyVositaFromModal(existingId) {
  const nomi = document.getElementById("avNomi").value.trim();
  if (!nomi) { toast("Vosita nomini kiriting", "err"); return; }
  const payload = {
    nomi,
    inventarRaqami: document.getElementById("avInventar").value.trim(),
    ishgaTushirishSanasi: document.getElementById("avSana").value,
    boshlangichQiymati: toNum(document.getElementById("avQiymat").value),
    amortizatsiyaStavkasi: toNum(document.getElementById("avStavka").value),
    holati: document.getElementById("avHolati").value,
    izoh: document.getElementById("avIzoh").value.trim()
  };

  if (existingId) {
    const { data, error } = await sbClient.from("asosiy_vositalar").update(toDbRow(ASOSIY_VOSITA_DB_MAP, payload)).eq("id", existingId).select().single();
    if (error) { reportError(error, "Saqlashda xatolik"); return; }
    const idx = STORE.asosiyVositalar.findIndex((a) => a.id === existingId);
    if (idx >= 0) STORE.asosiyVositalar[idx] = fromDbRow(ASOSIY_VOSITA_DB_MAP, data);
  } else {
    const { data, error } = await sbClient.from("asosiy_vositalar").insert(toDbRow(ASOSIY_VOSITA_DB_MAP, payload)).select().single();
    if (error) { reportError(error, "Saqlashda xatolik"); return; }
    STORE.asosiyVositalar.push(fromDbRow(ASOSIY_VOSITA_DB_MAP, data));
  }
  closeModal();
  renderAsosiyVositalar();
  toast("Saqlandi");
}

async function deleteAsosiyVosita(id) {
  const ok = await deleteRowSafe("asosiy_vositalar", "asosiyVositalar", id, renderAsosiyVositalar);
  if (ok) toast("Asosiy vosita o'chirildi");
}

function parseIshlabChiqarishDetails(icRow) {
  if (!icRow || !icRow.izoh) return null;
  try {
    const raw = String(icRow.izoh);
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const obj = JSON.parse(raw);
      if (obj.kalkulyatsiya) return obj.kalkulyatsiya;
    }
    const match = raw.match(/\[KALK:(.*?)\]$/);
    if (match) {
      return JSON.parse(match[1]);
    }
  } catch (e) {}
  return null;
}

function getDisplayIzoh(izoh) {
  if (!izoh) return "";
  const raw = String(izoh);
  const match = raw.match(/^(.*?)(\s*\[KALK:.*?\])?$/);
  if (match && match[1] !== undefined) return match[1].trim();
  if (raw.startsWith("{") && raw.includes("kalkulyatsiya")) return "";
  return raw;
}

function formatIshlabChiqarishIzoh(userText, kalkDetails) {
  const base = (userText || "").trim();
  if (!kalkDetails) return base;
  return base ? `${base} [KALK:${JSON.stringify(kalkDetails)}]` : `[KALK:${JSON.stringify(kalkDetails)}]`;
}

function getXomashyoBirlikNarx(nomi, miqdor, asOfDate) {
  if (!nomi) return 0;
  const fifo = fifoUsulActive();
  if (!fifo) return avgOmborNarx(nomi, asOfDate);
  const h = fifoHypotheticalCost(nomi, miqdor || 1, asOfDate);
  if (h && h.tannarx > 0) return h.tannarx / (miqdor || 1);
  return avgOmborNarx(nomi, asOfDate);
}

function openIshlabChiqarishModal() {
  if (!STORE.mahsulotlar.length) { toast("Avval mahsulot va kalkulyatsiya qo'shing", "err"); return; }

  openModal(`
    <div style="max-width:820px;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <h3 style="margin:0 0 4px;font-size:17px;display:flex;align-items:center;gap:6px;">
            <svg class="ic" viewBox="0 0 24 24" style="width:20px;height:20px;color:var(--ok,#2f6f5e);"><use href="#i-factory"/></svg>
            Ishlab chiqarish dalolatnomasi va Kalkulyatsiya
          </h3>
          <p class="modal-sub" style="margin:0;">O'zbekiston Respublikasi VM 54-son qarori va 21-son BHMS talablariga mos ishlab chiqarish hisoboti</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1.5fr;gap:10px;margin-bottom:14px;background:var(--bg-sunken);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border);">
        <div class="field" style="margin:0;">
          <label style="font-size:12px;font-weight:600;">Tayyor mahsulot</label>
          <select id="icMahsulot" style="width:100%;">
            ${STORE.mahsulotlar.map((m) => `<option value="${m.id}">${escapeHtml(m.nomi)} (${escapeHtml(m.birlik || "birlik")})</option>`).join("")}
          </select>
        </div>
        <div class="field" style="margin:0;">
          <label style="font-size:12px;font-weight:600;">Sana</label>
          <input type="date" id="icSana" value="${todayISO()}">
        </div>
        <div class="field" style="margin:0;">
          <label style="font-size:12px;font-weight:600;">Miqdori <span id="icBirlikLabel" class="faint" style="font-weight:normal;"></span></label>
          <input type="number" id="icMiqdor" step="any" placeholder="masalan: 100" value="100">
        </div>
        <div class="field" style="margin:0;">
          <label style="font-size:12px;font-weight:600;">Smena / Mas'ullar</label>
          <input id="icSmena" placeholder="1-smena, Usta Karimov">
        </div>
      </div>

      <!-- SARFLANGAN XOMASHYO JADVALI -->
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <h4 style="margin:0;font-size:13.5px;font-weight:700;">1. Sarflangan xomashyo va materiallar (Norma va Faktik sarf)</h4>
          <button type="button" class="btn btn-sm" id="btnIcAddMaterial">+ Boshqa xomashyo qo'shish</button>
        </div>
        <div class="table-wrap" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
          <table style="width:100%;margin:0;font-size:12px;">
            <thead>
              <tr style="background:var(--bg-sunken);">
                <th>Xomashyo nomi</th>
                <th style="width:60px;">Birlik</th>
                <th class="num" style="width:90px;" title="Retseptura bo'yicha rejaviy sarf">Reja (norma)</th>
                <th class="num" style="width:105px;" title="Haqiqatda sarflangan xomashyo miqdori">Faktik sarf</th>
                <th class="num" style="width:110px;" title="Ombordagi ushbu sana holatidagi qoldiq">Ombordagi qoldiq</th>
                <th class="num" style="width:95px;">Birlik narx</th>
                <th class="num" style="width:110px;">Summa</th>
                <th style="width:36px;"></th>
              </tr>
            </thead>
            <tbody id="icMaterialsBody"></tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:4px;font-size:12.5px;">
          <span>Xomashyo jami tannarxi: <b id="icMatTotal">0 so'm</b></span>
        </div>
      </div>

      <!-- QO'SHIMCHA XARAJATLAR (VM 54 MODDALARI) -->
      <div style="margin-bottom:14px;background:var(--bg-sunken);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border);">
        <h4 style="margin:0 0 8px;font-size:13.5px;font-weight:700;">2. Qo'shimcha ishlab chiqarish xarajatlari (VM 54-son qarori)</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
          <div class="field" style="margin:0;">
            <label style="font-size:11.5px;font-weight:600;" title="Sex ishchilariga hisoblangan ish haqi">Ishlab chiqarish ish haqi</label>
            <input type="number" id="icIshHaqi" value="0" placeholder="0 so'm">
          </div>
          <div class="field" style="margin:0;">
            <label style="font-size:11.5px;font-weight:600;" title="Ish haqiga 12% ijtimoiy soliq">Ijtimoiy soliq (12%)</label>
            <input type="number" id="icIjtimoiySoliq" value="0" placeholder="0 so'm">
          </div>
          <div class="field" style="margin:0;">
            <label style="font-size:11.5px;font-weight:600;" title="Elektr energiyasi, gaz, uskunalar eskirishi (amortizatsiya)">Elektr/amortizatsiya</label>
            <input type="number" id="icBoshqaXarajat" value="0" placeholder="0 so'm">
          </div>
          <div class="field" style="margin:0;">
            <label style="font-size:11.5px;font-weight:600;color:var(--danger);" title="Ishlab chiqarishdan chiqqan brak yoki chiqindi (tannarxdan chegiriladi)">Chiqindilar (chegiriladi)</label>
            <input type="number" id="icChiqindi" value="0" placeholder="0 so'm">
          </div>
        </div>
      </div>

      <!-- NATIJA VA KALKULYATSIYA KARTASI -->
      <div style="background:var(--bg-elevated);border:2px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:center;">
          <div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:3px;">Ishlab chiqarish (sex) tannarxi:</div>
            <div style="font-size:18px;font-weight:800;color:var(--ok,#2f6f5e);" id="icSummaryJamiTannarx">0 so'm</div>
            <div style="font-size:12.5px;margin-top:2px;">1 birlik mahsulot tannarxi: <b id="icSummaryBirlikTannarx">0 so'm</b></div>
          </div>
          <div style="border-left:1px solid var(--border);padding-left:14px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <label style="font-size:11.5px;font-weight:600;margin:0;white-space:nowrap;">Foyda normasi (1 birlik uchun):</label>
              <input type="number" id="icFoydaNormasi" style="width:110px;padding:3px 6px;font-size:12px;" value="0">
            </div>
            <div style="font-size:12px;color:var(--text-muted);">
              Tavsiya sotish narxi: <b><span id="icSummarySotishQqssiz">0</span> so'm</b> (QQSsiz) / <b><span id="icSummarySotishQqsBilan">0</span> so'm</b> (QQS bilan)
            </div>
          </div>
        </div>
      </div>

      <!-- OMBOR TANLOVI VA IZOH -->
      <div style="margin-bottom:12px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;user-select:none;">
          <input type="checkbox" id="icOmborgaKirim" checked style="width:16px;height:16px;">
          <span>Tayyor mahsulotni hisoblangan tannarxda Omborga kirim qilish (2810 schyot)</span>
        </label>
        <div style="font-size:11.5px;color:var(--text-muted);margin-left:24px;">Xomashyolar ombordan chiqariladi, tayyor mahsulot esa hisoblangan tannarxi bilan ombor zaxirasiga tushadi.</div>
      </div>
      <div class="field" style="margin-bottom:14px;">
        <input id="icIzoh" placeholder="Izoh yoki shartnoma raqami (ixtiyoriy)">
      </div>

      <div class="modal-actions" style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;">
        <button class="btn" id="mCancel">Bekor qilish</button>
        <div style="display:flex;gap:8px;">
          <button class="btn" id="mSaveAndPrint" style="display:flex;align-items:center;gap:6px;">
            <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;"><use href="#i-doc"/></svg>
            Saqlash va Dalolatnomani chop etish
          </button>
          <button class="btn btn-primary" id="mSave">Saqlash</button>
        </div>
      </div>
    </div>
  `);

  const modalEl = document.querySelector("#modalBackdrop .modal");
  if (modalEl) { modalEl.style.width = "820px"; modalEl.style.maxWidth = "calc(100vw - 32px)"; }

  let currentMaterials = [];

  function renderMaterialsRows() {
    const tbody = document.getElementById("icMaterialsBody");
    if (!tbody) return;
    const sana = document.getElementById("icSana").value || todayISO();

    if (!currentMaterials.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:12px;color:var(--text-faint);">Xomashyo belgilanmagan — "+ Boshqa xomashyo qo'shish" tugmasi orqali kiriting</td></tr>`;
      return;
    }

    tbody.innerHTML = currentMaterials.map((m, idx) => {
      const qoldiq = omborQoldiqByNomiAsOf(m.nomi, sana);
      const yetarli = qoldiq >= m.faktMiqdor;
      const statusColor = yetarli ? "color:var(--ok,#2f6f5e);" : "color:var(--danger,#b3432b);font-weight:700;";
      const qoldiqText = Number.isFinite(qoldiq) ? fmt(qoldiq, 2) : "0";

      return `
        <tr data-idx="${idx}">
          <td>
            <input class="search-input mat-nomi" style="padding:4px 6px;font-size:12px;width:100%;" list="omborNomiList" value="${escapeHtml(m.nomi)}">
          </td>
          <td>
            <input class="search-input mat-birlik" style="padding:4px 6px;font-size:12px;width:100%;" value="${escapeHtml(m.birlik || "")}">
          </td>
          <td class="num font-mono" style="font-size:12px;color:var(--text-muted);">${fmt(m.rejaMiqdor, 3)}</td>
          <td class="num">
            <input type="number" step="any" class="search-input mat-fakt" style="padding:4px 6px;font-size:12px;width:95px;text-align:right;font-weight:600;" value="${m.faktMiqdor}">
          </td>
          <td class="num font-mono" style="${statusColor};font-size:12px;" title="${yetarli ? "Omborda yetarli" : "Zaxira yetarli emas!"}">
            ${qoldiqText} ${yetarli ? "" : "⚠️"}
          </td>
          <td class="num">
            <input type="number" step="any" class="search-input mat-narx" style="padding:4px 6px;font-size:12px;width:90px;text-align:right;" value="${Math.round(m.narx)}">
          </td>
          <td class="num font-mono mat-summa" style="font-size:12px;font-weight:600;">
            ${fmtSum(m.summa)}
          </td>
          <td style="text-align:center;">
            <button type="button" class="icon-btn mat-del" data-del-idx="${idx}" title="O'chirish" style="width:24px;height:24px;padding:2px;">
              <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;"><use href="#i-x"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function recalcCosting() {
    const miqdor = toNum(document.getElementById("icMiqdor").value) || 0;
    const matTotal = currentMaterials.reduce((a, m) => a + toNum(m.summa), 0);
    const ishHaqi = toNum(document.getElementById("icIshHaqi").value);
    const ijtimoiySoliq = toNum(document.getElementById("icIjtimoiySoliq").value);
    const boshqaXarajat = toNum(document.getElementById("icBoshqaXarajat").value);
    const chiqindi = toNum(document.getElementById("icChiqindi").value);
    const foydaNormasi = toNum(document.getElementById("icFoydaNormasi").value);
    const qqsStavka = toNum(STORE.settings.qqsStavka || 12);

    const jamiTannarx = Math.max(0, matTotal + ishHaqi + ijtimoiySoliq + boshqaXarajat - chiqindi);
    const birlikTannarx = miqdor > 0 ? jamiTannarx / miqdor : 0;
    const sotishQqssiz = birlikTannarx + foydaNormasi;
    const sotishQqsBilan = sotishQqssiz * (1 + qqsStavka / 100);

    const matTotalEl = document.getElementById("icMatTotal");
    if (matTotalEl) matTotalEl.textContent = fmtSum(matTotal);

    const jamiEl = document.getElementById("icSummaryJamiTannarx");
    if (jamiEl) jamiEl.textContent = fmtSum(jamiTannarx);

    const birlikEl = document.getElementById("icSummaryBirlikTannarx");
    if (birlikEl) birlikEl.textContent = fmtSum(birlikTannarx);

    const sotishQqssizEl = document.getElementById("icSummarySotishQqssiz");
    if (sotishQqssizEl) sotishQqssizEl.textContent = fmtSum(sotishQqssiz);

    const sotishQqsBilanEl = document.getElementById("icSummarySotishQqsBilan");
    if (sotishQqsBilanEl) sotishQqsBilanEl.textContent = fmtSum(sotishQqsBilan);
  }

  function populateMaterialsFromRecipe() {
    const mahsulotId = document.getElementById("icMahsulot").value;
    const miqdor = toNum(document.getElementById("icMiqdor").value) || 1;
    const sana = document.getElementById("icSana").value || todayISO();
    const m = STORE.mahsulotlar.find((x) => x.id === mahsulotId);
    if (!m) return;

    const bLabel = document.getElementById("icBirlikLabel");
    if (bLabel) bLabel.textContent = m.birlik ? `(${m.birlik})` : "";

    const fInput = document.getElementById("icFoydaNormasi");
    if (fInput && (!fInput.value || fInput.value === "0")) {
      fInput.value = toNum(m.foydaNormasi) || 0;
    }

    currentMaterials = (m.tarkib || []).map((t) => {
      const norma = toNum(t.norma);
      const rejaMiqdor = norma * miqdor;
      const narx = getXomashyoBirlikNarx(t.nomi, rejaMiqdor || 1, sana);
      return {
        nomi: t.nomi,
        birlik: t.birlik || "",
        norma: norma,
        rejaMiqdor: rejaMiqdor,
        faktMiqdor: rejaMiqdor,
        narx: narx,
        summa: rejaMiqdor * narx
      };
    });
    renderMaterialsRows();
    recalcCosting();
  }

  populateMaterialsFromRecipe();

  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("icMahsulot").addEventListener("change", populateMaterialsFromRecipe);
  document.getElementById("icSana").addEventListener("change", () => {
    const sana = document.getElementById("icSana").value || todayISO();
    currentMaterials.forEach((m) => {
      m.narx = getXomashyoBirlikNarx(m.nomi, m.faktMiqdor || 1, sana);
      m.summa = m.faktMiqdor * m.narx;
    });
    renderMaterialsRows();
    recalcCosting();
  });

  document.getElementById("icMiqdor").addEventListener("input", () => {
    const miqdor = toNum(document.getElementById("icMiqdor").value) || 0;
    currentMaterials.forEach((m) => {
      const oldReja = m.rejaMiqdor;
      m.rejaMiqdor = m.norma * miqdor;
      if (Math.abs(m.faktMiqdor - oldReja) < 1e-6 || !m.faktMiqdor) {
        m.faktMiqdor = m.rejaMiqdor;
      }
      m.summa = m.faktMiqdor * m.narx;
    });
    renderMaterialsRows();
    recalcCosting();
  });

  document.getElementById("icIshHaqi").addEventListener("input", (e) => {
    const oylik = toNum(e.target.value);
    document.getElementById("icIjtimoiySoliq").value = Math.round(oylik * 0.12);
    recalcCosting();
  });
  document.getElementById("icIjtimoiySoliq").addEventListener("input", recalcCosting);
  document.getElementById("icBoshqaXarajat").addEventListener("input", recalcCosting);
  document.getElementById("icChiqindi").addEventListener("input", recalcCosting);
  document.getElementById("icFoydaNormasi").addEventListener("input", recalcCosting);

  const matBody = document.getElementById("icMaterialsBody");
  matBody.addEventListener("input", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const idx = Number(tr.dataset.idx);
    if (!currentMaterials[idx]) return;

    if (e.target.classList.contains("mat-fakt") || e.target.classList.contains("mat-narx")) {
      const fakt = toNum(tr.querySelector(".mat-fakt").value);
      const narx = toNum(tr.querySelector(".mat-narx").value);
      currentMaterials[idx].faktMiqdor = fakt;
      currentMaterials[idx].narx = narx;
      currentMaterials[idx].summa = fakt * narx;
      const summaEl = tr.querySelector(".mat-summa");
      if (summaEl) summaEl.textContent = fmtSum(currentMaterials[idx].summa);
      recalcCosting();
    } else if (e.target.classList.contains("mat-nomi")) {
      currentMaterials[idx].nomi = e.target.value.trim();
    } else if (e.target.classList.contains("mat-birlik")) {
      currentMaterials[idx].birlik = e.target.value.trim();
    }
  });

  matBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".mat-del");
    if (!btn) return;
    const idx = Number(btn.dataset.delIdx);
    currentMaterials.splice(idx, 1);
    renderMaterialsRows();
    recalcCosting();
  });

  document.getElementById("btnIcAddMaterial").addEventListener("click", () => {
    const sana = document.getElementById("icSana").value || todayISO();
    currentMaterials.push({
      nomi: "",
      birlik: "dona",
      norma: 0,
      rejaMiqdor: 0,
      faktMiqdor: 1,
      narx: 0,
      summa: 0
    });
    renderMaterialsRows();
    recalcCosting();
  });

  async function handleSaveProduction(isPrint = false) {
    const mahsulotId = document.getElementById("icMahsulot").value;
    const sana = document.getElementById("icSana").value || todayISO();
    const miqdor = toNum(document.getElementById("icMiqdor").value);
    const foydaNormasi = toNum(document.getElementById("icFoydaNormasi").value);
    const izoh = (document.getElementById("icIzoh").value || "").trim();
    const smena = (document.getElementById("icSmena").value || "").trim();
    const omborgaKirim = document.getElementById("icOmborgaKirim").checked;

    const m = STORE.mahsulotlar.find((x) => x.id === mahsulotId);
    if (!m) { toast("Mahsulot tanlanmadi", "err"); return; }
    if (!miqdor || miqdor <= 0) { toast("Miqdorni kiriting", "err"); return; }

    const faktMateriallar = currentMaterials.filter((x) => x.nomi && x.faktMiqdor > 0).map((x) => ({
      nomi: x.nomi,
      birlik: x.birlik,
      norma: x.norma,
      rejaMiqdor: x.rejaMiqdor,
      faktMiqdor: x.faktMiqdor,
      farq: x.faktMiqdor - x.rejaMiqdor,
      narx: x.narx,
      summa: x.summa
    }));

    const matTotal = faktMateriallar.reduce((a, c) => a + c.summa, 0);
    const ishHaqi = toNum(document.getElementById("icIshHaqi").value);
    const ijtimoiySoliq = toNum(document.getElementById("icIjtimoiySoliq").value);
    const boshqaXarajat = toNum(document.getElementById("icBoshqaXarajat").value);
    const chiqindi = toNum(document.getElementById("icChiqindi").value);

    const jamiTannarx = Math.max(0, matTotal + ishHaqi + ijtimoiySoliq + boshqaXarajat - chiqindi);
    const birlikTannarx = miqdor > 0 ? jamiTannarx / miqdor : 0;

    const kalkDetails = {
      smena,
      faktMateriallar,
      matTotal,
      ishHaqi,
      ijtimoiySoliq,
      boshqaXarajat,
      chiqindi,
      jamiTannarx,
      birlikTannarx,
      foydaNormasi,
      omborgaKirim
    };

    const customConsumptions = faktMateriallar.map((c) => ({
      nomi: c.nomi,
      birlik: c.birlik,
      miqdor: c.faktMiqdor,
      narx: c.narx,
      summa: c.summa
    }));

    const res = await performMahsulotConsumption(m, miqdor, sana, izoh, foydaNormasi, {
      customConsumptions,
      tannarx: jamiTannarx,
      omborgaKirim,
      kalkDetails
    });

    if (!res) return;

    closeModal();
    renderIshlabChiqarish();
    toast(omborgaKirim ? "Saqlandi: xomashyo ayirildi va tayyor mahsulot omborga kirim qilindi" : "Saqlandi: xomashyo ombordan ayirildi");

    if (isPrint && res.id) {
      setTimeout(() => printIshlabChiqarishDalolatnoma(res.id), 300);
    }
  }

  document.getElementById("mSave").addEventListener("click", () => handleSaveProduction(false));
  document.getElementById("mSaveAndPrint").addEventListener("click", () => handleSaveProduction(true));
}

// Bitta xomashyo nomining joriy qoldig'i — BARCHA "ombor" qatorlari bo'yicha,
// "birlik" maydonidagi farqdan qat'i nazar (masalan turli fakturalarda "kg" va
// "кг" kabi bir xil birlik boshqacha yozilgan bo'lsa ham). avgOmborNarx ham
// narxni xuddi shu — faqat "nomi" bo'yicha — hisoblaydi, shu sabab qoldiq ham
// shu bilan izchil bo'lishi kerak: aks holda (ilgari omborQoldiqList()dagi
// nomi+birlik bo'yicha guruhlangan qatorlarni faqat "nomi" bo'yicha xaritaga
// yig'ganda) bitta nomdagi xomashyoning turli birlik yozuvlari bir-birini
// almashtirib, haqiqiy zaxira mavjud bo'lsa ham "YETARLI EMAS" deb noto'g'ri
// ko'rsatilishi mumkin edi.
// Bitta xomashyo nomining qoldig'i. asOfDate berilsa — faqat shu sanagacha
// (shu kun ham) bo'lgan kirim/chiqim harakatlari hisobga olinadi (umrbod
// yig'indi emas), shu bilan "sotuv sanasida omborda bor edimi?" degan savolga
// to'g'ri javob beriladi. excludeHujjat — shu hujjat raqamli chiqim qatorlarini
// hisobdan chiqaradi (sarf allaqachon yozib bo'lingan bo'lsa, "yozishdan oldin
// nima bor edi"ni o'lchash uchun).
function omborQoldiqByNomiAsOf(nomi, asOfDate, excludeHujjat) {
  let kirim = 0, chiqim = 0;
  STORE.ombor.forEach((r) => {
    if (r.nomi !== nomi) return;
    if (asOfDate && r.sana && r.sana > asOfDate) return;
    if (r.turi === "chiqim") { if (excludeHujjat && r.hujjatRaqami === excludeHujjat) return; chiqim += toNum(r.miqdor); }
    else kirim += toNum(r.miqdor);
  });
  return kirim - chiqim;
}

function omborQoldiqByNomi(nomi) {
  return omborQoldiqByNomiAsOf(nomi, null);
}

// Yetishmovchilik sabablari — foydalanuvchiga ko'rsatiladigan matn.
const OMBOR_KAMOMAD_LABEL = {
  kam: "ombor zaxirasi yetarli emas",
  kirim_yoq: "kirim faktura kiritilmagan",
  kirim_kech: "kirim faktura sanasi sotuvdan keyin"
};

// Har bir kerakli xomashyo (consumptions — computeMahsulotConsumption natijasi)
// uchun ombordagi qoldiqni biriktirib qaytaradi. opts.asOfDate — shu sanaga
// nisbatan; opts.excludeHujjat — o'zining sarf qatorlarini chiqarib tashlash.
// Natija bir nom bo'yicha bitta element (takror tarkib nomlari jamlanadi):
//   { nomi, birlik, miqdor(=kerak), qoldiq, yetarli, kamomad, sabab }
//   sabab: "kam" (kirim bor, lekin kam) | "kirim_yoq" (umuman kirim yo'q) | null
function annotateOmborShortages(consumptions, opts) {
  const asOfDate = opts && opts.asOfDate;
  const excl = opts && opts.excludeHujjat;
  const agg = new Map();
  consumptions.forEach((c) => {
    const cur = agg.get(c.nomi) || { nomi: c.nomi, birlik: c.birlik, miqdor: 0 };
    cur.miqdor += toNum(c.miqdor);
    agg.set(c.nomi, cur);
  });
  return Array.from(agg.values()).map((c) => {
    let kirim = 0, chiqim = 0, kirimLifetime = 0;
    STORE.ombor.forEach((r) => {
      if (r.nomi !== c.nomi) return;
      if (r.turi === "chiqim") {
        if (asOfDate && r.sana && r.sana > asOfDate) return;
        if (excl && r.hujjatRaqami === excl) return;
        chiqim += toNum(r.miqdor);
      } else {
        kirimLifetime += toNum(r.miqdor);
        if (asOfDate && r.sana && r.sana > asOfDate) return;
        kirim += toNum(r.miqdor);
      }
    });
    const qoldiq = kirim - chiqim;
    const kamomad = Math.max(0, c.miqdor - qoldiq);
    let sabab = null;
    if (kamomad > 1e-4) {
      if (kirim > 1e-9) sabab = "kam";
      else if (kirimLifetime > 1e-9) sabab = "kirim_kech";
      else sabab = "kirim_yoq";
    }
    return Object.assign({}, c, { qoldiq, yetarli: kamomad <= 1e-4, kamomad, sabab });
  });
}

function checkOmborShortages(consumptions, opts) {
  return annotateOmborShortages(consumptions, opts).filter((c) => !c.yetarli);
}

function updateIshlabChiqarishPreview() {
  const el = document.getElementById("icPreview");
  if (!el) return;
  const mahsulotId = document.getElementById("icMahsulot").value;
  const miqdor = toNum(document.getElementById("icMiqdor").value);
  const sana = document.getElementById("icSana").value || todayISO();
  const m = STORE.mahsulotlar.find((x) => x.id === mahsulotId);
  if (!m || !miqdor) { el.innerHTML = `<span class="faint">Mahsulot va miqdorni kiriting</span>`; return; }

  const { consumptions, tannarx } = computeMahsulotConsumption(m, miqdor, sana);
  const annotated = annotateOmborShortages(consumptions, { asOfDate: sana });
  const hasShortage = annotated.some((c) => !c.yetarli);
  const hasKirimYoq = annotated.some((c) => c.sabab === "kirim_yoq" || c.sabab === "kirim_kech");
  const lines = annotated.map((c) => {
    const izoh = c.yetarli ? "" : ` — ${OMBOR_KAMOMAD_LABEL[c.sabab] || "yetarli emas"} (kamomad: ${fmt(c.kamomad, 3)})`;
    return `<div style="${c.yetarli ? "" : "color:var(--danger,#e5484d);font-weight:600;"}">${escapeHtml(c.nomi)}: ${fmt(c.miqdor, 3)} ${escapeHtml(c.birlik || "")} sarflanadi (${escapeHtml(sana)} holatiga qoldiq: ${fmt(c.qoldiq, 3)})${izoh}</div>`;
  });
  // Ogohlantirish yozuvni SAQLASHGA to'sqinlik qilmaydi (qarang
  // addIshlabChiqarishEntry). "kirim_yoq" — bu xomashyoga umuman kirim faktura
  // kiritilmagan; "kam" — ko'pincha tarkibdagi noto'g'ri norma/birlik (kg
  // o'rniga tonna) yoki kiritilmagan kirim.
  const shortageNote = hasShortage
    ? `<div class="faint" style="margin-top:6px;">${hasKirimYoq
        ? "Yetishmayotgan xomashyoga \"Ombor kirimi\" (yoki \"Faktura kirim\") bo'limida kirim hujjatini kiriting."
        : "Ko'pincha \"Mahsulotlar\"dagi tarkib normasi/birligi noto'g'ri (kg o'rniga tonna) yoki kirim faktura kiritilmaganidan darak beradi. Tekshirish tavsiya etiladi."}</div>`
    : "";
  el.innerHTML = `${lines.join("") || `<span class="faint">Bu mahsulotda tarkib belgilanmagan</span>`}<div style="margin-top:8px;"><b>Taxminiy tannarx: ${fmtSum(tannarx)}</b></div>${shortageNote}`;
}

// Mahsulot kalkulyatsiyasi (tarkib) asosida berilgan miqdor uchun qaysi
// xomashyodan qancha kerakligini va taxminiy tannarxni hisoblaydi — faqat
// hisoblash, bazaga yozmaydi. performMahsulotConsumption va
// applyChiqimTafsilConsumption ikkalasi ham shu funksiyani ishlatadi.
// asOfDate (operatsiya sanasi) berilsa, xomashyo narxi o'sha sanagacha bo'lgan
// kirimlar bo'yicha hisoblanadi — shu bilan eski hujjatlar tannarxi keyinroq
// narx o'zgarishidan ta'sirlanmaydi.
//
// opts.docRef — mavjud "ombor" sarf hujjati raqami ("CHT-<tafsilId>" yoki
// "IC-<icId>"). Berilsa va usul "fifo" bo'lsa, tannarx aynan shu hujjatning
// FIFO daftaridagi qiymatidan olinadi (boshqa sotuvlar bilan navbat izchil).
// Berilmasa — "sana"gacha bo'lgan partiyalar bo'yicha gipotetik FIFO (oldindan
// ko'rish, yoki hali CHT- qatori yaratilmagan holat).
// Qaytaradi: { consumptions, tannarx, kamomadlar[] }
//   kamomadlar — [{nomi, sabab:"kam"|"kirim_yoq", miqdor}] (ombor yetmagan xomashyolar)
function computeMahsulotConsumption(m, miqdor, asOfDate, opts) {
  const docRef = opts && opts.docRef;
  const fifo = fifoUsulActive();
  const consumptions = (m.tarkib || [])
    .map((t) => ({ nomi: t.nomi, birlik: t.birlik, miqdor: toNum(t.norma) * toNum(miqdor) }))
    .filter((c) => c.miqdor > 0);

  // Tannarx bir xil nomdagi tarkibiy qism ikki marta yozilgan bo'lsa ham ikki
  // baravar hisoblanib ketmasligi uchun nomi bo'yicha jamlab hisoblanadi
  // (FIFO byDoc allaqachon shu nom bo'yicha butun sarfni jamlaydi).
  const byNomi = new Map();
  consumptions.forEach((c) => byNomi.set(c.nomi, (byNomi.get(c.nomi) || 0) + c.miqdor));

  let tannarx = 0;
  const kamomadlar = [];
  byNomi.forEach((need, nomi) => {
    if (!fifo) { tannarx += need * avgOmborNarx(nomi, asOfDate); return; }
    const res = docRef ? fifoLedger(nomi).byDoc.get(docRef) : null;
    if (res) {
      tannarx += res.tannarx;
      if (res.kamomad > 1e-9) kamomadlar.push({ nomi, sabab: res.sabab, miqdor: res.kamomad });
    } else {
      const h = fifoHypotheticalCost(nomi, need, asOfDate);
      tannarx += h.tannarx;
      if (h.sabab) kamomadlar.push({ nomi, sabab: h.sabab, miqdor: h.kamomad });
    }
  });
  return { consumptions, tannarx, kamomadlar };
}

// computeMahsulotConsumption natijasini "ombor" jadvaliga turi="chiqim"
// qatorlari sifatida yozadi (hujjatRaqami orqali keyinchalik birgalikda
// topish/o'chirish mumkin). STORE.ombor'ga ham qo'shadi.
async function insertOmborConsumptionRows(consumptions, sana, hujjatRaqami, kontragentNomiLabel) {
  if (!consumptions.length) return true;
  const omborRows = consumptions.map((c) => toDbRow(OMBOR_DB_MAP, {
    sana, hujjatRaqami, kontragentInn: "", kontragentNomi: kontragentNomiLabel,
    nomi: c.nomi, birlik: c.birlik, miqdor: c.miqdor, narx: 0, yetkazibBerishNarxi: 0, qqsSumma: 0, yetkazibBerishNarxiQQSBilan: 0, turi: "chiqim"
  }));
  const { data: omborData, error: omborErr } = await sbClient.from("ombor").insert(omborRows).select();
  if (omborErr) { console.error(omborErr); toast("Yozildi, lekin ombordan ayirishda xatolik", "err"); return false; }
  (omborData || []).forEach((row) => STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, row)));
  invalidateFifo();
  return true;
}

async function insertOmborMahsulotKirimRow(mahsulotNomi, birlik, miqdor, birlikTannarx, sana, hujjatRaqami) {
  if (!miqdor || miqdor <= 0) return true;
  const kirimRow = toDbRow(OMBOR_DB_MAP, {
    sana,
    hujjatRaqami,
    kontragentInn: "",
    kontragentNomi: "Ishlab chiqarishdan kirim (2810)",
    nomi: mahsulotNomi,
    birlik: birlik || "",
    miqdor: miqdor,
    narx: Math.round(birlikTannarx * 100) / 100,
    yetkazibBerishNarxi: 0,
    qqsSumma: 0,
    yetkazibBerishNarxiQQSBilan: 0,
    turi: "kirim"
  });
  const { data, error } = await sbClient.from("ombor").insert(kirimRow).select().single();
  if (error) {
    console.error(error);
    toast("Xomashyo ayirildi, lekin tayyor mahsulotni omborga kirim qilishda xatolik", "err");
    return false;
  }
  STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, data));
  invalidateFifo();
  return true;
}

// Mahsulot kalkulyatsiyasi (tarkib) asosida bitta ishlab chiqarish/sotuv
// yozuvini yaratadi: "ishlab_chiqarish" jadvaliga bitta qator + shu
// mahsulotning har bir xomashyo tarkibiy qismi uchun "ombor" jadvaliga
// turi="chiqim" qatorlari yoziladi (hujjatRaqami="IC-<yozuv id>" — shu orqali
// keyinchalik birgalikda o'chirish/topish mumkin). Shuningdek opts.omborgaKirim
// bo'yicha tayyor mahsulot "kirim" (2810) qatori yoziladi.
async function performMahsulotConsumption(m, miqdor, sana, izoh, foydaNormasi, opts = {}) {
  const customConsumptions = opts.customConsumptions;
  let consumptions, tannarx;

  if (customConsumptions && customConsumptions.length) {
    consumptions = customConsumptions;
    tannarx = opts.tannarx !== undefined ? toNum(opts.tannarx) : customConsumptions.reduce((a, c) => a + toNum(c.summa || (c.miqdor * c.narx)), 0);
  } else {
    const computed = computeMahsulotConsumption(m, miqdor, sana);
    consumptions = computed.consumptions;
    tannarx = computed.tannarx;
  }

  const foyda = (foydaNormasi !== undefined && foydaNormasi !== null) ? toNum(foydaNormasi) : toNum(m.foydaNormasi);
  const finalIzoh = opts.kalkDetails ? formatIshlabChiqarishIzoh(izoh, opts.kalkDetails) : izoh;

  const payload = { sana, mahsulotId: m.id, mahsulotNomi: m.nomi, miqdor, birlik: m.birlik, tannarx, izoh: finalIzoh, foydaNormasi: foyda };
  let { data, error } = await sbClient.from("ishlab_chiqarish").insert(toDbRow(ISHLAB_CHIQARISH_DB_MAP, payload)).select().single();
  if (error && isMissingColumnError(error)) {
    const { foydaNormasi: _drop, ...rest } = payload;
    ({ data, error } = await sbClient.from("ishlab_chiqarish").insert(toDbRow(ISHLAB_CHIQARISH_DB_MAP, rest)).select().single());
  }
  if (error) { reportError(error, "Saqlashda xatolik"); return false; }
  const icRow = fromDbRow(ISHLAB_CHIQARISH_DB_MAP, data);
  STORE.ishlabChiqarish.push(icRow);

  // 1. Ombordan xomashyo chiqimi
  await insertOmborConsumptionRows(consumptions, sana, `IC-${icRow.id}`, `Ishlab chiqarish: ${m.nomi}`);

  // 2. Tayyor mahsulotni omborga kirim qilish (2810 schyot)
  if (opts.omborgaKirim !== false) {
    const birlikTannarx = miqdor > 0 ? tannarx / miqdor : 0;
    await insertOmborMahsulotKirimRow(m.nomi, m.birlik, miqdor, birlikTannarx, sana, `IC-${icRow.id}`);
  }

  updateNavBadges();
  return icRow;
}

/* ------------------- Chiqim faktura → kalkulyatsiya bog'lash ------------------- */
// Chiqim faktura import qilinganda (yoki qo'lda qayta urinilganda) har bir
// sotilgan mahsulot qatori shu mantiq bilan "Mahsulotlar" kalkulyatsiyasiga
// bog'lanadi: avval nomi bo'yicha ANIQ moslik qidiriladi (katta-kichik harf va
// bo'sh joylarga sezgir emas); topilmasa, mahsulot kartochkasida qo'lda
// kiritilgan "Standart sotuv narxi" facturadagi narxga ENG YAQIN bo'lgani
// tanlanadi — LEKIN faqat shu farq CHIQIM_NARX_MATCH_TOLERANCE doirasida
// bo'lsa (aks holda "eng yaqini" baribir juda uzoq bo'lishi mumkin, masalan
// katalogda atigi bitta mahsulot bo'lsa — bunda noto'g'ri mahsulotga bog'lab,
// tannarx/foydani buzishdan ko'ra "mos kelmadi" deb qoldirib, odam tekshirsin
// afzal). Ikkalasi ham topilmasa — SOTILGAN NOM Ombordagi xomashyo nomining
// biriga ANIQ mos kelsa (masalan xomashyoning o'zi to'g'ridan-to'g'ri sotilgan
// bo'lsa), o'sha xomashyo uchun "o'tkazuvchi" (1 birlik = 1 birlik xomashyo)
// mahsulot AVTOMATIK yaratiladi — shu bilan Ombordagi qoldiq/narx asosida
// tannarx to'g'ri hisoblanadi, sotuv "kalkulyatsiya qilinmagan" bo'lib
// qolmaydi. Bu YANGI mahsulot nomi xomashyo nomi bilan AYNAN bir xil
// yaratilgani uchun keyingi shu nomdagi sotuvlar endi 1-qadamning o'zida
// (nomi bo'yicha) avtomatik topiladi — qayta yaratilmaydi.
// Faqat ikkalasi (mahsulot HAM, xomashyo HAM) topilmasa — haqiqatan
// noma'lum nom uchun hech narsa o'ylab topilmaydi (bo'sh tarkibli mahsulot
// avtomatik yaratish "tannarx = 0, foyda = 100%" degan NOTO'G'RI taassurot
// berardi) — bunday holat hamon "kalkulyatsiya qilinmagan" deb qoldiriladi,
// odam tekshirib to'g'ri mahsulotni tanlashi kerak.
const CHIQIM_NARX_MATCH_TOLERANCE = 0.2; // ±20%

/* --------------------- Nomlarni "taxminiy" (fuzzy) solishtirish --------------------- */
// Haqiqiy fakturalarda bir xil mahsulot turlicha yozilib qolishi odatiy hol:
// kirill/lotin ("Полиэтилен труба" / "politilen truba"), imlo xatosi
// ("Плиэтилен", "турба"), katta-kichik harf. Aniq moslik (nomi bo'yicha)
// bunday holatlarni topa olmaydi — shu funksiyalar KICHIK farqlarga chidamli
// qo'shimcha (oxirgi) qidiruv qatlamini ta'minlaydi.
const CYRILLIC_TO_LATIN = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "i", ь: "",
  э: "e", ю: "yu", я: "ya", і: "i", ў: "o", қ: "q", ғ: "g", ҳ: "h"
};

function transliterate(s) {
  return String(s || "").toLowerCase().split("").map((ch) => (CYRILLIC_TO_LATIN[ch] !== undefined ? CYRILLIC_TO_LATIN[ch] : ch)).join("");
}

// Solishtirish uchun "kanonik" shakl: kirill->lotin, faqat harf+raqam qoladi,
// ortiqcha bo'shliqlar yig'iladi.
function normalizeForMatch(s) {
  return transliterate(s).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function extractNumbers(s) {
  return String(s || "").match(/\d+/g) || [];
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

function textSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const FUZZY_MATCH_THRESHOLD = 0.72;

// "nomi"ni "Mahsulotlar" va Ombordagi xomashyo nomlari bilan taxminiy
// solishtirib, ENG YAQIN nomzodni (agar bo'lsa) qaytaradi — bo'sagadan
// (FUZZY_MATCH_THRESHOLD) qat'i nazar, faqat DIAGNOSTIKA uchun ("Kalkulyatsiya
// qilinmagan" ro'yxatida "eng yaqin nomzod" sifatida ko'rsatish). Xavfsizlik
// qoidalari: (1) sotilgan nomda BITTADAN KO'P raqam bo'lsa (masalan bir nechta
// diametrni birlashtirgan qator) — tabiatan noaniq, umuman qidirilmaydi;
// (2) bir tomonda raqam bor, ikkinchisida yo'q bo'lsa — diametri aniqlanmagani
// uchun rad etiladi; (3) ikkala tomonda ham raqam bo'lsa, ULAR MOS KELISHI
// SHART (200mm quvur 76mm bilan aralashib ketmasligi uchun).
function findClosestMahsulotYokiXomashyo(nomi) {
  const soldNorm = normalizeForMatch(nomi);
  const soldNumbers = extractNumbers(soldNorm);
  if (soldNumbers.length > 1) return null;
  const soldText = soldNorm.replace(/\d+/g, "").trim();

  const candidates = [
    ...STORE.mahsulotlar.map((m) => ({ kind: "mahsulot", ref: m, nomi: m.nomi })),
    ...omborKirimRows().reduce((list, r) => {
      if (r.nomi && !list.some((x) => x.nomi === r.nomi)) list.push({ kind: "xomashyo", ref: r, nomi: r.nomi });
      return list;
    }, [])
  ];

  let best = null, bestScore = 0;
  candidates.forEach((c) => {
    const candNorm = normalizeForMatch(c.nomi);
    const candNumbers = extractNumbers(candNorm);
    if ((soldNumbers.length > 0) !== (candNumbers.length > 0)) return;
    if (soldNumbers.length && candNumbers.length && !soldNumbers.some((n) => candNumbers.includes(n))) return;
    const candText = candNorm.replace(/\d+/g, "").trim();
    const score = textSimilarity(soldText, candText);
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return best ? { ...best, score: bestScore } : null;
}

async function matchMahsulotForChiqimLine(nomi, narx) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const targetNomi = norm(nomi);
  const byNomi = STORE.mahsulotlar.find((m) => norm(m.nomi) === targetNomi);
  if (byNomi) return { mahsulot: byNomi, mosTuri: "nomi" };

  const candidates = STORE.mahsulotlar.filter((m) => toNum(m.standartNarxi) > 0);
  if (candidates.length && narx > 0) {
    let best = null;
    let bestDiff = Infinity;
    candidates.forEach((m) => {
      const diff = Math.abs(toNum(m.standartNarxi) - narx);
      if (diff < bestDiff) { bestDiff = diff; best = m; }
    });
    if (best && bestDiff <= narx * CHIQIM_NARX_MATCH_TOLERANCE) return { mahsulot: best, mosTuri: "narx" };
  }

  const xomashyoRow = omborKirimRows().find((r) => norm(r.nomi) === targetNomi);
  if (xomashyoRow) {
    const created = await createOtkazuvchiMahsulot(xomashyoRow.nomi, xomashyoRow.birlik);
    if (created) return { mahsulot: created, mosTuri: "avto" };
  }

  // Imlo xatosi/kirill-lotin farqiga chidamli taxminiy moslik — faqat
  // FUZZY_MATCH_THRESHOLD'dan yuqori bo'lsa avtomatik qo'llaniladi.
  const closest = findClosestMahsulotYokiXomashyo(nomi);
  if (closest && closest.score >= FUZZY_MATCH_THRESHOLD) {
    if (closest.kind === "mahsulot") return { mahsulot: closest.ref, mosTuri: "taxminiy" };
    const created = await createOtkazuvchiMahsulot(closest.ref.nomi, closest.ref.birlik);
    if (created) return { mahsulot: created, mosTuri: "taxminiy" };
  }

  return { mahsulot: null, mosTuri: "none" };
}

// Ombordagi bitta xomashyoni to'g'ridan-to'g'ri sotilganda ishlatish uchun
// "o'tkazuvchi" mahsulot yaratadi: 1 birlik mahsulot = 1 birlik shu xomashyo
// (tarkib normasi = 1) — shu bilan mavjud computeMahsulotConsumption/Ombor
// sarfi mexanizmi o'zgarishsiz ishlaydi. Qarang: matchMahsulotForChiqimLine.
async function createOtkazuvchiMahsulot(nomi, birlik) {
  const payload = { nomi, birlik, tarkib: [{ nomi, birlik, norma: 1 }], standartNarxi: null };
  const { data, error } = await sbClient.from("mahsulotlar").insert(toDbRow(MAHSULOT_DB_MAP, payload)).select().single();
  if (error) { console.error(error); return null; }
  const mahsulot = fromDbRow(MAHSULOT_DB_MAP, data);
  STORE.mahsulotlar.push(mahsulot);
  return mahsulot;
}

// Bitta "chiqim_tafsil" qatoriga mos kalkulyatsiya asosida ombordan xomashyo
// ayiradi (hujjatRaqami="CHT-<tafsil id>" — keyinchalik topish/bekor qilish
// uchun). Faqat mahsulot topilganda chaqiriladi. Zaxira YETARLI bo'lmasa ham
// yozuv baribir amalga oshiriladi (savdo/kalkulyatsiya to'xtatilmaydi) — faqat
// qaysi xomashyolar yetarli emasligi qaytariladi, chaqiruvchi buni foydalanuvchiga
// ko'rsatadi (qarang: checkOmborShortages, handleInvoiceImport, setChiqimTafsilMahsulot).
async function applyChiqimTafsilConsumption(tafsilRow, mahsulot) {
  const { consumptions } = computeMahsulotConsumption(mahsulot, tafsilRow.miqdor, tafsilRow.sana);
  // Sarf yozilishidan OLDIN, sotuv sanasiga nisbatan tekshiramiz.
  const shortages = checkOmborShortages(consumptions, { asOfDate: tafsilRow.sana });
  await insertOmborConsumptionRows(consumptions, tafsilRow.sana, `CHT-${tafsilRow.id}`, `Sotuv (kalkulyatsiya): ${mahsulot.nomi}`);
  updateNavBadges();
  return shortages;
}

// Avval shu tafsil qatoriga tegishli "CHT-<id>" ombor qatorlari bo'lsa
// o'chiradi (eski sarfni bekor qiladi/inventarni qaytaradi), so'ng
// chiqim_tafsil.mahsulot_id'ni yangilaydi va (agar mahsulot berilgan bo'lsa)
// yangisiga qarab qayta sarflaydi. Ham "Kalkulyatsiya" blankasidagi qo'lda
// tanlash, ham rematchChiqimTafsil/rematchAllChiqimTafsil shu funksiyani
// ishlatadi. Qaytaradi: { ok, shortages } — shortages faqat mahsulot topilgan
// va ombor zaxirasi yetarli bo'lmagan xomashyolar ro'yxati (bo'sh bo'lishi mumkin).
async function setChiqimTafsilMahsulot(tafsilId, mahsulotId, mosTuri) {
  const tafsil = STORE.chiqimTafsil.find((t) => t.id === tafsilId);
  if (!tafsil) return { ok: false, shortages: [] };

  const oldOmborRows = STORE.ombor.filter((r) => r.turi === "chiqim" && r.hujjatRaqami === `CHT-${tafsilId}`);
  if (oldOmborRows.length) {
    const ids = oldOmborRows.map((r) => r.id);
    const { error } = await sbClient.from("ombor").delete().in("id", ids);
    if (error) { reportError(error, "Eski sarfni bekor qilishda xatolik"); return { ok: false, shortages: [] }; }
    STORE.ombor = STORE.ombor.filter((r) => !ids.includes(r.id));
    invalidateFifo();
  }

  const mahsulot = mahsulotId ? STORE.mahsulotlar.find((m) => m.id === mahsulotId) : null;
  const { data, error } = await sbClient.from("chiqim_tafsil")
    .update(toDbRow(CHIQIM_TAFSIL_DB_MAP, { mahsulotId: mahsulot ? mahsulot.id : null, mosTuri: mosTuri || (mahsulot ? "qolda" : "none") }))
    .eq("id", tafsilId).select().single();
  if (error) { reportError(error, "Saqlashda xatolik"); return { ok: false, shortages: [] }; }
  const idx = STORE.chiqimTafsil.findIndex((t) => t.id === tafsilId);
  if (idx >= 0) STORE.chiqimTafsil[idx] = fromDbRow(CHIQIM_TAFSIL_DB_MAP, data);

  let shortages = [];
  if (mahsulot) shortages = await applyChiqimTafsilConsumption(STORE.chiqimTafsil[idx], mahsulot);
  updateNavBadges();
  return { ok: true, shortages };
}

function shortageToastSuffix(shortages) {
  if (!shortages.length) return "";
  const bySabab = {};
  shortages.forEach((s) => { (bySabab[s.sabab || "kam"] = bySabab[s.sabab || "kam"] || []).push(s.nomi); });
  const parts = Object.keys(bySabab).map((k) => `${OMBOR_KAMOMAD_LABEL[k] || k}: ${bySabab[k].join(", ")}`);
  return ` — DIQQAT: ${parts.join("; ")}`;
}

// "Kalkulyatsiya qilinmagan" ro'yxatidagi "Yangilash" tugmasi — foydalanuvchi
// yangi mahsulot/standart narx qo'shgandan keyin joriy STORE.mahsulotlar
// asosida moslashtirishni qayta urinadi.
async function rematchChiqimTafsil(tafsilId) {
  const tafsil = STORE.chiqimTafsil.find((t) => t.id === tafsilId);
  if (!tafsil) return;
  const { mahsulot, mosTuri } = await matchMahsulotForChiqimLine(tafsil.nomi, tafsil.narx);
  if (!mahsulot) { toast("Hamon mos kalkulyatsiya topilmadi"); return; }
  const { ok, shortages } = await setChiqimTafsilMahsulot(tafsilId, mahsulot.id, mosTuri);
  if (ok) toast(`"${mahsulot.nomi}" kalkulyatsiyasi bilan bog'landi${shortageToastSuffix(shortages)}`, shortages.length ? "err" : "ok");
}

// "Barchasini qayta moslashtirish" — Ishlab chiqarish sahifasidagi "Kalkulyatsiya
// qilinmagan sotuvlar" ro'yxatidagi HAMMA qatorni bittalab bosish o'rniga bir
// marta bosib, mavjud mahsulot katalogi bo'yicha qayta moslashtirishga urinadi
// (masalan bir nechta yangi mahsulot/standart narx qo'shilgandan keyin).
// btnEl berilsa — jarayon davomida tugmada "X / Y" progress ko'rsatiladi.
async function rematchAllChiqimTafsil(btnEl) {
  const uncosted = STORE.chiqimTafsil.filter((t) => !t.mahsulotId);
  if (!uncosted.length) { toast("Kalkulyatsiya qilinmagan qator yo'q"); return; }

  const origLabel = btnEl ? btnEl.textContent : "";
  if (btnEl) { btnEl.disabled = true; }
  const byMos = { nomi: 0, narx: 0, avto: 0, taxminiy: 0 };
  const kamomadNomlar = { kam: new Set(), kirim_kech: new Set(), kirim_yoq: new Set() };
  let matched = 0, shortageRows = 0;

  for (let i = 0; i < uncosted.length; i++) {
    if (btnEl) btnEl.textContent = `Moslashtirilmoqda… ${i + 1} / ${uncosted.length}`;
    const t = uncosted[i];
    const { mahsulot, mosTuri } = await matchMahsulotForChiqimLine(t.nomi, t.narx);
    if (!mahsulot) continue;
    const { ok, shortages } = await setChiqimTafsilMahsulot(t.id, mahsulot.id, mosTuri);
    if (!ok) continue;
    matched++;
    if (byMos[mosTuri] !== undefined) byMos[mosTuri]++;
    if (shortages.length) {
      shortageRows++;
      shortages.forEach((s) => { (kamomadNomlar[s.sabab] || kamomadNomlar.kam).add(s.nomi); });
    }
  }

  if (btnEl) { btnEl.disabled = false; btnEl.textContent = origLabel; }
  invalidateFifo();
  renderIshlabChiqarish();

  const stillUnmatched = uncosted.length - matched;
  const mosQism = Object.entries(byMos).filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ta ${CHIQIM_TAFSIL_MOS_LABEL_QISQA[k] || k}`).join(", ");
  let msg = `${matched} ta bog'landi${mosQism ? ` (${mosQism})` : ""}`;
  if (stillUnmatched) msg += `; ${stillUnmatched} ta hali mos kelmadi`;
  const kamParts = Object.entries(kamomadNomlar).filter(([, set]) => set.size)
    .map(([k, set]) => `${OMBOR_KAMOMAD_LABEL[k]}: ${[...set].slice(0, 4).join(", ")}${set.size > 4 ? "…" : ""}`);
  if (kamParts.length) msg += `; ombor — ${kamParts.join("; ")}`;
  toast(msg, (stillUnmatched || shortageRows) ? "err" : "ok");
}

const CHIQIM_TAFSIL_MOS_LABEL_QISQA = {
  nomi: "nomi bo'yicha", narx: "narxi bo'yicha", avto: "xomashyo sifatida", taxminiy: "taxminiy (tekshiring)"
};

const CHIQIM_TAFSIL_MOS_LABEL = {
  nomi: '<span class="pill pill-ok">Nomi bo\'yicha</span>',
  narx: '<span class="pill pill-warn">Narxi bo\'yicha</span>',
  avto: '<span class="pill pill-warn">Xomashyo sifatida avto</span>',
  taxminiy: '<span class="pill pill-warn">Taxminiy (tekshiring!)</span>',
  qolda: '<span class="pill pill-muted">Qo\'lda tanlangan</span>',
  none: '<span class="pill pill-danger">Mos kelmadi</span>'
};

// Bitta chiqim fakturaning kalkulyatsiya bo'yicha aniqlangan sotuv summasi,
// xomashyo tannarxi, foydasi va undan hisoblangan taxminiy foyda solig'i
// ulushi (STORE.settings.foydaStavka bo'yicha). Faqat kalkulyatsiya bilan
// bog'langan (mahsulotId mavjud) qatorlar tannarxga qo'shiladi — bog'lanmagan
// qatorlarning sotuv summasi baribir hisoblanadi, lekin tannarxi noma'lum
// bo'lgani uchun ularning "foydasi" haqiqatdan kattaroq ko'rinishi mumkin.
function computeChiqimKalkulyatsiyaFoyda(chiqimId) {
  const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);
  const defFoyda = Math.max(0, Math.min(0.95, toNum(STORE.settings.defaultFoydaNormasi != null ? STORE.settings.defaultFoydaNormasi : 0.2)));
  let savdo = 0, xomashyoTannarx = 0, xizmatUlushi = 0, taxminiyTannarx = 0, kalkulyatsiyasizSoni = 0;
  rows.forEach((t) => {
    const qatorSavdo = toNum(t.summa) || toNum(t.miqdor) * toNum(t.narx);
    savdo += qatorSavdo;
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    if (mahsulot) {
      xomashyoTannarx += computeMahsulotConsumption(mahsulot, t.miqdor, t.sana, { docRef: "CHT-" + t.id }).tannarx;
      xizmatUlushi += xizmatTannarxUlushi(t.sana, t.miqdor);
    } else {
      kalkulyatsiyasizSoni++;
      taxminiyTannarx += qatorSavdo * (1 - defFoyda);
    }
  });
  const tannarx = xomashyoTannarx + xizmatUlushi + taxminiyTannarx;
  const foyda = savdo - tannarx;
  const foydaStavka = toNum(STORE.settings.foydaStavka);
  const soligi = Math.max(foyda, 0) * (foydaStavka / 100);
  return { savdo, tannarx, xomashyoTannarx, xizmatUlushi, taxminiyTannarx, kalkulyatsiyasizSoni, foyda, foydaStavka, soligi };
}

// Bitta chiqim fakturaning sotilgan mahsulot qatorlarini va ularning
// kalkulyatsiya bilan bog'lanishini ko'rsatadigan/tahrirlaydigan oyna
// ("blanka"). "Kalkulyatsiya" ustunidagi <select> o'zgartirilganda darhol
// setChiqimTafsilMahsulot chaqirilib, ombor sarfi ham qayta hisoblanadi.
function openChiqimKalkulyatsiyaModal(chiqimId) {
  const chiqimRow = STORE.chiqim.find((r) => r.id === chiqimId);
  if (!chiqimRow) return;
  const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);

  // Hisob holati chizig'i (yumshoq tasdiq) + tez tugmalar.
  const holat = computeChiqimHisobHolati(chiqimId);
  const holatMeta = CHIQIM_HOLAT_META[holat.holat];
  const kamomadXom = (holat.sabablar.find((s) => s.turi === "ombor") || {}).xomashyolar || [];
  const kalkMuammo = holat.sabablar.some((s) => s.turi === "kalkulyatsiyasiz" || s.turi === "taxminiy_moslik" || s.turi === "qatorsiz");
  const holatStripHtml = (holatMeta && holatMeta.rank > 0) ? `
    <div class="note ${holat.holat === "tasdiqlanmagan" ? "" : "warn"}" style="margin-bottom:12px;${holat.holat === "tasdiqlanmagan" ? "border-color:var(--danger);background:var(--danger-soft);color:var(--danger);" : ""}">
      <b>${holatMeta.text}.</b> ${escapeHtml(chiqimHisobHolatiText(holat.sabablar))}
      <div class="page-actions" style="margin-top:8px;gap:6px;flex-wrap:wrap;">
        ${kamomadXom.map((x) => `<button class="btn btn-sm" data-add-kirim="${escapeHtml(x.nomi)}">+ "${escapeHtml(x.nomi)}" ga kirim</button>`).join("")}
        ${kalkMuammo ? `<button class="btn btn-sm" id="btnFocusKalk">Kalkulyatsiyani tanlash</button>` : ""}
        ${!chiqimRow.tovarsiz ? `<button class="btn btn-sm" id="btnMarkTovarsiz">Tovarsiz sotuv deb belgilash</button>` : ""}
      </div>
    </div>
  ` : "";

  const mahsulotOptions = (selectedId) => `<option value="">— tanlanmagan —</option>` +
    STORE.mahsulotlar.map((m) => `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${escapeHtml(m.nomi)}</option>`).join("");

  const bodyHtml = rows.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nomi (facturada)</th><th class="num">Miqdor</th><th class="num">Narx</th><th>Kalkulyatsiya</th><th>Holat</th></tr></thead>
        <tbody>
          ${rows.map((t) => `
            <tr data-tafsil-id="${t.id}">
              <td>${escapeHtml(t.nomi)}</td>
              <td class="num">${fmt(t.miqdor, 3)} ${escapeHtml(t.birlik || "")}</td>
              <td class="num">${fmtSum(t.narx)}</td>
              <td><select class="search-input" data-tafsil-select="${t.id}">${mahsulotOptions(t.mahsulotId)}</select></td>
              <td>${CHIQIM_TAFSIL_MOS_LABEL[t.mosTuri] || CHIQIM_TAFSIL_MOS_LABEL.none}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<p class="modal-sub">Bu faktura uchun mahsulot qatorlari topilmadi — fayl import qilinganda mahsulot ustunlari aniqlanmagan bo'lishi mumkin (masalan faylda faqat hujjat jami summasi bo'lgan, mahsulot nomi/miqdori bo'lmagan), yoki asl import faylidan alohida sabab bilan (masalan .json'dan tiklashda) yo'qolgan bo'lishi mumkin. Pastdan qo'lda qo'shishingiz mumkin.</p>`;

  // Mahsulot qatori umuman topilmagan (yoki qo'shimcha qator kerak bo'lgan)
  // hollarda — masalan asl import fayli yo'qolgan/topilmaydigan hujjatlar
  // uchun — qo'lda qator qo'shish imkoni. addChiqimTafsilRow shu yerdagi
  // maydonlardan o'qib, yangi chiqim_tafsil qatorini yaratadi va (mahsulot
  // tanlangan bo'lsa) ombordan avtomat sarflaydi.
  const addRowHtml = `
    <div class="card section" style="margin-top:12px;">
      <div class="card-title">Mahsulot qatorini qo'lda qo'shish</div>
      <div class="field-row" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="flex:2;min-width:160px;"><label>Mahsulot</label><select id="newTafsilMahsulot">${mahsulotOptions()}</select></div>
        <div class="field" style="flex:1;min-width:90px;"><label>Miqdor</label><input id="newTafsilMiqdor" type="number" step="any"></div>
        <div class="field" style="flex:1;min-width:90px;"><label>Narx</label><input id="newTafsilNarx" type="number" step="any"></div>
        <button class="btn btn-sm" id="btnAddTafsilRow">+ Qo'shish</button>
      </div>
    </div>
  `;

  const foydaInfo = computeChiqimKalkulyatsiyaFoyda(chiqimId);
  const { materials } = computeChiqimMaterialBreakdown(chiqimId);
  const materialsHtml = materials.length ? `
    <div class="table-wrap" style="margin-top:12px;">
      <div class="card-title" style="margin-bottom:4px;">Sarflangan xomashyo (bosma blankadagi 2-bo'lim bilan bir xil)</div>
      <table>
        <thead><tr><th>Xomashyo nomi</th><th class="num">Birlik</th><th class="num">Miqdori</th><th class="num">Narxi</th><th class="num">Summa</th></tr></thead>
        <tbody>
          ${materials.map((c) => `
            <tr>
              <td>${escapeHtml(c.nomi)}</td>
              <td class="num">${escapeHtml(c.birlik || "")}</td>
              <td class="num">${fmt(c.miqdor, 3)}</td>
              <td class="num">${fmtSum(c.narx)}</td>
              <td class="num">${fmtSum(c.summa)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : "";
  const foydaHtml = rows.length ? `
    <div class="note" style="margin-top:12px;">
      <div class="report-line"><span class="label">Sotuv summasi</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.savdo)}</span></div>
      <div class="report-line"><span class="label">Xomashyo tannarxi</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.xomashyoTannarx)}</span></div>
      ${foydaInfo.xizmatUlushi ? `<div class="report-line"><span class="label">+ Xizmat xarajati ulushi (bank)</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.xizmatUlushi)}</span></div>` : ""}
      <div class="report-line"><span class="label"><b>Foyda</b></span><span class="code"></span><span class="val"><b>${fmtSum(foydaInfo.foyda)}</b></span></div>
      <div class="report-line"><span class="label">Taxminiy foyda solig'i (${fmt(foydaInfo.foydaStavka)}%)</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.soligi)}</span></div>
    </div>
  ` : "";

  openModal(`
    <h3>Kalkulyatsiya — faktura ${escapeHtml(chiqimRow.hujjatRaqami || "")}</h3>
    <p class="modal-sub">${escapeHtml(chiqimRow.sana || "")} &middot; ${escapeHtml(chiqimRow.kontragentNomi || "")}. Kalkulyatsiya ustunini o'zgartirsangiz, eski ombor sarfi bekor qilinib, yangisiga qarab qayta hisoblanadi.</p>
    ${holatStripHtml}
    ${bodyHtml}
    ${addRowHtml}
    ${materialsHtml}
    ${foydaHtml}
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
      ${rows.length ? `<button class="btn" id="mPrintDalolatnoma">Sarflash dalolatnomasi</button>` : ""}
      ${rows.length ? `<button class="btn btn-primary" id="mPrint">Chop etish</button>` : ""}
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const printBtn = document.getElementById("mPrint");
  if (printBtn) printBtn.addEventListener("click", () => printChiqimKalkulyatsiyaBlanka(chiqimId));
  const printDalolatnomaBtn = document.getElementById("mPrintDalolatnoma");
  if (printDalolatnomaBtn) printDalolatnomaBtn.addEventListener("click", () => printMahsulotSarflashDalolatnomasi(chiqimId));
  document.querySelectorAll("[data-tafsil-select]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const tafsilId = sel.dataset.tafsilSelect;
      const mahsulotId = sel.value || null;
      const { ok, shortages } = await setChiqimTafsilMahsulot(tafsilId, mahsulotId, mahsulotId ? "qolda" : "none");
      if (ok) {
        openChiqimKalkulyatsiyaModal(chiqimId);
        toast(`Yangilandi${shortageToastSuffix(shortages)}`, shortages.length ? "err" : "ok");
      }
    });
  });
  document.getElementById("btnAddTafsilRow").addEventListener("click", () => addChiqimTafsilRow(chiqimRow));

  document.querySelectorAll("[data-add-kirim]").forEach((b) => b.addEventListener("click", () => {
    openOmborKirimQuickAddModal(b.dataset.addKirim, chiqimRow.sana, () => openChiqimKalkulyatsiyaModal(chiqimId));
  }));
  const btnFocusKalk = document.getElementById("btnFocusKalk");
  if (btnFocusKalk) btnFocusKalk.addEventListener("click", () => {
    const selects = [...document.querySelectorAll('[data-tafsil-select]')];
    const target = selects.find((s) => !s.value) || selects[0] || document.getElementById("newTafsilMahsulot");
    if (target) { target.focus(); if (target.scrollIntoView) target.scrollIntoView({ block: "center" }); }
  });
  const btnMarkTovarsiz = document.getElementById("btnMarkTovarsiz");
  if (btnMarkTovarsiz) btnMarkTovarsiz.addEventListener("click", async () => {
    if (!confirm("Bu faktura 'tovarsiz sotuv' (xizmat/vositachilik) deb belgilansinmi? Kalkulyatsiya talab qilinmaydi va hisob holati 'tovarsiz' bo'ladi.")) return;
    chiqimRow.tovarsiz = true;
    pushFieldsUpdate("chiqim", chiqimId, { tovarsiz: true });
    invalidateFifo();
    saveStore();
    closeModal();
    if (CURRENT_PAGE === "chiqim") renderInvoiceTable("chiqim");
    toast("'Tovarsiz sotuv' deb belgilandi");
  });
}

// Yetishmayotgan xomashyoga tez kirim qatori qo'shish (kalkulyatsiya oynasidan).
// Odatda bu "Faktura kirim" import orqali keladi — bu faqat qo'lda to'ldirish.
function openOmborKirimQuickAddModal(nomiPrefill, sanaPrefill, onDone) {
  openModal(`
    <h3>Ombor kirimi qo'shish</h3>
    <p class="modal-sub">Yetishmayotgan xomashyoga kirim qatori. Odatda "Faktura kirim" faylidan avtomat keladi — bu tez to'ldirish uchun.</p>
    <div class="field"><label>Nomi</label><input id="qkNomi" value="${escapeHtml(nomiPrefill || "")}"></div>
    <div class="field"><label>Sana</label><input type="date" id="qkSana" value="${escapeHtml(sanaPrefill || todayISO())}"></div>
    <div class="field-row" style="display:flex;gap:8px;">
      <div class="field" style="flex:1;"><label>Miqdor</label><input id="qkMiqdor" type="number" step="any"></div>
      <div class="field" style="flex:1;"><label>Birlik</label><input id="qkBirlik" placeholder="dona / kg / m"></div>
    </div>
    <div class="field"><label>Yetkazib berish narxi (QQSsiz, jami summa)</label><input id="qkBaza" type="number" step="any"></div>
    <div class="modal-actions"><button class="btn" id="mCancel">Bekor</button><button class="btn btn-primary" id="mSave">Saqlash</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", async () => {
    const nomi = document.getElementById("qkNomi").value.trim();
    const miqdor = toNum(document.getElementById("qkMiqdor").value);
    const baza = toNum(document.getElementById("qkBaza").value);
    if (!nomi || !miqdor) { toast("Nom va miqdorni kiriting", "err"); return; }
    const newRow = {
      sana: document.getElementById("qkSana").value || todayISO(), hujjatRaqami: "",
      kontragentInn: "", kontragentNomi: "Qo'lda kirim",
      nomi, birlik: document.getElementById("qkBirlik").value.trim(),
      miqdor, narx: miqdor ? baza / miqdor : 0, yetkazibBerishNarxi: baza, qqsSumma: 0,
      yetkazibBerishNarxiQQSBilan: baza, turi: "kirim"
    };
    const { data, error } = await sbClient.from("ombor").insert(toDbRow(OMBOR_DB_MAP, newRow)).select().single();
    if (error) { reportError(error, "Qo'shishda xatolik"); return; }
    STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, data));
    invalidateFifo();
    updateNavBadges();
    saveStore();
    closeModal();
    toast("Ombor kirimi qo'shildi");
    if (onDone) onDone();
  });
}

async function addChiqimTafsilRow(chiqimRow) {
  const mahsulotId = document.getElementById("newTafsilMahsulot").value;
  const miqdor = toNum(document.getElementById("newTafsilMiqdor").value);
  const narx = toNum(document.getElementById("newTafsilNarx").value);
  if (!mahsulotId) { toast("Mahsulotni tanlang", "err"); return; }
  if (!miqdor) { toast("Miqdorni kiriting", "err"); return; }
  const mahsulot = STORE.mahsulotlar.find((m) => m.id === mahsulotId);
  if (!mahsulot) return;

  const tafsilPayload = {
    chiqimId: chiqimRow.id, hujjatRaqami: chiqimRow.hujjatRaqami, sana: chiqimRow.sana,
    nomi: mahsulot.nomi, birlik: mahsulot.birlik, miqdor, narx, summa: miqdor * narx,
    mahsulotId: mahsulot.id, mosTuri: "qolda", faylId: null
  };
  let tafsilRow;
  try {
    const { data, error } = await sbClient.from("chiqim_tafsil").insert(toDbRow(CHIQIM_TAFSIL_DB_MAP, tafsilPayload)).select().single();
    if (error) throw error;
    tafsilRow = fromDbRow(CHIQIM_TAFSIL_DB_MAP, data);
  } catch (error) {
    console.error(error);
    toast(isPermissionError(error) ? "Sizda bu amal uchun ruxsat yo'q (faqat admin)" : "Qo'shishda xatolik", "err");
    return;
  }
  STORE.chiqimTafsil.push(tafsilRow);
  const shortages = await applyChiqimTafsilConsumption(tafsilRow, mahsulot);
  saveStore();
  openChiqimKalkulyatsiyaModal(chiqimRow.id);
  toast(`Qo'shildi${shortageToastSuffix(shortages)}`, shortages.length ? "err" : "ok");
}

// Bitta chiqim fakturaning barcha sotilgan mahsulot qatorlari bo'yicha
// (kalkulyatsiya orqali) kerak bo'lgan xomashyoni, BIR XIL nomdagilarni
// yig'gan holda va har birining sanaga mos o'rtacha narxi bilan qaytaradi.
// openChiqimKalkulyatsiyaModal (pechatdan oldin ko'rib chiqish) va
// printChiqimKalkulyatsiyaBlanka (bosma blanka) ikkalasi ham shu bitta
// funksiyani ishlatadi — shu bilan ekrandagi va bosmadagi summalar hech
// qachon bir-biridan farq qilmaydi.
function computeChiqimMaterialBreakdown(chiqimId) {
  const chiqimRow = STORE.chiqim.find((r) => r.id === chiqimId);
  const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);
  const fifo = fifoUsulActive();
  const materialMap = new Map();
  rows.forEach((t) => {
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    if (!mahsulot) return;
    // Bir tafsil qatori ichida bir xil xomashyoni nomi bo'yicha jamlaymiz —
    // FIFO byDoc allaqachon shu nom bo'yicha butun sarfni jamlagani uchun, aks
    // holda ikki baravar qo'shilib ketardi.
    const perNomi = new Map();
    computeMahsulotConsumption(mahsulot, t.miqdor, t.sana).consumptions.forEach((c) => {
      const p = perNomi.get(c.nomi) || { birlik: c.birlik, miqdor: 0 };
      p.miqdor += c.miqdor;
      perNomi.set(c.nomi, p);
    });
    perNomi.forEach((p, nomi) => {
      const cur = materialMap.get(nomi) || { nomi, birlik: p.birlik, miqdor: 0, summa: 0 };
      cur.miqdor += p.miqdor;
      if (fifo) {
        const d = fifoLedger(nomi).byDoc.get("CHT-" + t.id);
        cur.summa += d ? d.tannarx : fifoHypotheticalCost(nomi, p.miqdor, t.sana).tannarx;
      }
      materialMap.set(nomi, cur);
    });
  });
  const asOfDate = chiqimRow ? chiqimRow.sana : null;
  let total = 0;
  const materials = Array.from(materialMap.values()).map((c) => {
    const summa = fifo ? c.summa : c.miqdor * avgOmborNarx(c.nomi, asOfDate);
    const narx = c.miqdor ? summa / c.miqdor : 0;
    total += summa;
    return { nomi: c.nomi, birlik: c.birlik, miqdor: c.miqdor, narx, summa };
  });
  return { materials, total };
}

// openChiqimKalkulyatsiyaModal bilan bir xil ma'lumot, lekin rasmiy hujjat
// (blanka) ko'rinishida chop etish uchun — printSverkaPdf naqshi bo'yicha.
// Rasmiy "KALKULYATSIYA" blankasi andazasi (UTVERJDAYU + ikki bo'limli
// jadval: 1) sotilgan mahsulotlar, 2) sarflangan xomashyo — moslashtirilgan
// avtotransport ta'mirlash kalkulyatsiyasi blankasi asosida) bo'yicha chop
// etish. printSverkaPdf/Акт sverki bilan bir xil window.open+print naqshi.
function printChiqimKalkulyatsiyaBlanka(chiqimId) {
  const chiqimRow = STORE.chiqim.find((r) => r.id === chiqimId);
  if (!chiqimRow) return;
  const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);
  const s = STORE.settings;

  // 1-bo'lim: facturadagi har bir sotilgan mahsulot qatori — mos kalkulyatsiya
  // nomi bilan birga (rasmiy blankadagi "Наименование работ" jadvaliga mos).
  let productsTotal = 0;
  const productRows = rows.map((t, i) => {
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    const summa = toNum(t.summa) || toNum(t.miqdor) * toNum(t.narx);
    productsTotal += summa;
    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(t.nomi)}${mahsulot ? "" : ` <i>(kalkulyatsiya qilinmagan)</i>`}</td>
        <td class="num">${fmt(t.miqdor, 3)} ${escapeHtml(t.birlik || "")}</td>
        <td class="num">${fmtSum(t.narx)}</td>
        <td class="num">${fmtSum(summa)}</td>
      </tr>
    `;
  }).join("");

  // 2-bo'lim: har bir sotilgan mahsulotning kalkulyatsiyasi (tarkib) asosida
  // kerak bo'lgan xomashyo, BIR XIL nomdagilar butun faktura bo'yicha
  // yig'ilgan holda (rasmiy blankadagi "Стоимость материалов" jadvaliga mos).
  // computeChiqimMaterialBreakdown — bir xil hisob openChiqimKalkulyatsiyaModal
  // oldindan ko'rishida ham ishlatiladi, shu bilan ekran va bosma natija
  // hech qachon bir-biridan farq qilmaydi.
  const { materials, total: materialsTotal } = computeChiqimMaterialBreakdown(chiqimId);
  const materialRows = materials.map((c) => `
      <tr>
        <td>${escapeHtml(c.nomi)}</td>
        <td class="num">${escapeHtml(c.birlik || "")}</td>
        <td class="num">${fmt(c.miqdor, 3)}</td>
        <td class="num">${fmtSum(c.narx)}</td>
        <td class="num">${fmtSum(c.summa)}</td>
      </tr>
    `).join("");

  // 3-bo'lim: shu ikki jamidan hisoblangan foyda va undan taxminiy foyda
  // solig'i ulushi (STORE.settings.foydaStavka bo'yicha) — computeTotals()
  // orqali Foyda solig'i hisobotidagi umumiy soliq bilan bir xil stavka.
  // "Xizmat" deb belgilangan bank chiqimlaridan shu faktura oyiga tegishli
  // ulush — computeChiqimKalkulyatsiyaFoyda bilan bir xil manba, shu bilan
  // ekrandagi modal va bosma blanka hech qachon farq qilmaydi.
  const xizmatUlushi = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId)
    .reduce((sum, t) => sum + (t.mahsulotId ? xizmatTannarxUlushi(t.sana, t.miqdor) : 0), 0);
  const foydaInfo = { foyda: productsTotal - materialsTotal - xizmatUlushi, foydaStavka: toNum(s.foydaStavka) };
  foydaInfo.soligi = Math.max(foydaInfo.foyda, 0) * (foydaInfo.foydaStavka / 100);

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Kalkulyatsiya ${escapeHtml(chiqimRow.hujjatRaqami || "")}</title>
      <style>
        @page{size:A4; margin:14mm 12mm;}
        body{font-family:Arial, "Segoe UI", sans-serif; padding:32px; color:#1c2530; font-size:12.5px;}
        .approve{float:right; text-align:center; width:260px; font-size:12px;}
        .approve .line{margin-top:6px;}
        .approve .dots{border-bottom:1px dotted #1c2530; display:inline-block; min-width:170px;}
        h1{font-size:19px; text-align:center; margin:70px 0 14px;}
        .meta{font-size:12.5px; margin-bottom:6px;}
        .meta b{font-weight:700;}
        .section-title{font-weight:700; margin:20px 0 8px; font-size:13px; break-after:avoid;}
        table{width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:6px;}
        thead{display:table-header-group;}
        tr{break-inside:avoid;}
        th, td{border:1px solid #1c2530; padding:5px 8px; text-align:left;}
        th{background:#eceff2; text-align:center;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        .jami{margin:6px 0 0; font-weight:700; break-inside:avoid;}
        .sign{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:48px; font-size:12px; break-inside:avoid;}
        .sign .line{margin-top:36px; border-top:1px solid #1c2530; padding-top:4px; width:80%;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <div class="approve">
        «ТАСДИҚЛАЙМАН»<br>
        ${escapeHtml(s.companyName)} rahbari<br>
        <span class="dots">${escapeHtml(s.rahbar || "")}</span>
        <div class="line">«____» ______________ 20____ y.</div>
      </div>
      <div style="clear:both;"></div>
      <h1>KALKULYATSIYA № ${escapeHtml(chiqimRow.hujjatRaqami || "")}</h1>
      <div class="meta"><b>Mavzu:</b> Sotilgan mahsulot tannarxi bo'yicha kalkulyatsiya &nbsp; <b>Asos:</b> Faktura № ${escapeHtml(chiqimRow.hujjatRaqami || "")}, ${escapeHtml(chiqimRow.sana || "")}</div>
      <div class="meta"><b>Xaridor:</b> ${escapeHtml(chiqimRow.kontragentNomi || "")} (INN ${escapeHtml(chiqimRow.kontragentInn || "")})</div>

      <div class="section-title">1. Sotilgan mahsulotlar qiymati</div>
      <table>
        <thead><tr><th>№</th><th>Mahsulot nomi</th><th class="num">Miqdori</th><th class="num">Narxi</th><th class="num">Summa</th></tr></thead>
        <tbody>${productRows || `<tr><td colspan="5" style="text-align:center;">Mahsulot qatorlari topilmadi</td></tr>`}</tbody>
      </table>
      <div class="jami">JAMI: sotilgan mahsulotlar summasi — ${fmtSum(productsTotal)}</div>

      <div class="section-title">2. Sarflangan xomashyo (tannarx)</div>
      <table>
        <thead><tr><th>Xomashyo nomi</th><th class="num">O'lchov birligi</th><th class="num">Miqdori</th><th class="num">Narxi</th><th class="num">Summa</th></tr></thead>
        <tbody>${materialRows || `<tr><td colspan="5" style="text-align:center;">Kalkulyatsiya qilingan xomashyo topilmadi</td></tr>`}</tbody>
      </table>
      <div class="jami">JAMI: xomashyo tannarxi — ${fmtSum(materialsTotal)}</div>

      <div class="section-title">3. Natija</div>
      <table>
        <tbody>
          <tr><td>Sotilgan mahsulotlar summasi</td><td class="num">${fmtSum(productsTotal)}</td></tr>
          <tr><td>Xomashyo tannarxi</td><td class="num">${fmtSum(materialsTotal)}</td></tr>
          ${xizmatUlushi ? `<tr><td>Xizmat xarajati ulushi (bank)</td><td class="num">${fmtSum(xizmatUlushi)}</td></tr>` : ""}
          <tr><td><b>Foyda</b></td><td class="num"><b>${fmtSum(foydaInfo.foyda)}</b></td></tr>
          <tr><td>Foyda solig'i (${fmt(foydaInfo.foydaStavka)}%)</td><td class="num">${fmtSum(foydaInfo.soligi)}</td></tr>
        </tbody>
      </table>

      <div class="sign">
        <div>Tuzdi (buxgalter)<div class="line"></div></div>
        <div>Tasdiqladi (rahbar)<div class="line"></div></div>
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

/* -------------------- Butun sonni o'zbekcha so'zga o'girish -------------------- */
// "Jami sarflandilar: ... (miqdori so'z bilan yoziladi)" kabi rasmiy
// dalolatnoma maydonlari uchun. Faqat butun qismni so'zlaydi (kasr qism
// jadvalning o'zida raqamda ko'rinadi) — milliardgacha yetarli.
const SON_BIRLIK_SOZ = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const SON_ONLIK_SOZ = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];

function sonUchXonaliSoz(n) {
  const parts = [];
  const yuz = Math.floor(n / 100);
  const qoldiq = n % 100;
  if (yuz) parts.push((yuz > 1 ? SON_BIRLIK_SOZ[yuz] + " " : "") + "yuz");
  const onlik = Math.floor(qoldiq / 10);
  const birlik = qoldiq % 10;
  if (onlik) parts.push(SON_ONLIK_SOZ[onlik]);
  if (birlik) parts.push(SON_BIRLIK_SOZ[birlik]);
  return parts.join(" ");
}

function sonSozBilan(n) {
  n = Math.round(Math.abs(toNum(n)));
  if (n === 0) return "nol";
  const guruhlar = [{ q: 1000000000, nomi: "milliard" }, { q: 1000000, nomi: "million" }, { q: 1000, nomi: "ming" }];
  let qoldiq = n;
  const parts = [];
  for (const g of guruhlar) {
    const son = Math.floor(qoldiq / g.q);
    if (son) { parts.push(sonUchXonaliSoz(son) + " " + g.nomi); qoldiq -= son * g.q; }
  }
  if (qoldiq) parts.push(sonUchXonaliSoz(qoldiq));
  return parts.join(" ");
}

function summaSozBilan(n) {
  const num = toNum(n);
  const butun = Math.floor(Math.abs(num));
  const tiyin = Math.round((Math.abs(num) - butun) * 100);
  const text = sonSozBilan(butun);
  const capitalized = text ? (text.charAt(0).toUpperCase() + text.slice(1)) : "Nol";
  return `${capitalized} so'm ${String(tiyin).padStart(2, "0")} tiyin`;
}

// Bitta chiqim fakturaning kalkulyatsiyasi asosida "Mahsulotlarni ishlab
// chiqarishga sarflash to'g'risida DALOLATNOMA" — rasmiy andaza bo'yicha
// (foydalanuvchi bergan namunaga so'zma-so'z mos). Hujjat raqami/sanasi
// chiqim fakturaning o'zidan, komissiya raisi Sozlamalardagi "rahbar"dan,
// a'zolar/moddiy javobgar shaxs "Ish haqi" bo'limidagi xodimlardan (birinchi
// topilgan farqli F.I.Sh.lardan) olinadi — bu maydonlar qog'ozda qo'lda
// tuzatilishi mumkin. "Tovar kodi" va "Yaroqsiz mahsulot miqdori" uchun
// ilovada mos ma'lumot yo'q, shu sabab bo'sh (qo'lda to'ldirish uchun)
// qoldirilgan. Xomashyo (computeChiqimMaterialBreakdown) va sotilgan mahsulot
// (chiqim_tafsil) qatorlari BITTA jadvalda — "Izoh" ustunida "Sarflandi"/
// "Tayyorlandi" bilan ajratilgan holda — birlashtirilgan.
function printMahsulotSarflashDalolatnomasi(chiqimId) {
  const chiqimRow = STORE.chiqim.find((r) => r.id === chiqimId);
  if (!chiqimRow) return;
  const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);
  const { materials } = computeChiqimMaterialBreakdown(chiqimId);
  const s = STORE.settings;

  const shahar = String(s.address || "").split(",")[0].trim() || "____________";

  const xodimFioLar = [...new Set(STORE.ishHaqi.map((r) => r.fio).filter(Boolean))];
  const topXodim = (i) => STORE.ishHaqi.find((r) => r.fio === xodimFioLar[i]) || null;
  const azo1 = topXodim(0);
  const azo2 = topXodim(1);
  const moddiyJavobgar = topXodim(2) || azo2 || azo1;
  const kishiHtml = (r) => r
    ? `${escapeHtml(r.lavozimi || "xodim")}, ${escapeHtml(r.fio)} _________________________________`
    : `_________________________________ (Lavozimi, F.I.Sh.)`;

  let idx = 0;
  const materialRows = materials.map((c) => {
    idx++;
    return `<tr><td class="num">${idx}</td><td>${escapeHtml(c.nomi)}</td><td class="num">${escapeHtml(c.birlik || "")}</td><td class="num">${fmt(c.miqdor, 3)}</td><td></td><td>Sarflandi</td></tr>`;
  }).join("");
  const productRows = rows.map((t) => {
    idx++;
    return `<tr><td class="num">${idx}</td><td>${escapeHtml(t.nomi)}</td><td class="num">${escapeHtml(t.birlik || "")}</td><td class="num">${fmt(t.miqdor, 3)}</td><td></td><td>Tayyorlandi</td></tr>`;
  }).join("");

  // Jami sarflandilar — xomashyo qatorlarini birlik bo'yicha guruhlab, har
  // birini alohida so'zda ko'rsatamiz (birliklar har xil bo'lishi mumkin,
  // masalan kg va metr bir jadvalda uchrasa).
  const birlikJami = {};
  materials.forEach((c) => { const b = c.birlik || "birlik"; birlikJami[b] = (birlikJami[b] || 0) + toNum(c.miqdor); });
  const jamiSozda = Object.entries(birlikJami).map(([b, miqdor]) => `${sonSozBilan(miqdor)} ${b}`).join(", ") || "—";

  const tayyorMahsulotText = rows.length
    ? rows.map((t) => `${escapeHtml(t.nomi)} — ${fmt(t.miqdor, 3)} ${escapeHtml(t.birlik || "")}`).join("; ")
    : "—";

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Sarflash dalolatnomasi ${escapeHtml(chiqimRow.hujjatRaqami || "")}</title>
      <style>
        @page{size:A4; margin:14mm 12mm;}
        body{font-family:Arial, "Segoe UI", sans-serif; padding:32px; color:#1c2530; font-size:12.5px;}
        h1{font-size:15.5px; text-align:center; margin:0 0 4px; text-transform:uppercase;}
        .center{text-align:center;}
        .meta{font-size:12.5px; margin:4px 0;}
        .section-title{font-weight:700; margin:16px 0 6px; font-size:12.5px; break-after:avoid;}
        table{width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:6px;}
        thead{display:table-header-group;}
        tr{break-inside:avoid;}
        th, td{border:1px solid #1c2530; padding:5px 8px; text-align:left;}
        th{background:#eceff2; text-align:center;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        .fillline{margin:8px 0; break-inside:avoid;}
        .fillline .dots{border-bottom:1px dotted #1c2530; display:inline-block; min-width:60%;}
        .sign{margin-top:10px; font-size:12px;}
        .sign div{margin:14px 0; break-inside:avoid;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <h1>Mahsulotlarni ishlab chiqarishga sarflash to'g'risida<br>dalolatnoma</h1>
      <div class="center meta">№ ${escapeHtml(chiqimRow.hujjatRaqami || "")}-sonli</div>
      <div class="center meta">«${escapeHtml((chiqimRow.sana || "").slice(8, 10))}» ${escapeHtml((chiqimRow.sana || "").slice(5, 7))} ${escapeHtml((chiqimRow.sana || "").slice(0, 4))} y.</div>
      <div class="center meta">${escapeHtml(shahar)} shahri</div>

      <div class="section-title">Komissiya tarkibi:</div>
      <div class="fillline">Rais: ${escapeHtml(s.rahbar || "")} <span class="dots"></span> (Lavozimi, F.I.Sh.)</div>
      <div class="fillline">A'zolar: ${kishiHtml(azo1)}</div>
      <div class="fillline">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${kishiHtml(azo2)}</div>

      <p class="meta">Ushbu dalolatnoma komissiya tomonidan «${escapeHtml((chiqimRow.sana || "").slice(8, 10))}» ${escapeHtml((chiqimRow.sana || "").slice(5, 7))} ${escapeHtml((chiqimRow.sana || "").slice(0, 4))} yildagi ${escapeHtml(chiqimRow.hujjatRaqami || "")}-sonli ombor talabnomasiga asosan ombordan ishlab chiqarish uchun olingan moddiy boyliklar haqiqatda sarflanganligini tasdiqlash uchun tuzildi.</p>
      <p class="meta">«${escapeHtml((chiqimRow.sana || "").slice(8, 10))}» ${escapeHtml((chiqimRow.sana || "").slice(5, 7))} ${escapeHtml((chiqimRow.sana || "").slice(0, 4))} yildan «${escapeHtml((chiqimRow.sana || "").slice(8, 10))}» ${escapeHtml((chiqimRow.sana || "").slice(5, 7))} ${escapeHtml((chiqimRow.sana || "").slice(0, 4))} yilgacha bo'lgan davrda quyidagi mahsulotlar (xomashyolar) ishlab chiqarish jarayonida to'liq sarflandi:</p>

      <table>
        <thead><tr><th>№</th><th>Mahsulot/Xomashyo nomi</th><th>O'lchov birligi</th><th class="num">Miqdori</th><th>Tovar kodi (agar bo'lsa)</th><th>Izoh</th></tr></thead>
        <tbody>${materialRows}${productRows || ""}</tbody>
      </table>

      <p class="meta"><b>Jami sarflandilar:</b> ${jamiSozda} o'lchov birligida. <span class="faint">(miqdori so'z bilan)</span></p>
      <p class="meta"><b>Ishlab chiqarilgan tayyor mahsulot turi va miqdori:</b> ${tayyorMahsulotText}</p>
      <p class="meta"><b>Yaroqsiz mahsulot miqdori:</b> <span class="dots">&nbsp;</span></p>

      <p class="meta">Xulosa: Yuqorida ko'rsatilgan xomashyo va mahsulotlar texnologik me'yorlarga muvofiq ishlab chiqarish ehtiyojlari uchun maqsadli sarflangan. Ushbu dalolatnomaga asosan moddiy boyliklarni ishlab chiqarish xarajatlariga hisobdan chiqarishga ruxsat beriladi.</p>

      <div class="sign">
        <div>Rais: ${kishiHtml({ lavozimi: "Rahbar", fio: s.rahbar || "" })}</div>
        <div>A'zolar: ${kishiHtml(azo1)}</div>
        <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${kishiHtml(azo2)}</div>
        <div>Moddiy javobgar shaxs (Omborchi/Usta): ${kishiHtml(moddiyJavobgar)}</div>
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

// "Ishlab chiqarish" jurnalidagi bitta yozuv uchun rasmiy "Ishlab chiqarish
// dalolatnomasi" (ishlab chiqarish akti) — komissiya, sarflangan xomashyo va
// "Foyda normasi" asosidagi narx kalkulyatsiyasi bilan. Tarkibi O'zbekiston
// Respublikasi Vazirlar Mahkamasining 1999-yil 5-fevraldagi 54-son qarori
// bilan tasdiqlangan tannarx/moliyaviy natija shakllantirish tartibiga (asosiy
// me'yoriy hujjat) asoslangan; komissiya a'zolari ilovada alohida yuritilmagani
// uchun F.I.Sh. qo'lda to'ldirish uchun bo'sh qoldirilgan.
function printIshlabChiqarishDalolatnoma(icId) {
  const icRow = STORE.ishlabChiqarish.find((r) => r.id === icId);
  if (!icRow) return;
  const mahsulot = icRow.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === icRow.mahsulotId) : null;
  const s = STORE.settings;
  const details = parseIshlabChiqarishDetails(icRow);

  const miqdor = toNum(icRow.miqdor);
  const foydaNormasi = toNum(icRow.foydaNormasi);
  let materials = [];
  let materialsTotal = 0;
  let ishHaqi = 0, ijtimoiySoliq = 0, boshqaXarajat = 0, chiqindi = 0;

  if (details && details.faktMateriallar && details.faktMateriallar.length) {
    materials = details.faktMateriallar.map((m) => ({
      nomi: m.nomi,
      birlik: m.birlik || "",
      rejaMiqdor: toNum(m.rejaMiqdor),
      faktMiqdor: toNum(m.faktMiqdor),
      farq: toNum(m.farq !== undefined ? m.farq : (m.faktMiqdor - m.rejaMiqdor)),
      narx: toNum(m.narx),
      summa: toNum(m.summa)
    }));
    materialsTotal = toNum(details.matTotal || materials.reduce((a, c) => a + c.summa, 0));
    ishHaqi = toNum(details.ishHaqi);
    ijtimoiySoliq = toNum(details.ijtimoiySoliq);
    boshqaXarajat = toNum(details.boshqaXarajat);
    chiqindi = toNum(details.chiqindi);
  } else {
    // Eski yozuvlar uchun fallback
    const fifo = fifoUsulActive();
    const xomashyoNarx = (nomi, mMiqdor) => {
      if (!fifo) return avgOmborNarx(nomi, icRow.sana);
      const d = fifoLedger(nomi).byDoc.get(`IC-${icId}`);
      const summa = d ? d.tannarx : fifoHypotheticalCost(nomi, mMiqdor, icRow.sana).tannarx;
      return mMiqdor ? summa / mMiqdor : 0;
    };
    const agg = new Map();
    const addAgg = (nomi, birlik, mMiqdor) => {
      const cur = agg.get(nomi) || { nomi, birlik, miqdor: 0 };
      cur.miqdor += toNum(mMiqdor);
      agg.set(nomi, cur);
    };
    if (mahsulot) {
      computeMahsulotConsumption(mahsulot, icRow.miqdor, icRow.sana).consumptions
        .forEach((c) => addAgg(c.nomi, c.birlik, c.miqdor));
    } else {
      STORE.ombor
        .filter((r) => r.turi === "chiqim" && r.hujjatRaqami === `IC-${icId}`)
        .forEach((r) => addAgg(r.nomi, r.birlik, r.miqdor));
    }
    materials = Array.from(agg.values()).map((c) => {
      const narx = xomashyoNarx(c.nomi, c.miqdor);
      return { nomi: c.nomi, birlik: c.birlik, rejaMiqdor: c.miqdor, faktMiqdor: c.miqdor, farq: 0, narx, summa: c.miqdor * narx };
    });
    materialsTotal = materials.reduce((a, c) => a + c.summa, 0);
  }

  const jamiTannarx = toNum(icRow.tannarx) || Math.max(0, materialsTotal + ishHaqi + ijtimoiySoliq + boshqaXarajat - chiqindi);
  const birlikTannarx = miqdor ? jamiTannarx / miqdor : 0;
  const birlikNarxQqssiz = birlikTannarx + foydaNormasi;
  const qqsStavka = toNum(s.qqsStavka || 12);
  const birlikQqsSumma = birlikNarxQqssiz * (qqsStavka / 100);
  const birlikNarxQqsBilan = birlikNarxQqssiz + birlikQqsSumma;

  const materialRows = materials.map((c) => {
    const farqSign = c.farq > 0 ? `+${fmt(c.farq, 3)}` : fmt(c.farq, 3);
    const farqColor = c.farq > 0 ? "color:#b3432b;" : (c.farq < 0 ? "color:#2f6f5e;" : "");
    return `
      <tr>
        <td>${escapeHtml(c.nomi)}</td>
        <td class="num">${escapeHtml(c.birlik || "")}</td>
        <td class="num">${fmt(c.rejaMiqdor, 3)}</td>
        <td class="num"><b>${fmt(c.faktMiqdor, 3)}</b></td>
        <td class="num" style="${farqColor}">${farqSign}</td>
        <td class="num">${fmtSum(c.narx)}</td>
        <td class="num"><b>${fmtSum(c.summa)}</b></td>
      </tr>
    `;
  }).join("");

  const smenaText = details && details.smena ? ` &nbsp; <b>Smena/Brigada:</b> ${escapeHtml(details.smena)}` : "";

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Ishlab chiqarish dalolatnomasi ${escapeHtml(icRow.sana || "")}</title>
      <style>
        @page{size:A4; margin:14mm 12mm;}
        body{font-family:Arial, "Segoe UI", sans-serif; padding:24px; color:#1c2530; font-size:12px; line-height:1.4;}
        .approve{float:right; text-align:center; width:270px; font-size:11.5px;}
        .approve .line{margin-top:6px;}
        .approve .dots{border-bottom:1px dotted #1c2530; display:inline-block; min-width:170px;}
        h1{font-size:18px; text-align:center; margin:60px 0 10px; text-transform:uppercase;}
        .meta{font-size:12px; margin-bottom:5px;}
        .meta b{font-weight:700;}
        .section-title{font-weight:700; margin:16px 0 6px; font-size:12.5px; break-after:avoid;}
        table{width:100%; border-collapse:collapse; font-size:11px; margin-bottom:6px;}
        thead{display:table-header-group;}
        tr{break-inside:avoid;}
        th, td{border:1px solid #1c2530; padding:5px 7px; text-align:left;}
        th{background:#eceff2; text-align:center; font-weight:700;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        .jami{margin:4px 0 0; font-weight:700; break-inside:avoid; text-align:right;}
        .sign{display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-top:40px; font-size:11.5px; break-inside:avoid;}
        .sign .line{margin-top:36px; border-top:1px solid #1c2530; padding-top:4px; width:85%;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <div class="approve">
        «ТАСДИҚЛАЙМАН»<br>
        <b>${escapeHtml(s.companyName || "Korxona")}</b> rahbari<br>
        <span class="dots" style="margin-top:16px;">${escapeHtml(s.rahbar || "")}</span>
        <div class="line">«____» ______________ 20____ y.</div>
      </div>
      <div style="clear:both;"></div>

      <h1>ISHLAB CHIQARISH DALOLATNOMASI</h1>
      <div class="meta"><b>Sana:</b> ${escapeHtml(icRow.sana || "")} &nbsp;|&nbsp; <b>Korxona:</b> ${escapeHtml(s.companyName)} (INN ${escapeHtml(s.inn)})${smenaText}</div>
      <div class="meta"><b>Asos:</b> O'zbekiston Respublikasi Vazirlar Mahkamasining 1999-yil 5-fevraldagi 54-son qarori bilan tasdiqlangan "Mahsulot (ish, xizmat)lar tannarxiga kiritiladigan xarajatlar tarkibi hamda moliyaviy natijalarni shakllantirish tartibi to'g'risida"gi Nizom.</div>

      <div class="section-title">1. Ishlab chiqarilgan tayyor mahsulot</div>
      <table>
        <thead><tr><th>Mahsulot nomi</th><th class="num">Birlik</th><th class="num">Miqdori</th><th class="num">1 birlik tannarxi</th><th class="num">Jami tannarx</th></tr></thead>
        <tbody>
          <tr>
            <td><b>${escapeHtml(icRow.mahsulotNomi || "")}</b></td>
            <td class="num">${escapeHtml(icRow.birlik || "")}</td>
            <td class="num"><b>${fmt(miqdor, 3)}</b></td>
            <td class="num">${fmtSum(birlikTannarx)}</td>
            <td class="num"><b>${fmtSum(jamiTannarx)}</b></td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">2. Sarflangan xomashyo va materiallar (Norma va Faktik sarf)</div>
      <table>
        <thead>
          <tr>
            <th>Xomashyo nomi</th>
            <th class="num">Birlik</th>
            <th class="num">Reja (norma)</th>
            <th class="num">Faktik sarf</th>
            <th class="num">Farq (+/-)</th>
            <th class="num">Narxi</th>
            <th class="num">Summa</th>
          </tr>
        </thead>
        <tbody>${materialRows || `<tr><td colspan="7" style="text-align:center;">Xomashyo topilmadi</td></tr>`}</tbody>
      </table>
      <div class="jami">JAMI xomashyo moddiy xarajati: ${fmtSum(materialsTotal)} so'm</div>

      ${(ishHaqi > 0 || boshqaXarajat > 0 || chiqindi > 0) ? `
      <div class="section-title">3. Boshqa ishlab chiqarish xarajatlari (VM 54-son qarori moddalari)</div>
      <table>
        <thead><tr><th>Xarajat turi</th><th class="num">Jami summa</th><th class="num">1 ${escapeHtml(icRow.birlik || "birlik")} uchun</th></tr></thead>
        <tbody>
          ${ishHaqi > 0 ? `<tr><td>Ishlab chiqarish ishchilari ish haqi</td><td class="num">${fmtSum(ishHaqi)}</td><td class="num">${fmtSum(ishHaqi / miqdor)}</td></tr>` : ""}
          ${ijtimoiySoliq > 0 ? `<tr><td>Ish haqiga ijtimoiy soliq (12%)</td><td class="num">${fmtSum(ijtimoiySoliq)}</td><td class="num">${fmtSum(ijtimoiySoliq / miqdor)}</td></tr>` : ""}
          ${boshqaXarajat > 0 ? `<tr><td>Boshqa to'g'ridan-to'g'ri xarajatlar (elektr, gaz, amortizatsiya)</td><td class="num">${fmtSum(boshqaXarajat)}</td><td class="num">${fmtSum(boshqaXarajat / miqdor)}</td></tr>` : ""}
          ${chiqindi > 0 ? `<tr style="color:#b3432b;"><td>Qaytariladigan chiqindilar (tannarxdan chegiriladi)</td><td class="num">-${fmtSum(chiqindi)}</td><td class="num">-${fmtSum(chiqindi / miqdor)}</td></tr>` : ""}
        </tbody>
      </table>
      ` : ""}

      <div class="section-title">4. Narx kalkulyatsiyasi va natija (1 ${escapeHtml(icRow.birlik || "birlik")} uchun)</div>
      <table>
        <tbody>
          <tr><td style="width:300px;">Ishlab chiqarish tannarxi</td><td class="num"><b>${fmtSum(birlikTannarx)}</b></td></tr>
          <tr><td>+ Foyda normasi (rentabellik)</td><td class="num">${fmtSum(foydaNormasi)}</td></tr>
          <tr style="background:#f4f6f8;"><td><b>= Tavsiya sotish narxi (QQSsiz)</b></td><td class="num"><b>${fmtSum(birlikNarxQqssiz)}</b></td></tr>
          <tr><td>+ QQS (${fmt(qqsStavka)}%)</td><td class="num">${fmtSum(birlikQqsSumma)}</td></tr>
          <tr style="background:#e8ecf0;"><td><b>= Tavsiya sotish narxi (QQS bilan)</b></td><td class="num"><b>${fmtSum(birlikNarxQqsBilan)}</b></td></tr>
        </tbody>
      </table>
      <div class="jami">JAMI partiya qiymati (${fmt(miqdor, 3)} ${escapeHtml(icRow.birlik || "")}): ${fmtSum(birlikNarxQqssiz * miqdor)} so'm (QQSsiz) / ${fmtSum(birlikNarxQqsBilan * miqdor)} so'm (QQS bilan)</div>

      <div class="section-title" style="margin-top:20px;">Komissiya a'zolari:</div>
      <div class="sign">
        <div>Sex boshlig'i / Usta<div class="line"></div>(imzo, F.I.Sh.)</div>
        <div>Bosh texnolog<div class="line"></div>(imzo, F.I.Sh.)</div>
        <div>Bosh buxgalter<div class="line"></div>(imzo, F.I.Sh.)</div>
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

function printIshlabChiqarishKalkulyatsiya(icId) {
  const icRow = STORE.ishlabChiqarish.find((r) => r.id === icId);
  if (!icRow) return;
  const s = STORE.settings;
  const details = parseIshlabChiqarishDetails(icRow);

  const miqdor = toNum(icRow.miqdor) || 1;
  const birlik = icRow.birlik || "dona";
  const mahsulotNomi = icRow.mahsulotNomi || "";

  let matTotal = 0, ishHaqi = 0, ijtimoiySoliq = 0, boshqaXarajat = 0, chiqindi = 0;
  if (details) {
    matTotal = toNum(details.matTotal);
    ishHaqi = toNum(details.ishHaqi);
    ijtimoiySoliq = toNum(details.ijtimoiySoliq);
    boshqaXarajat = toNum(details.boshqaXarajat);
    chiqindi = toNum(details.chiqindi);
  } else {
    matTotal = toNum(icRow.tannarx);
  }

  const jamiTannarx = Math.max(0, matTotal + ishHaqi + ijtimoiySoliq + boshqaXarajat - chiqindi);
  const birlikTannarx = miqdor > 0 ? jamiTannarx / miqdor : 0;
  const foydaNormasi = toNum(icRow.foydaNormasi);
  const birlikNarxQqssiz = birlikTannarx + foydaNormasi;
  const qqsStavka = toNum(s.qqsStavka || 12);
  const birlikQqsSumma = birlikNarxQqssiz * (qqsStavka / 100);
  const birlikNarxQqsBilan = birlikNarxQqssiz + birlikQqsSumma;

  const ulush = (val) => jamiTannarx > 0 ? fmt((val / jamiTannarx) * 100, 1) + "%" : "0%";

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Kalkulyatsiya — ${escapeHtml(mahsulotNomi)}</title>
      <style>
        @page{size:A4; margin:14mm 12mm;}
        body{font-family:Arial, "Segoe UI", sans-serif; padding:24px; color:#1c2530; font-size:12px; line-height:1.4;}
        .approve{float:right; text-align:center; width:280px; font-size:11.5px;}
        .approve .dots{border-bottom:1px dotted #1c2530; display:inline-block; min-width:180px;}
        h1{font-size:18px; text-align:center; margin:60px 0 6px; text-transform:uppercase; letter-spacing:0.5px;}
        .meta{font-size:12px; margin-bottom:5px; text-align:center;}
        .meta-sub{font-size:11px; color:#444; margin-bottom:14px; text-align:center;}
        table{width:100%; border-collapse:collapse; font-size:11px; margin:14px 0;}
        th, td{border:1px solid #1c2530; padding:6px 8px; text-align:left;}
        th{background:#eceff2; text-align:center; font-weight:700;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        tr.total-row td{font-weight:700; background:#f4f6f8;}
        tr.main-row td{font-weight:800; background:#e8ecf0;}
        .sign{display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-top:40px; font-size:11.5px; break-inside:avoid;}
        .sign .line{margin-top:36px; border-top:1px solid #1c2530; padding-top:4px; width:90%;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <div class="approve">
        «ТАСДИҚЛАЙМАН»<br>
        <b>${escapeHtml(s.companyName || "Korxona")}</b> rahbari<br>
        <span class="dots" style="margin-top:20px;">${escapeHtml(s.rahbar || "")}</span><br>
        <span style="font-size:11px;">(imzo, F.I.Sh.)</span>
        <div style="margin-top:6px;">«____» ______________ 20____ y.</div>
      </div>
      <div style="clear:both;"></div>

      <h1>1 BIRLIK MAHSULOT TANNARXI KALKULYATSIYASI</h1>
      <div class="meta"><b>Mahsulot:</b> ${escapeHtml(mahsulotNomi)} &nbsp;|&nbsp; <b>O'lchov birligi:</b> 1 ${escapeHtml(birlik)} &nbsp;|&nbsp; <b>Partiya hajmi:</b> ${fmt(miqdor, 3)} ${escapeHtml(birlik)}</div>
      <div class="meta-sub">Asos: O'zbekiston Respublikasi Vazirlar Mahkamasining 1999-yil 5-fevraldagi 54-son qarori (VM-54)</div>

      <table>
        <thead>
          <tr>
            <th style="width:35px;">№</th>
            <th>Xarajatlar moddasi nomi</th>
            <th class="num" style="width:130px;">Jami partiya uchun (so'm)</th>
            <th class="num" style="width:130px;">1 ${escapeHtml(birlik)} uchun (so'm)</th>
            <th class="num" style="width:80px;">Tarkibdagi ulushi (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align:center;">1</td>
            <td>Xomashyo va asosiy materiallar (fakt sarf bo'yicha)</td>
            <td class="num">${fmtSum(matTotal)}</td>
            <td class="num">${fmtSum(matTotal / miqdor)}</td>
            <td class="num">${ulush(matTotal)}</td>
          </tr>
          <tr>
            <td style="text-align:center;">2</td>
            <td>Asosiy ishlab chiqarish ishchilarining ish haqi</td>
            <td class="num">${fmtSum(ishHaqi)}</td>
            <td class="num">${fmtSum(ishHaqi / miqdor)}</td>
            <td class="num">${ulush(ishHaqi)}</td>
          </tr>
          <tr>
            <td style="text-align:center;">3</td>
            <td>Ish haqiga ijtimoiy soliq (12%)</td>
            <td class="num">${fmtSum(ijtimoiySoliq)}</td>
            <td class="num">${fmtSum(ijtimoiySoliq / miqdor)}</td>
            <td class="num">${ulush(ijtimoiySoliq)}</td>
          </tr>
          <tr>
            <td style="text-align:center;">4</td>
            <td>Boshqa to'g'ridan-to'g'ri xarajatlar (elektr, texnologik yoqilg'i, amortizatsiya)</td>
            <td class="num">${fmtSum(boshqaXarajat)}</td>
            <td class="num">${fmtSum(boshqaXarajat / miqdor)}</td>
            <td class="num">${ulush(boshqaXarajat)}</td>
          </tr>
          ${chiqindi > 0 ? `
          <tr style="color:#b3432b;">
            <td style="text-align:center;">5</td>
            <td>Qaytariladigan chiqindilar (chegiriladi)</td>
            <td class="num">-${fmtSum(chiqindi)}</td>
            <td class="num">-${fmtSum(chiqindi / miqdor)}</td>
            <td class="num">-${ulush(chiqindi)}</td>
          </tr>
          ` : ""}
          <tr class="main-row">
            <td colspan="2"><b>I. ISHLAB CHIQARISH (SEX) TANNARXI</b></td>
            <td class="num"><b>${fmtSum(jamiTannarx)}</b></td>
            <td class="num"><b>${fmtSum(birlikTannarx)}</b></td>
            <td class="num"><b>100.0%</b></td>
          </tr>
          <tr>
            <td style="text-align:center;">6</td>
            <td>Korxona foydasi (Foyda normasi / Rentabellik)</td>
            <td class="num">${fmtSum(foydaNormasi * miqdor)}</td>
            <td class="num">${fmtSum(foydaNormasi)}</td>
            <td class="num">—</td>
          </tr>
          <tr class="total-row">
            <td colspan="2"><b>II. ULQURJI SOTISH NARXI (QQSsiz)</b></td>
            <td class="num"><b>${fmtSum(birlikNarxQqssiz * miqdor)}</b></td>
            <td class="num"><b>${fmtSum(birlikNarxQqssiz)}</b></td>
            <td class="num">—</td>
          </tr>
          <tr>
            <td style="text-align:center;">7</td>
            <td>Qo'shilgan qiymat solig'i (QQS ${fmt(qqsStavka)}%)</td>
            <td class="num">${fmtSum(birlikQqsSumma * miqdor)}</td>
            <td class="num">${fmtSum(birlikQqsSumma)}</td>
            <td class="num">—</td>
          </tr>
          <tr class="main-row">
            <td colspan="2"><b>III. YAKUNIY SOTISH NARXI (QQS bilan)</b></td>
            <td class="num"><b>${fmtSum(birlikNarxQqsBilan * miqdor)}</b></td>
            <td class="num"><b>${fmtSum(birlikNarxQqsBilan)}</b></td>
            <td class="num">—</td>
          </tr>
        </tbody>
      </table>

      <div class="sign">
        <div>Bosh buxgalter<div class="line"></div>(imzo, F.I.Sh.)</div>
        <div>Iqtisodchi / Texnolog<div class="line"></div>(imzo, F.I.Sh.)</div>
        <div>Sex boshlig'i<div class="line"></div>(imzo, F.I.Sh.)</div>
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

// To'g'ridan-to'g'ri xomashyo chiqimi — mahsulot kalkulyatsiyasisiz, bitta
// nomdagi xomashyo Ombordan shu miqdorda to'g'ridan-to'g'ri ayiriladi
// ("Ombor chiqimi"da kiritilgan nom Ombor kirimidagi xomashyo nomiga
// to'g'ridan-to'g'ri mos kelganda ishlatiladi).
async function performXomashyoChiqim(nomi, birlik, miqdor, sana, izoh) {
  const row = {
    sana, hujjatRaqami: "", kontragentInn: "", kontragentNomi: izoh || "Qo'lda kiritilgan chiqim",
    nomi, birlik, miqdor, narx: 0, yetkazibBerishNarxi: 0, qqsSumma: 0, yetkazibBerishNarxiQQSBilan: 0, turi: "chiqim"
  };
  const { data, error } = await sbClient.from("ombor").insert(toDbRow(OMBOR_DB_MAP, row)).select().single();
  if (error) { reportError(error, "Saqlashda xatolik"); return false; }
  STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, data));
  updateNavBadges();
  return true;
}

async function addIshlabChiqarishEntry() {
  openIshlabChiqarishModal();
}

async function deleteIshlabChiqarishEntry(id) {
  const entryIdx = STORE.ishlabChiqarish.findIndex((r) => r.id === id);
  const entry = entryIdx >= 0 ? STORE.ishlabChiqarish[entryIdx] : null;
  // IC-${id} ga bog'langan barcha ombor qatorlari (ham xomashyo chiqimi, ham tayyor mahsulot kirimi)
  const linked = STORE.ombor.filter((r) => r.hujjatRaqami === `IC-${id}`);
  RECENTLY_DELETED.add(id);
  linked.forEach((r) => RECENTLY_DELETED.add(r.id));
  STORE.ishlabChiqarish = STORE.ishlabChiqarish.filter((r) => r.id !== id);
  STORE.ombor = STORE.ombor.filter((r) => r.hujjatRaqami !== `IC-${id}`);
  updateNavBadges();
  PAGES[CURRENT_PAGE].render();
  const { error } = await sbClient.from("ishlab_chiqarish").delete().eq("id", id);
  if (error) {
    console.error(error);
    RECENTLY_DELETED.delete(id);
    if (entry) STORE.ishlabChiqarish.push(entry);
    linked.forEach((r) => { RECENTLY_DELETED.delete(r.id); STORE.ombor.push(r); });
    updateNavBadges();
    PAGES[CURRENT_PAGE].render();
    toast(isPermissionError(error) ? "Sizda bu qatorni o'chirish huquqi yo'q (faqat admin)" : "O'chirishda xatolik", "err");
    return;
  }
  if (linked.length) {
    const { error: error2 } = await sbClient.from("ombor").delete().in("id", linked.map((r) => r.id));
    if (error2) console.error(error2);
  }
  updateNavBadges();
  PAGES[CURRENT_PAGE].render();
  toast("O'chirildi, ombor harakatlari (xomashyo va tayyor mahsulot) bekor qilindi");
}

function omborChiqimNomiDatalistHtml() {
  const rawNames = omborKirimRows().map((r) => r.nomi).filter(Boolean);
  const mahsulotNames = STORE.mahsulotlar.map((m) => m.nomi).filter(Boolean);
  const names = [...new Set([...rawNames, ...mahsulotNames])].sort();
  return `<datalist id="omborChiqimNomiList">${names.map((n) => `<option value="${escapeHtml(n)}">`).join("")}</datalist>`;
}

// Kiritilgan nom Ombor kirimidagi biror xomashyo nomiga to'g'ridan-to'g'ri
// mos kelsa — "xomashyo" (birga-bir ayiriladi). Aks holda Ishlab
// chiqarishdagi biror mahsulot nomiga mos kelsa — "mahsulot" (kalkulyatsiya
// bo'yicha hisoblab ayiriladi). Hech biriga mos kelmasa — "none".
function resolveOmborChiqimTarget(nomi) {
  if (omborKirimRows().some((r) => r.nomi === nomi)) return { kind: "xomashyo" };
  const mahsulot = STORE.mahsulotlar.find((m) => m.nomi === nomi);
  if (mahsulot) return { kind: "mahsulot", mahsulot };
  return { kind: "none" };
}

function openOmborChiqimModal() {
  openModal(`
    <h3>Ombor chiqimi</h3>
    <p class="modal-sub">Nom kiriting: agar u Ombor kirimidagi xomashyo nomi bilan bir xil bo'lsa, kiritilgan miqdor to'g'ridan-to'g'ri o'sha xomashyodan ayiriladi. Agar u Ishlab chiqarishdagi mahsulot nomi bo'lsa, kalkulyatsiya (tarkib) asosida mos xomashyolar miqdori sotilgan mahsulot miqdoriga ko'paytirilib ayiriladi.</p>
    <div class="field"><label>Nomi</label><input id="ocNomi" list="omborChiqimNomiList" placeholder="Xomashyo yoki mahsulot nomi"></div>
    <div class="field"><label>Sana</label><input type="date" id="ocSana" value="${todayISO()}"></div>
    <div class="field"><label>Miqdor</label><input id="ocMiqdor" placeholder="masalan: 50"></div>
    <div class="field"><label>Izoh (ixtiyoriy)</label><input id="ocIzoh" placeholder=""></div>
    <div class="note" id="ocPreview"></div>
    ${omborChiqimNomiDatalistHtml()}
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const update = () => updateOmborChiqimPreview();
  document.getElementById("ocNomi").addEventListener("input", update);
  document.getElementById("ocMiqdor").addEventListener("input", update);
  document.getElementById("ocSana").addEventListener("change", update);
  update();
  document.getElementById("mSave").addEventListener("click", saveOmborChiqim);
}

function updateOmborChiqimPreview() {
  const el = document.getElementById("ocPreview");
  if (!el) return;
  const nomi = document.getElementById("ocNomi").value.trim();
  const miqdor = toNum(document.getElementById("ocMiqdor").value);
  const sana = (document.getElementById("ocSana") && document.getElementById("ocSana").value) || todayISO();
  if (!nomi || !miqdor) { el.innerHTML = `<span class="faint">Nom va miqdorni kiriting</span>`; return; }

  const target = resolveOmborChiqimTarget(nomi);
  const kamomadIzoh = (c) => c.yetarli ? "" : ` — ${OMBOR_KAMOMAD_LABEL[c.sabab] || "yetarli emas"} (kamomad: ${fmt(c.kamomad, 3)})`;

  if (target.kind === "xomashyo") {
    const [c] = annotateOmborShortages([{ nomi, birlik: "", miqdor }], { asOfDate: sana });
    el.innerHTML = `<div class="faint" style="margin-bottom:4px;">Xomashyo sifatida aniqlandi — to'g'ridan-to'g'ri ayiriladi:</div><div style="${c.yetarli ? "" : "color:var(--danger,#e5484d);font-weight:600;"}">${escapeHtml(nomi)}: ${fmt(miqdor, 3)} (${escapeHtml(sana)} holatiga qoldiq: ${fmt(c.qoldiq, 3)})${kamomadIzoh(c)}</div>`;
  } else if (target.kind === "mahsulot") {
    const m = target.mahsulot;
    const { consumptions, tannarx } = computeMahsulotConsumption(m, miqdor, sana);
    const annotated = annotateOmborShortages(consumptions, { asOfDate: sana });
    const lines = annotated.map((c) =>
      `<div style="${c.yetarli ? "" : "color:var(--danger,#e5484d);font-weight:600;"}">${escapeHtml(c.nomi)}: ${fmt(c.miqdor, 3)} ${escapeHtml(c.birlik || "")} sarflanadi (${escapeHtml(sana)} holatiga qoldiq: ${fmt(c.qoldiq, 3)})${kamomadIzoh(c)}</div>`);
    el.innerHTML = `<div class="faint" style="margin-bottom:4px;">Mahsulot sifatida aniqlandi — kalkulyatsiya bo'yicha:</div>${lines.join("") || `<span class="faint">Bu mahsulotda tarkib belgilanmagan</span>`}<div style="margin-top:8px;"><b>Taxminiy tannarx: ${fmtSum(tannarx)}</b></div>`;
  } else {
    el.innerHTML = `<span style="color:var(--danger,#e5484d);font-weight:600;">Bu nom na Ombor kirimidagi xomashyo, na Ishlab chiqarishdagi mahsulot sifatida topilmadi.</span>`;
  }
}

async function saveOmborChiqim() {
  const nomi = document.getElementById("ocNomi").value.trim();
  const sana = document.getElementById("ocSana").value || todayISO();
  const miqdor = toNum(document.getElementById("ocMiqdor").value);
  const izoh = document.getElementById("ocIzoh").value.trim();
  if (!nomi) { toast("Nomni kiriting", "err"); return; }
  if (!miqdor || miqdor <= 0) { toast("Miqdorni kiriting", "err"); return; }

  const target = resolveOmborChiqimTarget(nomi);
  if (target.kind === "none") { toast("Bu nom xomashyo yoki mahsulot sifatida topilmadi", "err"); return; }

  const ref = target.kind === "xomashyo" ? omborKirimRows().find((r) => r.nomi === nomi) : null;
  const ok = target.kind === "xomashyo"
    ? await performXomashyoChiqim(nomi, ref ? ref.birlik : "", miqdor, sana, izoh)
    : await performMahsulotConsumption(target.mahsulot, miqdor, sana, izoh);
  if (!ok) return;

  closeModal();
  renderOmborChiqim();
  toast("Chiqim qo'shildi, ombor qoldig'i yangilandi");
}

// Ombor chiqimi — Excel'dan import. Ombor kirimi bilan AYNAN BIR XIL didox.uz
// "faktura" eksport formatini kutadi (detectInvoiceColumns — Sana/Hujjat №/
// Nomi/Birlik/Miqdor/Narxi/Yetkazib berish narxi/QQS summasi/Yetkazib berish
// narxi QQS bilan ustunlari o'sha fayldan xuddi shunday o'qiladi). Yagona
// farq: manba/izoh maydoni SOTUVCHI emas XARIDOR (Покупатель) nomidan
// olinadi — chiqim uchun mazmunli kontragent shu, chunki mahsulot xaridorga
// jo'natiladi — va har bir qator turi="chiqim" bilan yoziladi.
function parseOmborChiqimLineItems(rows, col) {
  let ctx = { sana: "", hujjatRaqami: "", status: "Подписан", kontragentInn: "", kontragentNomi: "" };
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[col.id]) {
      ctx = {
        sana: normalizeDate(row[col.sana]),
        hujjatRaqami: String(row[col.hujjat] || "").trim(),
        status: String(row[col.status] || "Подписан").trim(),
        kontragentInn: String(row[col.buyerInn] || "").trim(),
        kontragentNomi: String(row[col.buyerNomi] || "").trim()
      };
    }
    const nomi = String(row[col.nomi] || "").trim();
    if (!nomi || !isValidStatus(ctx.status)) continue;

    const yetkazibBerishNarxi = toNum(row[col.base]);
    const qqsSumma = toNum(row[col.qqsSumma]);
    const yetkazibBerishNarxiQQSBilan = toNum(row[col.jami]) || (yetkazibBerishNarxi + qqsSumma);

    items.push({
      sana: ctx.sana, hujjatRaqami: ctx.hujjatRaqami,
      kontragentInn: ctx.kontragentInn, kontragentNomi: ctx.kontragentNomi,
      nomi, birlik: String(row[col.birlik] || "").trim(),
      miqdor: toNum(row[col.miqdor]), narx: toNum(row[col.narx]),
      yetkazibBerishNarxi, qqsSumma, yetkazibBerishNarxiQQSBilan,
      turi: "chiqim"
    });
  }
  return items;
}

async function handleOmborChiqimImport(file) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) { toast("Fayl bo'sh", "err"); return; }

    const col = detectInvoiceColumns(rows[0]);
    if (col.id === -1 || col.hujjat === -1 || col.nomi === -1) {
      toast("Fayl tuzilishi tanilmadi — ustunlar mos kelmayapti", "err");
      return;
    }

    const items = parseOmborChiqimLineItems(rows, col);
    if (!items.length) { toast("Import qilinadigan qator topilmadi", "err"); return; }

    const candidates = [];
    let skipped = 0;
    for (const it of items) {
      const dupExists = STORE.ombor.some((r) => r.turi === "chiqim" && r.hujjatRaqami === it.hujjatRaqami && r.sana === it.sana && r.nomi === it.nomi && Math.abs(r.miqdor - it.miqdor) < 0.001);
      if (dupExists) { skipped++; continue; }
      candidates.push(it);
    }

    if (candidates.length) {
      const faylRow = await registerFaylUpload("ombor", file);
      if (faylRow) candidates.forEach((c) => { c.faylId = faylRow.id; });
    }

    let added = 0;
    if (candidates.length) {
      let data;
      try {
        data = await insertRowsChunked("ombor", candidates.map((r) => toDbRow(OMBOR_DB_MAP, r)));
      } catch (error) { reportError(error, "Bazaga yozishda xatolik"); return; }
      data.forEach((row) => STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, row)));
      added = data.length;
    }

    updateNavBadges();
    closeModal();
    renderOmborChiqim();
    toast(`Import: ${added} ta chiqim qo'shildi, ${skipped} ta takror o'tkazib yuborildi`);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

function openOmborChiqimImportModal() {
  openModal(`
    <h3>Ombor chiqimi — Excel'dan import</h3>
    <p class="modal-sub">didox.uz eksport qilgan "faktura chiqim" (sotuv) .xlsx faylini yuklang — Ombor kirimidagi bilan bir xil format. Har bir hujjatdagi har bir mahsulot alohida "chiqim" qatori sifatida qo'shiladi (Manba/izoh — xaridor nomi), takroriy qatorlar o'tkazib yuboriladi.</p>
    <div class="dropzone" id="dz">Faylni shu yerga tashlang yoki bosing<br><span class="faint">.xlsx / .xls</span></div>
    <input type="file" id="impFile" accept=".xlsx,.xls" style="display:none">
    <div class="modal-actions"><button class="btn" id="mCancel">Yopish</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const dz = document.getElementById("dz");
  const inp = document.getElementById("impFile");
  dz.addEventListener("click", () => inp.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    if (e.dataTransfer.files[0]) handleOmborChiqimImport(e.dataTransfer.files[0]);
  });
  inp.addEventListener("change", (e) => {
    if (e.target.files[0]) handleOmborChiqimImport(e.target.files[0]);
  });
}

/* -------------------- Ombordagi Mahsulotni Qayta Ishlash (Konvertatsiya) -------------------- */

function computeQaytaIshlashCost(params) {
  const sarfMiqdor = toNum(params.sarfMiqdor);
  const manbaNarx = toNum(params.manbaNarx);
  const sarfSumma = sarfMiqdor * manbaNarx;

  const yangiMiqdor = toNum(params.yangiMiqdor);
  const qoshimchaXarajat = toNum(params.qoshimchaXarajat);
  const chiqindiSumma = toNum(params.chiqindiSumma);

  const jamiXarajat = Math.max(0, sarfSumma + qoshimchaXarajat - chiqindiSumma);
  const yangiBirlikNarx = yangiMiqdor > 0 ? jamiXarajat / yangiMiqdor : 0;
  const yangiJamiSumma = yangiMiqdor * yangiBirlikNarx;

  return {
    sarfMiqdor,
    manbaNarx,
    sarfSumma,
    yangiMiqdor,
    qoshimchaXarajat,
    chiqindiSumma,
    jamiXarajat,
    yangiBirlikNarx,
    yangiJamiSumma
  };
}

function computeTexnologikYoqotish(sarfMiqdor, yangiMiqdor, manbaBirlik, yangiBirlik) {
  sarfMiqdor = toNum(sarfMiqdor);
  yangiMiqdor = toNum(yangiMiqdor);
  const sameUnit = String(manbaBirlik || "").trim().toLowerCase() === String(yangiBirlik || "").trim().toLowerCase();
  if (!sameUnit || sarfMiqdor <= 0) {
    return { sameUnit: false, yoqotishMiqdor: 0, yoqotishFoiz: 0 };
  }
  const yoqotishMiqdor = Math.max(0, sarfMiqdor - yangiMiqdor);
  const yoqotishFoiz = sarfMiqdor > 0 ? (yoqotishMiqdor / sarfMiqdor) * 100 : 0;
  return {
    sameUnit: true,
    yoqotishMiqdor,
    yoqotishFoiz: Math.round(yoqotishFoiz * 10) / 10
  };
}

function openOmborQaytaIshlashModal(preselectedNomi = null) {
  const stockList = omborQoldiqList();
  if (!stockList.length) {
    toast("Omborda mahsulotlar mavjud emas", "err");
    return;
  }

  let selected = null;
  if (preselectedNomi) {
    selected = stockList.find((q) => q.nomi === preselectedNomi && q.qoldiq > 0) || stockList.find((q) => q.nomi === preselectedNomi);
  }
  if (!selected) {
    selected = stockList.find((q) => q.qoldiq > 0) || stockList[0];
  }

  let step = 1;
  const state = {
    manbaNomi: selected ? selected.nomi : "",
    manbaBirlik: selected ? (selected.birlik || "") : "",
    manbaQoldiq: selected ? selected.qoldiq : 0,
    manbaNarx: selected ? getXomashyoBirlikNarx(selected.nomi, selected.qoldiq, todayISO()) : 0,
    sarfMiqdor: selected && selected.qoldiq > 0 ? selected.qoldiq : 0,
    sarfSumma: 0,
    yangiTur: "mahsulot",
    yangiNomi: "",
    yangiBirlik: selected ? (selected.birlik || "kg") : "kg",
    yangiMiqdor: 0,
    qoshimchaXarajat: 0,
    chiqindiNomi: "",
    chiqindiMiqdor: 0,
    chiqindiSumma: 0,
    sana: todayISO(),
    hujjatRaqami: "QI-" + todayISO().replace(/-/g, "") + "-" + Math.floor(100 + Math.random() * 900),
    masul: "",
    izoh: ""
  };
  state.sarfSumma = state.sarfMiqdor * state.manbaNarx;

  function renderModalHtml() {
    const isStep1 = step === 1;
    const existingNames = Array.from(new Set([
      ...STORE.mahsulotlar.map((m) => m.nomi),
      ...STORE.ombor.map((o) => o.nomi)
    ])).filter(Boolean);
    const standardUnits = ["kg", "dona", "metr", "litr", "m2", "m3", "qop", "pachka", "komplekt", "tonna", "gramm"];

    return `
      <div style="max-width:820px;width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div>
            <h3 style="margin:0 0 4px;font-size:17px;display:flex;align-items:center;gap:6px;">
              <svg class="ic" viewBox="0 0 24 24" style="width:20px;height:20px;color:var(--primary,#2f6f5e);"><use href="#i-refresh"/></svg>
              Ombordagi Mahsulotni Qayta Ishlash va Konvertatsiya Qilish
            </h3>
            <p class="modal-sub" style="margin:0;">Tovarni bir turdan ikkinchi turga o'zgartirish, navini yangilash yoki yangi mahsulot/xomashyoga aylantirish dalolatnomasi</p>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:8px 12px;background:var(--bg-sunken);border-radius:var(--radius-sm);border:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:6px;font-weight:${isStep1 ? "700" : "500"};color:${isStep1 ? "var(--primary)" : "var(--text-muted)"};font-size:13px;">
            <span style="background:${isStep1 ? "var(--primary)" : "var(--bg-card)"};color:${isStep1 ? "#fff" : "var(--text-faint)"};width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;border:1px solid ${isStep1 ? "transparent" : "var(--border)"};">1</span>
            1-Qadam: Manba tovar/xomashyoni tanlash
          </div>
          <span style="color:var(--text-faint);margin:0 4px;">➔</span>
          <div style="display:flex;align-items:center;gap:6px;font-weight:${!isStep1 ? "700" : "500"};color:${!isStep1 ? "var(--primary)" : "var(--text-muted)"};font-size:13px;">
            <span style="background:${!isStep1 ? "var(--primary)" : "var(--bg-card)"};color:${!isStep1 ? "#fff" : "var(--text-faint)"};width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;border:1px solid ${!isStep1 ? "transparent" : "var(--border)"};">2</span>
            2-Qadam: Yangi mahsulot parametrlarini belgilash
          </div>
        </div>

        ${isStep1 ? `
          <div style="margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:12px;font-weight:600;color:var(--text-muted);">Ombordagi mavjud mahsulotlar va xomashyolar (o'lchov birligi bilan):</span>
              <span class="faint" style="font-size:11.5px;">${stockList.length} ta pozitsiya</span>
            </div>
            <input class="search-input" id="qiSearchManba" placeholder="Ombordagi nom bo'yicha tezkor qidirish..." style="margin-bottom:8px;width:100%;">
            
            <div class="table-wrap" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
              <table style="width:100%;margin:0;font-size:12px;" id="qiStockTable">
                <thead>
                  <tr style="background:var(--bg-sunken);position:sticky;top:0;z-index:2;">
                    <th style="width:36px;text-align:center;">Tanlash</th>
                    <th>Mahsulot / Xomashyo nomi</th>
                    <th>O'lchov birligi</th>
                    <th class="num">Mavjud qoldiq</th>
                    <th class="num">Birlik narxi (so'm)</th>
                    <th class="num">Jami qiymati</th>
                  </tr>
                </thead>
                <tbody id="qiStockTbody">
                  ${stockList.map((q) => {
                    const isSel = q.nomi === state.manbaNomi;
                    const narx = getXomashyoBirlikNarx(q.nomi, q.qoldiq, todayISO());
                    const qiymat = q.qoldiq > 0 ? q.qoldiq * narx : 0;
                    return `
                      <tr data-nomi="${escapeHtml(q.nomi)}" data-birlik="${escapeHtml(q.birlik || "")}" data-qoldiq="${q.qoldiq}" data-narx="${narx}" style="cursor:pointer;${isSel ? "background:var(--bg-highlight,#eff6ff);" : ""}">
                        <td style="text-align:center;">
                          <input type="radio" name="qiManbaRadio" ${isSel ? "checked" : ""} style="cursor:pointer;">
                        </td>
                        <td style="font-weight:${isSel ? "700" : "500"};">${escapeHtml(q.nomi)}</td>
                        <td><span class="badge" style="font-size:11px;">${escapeHtml(q.birlik || "birlik")}</span></td>
                        <td class="num" style="font-weight:700;color:${q.qoldiq > 0 ? "var(--ok,#2f6f5e)" : "var(--danger,#e5484d)"}">${fmt(q.qoldiq, 3)}</td>
                        <td class="num">${fmt(narx, 2)}</td>
                        <td class="num">${fmtSum(qiymat)}</td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>

          <div id="qiManbaSelectedCard" style="background:var(--bg-sunken);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border);display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:12px;align-items:end;margin-bottom:12px;">
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;">Tanlangan tovar:</div>
              <div id="qiCardName" style="font-weight:700;font-size:14px;color:var(--text-normal);margin-top:2px;">${escapeHtml(state.manbaNomi || "Tanlanmagan")}</div>
              <div id="qiCardStock" class="faint" style="font-size:11.5px;">Mavjud: ${fmt(state.manbaQoldiq, 3)} ${escapeHtml(state.manbaBirlik)} (1 ${escapeHtml(state.manbaBirlik)} = ${fmt(state.manbaNarx, 2)} so'm)</div>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <label style="font-size:12px;font-weight:600;margin:0;">Qayta ishlanadigan miqdor</label>
                <button type="button" class="btn btn-sm" id="btnQiAllQty" style="padding:1px 6px;font-size:10px;">Hammasi</button>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="number" id="qiSarfInput" step="any" min="0.001" value="${state.sarfMiqdor || ""}" placeholder="0" style="width:100%;">
                <span id="qiCardUnit" class="faint" style="font-size:12px;min-width:30px;">${escapeHtml(state.manbaBirlik)}</span>
              </div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;">Sarflanadigan qiymat:</div>
              <div id="qiCardSumma" style="font-weight:800;font-size:16px;color:var(--primary);margin-top:4px;">${fmtSum(state.sarfSumma)}</div>
            </div>
          </div>
          <div id="qiSarfWarning" style="display:${state.sarfMiqdor > state.manbaQoldiq ? "block" : "none"};color:var(--danger,#e5484d);font-size:12px;font-weight:600;margin-bottom:12px;">
            ⚠️ Diqqat: Kiritilgan miqdor ombordagi mavjud qoldiqdan (${fmt(state.manbaQoldiq, 3)} ${escapeHtml(state.manbaBirlik)}) ko'proq!
          </div>

          <div class="modal-actions" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
            <button class="btn" id="mCancel">Bekor qilish</button>
            <button class="btn btn-primary" id="btnQiNextStep" style="padding:8px 18px;font-weight:700;">
              Keyingi qadam: Yangi mahsulotni belgilash ➔
            </button>
          </div>
        ` : `
          <div style="background:var(--bg-sunken);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <div>
              <span class="faint" style="font-size:11px;font-weight:700;text-transform:uppercase;">Sarflanayotgan manba tovar:</span>
              <div style="font-weight:700;font-size:14px;color:var(--text-normal);margin-top:1px;">
                ${escapeHtml(state.manbaNomi)} — ${fmt(state.sarfMiqdor, 3)} ${escapeHtml(state.manbaBirlik)} (${fmtSum(state.sarfSumma)})
              </div>
            </div>
            <button type="button" class="btn btn-sm" id="btnQiBackToStep1">⬅️ Manbani o'zgartirish</button>
          </div>

          <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:14px;">
            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;">
              <h4 style="margin:0 0 10px;font-size:13px;font-weight:700;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:6px;">
                1. Olinadigan Yangi Mahsulot / Xomashyo
              </h4>
              
              <div class="field" style="margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;">Olinadigan tovar turi</label>
                <select id="qiYangiTur" style="width:100%;">
                  <option value="mahsulot" ${state.yangiTur === "mahsulot" ? "selected" : ""}>Tayyor mahsulot (2810 hisobvarag'i — sotish uchun)</option>
                  <option value="xomashyo" ${state.yangiTur === "xomashyo" ? "selected" : ""}>Xomashyo / Yarim tayyor mahsulot (1010/2110 — keyingi ishlab chiqarishga)</option>
                </select>
              </div>

              <div class="field" style="margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;">Yangi mahsulot / xomashyo nomi</label>
                <input id="qiYangiNomi" list="qiYangiNomiList" value="${escapeHtml(state.yangiNomi)}" placeholder="Masalan: Qiyma 1-nav, Kesilgan taxta, Qadoqlangan shakar...">
                <datalist id="qiYangiNomiList">
                  ${existingNames.map((n) => `<option value="${escapeHtml(n)}">`).join("")}
                </datalist>
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <div class="field" style="margin:0;">
                  <label style="font-size:12px;font-weight:600;">O'lchov birligi</label>
                  <input id="qiYangiBirlik" list="qiBirlikList" value="${escapeHtml(state.yangiBirlik || state.manbaBirlik || "kg")}" placeholder="kg, dona...">
                  <datalist id="qiBirlikList">
                    ${standardUnits.map((u) => `<option value="${u}">`).join("")}
                  </datalist>
                </div>
                <div class="field" style="margin:0;">
                  <label style="font-size:12px;font-weight:600;">Olingan miqdori</label>
                  <input type="number" id="qiYangiMiqdor" step="any" min="0.001" value="${state.yangiMiqdor || ""}" placeholder="masalan: 48">
                </div>
              </div>

              <div id="qiYoqotishBox" style="background:var(--bg-sunken);padding:8px 10px;border-radius:var(--radius-sm);font-size:11.5px;margin-bottom:8px;"></div>
            </div>

            <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;">
              <h4 style="margin:0 0 10px;font-size:13px;font-weight:700;color:var(--text-normal);border-bottom:1px solid var(--border);padding-bottom:6px;">
                2. Xarajatlar va Chiqindilar (Tannarxga ta'siri)
              </h4>

              <div class="field" style="margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;">Qo'shimcha qayta ishlash xarajatlari (mehnat, energiya, so'm)</label>
                <input type="number" id="qiQoshimchaXarajat" step="any" min="0" value="${state.qoshimchaXarajat || 0}" placeholder="0">
              </div>

              <div class="field" style="margin-bottom:6px;">
                <label style="font-size:12px;font-weight:600;">Qaytariladigan chiqindi / brak (agar omborga olinsa)</label>
                <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:6px;">
                  <input id="qiChiqindiNomi" value="${escapeHtml(state.chiqindiNomi || "")}" placeholder="Chiqindi nomi (masalan: Yem, Qiyqim)">
                  <input type="number" id="qiChiqindiSumma" step="any" min="0" value="${state.chiqindiSumma || 0}" placeholder="Summasi (so'm)">
                </div>
                <span class="faint" style="font-size:11px;">Chiqindi summasi yangi mahsulot tannarxidan chegiriladi</span>
              </div>

              <div style="background:var(--bg-sunken);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;margin-top:10px;">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <span class="faint">Jami tannarx qiymati:</span>
                  <b id="qiJamiXarajatLabel">0 so'm</b>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:13px;padding-top:4px;border-top:1px dashed var(--border);">
                  <span style="font-weight:700;">1 birlik yangi tannarx:</span>
                  <b id="qiBirlikTannarxLabel" style="color:var(--primary);font-size:15px;">0 so'm</b>
                </div>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr 1.5fr;gap:10px;background:var(--bg-sunken);padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:14px;">
            <div class="field" style="margin:0;">
              <label style="font-size:11.5px;font-weight:600;">Sana</label>
              <input type="date" id="qiSana" value="${state.sana || todayISO()}">
            </div>
            <div class="field" style="margin:0;">
              <label style="font-size:11.5px;font-weight:600;">Hujjat №</label>
              <input id="qiHujjatRaqami" value="${escapeHtml(state.hujjatRaqami)}">
            </div>
            <div class="field" style="margin:0;">
              <label style="font-size:11.5px;font-weight:600;">Mas'ul shaxs (usta / operator)</label>
              <input id="qiMasul" value="${escapeHtml(state.masul || "")}" placeholder="Usta Ismoilov">
            </div>
            <div class="field" style="margin:0;">
              <label style="font-size:11.5px;font-weight:600;">Izoh</label>
              <input id="qiIzoh" value="${escapeHtml(state.izoh || "")}" placeholder="Qayta ishlash sababi">
            </div>
          </div>

          <div class="modal-actions" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <button class="btn" id="btnQiBack">⬅️ Ortga</button>
              <button class="btn" id="mCancel">Bekor qilish</button>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary" id="btnQiSave" style="padding:8px 18px;font-weight:700;">
                ✅ Qayta ishlashni tasdiqlash
              </button>
              <button class="btn btn-primary" id="btnQiSavePrint" style="padding:8px 18px;font-weight:700;background:#1d4ed8;border-color:#1d4ed8;">
                🖨️ Saqlash va Dalolatnoma chop etish
              </button>
            </div>
          </div>
        `}
      </div>
    `;
  }

  function bindEvents() {
    document.querySelectorAll("#mCancel").forEach((b) => b.addEventListener("click", closeModal));

    if (step === 1) {
      const searchInput = document.getElementById("qiSearchManba");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          const q = e.target.value.trim().toLowerCase();
          document.querySelectorAll("#qiStockTbody tr").forEach((tr) => {
            const text = tr.dataset.nomi.toLowerCase();
            tr.style.display = !q || text.includes(q) ? "" : "none";
          });
        });
      }

      document.querySelectorAll("#qiStockTbody tr").forEach((tr) => {
        tr.addEventListener("click", () => {
          document.querySelectorAll("#qiStockTbody tr").forEach((r) => {
            r.style.background = "";
            const radio = r.querySelector("input[type=radio]");
            if (radio) radio.checked = false;
          });
          tr.style.background = "var(--bg-highlight,#eff6ff)";
          const radio = tr.querySelector("input[type=radio]");
          if (radio) radio.checked = true;

          state.manbaNomi = tr.dataset.nomi;
          state.manbaBirlik = tr.dataset.birlik;
          state.manbaQoldiq = toNum(tr.dataset.qoldiq);
          state.manbaNarx = toNum(tr.dataset.narx);

          if (!state.sarfMiqdor || state.sarfMiqdor > state.manbaQoldiq) {
            state.sarfMiqdor = state.manbaQoldiq > 0 ? state.manbaQoldiq : 0;
          }
          state.sarfSumma = state.sarfMiqdor * state.manbaNarx;

          const cardName = document.getElementById("qiCardName");
          const cardStock = document.getElementById("qiCardStock");
          const cardUnit = document.getElementById("qiCardUnit");
          const sarfInput = document.getElementById("qiSarfInput");
          const cardSumma = document.getElementById("qiCardSumma");
          const warn = document.getElementById("qiSarfWarning");

          if (cardName) cardName.textContent = state.manbaNomi;
          if (cardStock) cardStock.textContent = `Mavjud: ${fmt(state.manbaQoldiq, 3)} ${state.manbaBirlik} (1 ${state.manbaBirlik} = ${fmt(state.manbaNarx, 2)} so'm)`;
          if (cardUnit) cardUnit.textContent = state.manbaBirlik;
          if (sarfInput) sarfInput.value = state.sarfMiqdor || "";
          if (cardSumma) cardSumma.textContent = fmtSum(state.sarfSumma);
          if (warn) warn.style.display = state.sarfMiqdor > state.manbaQoldiq ? "block" : "none";
        });
      });

      const sarfInput = document.getElementById("qiSarfInput");
      if (sarfInput) {
        sarfInput.addEventListener("input", (e) => {
          state.sarfMiqdor = toNum(e.target.value);
          state.sarfSumma = state.sarfMiqdor * state.manbaNarx;
          const cardSumma = document.getElementById("qiCardSumma");
          const warn = document.getElementById("qiSarfWarning");
          if (cardSumma) cardSumma.textContent = fmtSum(state.sarfSumma);
          if (warn) warn.style.display = state.sarfMiqdor > state.manbaQoldiq ? "block" : "none";
        });
      }

      const allBtn = document.getElementById("btnQiAllQty");
      if (allBtn) {
        allBtn.addEventListener("click", () => {
          state.sarfMiqdor = state.manbaQoldiq > 0 ? state.manbaQoldiq : 0;
          state.sarfSumma = state.sarfMiqdor * state.manbaNarx;
          if (sarfInput) sarfInput.value = state.sarfMiqdor || "";
          const cardSumma = document.getElementById("qiCardSumma");
          const warn = document.getElementById("qiSarfWarning");
          if (cardSumma) cardSumma.textContent = fmtSum(state.sarfSumma);
          if (warn) warn.style.display = "none";
        });
      }

      const nextBtn = document.getElementById("btnQiNextStep");
      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          if (!state.manbaNomi) {
            toast("Qayta ishlanadigan mahsulotni tanlang", "err");
            return;
          }
          if (toNum(state.sarfMiqdor) <= 0) {
            toast("Sarflanadigan miqdorni kiriting", "err");
            return;
          }
          if (!state.yangiNomi) {
            state.yangiNomi = state.manbaNomi + " (qayta ishlangan)";
          }
          if (!state.yangiBirlik) {
            state.yangiBirlik = state.manbaBirlik || "kg";
          }
          if (!state.yangiMiqdor || state.yangiMiqdor <= 0) {
            state.yangiMiqdor = state.sarfMiqdor;
          }
          step = 2;
          render();
        });
      }
    } else {
      const backBtn = document.getElementById("btnQiBack");
      const backStep1Btn = document.getElementById("btnQiBackToStep1");
      const onBack = () => { step = 1; render(); };
      if (backBtn) backBtn.addEventListener("click", onBack);
      if (backStep1Btn) backStep1Btn.addEventListener("click", onBack);

      function updateStep2Cost() {
        state.yangiTur = document.getElementById("qiYangiTur").value;
        state.yangiNomi = document.getElementById("qiYangiNomi").value.trim();
        state.yangiBirlik = document.getElementById("qiYangiBirlik").value.trim();
        state.yangiMiqdor = toNum(document.getElementById("qiYangiMiqdor").value);
        state.qoshimchaXarajat = toNum(document.getElementById("qiQoshimchaXarajat").value);
        state.chiqindiNomi = document.getElementById("qiChiqindiNomi").value.trim();
        state.chiqindiSumma = toNum(document.getElementById("qiChiqindiSumma").value);
        state.sana = document.getElementById("qiSana").value;
        state.hujjatRaqami = document.getElementById("qiHujjatRaqami").value.trim();
        state.masul = document.getElementById("qiMasul").value.trim();
        state.izoh = document.getElementById("qiIzoh").value.trim();

        const cost = computeQaytaIshlashCost({
          sarfMiqdor: state.sarfMiqdor,
          manbaNarx: state.manbaNarx,
          yangiMiqdor: state.yangiMiqdor,
          qoshimchaXarajat: state.qoshimchaXarajat,
          chiqindiSumma: state.chiqindiSumma
        });

        state.yangiBirlikNarx = cost.yangiBirlikNarx;
        state.yangiJamiSumma = cost.yangiJamiSumma;

        const jamiLabel = document.getElementById("qiJamiXarajatLabel");
        const birlikLabel = document.getElementById("qiBirlikTannarxLabel");
        const lossBox = document.getElementById("qiYoqotishBox");

        if (jamiLabel) jamiLabel.textContent = fmtSum(cost.jamiXarajat);
        if (birlikLabel) birlikLabel.textContent = `${fmt(cost.yangiBirlikNarx, 2)} so'm`;

        if (lossBox) {
          const loss = computeTexnologikYoqotish(state.sarfMiqdor, state.yangiMiqdor, state.manbaBirlik, state.yangiBirlik);
          if (loss.sameUnit) {
            if (loss.yoqotishMiqdor > 0) {
              lossBox.innerHTML = `<span style="color:var(--text-normal);font-weight:600;">Texnologik yo'qotish (brak/chiqindi): ${fmt(loss.yoqotishMiqdor, 3)} ${escapeHtml(state.yangiBirlik)} (${loss.yoqotishFoiz}%)</span>`;
            } else if (loss.yoqotishMiqdor < 0) {
              lossBox.innerHTML = `<span style="color:var(--ok,#2f6f5e);font-weight:600;">Hajm ortishi: +${fmt(Math.abs(loss.yoqotishMiqdor), 3)} ${escapeHtml(state.yangiBirlik)}</span>`;
            } else {
              lossBox.innerHTML = `<span style="color:var(--ok,#2f6f5e);">Chiqish: 100% (yo'qotishsiz)</span>`;
            }
          } else {
            lossBox.innerHTML = `<span class="faint">O'lchov birliklari har xil: ${escapeHtml(state.manbaBirlik)} ➔ ${escapeHtml(state.yangiBirlik)}</span>`;
          }
        }
      }

      ["qiYangiTur", "qiYangiNomi", "qiYangiBirlik", "qiYangiMiqdor", "qiQoshimchaXarajat", "qiChiqindiNomi", "qiChiqindiSumma", "qiSana", "qiHujjatRaqami", "qiMasul", "qiIzoh"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener("input", updateStep2Cost);
          el.addEventListener("change", updateStep2Cost);
        }
      });
      updateStep2Cost();

      const saveBtn = document.getElementById("btnQiSave");
      const savePrintBtn = document.getElementById("btnQiSavePrint");

      const onSave = (andPrint) => {
        updateStep2Cost();
        if (!state.yangiNomi) {
          toast("Yangi mahsulot yoki xomashyo nomini kiriting", "err");
          return;
        }
        if (toNum(state.yangiMiqdor) <= 0) {
          toast("Olingan mahsulot miqdorini kiriting", "err");
          return;
        }
        executeQaytaIshlash(state, andPrint);
      };

      if (saveBtn) saveBtn.addEventListener("click", () => onSave(false));
      if (savePrintBtn) savePrintBtn.addEventListener("click", () => onSave(true));
    }
  }

  function render() {
    openModal(renderModalHtml(), { focus: true });
    bindEvents();
  }

  render();
}

async function executeQaytaIshlash(qiData, andPrint = false) {
  const docNo = qiData.hujjatRaqami || ("QI-" + Date.now().toString(36).toUpperCase());
  const sana = qiData.sana || todayISO();

  const chiqimRow = {
    sana,
    hujjatRaqami: docNo,
    kontragentInn: "",
    kontragentNomi: `Qayta ishlash: "${qiData.yangiNomi}" ga [QI]`,
    nomi: qiData.manbaNomi,
    birlik: qiData.manbaBirlik || "",
    miqdor: toNum(qiData.sarfMiqdor),
    narx: Math.round(toNum(qiData.manbaNarx) * 100) / 100,
    yetkazibBerishNarxi: Math.round(toNum(qiData.sarfSumma) * 100) / 100,
    qqsSumma: 0,
    yetkazibBerishNarxiQQSBilan: Math.round(toNum(qiData.sarfSumma) * 100) / 100,
    turi: "chiqim"
  };

  const kirimRow = {
    sana,
    hujjatRaqami: docNo,
    kontragentInn: "",
    kontragentNomi: `Qayta ishlashdan kirim ("${qiData.manbaNomi}" dan) [QI]`,
    nomi: qiData.yangiNomi,
    birlik: qiData.yangiBirlik || "",
    miqdor: toNum(qiData.yangiMiqdor),
    narx: Math.round(toNum(qiData.yangiBirlikNarx) * 100) / 100,
    yetkazibBerishNarxi: Math.round(toNum(qiData.yangiJamiSumma) * 100) / 100,
    qqsSumma: 0,
    yetkazibBerishNarxiQQSBilan: Math.round(toNum(qiData.yangiJamiSumma) * 100) / 100,
    turi: "kirim"
  };

  const rowsToInsert = [chiqimRow, kirimRow];

  if (qiData.chiqindiNomi && toNum(qiData.chiqindiSumma) > 0) {
    rowsToInsert.push({
      sana,
      hujjatRaqami: docNo,
      kontragentInn: "",
      kontragentNomi: `Qayta ishlash chiqindisi ("${qiData.manbaNomi}" dan) [QI]`,
      nomi: qiData.chiqindiNomi,
      birlik: qiData.chiqindiBirlik || qiData.manbaBirlik || "",
      miqdor: toNum(qiData.chiqindiMiqdor) || 1,
      narx: toNum(qiData.chiqindiMiqdor) > 0 ? Math.round((toNum(qiData.chiqindiSumma) / toNum(qiData.chiqindiMiqdor)) * 100) / 100 : toNum(qiData.chiqindiSumma),
      yetkazibBerishNarxi: Math.round(toNum(qiData.chiqindiSumma) * 100) / 100,
      qqsSumma: 0,
      yetkazibBerishNarxiQQSBilan: Math.round(toNum(qiData.chiqindiSumma) * 100) / 100,
      turi: "kirim"
    });
  }

  const dbRows = rowsToInsert.map((r) => toDbRow(OMBOR_DB_MAP, r));
  const { data, error } = await sbClient.from("ombor").insert(dbRows).select();
  if (error) {
    console.error(error);
    toast(isPermissionError(error) ? "Sizda omborga yozish huquqi yo'q" : "Qayta ishlashni saqlashda xatolik yuz berdi", "err");
    return false;
  }

  (data || []).forEach((row) => STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, row)));
  invalidateFifo();
  updateNavBadges();
  closeModal();

  if (CURRENT_PAGE === "ombor") renderOmbor();
  else if (CURRENT_PAGE === "ishlabchiqarish") renderIshlabChiqarish();
  else PAGES[CURRENT_PAGE].render();

  toast(`Mahsulot muvaffaqiyatli qayta ishlandi va omborga kirim qilindi! (${docNo})`);

  if (andPrint) {
    printQaytaIshlashDalolatnoma(qiData);
  }
  return true;
}

async function deleteQaytaIshlashEntry(docNo) {
  if (!docNo) return;
  const linked = STORE.ombor.filter((r) => r.hujjatRaqami === docNo);
  if (!linked.length) return;

  const manba = linked.find((r) => r.turi === "chiqim");
  const yangi = linked.find((r) => r.turi === "kirim" && !r.kontragentNomi.includes("chiqindi"));
  const desc = manba && yangi ? `"${manba.nomi}" ➔ "${yangi.nomi}"` : docNo;

  if (!confirm(`Ushbu qayta ishlash amaliyotini (${desc}) butunlay bekor qilib, sarflangan va kirim qilingan barcha qatorlarni o'chirishni tasdiqlaysizmi?`)) {
    return;
  }

  linked.forEach((r) => RECENTLY_DELETED.add(r.id));
  STORE.ombor = STORE.ombor.filter((r) => r.hujjatRaqami !== docNo);
  invalidateFifo();
  updateNavBadges();
  if (CURRENT_PAGE === "ombor") renderOmbor();
  else if (CURRENT_PAGE === "ishlabchiqarish") renderIshlabChiqarish();
  else PAGES[CURRENT_PAGE].render();

  const { error } = await sbClient.from("ombor").delete().in("id", linked.map((r) => r.id));
  if (error) {
    console.error(error);
    linked.forEach((r) => { RECENTLY_DELETED.delete(r.id); STORE.ombor.push(r); });
    invalidateFifo();
    updateNavBadges();
    if (CURRENT_PAGE === "ombor") renderOmbor();
    else PAGES[CURRENT_PAGE].render();
    toast(isPermissionError(error) ? "Sizda bu yozuvni o'chirish huquqi yo'q" : "O'chirishda xatolik", "err");
    return;
  }

  toast(`Qayta ishlash hujjati (${docNo}) va unga bog'liq barcha ombor harakatlari bekor qilindi`);
}

function printQaytaIshlashDalolatnoma(qiData) {
  const s = STORE.settings;
  const sameUnit = String(qiData.manbaBirlik || "").trim().toLowerCase() === String(qiData.yangiBirlik || "").trim().toLowerCase();
  const yoqotishMiqdor = sameUnit ? Math.max(0, toNum(qiData.sarfMiqdor) - toNum(qiData.yangiMiqdor)) : 0;
  const yoqotishFoiz = (sameUnit && toNum(qiData.sarfMiqdor) > 0) ? Math.round((yoqotishMiqdor / toNum(qiData.sarfMiqdor)) * 1000) / 10 : 0;

  const html = `
    <!DOCTYPE html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Qayta ishlash dalolatnomasi № ${escapeHtml(qiData.hujjatRaqami)}</title>
      <style>
        @page { size: A4 portrait; margin: 12mm 15mm; }
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.35; color: #000; margin: 0; padding: 0; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .firm-info { width: 55%; font-size: 10.5pt; }
        .firm-title { font-weight: bold; font-size: 13pt; text-transform: uppercase; margin-bottom: 2px; }
        .approve-block { width: 40%; text-align: right; font-size: 10pt; }
        .approve-title { font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
        h1 { text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 12px 0 4px; }
        .doc-sub { text-align: center; font-size: 11pt; margin-bottom: 14px; font-weight: 500; }
        .meta-text { text-align: justify; text-indent: 24px; margin-bottom: 12px; font-size: 10.5pt; }
        .sec-title { font-weight: bold; font-size: 11pt; margin: 12px 0 4px; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10pt; }
        th, td { border: 1px solid #000; padding: 4px 6px; }
        th { background: #f0f0f0; text-align: center; font-weight: bold; }
        .num { text-align: right; white-space: nowrap; }
        .center { text-align: center; }
        .summary-card { background: #fafafa; border: 1px solid #333; padding: 8px 12px; margin-bottom: 14px; font-size: 10.5pt; }
        .sign-grid { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; font-size: 10pt; page-break-inside: avoid; }
        .sign-line { border-bottom: 1px solid #000; display: inline-block; min-width: 140px; }
      </style>
    </head>
    <body>
      <div class="head">
        <div class="firm-info">
          <div class="firm-title">${escapeHtml(s.companyName || "KORXONA")}</div>
          <div>STIR (INN): <b>${escapeHtml(s.inn || "—")}</b></div>
          <div>Manzil: ${escapeHtml(s.address || "O'zbekiston Respublikasi")}</div>
        </div>
        <div class="approve-block">
          <div class="approve-title">«TASDIQLAYMAN»</div>
          <div>Korxona rahbari:</div>
          <div style="margin-top:20px;"><span class="sign-line"></span> (${escapeHtml(s.director || "__________________")})</div>
          <div style="margin-top:4px;">«____» ________________ 202___ y.</div>
        </div>
      </div>

      <h1>TOVAR-MODDIY ZAXIRALARNI QAYTA ISHLASH (KONVERTATSIYA) DALOLATNOMASI № ${escapeHtml(qiData.hujjatRaqami)}</h1>
      <div class="doc-sub">Sana: «${escapeHtml((qiData.sana || "").slice(8, 10))}» ${escapeHtml(UZ_MONTH_SHORT[new Date(qiData.sana || todayISO()).getMonth()] || "")} ${escapeHtml((qiData.sana || "").slice(0, 4))} yil</div>

      <div class="meta-text">
        Ushbu dalolatnoma komissiya a'zolari tomonidan korxona ishlab chiqarish va xo'jalik faoliyatida tovar-moddiy zaxiralarni qayta ishlash, navini saralash, modifikatsiya qilish hamda yangi turdagi tayyor mahsulot/xomashyoga aylantirish natijalarini rasmiylashtirish maqsadida tuzildi.
      </div>

      <div class="sec-title">1. Qayta ishlashga sarflangan manba tovar-moddiy zaxiralar (Ombor chiqimi)</div>
      <table>
        <thead>
          <tr>
            <th style="width:28px;">№</th>
            <th>Tovar / xomashyo nomi</th>
            <th style="width:70px;">O'lchov birligi</th>
            <th style="width:90px;" class="num">Sarflangan miqdor</th>
            <th style="width:110px;" class="num">Birlik narxi (so'm)</th>
            <th style="width:120px;" class="num">Jami sarf qiymati (so'm)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="center">1</td>
            <td><b>${escapeHtml(qiData.manbaNomi)}</b></td>
            <td class="center">${escapeHtml(qiData.manbaBirlik || "birlik")}</td>
            <td class="num font-bold"><b>${fmt(qiData.sarfMiqdor, 3)}</b></td>
            <td class="num">${fmt(qiData.manbaNarx, 2)}</td>
            <td class="num"><b>${fmtSum(qiData.sarfSumma)}</b></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="3" style="text-align:right;">JAMI SARF:</th>
            <th class="num">${fmt(qiData.sarfMiqdor, 3)}</th>
            <th></th>
            <th class="num">${fmtSum(qiData.sarfSumma)}</th>
          </tr>
        </tfoot>
      </table>

      <div class="sec-title">2. Qayta ishlash natijasida olingan yangi mahsulot / xomashyo (Ombor kirimi)</div>
      <table>
        <thead>
          <tr>
            <th style="width:28px;">№</th>
            <th>Yangi mahsulot / xomashyo nomi</th>
            <th style="width:110px;">Turi / Hisobvaraq</th>
            <th style="width:70px;">O'lchov birligi</th>
            <th style="width:90px;" class="num">Olingan miqdor</th>
            <th style="width:110px;" class="num">Yangi birlik tannarxi</th>
            <th style="width:120px;" class="num">Jami qiymati (so'm)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="center">1</td>
            <td><b>${escapeHtml(qiData.yangiNomi)}</b></td>
            <td class="center">${qiData.yangiTur === "mahsulot" ? "Tayyor mahsulot (2810)" : "Xomashyo (1010/2110)"}</td>
            <td class="center">${escapeHtml(qiData.yangiBirlik || "birlik")}</td>
            <td class="num"><b>${fmt(qiData.yangiMiqdor, 3)}</b></td>
            <td class="num"><b>${fmt(qiData.yangiBirlikNarx, 2)}</b></td>
            <td class="num"><b>${fmtSum(qiData.yangiJamiSumma)}</b></td>
          </tr>
          ${qiData.chiqindiNomi && toNum(qiData.chiqindiSumma) > 0 ? `
            <tr>
              <td class="center">2</td>
              <td>${escapeHtml(qiData.chiqindiNomi)} (Qaytariladigan chiqindi)</td>
              <td class="center">Chiqindi (1090)</td>
              <td class="center">${escapeHtml(qiData.chiqindiBirlik || qiData.manbaBirlik || "birlik")}</td>
              <td class="num">${fmt(qiData.chiqindiMiqdor, 3)}</td>
              <td class="num">${fmt(toNum(qiData.chiqindiSumma) / (toNum(qiData.chiqindiMiqdor) || 1), 2)}</td>
              <td class="num">${fmtSum(qiData.chiqindiSumma)}</td>
            </tr>
          ` : ""}
        </tbody>
        <tfoot>
          <tr>
            <th colspan="4" style="text-align:right;">JAMI KIRIM QIYMATI:</th>
            <th class="num">${fmt(toNum(qiData.yangiMiqdor) + toNum(qiData.chiqindiMiqdor || 0), 3)}</th>
            <th></th>
            <th class="num">${fmtSum(toNum(qiData.yangiJamiSumma) + toNum(qiData.chiqindiSumma || 0))}</th>
          </tr>
        </tfoot>
      </table>

      <div class="summary-card">
        <div style="font-weight:bold;margin-bottom:4px;text-transform:uppercase;">3. Texnologik Ko'rsatkichlar va Xarajatlar Balansi:</div>
        <div>• Manba sarf qiymati: <b>${fmtSum(qiData.sarfSumma)} so'm</b></div>
        ${toNum(qiData.qoshimchaXarajat) > 0 ? `<div>• Qo'shimcha qayta ishlash xarajatlari (mehnat, energiya): <b>+${fmtSum(qiData.qoshimchaXarajat)} so'm</b></div>` : ""}
        ${toNum(qiData.chiqindiSumma) > 0 ? `<div>• Chegirilgan chiqindilar qiymati: <b>-${fmtSum(qiData.chiqindiSumma)} so'm</b></div>` : ""}
        <div>• Yangi mahsulotning yakuniy to'liq tannarxi: <b>${fmtSum(qiData.yangiJamiSumma)} so'm</b> (1 ${escapeHtml(qiData.yangiBirlik)} = <b>${fmt(qiData.yangiBirlikNarx, 2)} so'm</b>)</div>
        ${sameUnit ? `<div>• Texnologik yo'qotish (brak/qiyqim/uvol): <b>${fmt(yoqotishMiqdor, 3)} ${escapeHtml(qiData.manbaBirlik)} (${yoqotishFoiz}%)</b></div>` : ""}
        ${qiData.izoh ? `<div>• Izoh: <i>${escapeHtml(qiData.izoh)}</i></div>` : ""}
      </div>

      <div class="meta-text" style="margin-top:10px;">
        Xulosa: Yuqorida sanab o'tilgan manba tovarlar to'liq hajmda texnologik qayta ishlandi, belgilangan sifat talablariga mos yangi mahsulot/xomashyo qabul qilib olindi va tegishli moddiy hisobga kirim qilindi.
      </div>

      <div class="sign-grid">
        <div>
          <div><b>Sex boshlig'i / Qayta ishlovchi:</b></div>
          <div style="margin-top:18px;"><span class="sign-line"></span> (${escapeHtml(qiData.masul || "__________________")})</div>
        </div>
        <div>
          <div><b>Moddiy javobgar shaxs (Omborchi):</b></div>
          <div style="margin-top:18px;"><span class="sign-line"></span> (${escapeHtml(s.omborchi || "__________________")})</div>
        </div>
        <div>
          <div><b>Bosh buxgalter:</b></div>
          <div style="margin-top:18px;"><span class="sign-line"></span> (${escapeHtml(s.accountant || "__________________")})</div>
        </div>
        <div>
          <div><b>Bosh texnolog / Mutaxassis:</b></div>
          <div style="margin-top:18px;"><span class="sign-line"></span> (__________________)</div>
        </div>
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 350);
}

function printQaytaIshlashDalolatnomaByDoc(docNo) {
  const linked = STORE.ombor.filter((r) => r.hujjatRaqami === docNo);
  if (!linked.length) {
    toast("Hujjat bo'yicha ma'lumot topilmadi", "err");
    return;
  }
  const chiqim = linked.find((r) => r.turi === "chiqim") || linked[0];
  const kirim = linked.find((r) => r.turi === "kirim" && !r.kontragentNomi.includes("chiqindi")) || linked[linked.length - 1];
  const chiqindi = linked.find((r) => r.turi === "kirim" && r.kontragentNomi.includes("chiqindi"));

  const qiData = {
    sana: chiqim.sana || todayISO(),
    hujjatRaqami: docNo,
    manbaNomi: chiqim.nomi,
    manbaBirlik: chiqim.birlik,
    sarfMiqdor: chiqim.miqdor,
    manbaNarx: chiqim.narx,
    sarfSumma: chiqim.yetkazibBerishNarxi || (chiqim.miqdor * chiqim.narx),
    yangiTur: "mahsulot",
    yangiNomi: kirim.nomi,
    yangiBirlik: kirim.birlik,
    yangiMiqdor: kirim.miqdor,
    yangiBirlikNarx: kirim.narx,
    yangiJamiSumma: kirim.yetkazibBerishNarxi || (kirim.miqdor * kirim.narx),
    qoshimchaXarajat: 0,
    chiqindiNomi: chiqindi ? chiqindi.nomi : "",
    chiqindiMiqdor: chiqindi ? chiqindi.miqdor : 0,
    chiqindiSumma: chiqindi ? (chiqindi.yetkazibBerishNarxi || (chiqindi.miqdor * chiqindi.narx)) : 0,
    masul: "",
    izoh: chiqim.kontragentNomi || ""
  };
  printQaytaIshlashDalolatnoma(qiData);
}

/* --------------------------------- Bank --------------------------------- */

let BANK_TAB_FILTER = "all"; // "all" | "5110" | "5210"

function renderBank() {
  const filtered = getFilteredRows(STORE.bank);
  const filtered5110 = filtered.filter((r) => !r.schyot || r.schyot === "5110" || (!r.valyuta || r.valyuta === "UZS"));
  const filtered5210 = filtered.filter((r) => r.schyot === "5210" || (r.valyuta && r.valyuta !== "UZS"));

  let displayRows = filtered;
  if (BANK_TAB_FILTER === "5110") displayRows = filtered5110;
  else if (BANK_TAB_FILTER === "5210") displayRows = filtered5210;

  const rows = displayRows.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");
  const t = computeTotals();
  const periodKirim = filtered.reduce((a, r) => a + toNum(r.kirim), 0);
  const periodChiqim = filtered.reduce((a, r) => a + toNum(r.chiqim), 0);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Bank harakati</h1>
        <p class="page-desc">5110 (Milliy valyuta) va 5210 (Valyuta hisobvarag'i) bo'yicha operatsiyalar. Markaziy Bank kurslari va BHMS 22 kurs farqlari integratsiyasi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnCbuRates"><svg class="ic" viewBox="0 0 24 24"><use href="#i-currency"/></svg>MB Kurslari</button>
        <button class="btn" id="btnKursFarqi"><svg class="ic" viewBox="0 0 24 24"><use href="#i-scale"/></svg>Kurs farqi (9540/9640)</button>
        <button class="btn" id="btnFindReplace">Izlash va almashtirish</button>
        <button class="btn" id="btnExportBank">Excel'ga eksport</button>
        <button class="btn" id="btn1CBank"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg>1C / Klient-Bank</button>
        <button class="btn" id="btnImport">Fayldan import</button>
        <button class="btn" id="btnAddValyutaRow">+ Valyuta (5210)</button>
        <button class="btn btn-primary" id="btnAddRow">+ Qo'shish (5110)</button>
      </div>
    </div>

    <!-- Hisobvaraqlar tab filtri -->
    <div class="filter-bar" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div class="segmented-control" id="bankTabControl">
        <button class="seg-btn ${BANK_TAB_FILTER === "all" ? "active" : ""}" data-tab="all">Barcha hisoblar (${filtered.length})</button>
        <button class="seg-btn ${BANK_TAB_FILTER === "5110" ? "active" : ""}" data-tab="5110"><span class="badge-5110">5110</span> So'm (${filtered5110.length})</button>
        <button class="seg-btn ${BANK_TAB_FILTER === "5210" ? "active" : ""}" data-tab="5210"><span class="badge-5210">5210</span> Valyuta (${filtered5210.length})</button>
      </div>
      <div class="note" style="margin:0;">"Joriy qoldiq" tanlangan davr oxirgi sanasiga nisbatan hisoblanadi.</div>
    </div>

    <div class="grid grid-4 section">
      <div class="card stat-card">
        <div class="stat-label">Boshlang'ich qoldiq (5110 UZS)</div>
        <input class="cell-input num" id="inOpening" style="font-size:18px;font-weight:700;padding:2px 4px;" value="${fmt(STORE.settings.bankOpeningBalance)}">
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:6px;">
          <span>5210 Valyuta ($):</span>
          <input class="cell-input num" id="inValyutaOpening" style="font-size:12px;font-weight:700;width:80px;padding:1px 4px;" value="${fmt(STORE.settings.valyutaOpeningBalance || 0)}">
        </div>
      </div>
      <div class="card stat-card"><div class="stat-label">Davr kirimi</div><div class="stat-value" id="statBankKirim">${fmtSum(periodKirim)}</div></div>
      <div class="card stat-card"><div class="stat-label">Davr chiqimi</div><div class="stat-value" id="statBankChiqim">${fmtSum(periodChiqim)}</div></div>
      <div class="card stat-card">
        <div class="stat-label">Joriy qoldiq (Jami pul)</div>
        <div class="stat-value" id="statBankQoldiq">${fmtSum(t.bankQoldiq)} <small style="font-size:12px;font-weight:normal;color:var(--text-muted);">so'm</small></div>
        ${t.valyuta5210SomQoldiq ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">shundan 5210: ${fmtSum(t.valyuta5210SomQoldiq)} so'm</div>` : ""}
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sana</th>
            <th>Hujjat №</th>
            <th>Schyot</th>
            <th>Valyuta</th>
            <th class="num">Valyuta summasi</th>
            <th class="num">MB Kursi</th>
            <th>Kontragent</th>
            <th>INN</th>
            <th>Tavsif</th>
            <th class="num">Kirim (UZS)</th>
            <th class="num">Chiqim (UZS)</th>
            <th title="Ishlab chiqarishga bevosita bog'lanmagan davriy xarajat — o'sha oyda sotilgan mahsulot miqdoriga bo'linib, kalkulyatsiya tannarxiga ulush sifatida qo'shiladi">Xizmat</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="bankBody"></tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-bank"/></svg><div class="t">Bank operatsiyalari yo'q</div><div class="d">"Fayldan import" tugmasi orqali bank ko'chirmasini (masalan, Bank.xlsx) yuklang yoki qo'lda kiriting.</div></div>` : ""}
    <div class="note"><b>5110 / 5210 ko'p valyutali tizim:</b> Valyuta tanlanganda Markaziy Bankning o'sha kungi kursi avtomatik yuklanadi. Valyutadagi summa kiritilganda so'mdagi kirim/chiqim avtomatik hisoblanadi. Davr oxirida "Kurs farqi (9540/9640)" tugmasi orqali BHMS 22 standarti bo'yicha qayta baholash amalga oshiriladi.</div>
    ${kontragentlarDatalistHtml()}
  `;

  document.getElementById("btnAddRow").addEventListener("click", () => addBankRow("5110", "UZS"));
  const btnValRow = document.getElementById("btnAddValyutaRow");
  if (btnValRow) btnValRow.addEventListener("click", () => addBankRow("5210", "USD"));

  document.getElementById("btnExportBank").addEventListener("click", () => exportBankXlsx(rows));
  document.getElementById("btn1CBank").addEventListener("click", () => open1CExchangeModal("bank"));
  document.getElementById("btnCbuRates").addEventListener("click", () => openCbuRatesModal());
  document.getElementById("btnKursFarqi").addEventListener("click", () => openKursFarqiModal());

  // Tab switcher
  const tabCtrl = document.getElementById("bankTabControl");
  if (tabCtrl) {
    tabCtrl.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      BANK_TAB_FILTER = btn.dataset.tab;
      renderBank();
    });
  }

  document.getElementById("btnFindReplace").addEventListener("click", () => openFindReplaceModal({
    rows: STORE.bank, storeType: "bank",
    fields: [{ key: "hujjatRaqami", label: "Hujjat №" }, { key: "kontragent", label: "Kontragent" }, { key: "tavsif", label: "Tavsif" }],
    onDone: renderBank
  }));
  document.getElementById("btnImport").addEventListener("click", openBankImportModal);

  document.getElementById("inOpening").addEventListener("change", (e) => {
    const partial = { bankOpeningBalance: toNum(e.target.value) };
    if (!guardSettingsPartial(partial)) { e.target.value = fmt(STORE.settings.bankOpeningBalance); return; }
    applySettingsChange(partial, { rerender: false });
    refreshBankSummary();
  });

  const inValOpen = document.getElementById("inValyutaOpening");
  if (inValOpen) {
    inValOpen.addEventListener("change", (e) => {
      const partial = { valyutaOpeningBalance: toNum(e.target.value) };
      if (!guardSettingsPartial(partial)) { e.target.value = fmt(STORE.settings.valyutaOpeningBalance || 0); return; }
      applySettingsChange(partial, { rerender: false });
      refreshBankSummary();
    });
  }

  bindBankRowEvents();
  renderRowsChunked(document.getElementById("bankBody"), rows, bankRowHtml);
}

function bankRowHtml(r) {
  const isValyuta = r.schyot === "5210" || (r.valyuta && r.valyuta !== "UZS");
  const valyutaCode = (r.valyuta || (r.schyot === "5210" ? "USD" : "UZS")).toUpperCase();

  return `
    <tr data-id="${r.id}">
      <td><input type="date" class="cell-input" data-f="sana" value="${escapeHtml(r.sana || "")}"></td>
      <td><input class="cell-input" data-f="hujjatRaqami" value="${escapeHtml(r.hujjatRaqami || "")}" style="min-width:80px"></td>
      <td>
        <select class="cell-input" data-f="schyot" style="min-width:70px;font-weight:700;">
          <option value="5110" ${!isValyuta ? "selected" : ""}>5110</option>
          <option value="5210" ${isValyuta ? "selected" : ""}>5210</option>
        </select>
      </td>
      <td>
        <select class="cell-input" data-f="valyuta" style="min-width:70px;font-weight:600;">
          <option value="UZS" ${valyutaCode === "UZS" ? "selected" : ""}>UZS</option>
          <option value="USD" ${valyutaCode === "USD" ? "selected" : ""}>USD ($)</option>
          <option value="EUR" ${valyutaCode === "EUR" ? "selected" : ""}>EUR (€)</option>
          <option value="RUB" ${valyutaCode === "RUB" ? "selected" : ""}>RUB (₽)</option>
        </select>
      </td>
      <td class="num">
        <input class="cell-input num num-fmt" data-f="valyutaSumma" value="${isValyuta ? fmt(r.valyutaSumma) : ""}" placeholder="${isValyuta ? "0" : "—"}" style="min-width:85px;" ${!isValyuta ? "disabled" : ""}>
      </td>
      <td class="num">
        <input class="cell-input num num-fmt" data-f="kurs" value="${isValyuta ? fmt(r.kurs) : ""}" placeholder="${isValyuta ? "1" : "—"}" style="min-width:80px;" ${!isValyuta ? "disabled" : ""}>
      </td>
      <td><input class="cell-input" data-f="kontragent" list="kontragentlarList" value="${escapeHtml(r.kontragent || "")}" style="min-width:160px"></td>
      <td><input class="cell-input" data-f="kontragentInn" value="${escapeHtml(r.kontragentInn || "")}" style="min-width:90px"></td>
      <td><input class="cell-input" data-f="tavsif" value="${escapeHtml(r.tavsif || "")}" style="min-width:200px" title="${escapeHtml(r.tavsif || "")}"></td>
      <td class="num"><input class="cell-input num num-fmt" data-f="kirim" value="${fmt(r.kirim)}"></td>
      <td class="num"><input class="cell-input num num-fmt" data-f="chiqim" value="${fmt(r.chiqim)}"></td>
      <td style="text-align:center;"><input type="checkbox" data-f="xizmat" ${r.xizmat ? "checked" : ""} title="Xizmat xarajati"></td>
      <td class="row-actions">
        ${kontragentHistoryBtnHtml(r.kontragentInn, "bank")}
        <button class="icon-btn" data-del="${r.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function exportBankXlsx(rows) {
  const s = STORE.settings;
  const t = computeTotals();
  const aoa = [
    [s.companyName], [`INN: ${s.inn}   Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`], ["Bank harakati"], [],
    ["Sana", "Hujjat №", "Schyot", "Valyuta", "Valyuta summasi", "MB Kursi", "Kontragent", "INN", "Tavsif", "Kirim (UZS)", "Chiqim (UZS)", "Xizmat"]
  ];
  rows.forEach((r) => aoa.push([
    r.sana,
    r.hujjatRaqami,
    r.schyot || "5110",
    r.valyuta || "UZS",
    toNum(r.valyutaSumma),
    toNum(r.kurs) || 1,
    r.kontragent,
    r.kontragentInn,
    r.tavsif,
    toNum(r.kirim),
    toNum(r.chiqim),
    r.xizmat ? "Ha" : "Yo'q"
  ]));
  aoa.push([]);
  aoa.push(["Boshlang'ich qoldiq (5110)", "", "", "", "", "", "", "", "", "", "", toNum(s.bankOpeningBalance)]);
  if (toNum(s.valyutaOpeningBalance)) {
    aoa.push(["Boshlang'ich qoldiq (5210 USD)", "", "", "", toNum(s.valyutaOpeningBalance), "", "", "", "", "", "", ""]);
  }
  aoa.push(["Joriy qoldiq (Jami)", "", "", "", "", "", "", "", "", "", "", toNum(t.bankQoldiq)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 24 }, { wch: 13 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bank");
  XLSX.writeFile(wb, `FORGET_bank_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function refreshBankSummary() {
  const t = computeTotals();
  const filtered = getFilteredRows(STORE.bank);
  const periodKirim = filtered.reduce((a, r) => a + toNum(r.kirim), 0);
  const periodChiqim = filtered.reduce((a, r) => a + toNum(r.chiqim), 0);
  const elK = document.getElementById("statBankKirim");
  const elC = document.getElementById("statBankChiqim");
  const elQ = document.getElementById("statBankQoldiq");
  if (elK) elK.textContent = fmtSum(periodKirim);
  if (elC) elC.textContent = fmtSum(periodChiqim);
  if (elQ) {
    elQ.innerHTML = `${fmtSum(t.bankQoldiq)} <small style="font-size:12px;font-weight:normal;color:var(--text-muted);">so'm</small>`;
  }
}

function bindBankRowEvents() {
  const body = document.getElementById("bankBody");
  if (!body) return;
  body.addEventListener("change", async (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const row = STORE.bank.find((r) => r.id === tr.dataset.id);
    if (!row) return;
    const field = e.target.dataset.f;
    if (!field) return;
    if (field !== "xizmat" && field !== "schyot" && field !== "valyuta" && !guardRowCell(e.target, field, row)) return;

    if (field === "schyot") {
      const sch = e.target.value;
      row.schyot = sch;
      if (sch === "5210" && (!row.valyuta || row.valyuta === "UZS")) {
        row.valyuta = "USD";
        row.kurs = getCbuRate("USD", row.sana);
      } else if (sch === "5110") {
        row.valyuta = "UZS";
        row.kurs = 1;
      }
      pushFieldsUpdate("bank", row.id, { schyot: row.schyot, valyuta: row.valyuta, kurs: row.kurs });
      saveStore();
      renderBank();
      return;
    }

    if (field === "valyuta") {
      const val = e.target.value;
      row.valyuta = val;
      if (val !== "UZS") {
        row.schyot = "5210";
        await fetchCbuRates(row.sana);
        row.kurs = getCbuRate(val, row.sana);
      } else {
        row.schyot = "5110";
        row.kurs = 1;
      }
      pushFieldsUpdate("bank", row.id, { schyot: row.schyot, valyuta: row.valyuta, kurs: row.kurs });
      saveStore();
      renderBank();
      return;
    }

    if (field === "valyutaSumma" || field === "kurs") {
      row[field] = toNum(e.target.value);
      const isVal = row.schyot === "5210" || (row.valyuta && row.valyuta !== "UZS");
      if (isVal) {
        const v = toNum(row.valyutaSumma);
        const k = toNum(row.kurs);
        if (v > 0 && k > 0) {
          if (toNum(row.kirim) > 0 || !toNum(row.chiqim)) {
            row.kirim = Math.round(v * k);
            pushFieldsUpdate("bank", row.id, { [field]: row[field], kirim: row.kirim });
          } else {
            row.chiqim = Math.round(v * k);
            pushFieldsUpdate("bank", row.id, { [field]: row[field], chiqim: row.chiqim });
          }
          saveStore();
          renderBank();
          return;
        }
      }
      pushFieldsUpdate("bank", row.id, { [field]: row[field] });
      saveStore();
      refreshBankSummary();
      return;
    }

    row[field] = field === "xizmat" ? e.target.checked : (field === "kirim" || field === "chiqim" ? toNum(e.target.value) : e.target.value);
    pushFieldsUpdate("bank", row.id, { [field]: row[field] });
    saveStore();
    if (field === "kirim" || field === "chiqim") {
      refreshBankSummary();
    } else if (field === "kontragent") {
      const match = resolveKontragentByNomi(row.kontragent);
      if (match && match.inn && !(row.kontragentInn || "").trim()) {
        row.kontragentInn = match.inn;
        pushFieldsUpdate("bank", row.id, { kontragentInn: row.kontragentInn });
        saveStore();
        renderBank();
        return;
      }
      ensureKontragentAutoAdded(row.kontragentInn, row.kontragent);
    } else if (field === "kontragentInn") {
      ensureKontragentAutoAdded(row.kontragentInn, row.kontragent);
    }
  });

  body.addEventListener("click", (e) => {
    const delId = e.target.dataset.del;
    if (delId) deleteRowSafe("bank", "bank", delId, renderBank);
  });
}

async function addBankRow(schyot = "5110", valyuta = "UZS") {
  const isVal = schyot === "5210" || valyuta !== "UZS";
  const vCode = isVal ? valyuta || "USD" : "UZS";
  let rate = 1;
  if (isVal) {
    await fetchCbuRates();
    rate = getCbuRate(vCode);
  }

  const newRow = {
    sana: todayISO(),
    hujjatRaqami: "",
    schyot: isVal ? "5210" : "5110",
    valyuta: vCode,
    valyutaSumma: 0,
    kurs: rate,
    kontragent: "",
    kontragentInn: "",
    tavsif: isVal ? `Valyuta to'lovi (${vCode})` : "",
    kirim: 0,
    chiqim: 0,
    xizmat: false
  };

  const { data, error } = await sbClient.from("bank").insert(toDbRow(BANK_DB_MAP, newRow)).select().single();
  if (error) { reportError(error, "Qo'shishda xatolik"); return; }
  const row = fromDbRow(BANK_DB_MAP, data);
  if (!STORE.bank.some((r) => r.id === row.id)) STORE.bank.push(row);
  saveStore();
  renderBank();
}

/* --------------------------------- Kassa (5010) --------------------------------- */
// O'zbekiston Respublikasi BHMS 21 va Yuridik shaxslar tomonidan kassa operatsiyalarini
// amalga oshirish qoidalariga to'liq moslashtirilgan kassa moduli:
//   - 5010: Milliy valyutadagi kassa
//   - KO-1: Kirim kassa orderi va kvitansiyasi
//   - KO-2: Chiqim kassa orderi
//   - KO-4: Kassa kitobi (kunlik qoldiqlar va operatsiyalar hisobi)

let KASSA_TAB_FILTER = "all"; // "all" | "kirim" | "chiqim"

function kassaQoldiqAsOf(asOfDate) {
  const s = STORE.settings;
  let balance = toNum(s.kassaOpeningBalance);
  const rows = STORE.kassa || [];
  for (const r of rows) {
    if (asOfDate && r.sana && r.sana > asOfDate) continue;
    const amt = toNum(r.summa);
    if (r.turi === "kirim") balance += amt;
    else if (r.turi === "chiqim") balance -= amt;
  }
  return balance;
}

function renderKassa() {
  const allFiltered = getFilteredRows(STORE.kassa || []);
  const rows = allFiltered.filter((r) => {
    if (KASSA_TAB_FILTER === "kirim") return r.turi === "kirim";
    if (KASSA_TAB_FILTER === "chiqim") return r.turi === "chiqim";
    return true;
  }).sort((a, b) => (b.sana || "").localeCompare(a.sana || "") || (b.hujjatRaqami || "").localeCompare(a.hujjatRaqami || ""));

  const main = document.getElementById("main");
  const t = computeTotals();
  const periodKirim = allFiltered.filter((r) => r.turi === "kirim").reduce((a, r) => a + toNum(r.summa), 0);
  const periodChiqim = allFiltered.filter((r) => r.turi === "chiqim").reduce((a, r) => a + toNum(r.summa), 0);
  const isNeg = t.kassaQoldiq < 0;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kassa operatsiyalari (5010)</h1>
        <p class="page-desc">Milliy valyutadagi naqd pul aylanmasi (KO-1 Kirim orderi, KO-2 Chiqim orderi va KO-4 Kassa kitobi). Qoldiq F1 Balansdagi "Pul mablag'lari"ga avtomatik qo'shiladi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnKassaKitobi"><svg class="ic" viewBox="0 0 24 24"><use href="#i-clipboard"/></svg> Kassa kitobi (KO-4)</button>
        <button class="btn" id="btnExportKassa">Excel'ga eksport</button>
        <button class="btn" id="btnImportKassa">Fayldan import</button>
        <button class="btn btn-secondary" id="btnAddKO2">+ Chiqim orderi (KO-2)</button>
        <button class="btn btn-primary" id="btnAddKO1">+ Kirim orderi (KO-1)</button>
      </div>
    </div>

    ${isNeg ? `<div class="alert alert-danger" style="margin-bottom:14px; display:flex; align-items:center; gap:8px;">
      <svg class="ic" viewBox="0 0 24 24"><use href="#i-warn"/></svg>
      <span><b>Diqqat: Kassa qoldig'i manfiy (${fmtSum(t.kassaQoldiq)})!</b> Amaldagi qoidalarga ko'ra, kassada haqiqiy naqd pul qoldig'i noldan kam bo'lishi mumkin emas. Iltimos, chiqim orderlarini yoki boshlang'ich qoldiqni tekshiring.</span>
    </div>` : ""}

    <div class="grid grid-4 section">
      <div class="card stat-card">
        <div class="stat-label">Boshlang'ich qoldiq</div>
        <input class="cell-input num" id="inKassaOpening" style="font-size:19px;font-weight:700;padding:2px 4px;" value="${fmt(STORE.settings.kassaOpeningBalance)}">
      </div>
      <div class="card stat-card"><div class="stat-label">Davr kirimi (KO-1)</div><div class="stat-value" id="statKassaKirim" style="color:var(--ok);">${fmtSum(periodKirim)}</div></div>
      <div class="card stat-card"><div class="stat-label">Davr chiqimi (KO-2)</div><div class="stat-value" id="statKassaChiqim" style="color:var(--danger);">${fmtSum(periodChiqim)}</div></div>
      <div class="card stat-card"><div class="stat-label">Joriy kassa qoldig'i</div><div class="stat-value ${isNeg ? "neg" : ""}" id="statKassaQoldiq">${fmtSum(t.kassaQoldiq)}</div></div>
    </div>

    <div class="filter-bar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <div class="filter-tabs">
        <button class="filter-tab ${KASSA_TAB_FILTER === "all" ? "active" : ""}" data-ktab="all">Barchasi (${allFiltered.length})</button>
        <button class="filter-tab ${KASSA_TAB_FILTER === "kirim" ? "active" : ""}" data-ktab="kirim">Kirim orderlari (${allFiltered.filter((r) => r.turi === "kirim").length})</button>
        <button class="filter-tab ${KASSA_TAB_FILTER === "chiqim" ? "active" : ""}" data-ktab="chiqim">Chiqim orderlari (${allFiltered.filter((r) => r.turi === "chiqim").length})</button>
      </div>
      <div class="faint" style="font-size:12px;">Tanlangan davr bo'yicha: <b>${rows.length}</b> ta operatsiya</div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:100px;">Sana</th>
            <th style="width:110px;">Hujjat №</th>
            <th style="width:120px;">Turi</th>
            <th style="width:80px; text-align:center;">Schyot</th>
            <th style="width:180px;">Kimdan / Kimga</th>
            <th style="width:180px;">Kontragent</th>
            <th>Asosi (Tavsif)</th>
            <th class="num" style="width:130px;">Kirim (so'm)</th>
            <th class="num" style="width:130px;">Chiqim (so'm)</th>
            <th style="width:110px;"></th>
          </tr>
        </thead>
        <tbody id="kassaBody"></tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-cash"/></svg><div class="t">Kassa operatsiyalari yo'q</div><div class="d">"+ Kirim orderi (KO-1)" yoki "+ Chiqim orderi (KO-2)" tugmalari orqali naqd pul harakatini kiriting.</div></div>` : ""}
    <div class="note"><b>5010 kassa harakatlari:</b> Kirim orderlari (KO-1) va Chiqim orderlari (KO-2) rasmiy A4 blankalarida avtomatik chop etiladi. Kontragent INN ko'rsatilgan bo'lsa, o'zaro hisob-kitoblar Solishtirma dalolatnoma (Sverka)ga to'g'ridan-to'g'ri integratsiya bo'ladi.</div>
    ${kontragentlarDatalistHtml()}
  `;

  document.getElementById("btnAddKO1").addEventListener("click", () => openKassaModal("kirim"));
  document.getElementById("btnAddKO2").addEventListener("click", () => openKassaModal("chiqim"));
  document.getElementById("btnKassaKitobi").addEventListener("click", openKassaKitobiModal);
  document.getElementById("btnExportKassa").addEventListener("click", () => exportKassaXlsx(rows));
  document.getElementById("btnImportKassa").addEventListener("click", openKassaImportModal);

  document.getElementById("inKassaOpening").addEventListener("change", (e) => {
    const partial = { kassaOpeningBalance: toNum(e.target.value) };
    if (!guardSettingsPartial(partial)) { e.target.value = fmt(STORE.settings.kassaOpeningBalance); return; }
    applySettingsChange(partial, { rerender: false });
    refreshKassaSummary();
  });

  main.querySelectorAll("[data-ktab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      KASSA_TAB_FILTER = btn.dataset.ktab;
      renderKassa();
    });
  });

  bindKassaRowEvents();
  renderRowsChunked(document.getElementById("kassaBody"), rows, kassaRowHtml);
}

function kassaRowHtml(r) {
  const isKirim = r.turi === "kirim";
  const summa = toNum(r.summa);
  const badgeHtml = isKirim
    ? `<span class="badge-kassa-kirim"><svg class="ic" style="width:12px;height:12px;" viewBox="0 0 24 24"><use href="#i-in"/></svg> KO-1 Kirim</span>`
    : `<span class="badge-kassa-chiqim"><svg class="ic" style="width:12px;height:12px;" viewBox="0 0 24 24"><use href="#i-out"/></svg> KO-2 Chiqim</span>`;

  const schyotHtml = r.schyot ? `<span class="schyot-tag">${escapeHtml(r.schyot)}</span>` : `<span class="faint">—</span>`;
  const kontragentHtml = r.kontragent
    ? `<span>${escapeHtml(r.kontragent)}${r.kontragentInn ? ` <span class="faint">(${escapeHtml(r.kontragentInn)})</span>` : ""}</span>`
    : `<span class="faint">—</span>`;

  return `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.sana || "")}</td>
      <td style="font-weight:600;">${escapeHtml(r.hujjatRaqami || "—")}</td>
      <td>${badgeHtml}</td>
      <td style="text-align:center;">${schyotHtml}</td>
      <td>${escapeHtml(r.kimdanKimga || "—")}</td>
      <td>${kontragentHtml}</td>
      <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(r.tavsif || "")}">${escapeHtml(r.tavsif || "—")}</td>
      <td class="num" style="font-weight:600; color:var(--ok);">${isKirim ? fmtSum(summa) : "—"}</td>
      <td class="num" style="font-weight:600; color:var(--danger);">${!isKirim ? fmtSum(summa) : "—"}</td>
      <td class="row-actions">
        <button class="icon-btn" data-print-kassa="${r.id}" title="${isKirim ? 'KO-1 Kirim orderini chop etish' : 'KO-2 Chiqim orderini chop etish'}">
          <svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg>
        </button>
        ${r.kontragentInn ? kontragentHistoryBtnHtml(r.kontragentInn, "kassa") : ""}
        <button class="icon-btn" data-edit-kassa="${r.id}" title="Tahrirlash">
          <svg class="ic" viewBox="0 0 24 24"><use href="#i-edit"/></svg>
        </button>
        <button class="icon-btn" data-del-kassa="${r.id}" title="O'chirish">
          <svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function refreshKassaSummary() {
  const t = computeTotals();
  const allFiltered = getFilteredRows(STORE.kassa || []);
  const periodKirim = allFiltered.filter((r) => r.turi === "kirim").reduce((a, r) => a + toNum(r.summa), 0);
  const periodChiqim = allFiltered.filter((r) => r.turi === "chiqim").reduce((a, r) => a + toNum(r.summa), 0);
  const elK = document.getElementById("statKassaKirim");
  const elC = document.getElementById("statKassaChiqim");
  const elQ = document.getElementById("statKassaQoldiq");
  if (elK) elK.textContent = fmtSum(periodKirim);
  if (elC) elC.textContent = fmtSum(periodChiqim);
  if (elQ) {
    elQ.textContent = fmtSum(t.kassaQoldiq);
    elQ.classList.toggle("neg", t.kassaQoldiq < 0);
  }
}

function bindKassaRowEvents() {
  const body = document.getElementById("kassaBody");
  if (!body) return;
  body.addEventListener("click", (e) => {
    const printBtn = e.target.closest("[data-print-kassa]");
    if (printBtn) {
      const id = printBtn.dataset.printKassa;
      const r = (STORE.kassa || []).find((x) => x.id === id);
      if (r) {
        if (r.turi === "kirim") printKO1(id);
        else printKO2(id);
      }
      return;
    }
    const editBtn = e.target.closest("[data-edit-kassa]");
    if (editBtn) {
      const id = editBtn.dataset.editKassa;
      const r = (STORE.kassa || []).find((x) => x.id === id);
      if (r) openKassaModal(r.turi, r);
      return;
    }
    const delBtn = e.target.closest("[data-del-kassa]");
    if (delBtn) {
      const id = delBtn.dataset.delKassa;
      if (id) {
        const r = (STORE.kassa || []).find((x) => x.id === id);
        const nom = r ? `${r.hujjatRaqami || "Kassa orderi"} (${fmtSum(r.summa)})` : "Kassa yozuvi";
        if (confirm(`${nom} ni o'chirishni tasdiqlaysizmi?`)) {
          deleteRowSafe("kassa", "kassa", id, renderKassa);
        }
      }
      return;
    }
  });
}

function openKassaModal(turi, editRow) {
  const isKirim = (turi || (editRow ? editRow.turi : "kirim")) === "kirim";
  const prefix = isKirim ? "KO-1" : "KO-2";
  const sameTypeCount = (STORE.kassa || []).filter((x) => x.turi === (isKirim ? "kirim" : "chiqim")).length + 1;
  const defaultDocNo = editRow ? (editRow.hujjatRaqami || "") : `${prefix}/${String(sameTypeCount).padStart(3, "0")}`;

  const schyotOptions = isKirim ? [
    { val: "4010", lbl: "4010 — Xaridor va buyurtmachilardan to'lov" },
    { val: "5110", lbl: "5110 — Bank hisobvarag'idan naqd pul yechish (chek)" },
    { val: "4210", lbl: "4210 — Hisobdor shaxsdan qaytgan avans qoldig'i" },
    { val: "4610", lbl: "4610 — Ta'sischilar badallari (ustav kapitali)" },
    { val: "9390", lbl: "9390 — Boshqa operatsion daromadlar / naqd tushum" }
  ] : [
    { val: "6710", lbl: "6710 — Xodimlarga mehnat haqi (ish haqi) to'lash" },
    { val: "6010", lbl: "6010 — Mol yetkazib beruvchilarga (ta'minotchiga) to'lov" },
    { val: "4210", lbl: "4210 — Hisobdor shaxsga avans (xizmat safari / xo'jalik)" },
    { val: "5110", lbl: "5110 — Bankka topshirish (inkassatsiya)" },
    { val: "9420", lbl: "9420 — Ma'muriy va boshqa davriy xarajatlar" }
  ];

  const currentSchyot = editRow ? editRow.schyot : (isKirim ? "4010" : "6710");

  openModal(`
    <h3>${editRow ? "Tahrirlash: " : "Yangi "}${isKirim ? "Kassa kirim orderi (KO-1)" : "Kassa chiqim orderi (KO-2)"}</h3>
    <p class="modal-sub">${isKirim ? "Mablag' qabul qilish: Dt 5010 (Kassa) / Kt Korrespondent schyot" : "Mablag' to'lash / berish: Dt Korrespondent schyot / Kt 5010 (Kassa)"}</p>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="field">
        <label>Sana <span style="color:var(--danger)">*</span></label>
        <input type="date" id="kSana" value="${editRow ? escapeHtml(editRow.sana || "") : todayISO()}">
      </div>
      <div class="field">
        <label>Order raqami <span style="color:var(--danger)">*</span></label>
        <input id="kHujjatRaqami" value="${escapeHtml(defaultDocNo)}" placeholder="masalan: KO-1/001">
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:12px;">
      <div class="field">
        <label>Korrespondent schyot <span style="color:var(--danger)">*</span></label>
        <select id="kSchyot">
          ${schyotOptions.map((o) => `<option value="${o.val}" ${o.val === currentSchyot ? "selected" : ""}>${o.lbl}</option>`).join("")}
          <option value="boshqa" ${!schyotOptions.some((o) => o.val === currentSchyot) && editRow ? "selected" : ""}>Boshqa schyot (qo'lda kiritish)...</option>
        </select>
        <input id="kSchyotCustom" style="margin-top:6px; display:${!schyotOptions.some((o) => o.val === currentSchyot) && editRow ? "block" : "none"};" value="${escapeHtml(currentSchyot)}" placeholder="Schyot kodi (masalan: 9410)">
      </div>
      <div class="field">
        <label>Summa (so'm) <span style="color:var(--danger)">*</span></label>
        <input class="num" id="kSumma" value="${editRow ? fmt(editRow.summa) : ""}" placeholder="0" style="font-size:16px; font-weight:700;">
        <div id="kSummaSoz" class="faint" style="font-size:11px; margin-top:4px; min-height:16px;"></div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="field">
        <label>${isKirim ? "Kimdan qabul qilindi (F.I.Sh)" : "Kimga to'lansin / berilsin (F.I.Sh)"}</label>
        <input id="kKimdanKimga" value="${escapeHtml(editRow ? (editRow.kimdanKimga || "") : "")}" placeholder="masalan: Karimov Alisher">
      </div>
      <div class="field">
        <label>Kontragent (agar mavjud bo'lsa)</label>
        <input id="kKontragent" list="kontragentlarList" value="${escapeHtml(editRow ? (editRow.kontragent || "") : "")}" placeholder="Tashkilot nomi">
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div class="field">
        <label>Kontragent INN</label>
        <input id="kKontragentInn" maxlength="9" value="${escapeHtml(editRow ? (editRow.kontragentInn || "") : "")}" placeholder="9 ta raqam">
      </div>
      <div class="field">
        <label>Ilova qilingan hujjatlar</label>
        <input id="kHujjatAsosi" value="${escapeHtml(editRow ? (editRow.hujjatAsosi || "") : "")}" placeholder="masalan: Shartnoma №12, Chek №44">
      </div>
    </div>

    <div class="field">
      <label>To'lov maqsadi / asosi <span style="color:var(--danger)">*</span></label>
      <input id="kTavsif" value="${escapeHtml(editRow ? (editRow.tavsif || "") : "")}" placeholder="masalan: 2026-yil sentyabr oyi ish haqi">
    </div>

    ${!isKirim ? `
      <div class="field">
        <label>Oluvchining shaxsini tasdiqlovchi hujjat (Pasport)</label>
        <input id="kPasport" value="${escapeHtml(editRow ? (editRow.pasport || "") : "")}" placeholder="Seriya, raqam, kim tomonidan va qachon berilgan">
      </div>
    ` : ""}

    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSaveKassa">Saqlash</button>
    </div>
  `);

  document.getElementById("mCancel").addEventListener("click", closeModal);

  const schyotSel = document.getElementById("kSchyot");
  const schyotCustom = document.getElementById("kSchyotCustom");
  schyotSel.addEventListener("change", () => {
    schyotCustom.style.display = schyotSel.value === "boshqa" ? "block" : "none";
    if (schyotSel.value !== "boshqa") schyotCustom.value = schyotSel.value;
  });

  const summaInput = document.getElementById("kSumma");
  const summaSozDiv = document.getElementById("kSummaSoz");
  const updateSoz = () => {
    const val = toNum(summaInput.value);
    summaSozDiv.textContent = val > 0 ? summaSozBilan(val) : "";
  };
  summaInput.addEventListener("input", updateSoz);
  updateSoz();

  const kontragentInp = document.getElementById("kKontragent");
  const kontragentInnInp = document.getElementById("kKontragentInn");
  kontragentInp.addEventListener("change", () => {
    const match = resolveKontragentByNomi(kontragentInp.value);
    if (match && match.inn && !kontragentInnInp.value.trim()) {
      kontragentInnInp.value = match.inn;
    }
  });

  document.getElementById("mSaveKassa").addEventListener("click", async () => {
    const sana = document.getElementById("kSana").value.trim();
    const hujjatRaqami = document.getElementById("kHujjatRaqami").value.trim();
    const summa = toNum(summaInput.value);
    const schyot = (schyotSel.value === "boshqa" ? schyotCustom.value.trim() : schyotSel.value) || (isKirim ? "4010" : "6710");
    const kimdanKimga = document.getElementById("kKimdanKimga").value.trim();
    const kontragent = kontragentInp.value.trim();
    const kontragentInn = kontragentInnInp.value.trim();
    const tavsif = document.getElementById("kTavsif").value.trim();
    const hujjatAsosi = document.getElementById("kHujjatAsosi").value.trim();
    const pasport = !isKirim ? document.getElementById("kPasport").value.trim() : "";

    if (!sana) { toast("Sanani tanlang", "err"); return; }
    if (!hujjatRaqami) { toast("Order raqamini kiriting", "err"); return; }
    if (summa <= 0) { toast("Summani to'g'ri kiriting", "err"); return; }
    if (!tavsif) { toast("To'lov asosini (tavsif) kiriting", "err"); return; }

    if (!isKirim) {
      const currentBalance = kassaQoldiqAsOf(todayISO());
      const oldSumma = editRow ? toNum(editRow.summa) : 0;
      if (currentBalance + oldSumma < summa) {
        if (!confirm(`Diqqat: Kassada joriy qoldiq ${fmtSum(currentBalance)}. Chiqim summasi (${fmtSum(summa)}) mavjud qoldiqdan oshib ketadi va kassa balansi manfiy bo'ladi.\n\nBaribir tasdiqlaysizmi?`)) {
          return;
        }
      }
    }

    const payload = {
      sana, hujjatRaqami, turi: isKirim ? "kirim" : "chiqim",
      schyot, summa, tavsif, kimdanKimga, kontragent, kontragentInn,
      hujjatAsosi, pasport
    };

    if (editRow) {
      Object.assign(editRow, payload);
      pushFieldsUpdate("kassa", editRow.id, payload);
      toast("Kassa orderi yangilandi");
    } else {
      const dbRow = toDbRow(KASSA_DB_MAP, payload);
      const { data, error } = await sbClient.from("kassa").insert(dbRow).select().single();
      if (error) { reportError(error, "Saqlashda xatolik"); return; }
      const newRow = fromDbRow(KASSA_DB_MAP, data);
      if (!STORE.kassa) STORE.kassa = [];
      STORE.kassa.push(newRow);
      toast(`${isKirim ? "Kirim orderi (KO-1)" : "Chiqim orderi (KO-2)"} saqlandi`);
    }

    if (kontragentInn) {
      await ensureKontragentAutoAdded(kontragentInn, kontragent || kimdanKimga);
    }

    saveStore();
    closeModal();
    updateNavBadges();
    renderKassa();
  });
}

function printKO1(kassaId) {
  const r = (STORE.kassa || []).find((x) => x.id === kassaId);
  if (!r) return;
  const s = STORE.settings;
  const summaSoz = summaSozBilan(r.summa);

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="utf-8">
      <title>KO-1 Kirim kassa orderi № ${escapeHtml(r.hujjatRaqami || "")}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm 15mm; }
        * { box-sizing: border-box; }
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin: 0; padding: 0; line-height: 1.3; }
        .ko1-container { display: flex; width: 100%; border: 1px solid #333; }
        .ko1-order { flex: 65; padding: 12px 18px; border-right: 2px dashed #666; }
        .ko1-kvit { flex: 35; padding: 12px 16px; }
        .company-header { font-size: 11pt; font-weight: bold; margin-bottom: 2px; }
        .company-sub { font-size: 9.5pt; color: #333; margin-bottom: 8px; }
        .doc-title { text-align: center; font-weight: bold; font-size: 12pt; text-transform: uppercase; margin: 6px 0 2px; }
        .doc-meta { text-align: center; font-size: 10pt; margin-bottom: 10px; }
        .tbl-codes { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 9.5pt; }
        .tbl-codes th, .tbl-codes td { border: 1px solid #000; padding: 4px 6px; text-align: center; }
        .tbl-codes th { background: #f2f2f2; font-weight: bold; }
        .line-item { margin: 6px 0; font-size: 10.5pt; display: flex; align-items: flex-end; }
        .line-item .lbl { white-space: nowrap; font-weight: normal; margin-right: 6px; }
        .line-item .val { flex: 1; border-bottom: 1px solid #000; font-weight: bold; min-height: 18px; padding-left: 4px; }
        .sign-row { margin-top: 14px; font-size: 10pt; display: flex; justify-content: space-between; align-items: flex-end; }
        .sign-row .lbl { font-weight: bold; }
        .sign-line { border-bottom: 1px solid #000; flex: 1; margin: 0 8px; }
        .stamp-box { width: 75px; height: 75px; border: 1px dashed #777; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9pt; color: #777; margin: 15px auto 5px; }
      </style>
    </head>
    <body>
      <div class="ko1-container">
        <div class="ko1-order">
          <div style="float: right; font-size: 9pt; font-style: italic;">Shakl № KO-1</div>
          <div class="company-header">${escapeHtml(s.companyName || "Korxona")}</div>
          <div class="company-sub">INN: ${escapeHtml(s.inn || "—")}</div>
          <div style="clear: both;"></div>

          <div class="doc-title">KIRIM KASSA ORDERI № ${escapeHtml(r.hujjatRaqami || "—")}</div>
          <div class="doc-meta">Tuzilgan sana: <b>${escapeHtml(r.sana || "")}</b></div>

          <table class="tbl-codes">
            <thead>
              <tr>
                <th rowspan="2">Debet (schyot)</th>
                <th colspan="2">Kredit</th>
                <th rowspan="2">Summa, so'm</th>
                <th rowspan="2">Maqsad kodi</th>
              </tr>
              <tr>
                <th>Korrespondent schyot</th>
                <th>Subschyot</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>5010</b></td>
                <td><b>${escapeHtml(r.schyot || "4010")}</b></td>
                <td>—</td>
                <td style="font-weight:bold;">${fmtSum(r.summa)}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>

          <div class="line-item">
            <span class="lbl">Kimdan qabul qilindi:</span>
            <span class="val">${escapeHtml(r.kimdanKimga || r.kontragent || "—")}${r.kontragentInn ? " (INN: " + escapeHtml(r.kontragentInn) + ")" : ""}</span>
          </div>
          <div class="line-item">
            <span class="lbl">Asosi:</span>
            <span class="val">${escapeHtml(r.tavsif || "—")}</span>
          </div>
          <div class="line-item">
            <span class="lbl">Summa so'z bilan:</span>
            <span class="val">${escapeHtml(summaSoz)}</span>
          </div>
          <div class="line-item">
            <span class="lbl">Ilova:</span>
            <span class="val">${escapeHtml(r.hujjatAsosi || "—")}</span>
          </div>

          <div style="margin-top: 22px;">
            <div class="sign-row">
              <span class="lbl">Bosh buxgalter:</span>
              <span class="sign-line"></span>
              <span>_________________________ (imzo, F.I.Sh)</span>
            </div>
            <div class="sign-row" style="margin-top: 12px;">
              <span class="lbl">Pulni qabul qildim (Kassir):</span>
              <span class="sign-line"></span>
              <span>_________________________ (imzo, F.I.Sh)</span>
            </div>
          </div>
        </div>

        <div class="ko1-kvit">
          <div style="font-size: 8.5pt; text-align: right; font-style: italic;">KO-1 ga ilova</div>
          <div class="company-header" style="font-size: 10pt;">${escapeHtml(s.companyName || "Korxona")}</div>
          <div class="company-sub" style="font-size: 8.5pt;">INN: ${escapeHtml(s.inn || "—")}</div>

          <div class="doc-title" style="font-size: 10.5pt; margin-top: 10px;">KVITANSIYA</div>
          <div class="doc-meta" style="font-size: 9pt;">Kirim kassa orderi № <b>${escapeHtml(r.hujjatRaqami || "—")}</b> ga</div>
          <div class="doc-meta" style="font-size: 9pt; margin-top:-6px;">Sana: <b>${escapeHtml(r.sana || "")}</b></div>

          <div class="line-item" style="font-size: 9.5pt;">
            <span class="lbl">Qabul qilindi:</span>
            <span class="val">${escapeHtml(r.kimdanKimga || r.kontragent || "—")}</span>
          </div>
          <div class="line-item" style="font-size: 9.5pt;">
            <span class="lbl">Asosi:</span>
            <span class="val">${escapeHtml(r.tavsif || "—")}</span>
          </div>
          <div class="line-item" style="font-size: 9.5pt;">
            <span class="lbl">Summa:</span>
            <span class="val">${fmtSum(r.summa)} so'm</span>
          </div>
          <div class="line-item" style="font-size: 9pt;">
            <span class="lbl">So'z bilan:</span>
            <span class="val" style="font-size: 8.5pt;">${escapeHtml(summaSoz)}</span>
          </div>

          <div class="stamp-box">M.O'.<br>(Shtamp)</div>

          <div style="margin-top: 15px; font-size: 9pt;">
            <div class="sign-row" style="margin-top: 6px;">
              <span>Bosh buxgalter:</span>
              <span class="sign-line"></span>
            </div>
            <div class="sign-row" style="margin-top: 6px;">
              <span>Kassir:</span>
              <span class="sign-line"></span>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  openPrintWindow(html);
}

function printKO2(kassaId) {
  const r = (STORE.kassa || []).find((x) => x.id === kassaId);
  if (!r) return;
  const s = STORE.settings;
  const rahbar = s.rahbar || "_________________________";
  const summaSoz = summaSozBilan(r.summa);

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="utf-8">
      <title>KO-2 Chiqim kassa orderi № ${escapeHtml(r.hujjatRaqami || "")}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm 20mm; }
        * { box-sizing: border-box; }
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin: 0; padding: 0; line-height: 1.35; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .company-header { font-size: 12pt; font-weight: bold; }
        .company-sub { font-size: 10pt; color: #333; }
        .shakl-no { font-size: 9.5pt; font-style: italic; text-align: right; }
        .doc-title { text-align: center; font-weight: bold; font-size: 14pt; text-transform: uppercase; margin: 14px 0 4px; }
        .doc-meta { text-align: center; font-size: 11pt; margin-bottom: 14px; }
        .tbl-codes { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10pt; }
        .tbl-codes th, .tbl-codes td { border: 1px solid #000; padding: 5px 8px; text-align: center; }
        .tbl-codes th { background: #f2f2f2; font-weight: bold; }
        .line-item { margin: 8px 0; font-size: 11pt; display: flex; align-items: flex-end; }
        .line-item .lbl { white-space: nowrap; font-weight: normal; margin-right: 6px; }
        .line-item .val { flex: 1; border-bottom: 1px solid #000; font-weight: bold; min-height: 20px; padding-left: 6px; }
        .sign-row { margin-top: 14px; font-size: 10.5pt; display: flex; justify-content: space-between; align-items: flex-end; }
        .sign-row .lbl { font-weight: bold; min-width: 130px; }
        .sign-line { border-bottom: 1px solid #000; flex: 1; margin: 0 10px; }
        .received-box { border: 1px solid #000; padding: 12px 16px; margin-top: 20px; }
        .received-title { font-weight: bold; font-size: 10.5pt; margin-bottom: 6px; }
      </style>
    </head>
    <body>
      <div class="header-top">
        <div>
          <div class="company-header">${escapeHtml(s.companyName || "Korxona")}</div>
          <div class="company-sub">INN: ${escapeHtml(s.inn || "—")}</div>
        </div>
        <div class="shakl-no">
          O'zbekiston standarti<br>
          <b>Shakl № KO-2</b>
        </div>
      </div>

      <div class="doc-title">CHIQIM KASSA ORDERI № ${escapeHtml(r.hujjatRaqami || "—")}</div>
      <div class="doc-meta">Tuzilgan sana: <b>${escapeHtml(r.sana || "")}</b></div>

      <table class="tbl-codes">
        <thead>
          <tr>
            <th colspan="2">Debet</th>
            <th rowspan="2">Kredit (schyot)</th>
            <th rowspan="2">Summa, so'm</th>
            <th rowspan="2">Maqsad kodi</th>
          </tr>
          <tr>
            <th>Korrespondent schyot</th>
            <th>Subschyot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>${escapeHtml(r.schyot || "6010")}</b></td>
            <td>—</td>
            <td><b>5010</b></td>
            <td style="font-weight:bold;">${fmtSum(r.summa)}</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>

      <div class="line-item">
        <span class="lbl">Berilsin (Kimga):</span>
        <span class="val">${escapeHtml(r.kimdanKimga || r.kontragent || "—")}${r.kontragentInn ? " (INN: " + escapeHtml(r.kontragentInn) + ")" : ""}</span>
      </div>
      <div class="line-item">
        <span class="lbl">Asosi:</span>
        <span class="val">${escapeHtml(r.tavsif || "—")}</span>
      </div>
      <div class="line-item">
        <span class="lbl">Summa so'z bilan:</span>
        <span class="val">${escapeHtml(summaSoz)}</span>
      </div>
      <div class="line-item">
        <span class="lbl">Ilova:</span>
        <span class="val">${escapeHtml(r.hujjatAsosi || "—")}</span>
      </div>

      <div style="margin-top: 24px;">
        <div class="sign-row">
          <span class="lbl">Korxona rahbari:</span>
          <span class="sign-line"></span>
          <span>${escapeHtml(rahbar)}</span>
        </div>
        <div class="sign-row" style="margin-top: 14px;">
          <span class="lbl">Bosh buxgalter:</span>
          <span class="sign-line"></span>
          <span>_________________________ (imzo, F.I.Sh)</span>
        </div>
      </div>

      <div class="received-box">
        <div class="received-title">PULNI OLUVCHI TARKIBI VA TILXATI:</div>
        <div class="line-item">
          <span class="lbl">Oldim (summa so'z bilan):</span>
          <span class="val"></span>
        </div>
        <div class="line-item" style="margin-top: 10px;">
          <span class="lbl">Oluvchining imzosi:</span>
          <span class="val" style="flex:0.4;"></span>
          <span class="lbl" style="margin-left: 15px;">Sana:</span>
          <span class="val" style="flex:0.4;">"____" ______________ 20___ y.</span>
        </div>
        <div class="line-item" style="margin-top: 10px;">
          <span class="lbl">Shaxsini tasdiqlovchi hujjat:</span>
          <span class="val">${escapeHtml(r.pasport || "Pasport: ____________________________________________________")}</span>
        </div>
      </div>

      <div class="sign-row" style="margin-top: 24px;">
        <span class="lbl">Pulni berdim (Kassir):</span>
        <span class="sign-line"></span>
        <span>_________________________ (imzo, F.I.Sh)</span>
      </div>
    </body>
    </html>
  `;
  openPrintWindow(html);
}

function openKassaKitobiModal() {
  const s = STORE.settings;
  const initialDate = s.filterTo || todayISO();

  openModal(`
    <h3>Kassa kitobi (KO-4)</h3>
    <p class="modal-sub">Tanlangan sana bo'yicha kunlik kassa varag'i, kun boshidagi qoldiq, barcha kirim/chiqim orderlari va yakuniy naqd pul qoldig'i.</p>

    <div class="field" style="margin-bottom:16px;">
      <label>Sana tanlang</label>
      <input type="date" id="kkDate" value="${escapeHtml(initialDate)}" style="font-size:15px; font-weight:600;">
    </div>

    <div id="kkPreview" style="margin-bottom:16px; border:1px solid var(--border); border-radius:8px; padding:12px; background:var(--bg-elevated);"></div>

    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
      <button class="btn btn-primary" id="mPrintKO4"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg> Rasmiy varaqni chop etish (A4)</button>
    </div>
  `);

  document.getElementById("mCancel").addEventListener("click", closeModal);

  const dateInp = document.getElementById("kkDate");
  const previewDiv = document.getElementById("kkPreview");

  const updatePreview = () => {
    const targetDate = dateInp.value;
    const allRows = (STORE.kassa || []).slice().sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));
    let opening = toNum(s.kassaOpeningBalance);
    allRows.forEach((r) => {
      if (r.sana && r.sana < targetDate) {
        if (r.turi === "kirim") opening += toNum(r.summa);
        else if (r.turi === "chiqim") opening -= toNum(r.summa);
      }
    });

    const dayRows = allRows.filter((r) => r.sana === targetDate);
    const dayKirim = dayRows.filter((r) => r.turi === "kirim").reduce((a, r) => a + toNum(r.summa), 0);
    const dayChiqim = dayRows.filter((r) => r.turi === "chiqim").reduce((a, r) => a + toNum(r.summa), 0);
    const closing = opening + dayKirim - dayChiqim;

    previewDiv.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
        <span>Kun boshiga qoldiq: <b>${fmtSum(opening)}</b></span>
        <span>Operatsiyalar soni: <b>${dayRows.length} ta</b></span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;">
        <span style="color:var(--ok);">Kunlik jami kirim: <b>+${fmtSum(dayKirim)}</b></span>
        <span style="color:var(--danger);">Kunlik jami chiqim: <b>-${fmtSum(dayChiqim)}</b></span>
      </div>
      <div style="padding-top:8px; border-top:1px solid var(--border); font-size:14px; font-weight:bold; display:flex; justify-content:space-between;">
        <span>Kun oxiriga qoldiq:</span>
        <span style="color:${closing < 0 ? "var(--danger)" : "inherit"};">${fmtSum(closing)} so'm</span>
      </div>
    `;
  };

  dateInp.addEventListener("change", updatePreview);
  updatePreview();

  document.getElementById("mPrintKO4").addEventListener("click", () => {
    printKO4(dateInp.value);
  });
}

function printKO4(dateFilter) {
  const s = STORE.settings;
  const targetDate = dateFilter || s.filterTo || todayISO();
  const allRows = (STORE.kassa || []).slice().sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));

  let opening = toNum(s.kassaOpeningBalance);
  allRows.forEach((r) => {
    if (r.sana && r.sana < targetDate) {
      if (r.turi === "kirim") opening += toNum(r.summa);
      else if (r.turi === "chiqim") opening -= toNum(r.summa);
    }
  });

  const dayRows = allRows.filter((r) => r.sana === targetDate);
  const dayKirim = dayRows.filter((r) => r.turi === "kirim").reduce((a, r) => a + toNum(r.summa), 0);
  const dayChiqim = dayRows.filter((r) => r.turi === "chiqim").reduce((a, r) => a + toNum(r.summa), 0);
  const closing = opening + dayKirim - dayChiqim;

  const rowsHtml = dayRows.length ? dayRows.map((r, i) => `
    <tr>
      <td style="text-align:center;">${i + 1}</td>
      <td style="text-align:center; font-weight:bold;">${escapeHtml(r.hujjatRaqami || "—")}</td>
      <td>${escapeHtml(r.kimdanKimga || r.kontragent || r.tavsif || "—")}</td>
      <td style="text-align:center;"><b>${escapeHtml(r.schyot || (r.turi === "kirim" ? "4010" : "6010"))}</b></td>
      <td class="num">${r.turi === "kirim" ? fmtSum(r.summa) : "—"}</td>
      <td class="num">${r.turi === "chiqim" ? fmtSum(r.summa) : "—"}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" style="text-align:center; padding:15px; color:#777;">Bu sana uchun kassa operatsiyalari mavjud emas</td></tr>`;

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="utf-8">
      <title>KO-4 Kassa kitobi — ${escapeHtml(targetDate)}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm 20mm; }
        * { box-sizing: border-box; }
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin: 0; padding: 0; line-height: 1.35; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .company-header { font-size: 12pt; font-weight: bold; }
        .company-sub { font-size: 10pt; color: #333; }
        .doc-title { text-align: center; font-weight: bold; font-size: 14pt; text-transform: uppercase; margin: 15px 0 2px; }
        .doc-meta { text-align: center; font-size: 11pt; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10pt; }
        th, td { border: 1px solid #000; padding: 6px 8px; }
        th { background: #f2f2f2; text-align: center; font-weight: bold; }
        .num { text-align: right; font-variant-numeric: tabular-nums; }
        .sign-row { margin-top: 25px; font-size: 10.5pt; display: flex; justify-content: space-between; align-items: flex-end; }
        .sign-line { border-bottom: 1px solid #000; flex: 1; margin: 0 10px; }
      </style>
    </head>
    <body>
      <div class="header-top">
        <div>
          <div class="company-header">${escapeHtml(s.companyName || "Korxona")}</div>
          <div class="company-sub">INN: ${escapeHtml(s.inn || "—")}</div>
        </div>
        <div style="font-size:9.5pt; font-style:italic; text-align:right;">
          Shakl № KO-4<br>
          KASSA KITOBI VARAG'I
        </div>
      </div>

      <div class="doc-title">KASSA KITOBI VARAG'I</div>
      <div class="doc-meta">Sana: <b>${escapeHtml(targetDate)}</b></div>

      <table>
        <thead>
          <tr>
            <th style="width:35px;">№</th>
            <th style="width:110px;">Hujjat №</th>
            <th>Kimdan qabul qilindi / Kimga berildi</th>
            <th style="width:110px;">Korrespondent schyot</th>
            <th style="width:110px;">Kirim, so'm</th>
            <th style="width:110px;">Chiqim, so'm</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#fafafa; font-weight:bold;">
            <td colspan="4" style="text-align:right;">KUN BOSHI QOLDIG'I (Остаток на начало дня):</td>
            <td colspan="2" class="num">${fmtSum(opening)}</td>
          </tr>
          ${rowsHtml}
          <tr style="background:#f2f2f2; font-weight:bold;">
            <td colspan="4" style="text-align:right;">KUNLIK JAMI AYLANMA (Итого за день):</td>
            <td class="num">${fmtSum(dayKirim)}</td>
            <td class="num">${fmtSum(dayChiqim)}</td>
          </tr>
          <tr style="background:#e8f4f0; font-weight:bold; font-size:10.5pt;">
            <td colspan="4" style="text-align:right;">KUN OXIRI QOLDIG'I (Остаток на конец дня):</td>
            <td colspan="2" class="num">${fmtSum(closing)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 30px; font-size: 10pt;">
        <div>Kassada jami naqd pul qoldig'i: <b>${escapeHtml(summaSozBilan(closing))}</b></div>
        <div style="margin-top: 20px;">
          <div class="sign-row">
            <span style="font-weight:bold; min-width:140px;">Kassir:</span>
            <span class="sign-line"></span>
            <span>_________________________ (imzo, F.I.Sh)</span>
          </div>
          <div class="sign-row" style="margin-top: 15px;">
            <span style="font-weight:bold; min-width:140px;">Kassa yozuvlarini tekshirib qabul qildi (Buxgalter):</span>
            <span class="sign-line"></span>
            <span>_________________________ (imzo, F.I.Sh)</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
  openPrintWindow(html);
}

function exportKassaXlsx(rows) {
  const s = STORE.settings;
  const t = computeTotals();
  const aoa = [
    [s.companyName],
    [`INN: ${s.inn}   Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`],
    ["Kassa operatsiyalari (5010)"],
    [],
    ["Sana", "Hujjat №", "Turi", "Korrespondent schyot", "Kimdan / Kimga", "Kontragent", "INN", "To'lov asosi", "Summa"]
  ];
  rows.forEach((r) => {
    aoa.push([
      r.sana || "",
      r.hujjatRaqami || "",
      r.turi === "kirim" ? "KO-1 Kirim" : "KO-2 Chiqim",
      r.schyot || "",
      r.kimdanKimga || "",
      r.kontragent || "",
      r.kontragentInn || "",
      r.tavsif || "",
      toNum(r.summa)
    ]);
  });
  aoa.push([]);
  aoa.push(["Boshlang'ich qoldiq", "", "", "", "", "", "", "", toNum(s.kassaOpeningBalance)]);
  aoa.push(["Joriy kassa qoldig'i", "", "", "", "", "", "", "", toNum(t.kassaQoldiq)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 30 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Kassa");
  XLSX.writeFile(wb, `FORGET_kassa_${todayISO()}.xlsx`);
  toast("Kassa Excel fayli yuklab olindi");
}

function openKassaImportModal() {
  openGenericImportModal(
    "Kassa operatsiyalari — Excel'dan import",
    "Kassa operatsiyalari yozilgan .xlsx faylni yuklang. Ustunlar tartibi: <b>Sana, Hujjat №, Turi (kirim/chiqim), Schyot, Kimdan/Kimga, Kontragent, INN, Tavsif, Summa</b>.",
    ".xlsx, .xls",
    handleKassaImport
  );
}

async function handleKassaImport(file) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

    let added = 0, skipped = 0;
    const candidates = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || !row.length || row.every((c) => c === "")) continue;
      const dateCell = row[0];
      const sana = normalizeDate(dateCell);
      if (!sana || !/^\d{4}-\d{2}-\d{2}$/.test(sana)) continue;

      const hujjatRaqami = String(row[1] || "").trim();
      const turiRaw = String(row[2] || "").toLowerCase();
      const turi = turiRaw.includes("chiqim") || turiRaw.includes("ko-2") ? "chiqim" : "kirim";
      const schyot = String(row[3] || "").trim();
      const kimdanKimga = String(row[4] || "").trim();
      const kontragent = String(row[5] || "").trim();
      const kontragentInn = String(row[6] || "").replace(/\D/g, "").trim();
      const tavsif = String(row[7] || "").trim();
      const summa = toNum(row[8]);

      if (summa <= 0) continue;

      const dup = (STORE.kassa || []).some((k) =>
        k.sana === sana &&
        k.hujjatRaqami === hujjatRaqami &&
        k.turi === turi &&
        Math.abs(toNum(k.summa) - summa) < 1
      );

      if (dup) { skipped++; continue; }
      candidates.push({ sana, hujjatRaqami, turi, schyot, kimdanKimga, kontragent, kontragentInn, tavsif, summa });
    }

    if (!candidates.length) {
      closeModal();
      toast(skipped ? `Barcha (${skipped} ta) yozuvlar oldin kiritilgan takrorlar` : "Faylda mos kassa qatorlari topilmadi", "err");
      return;
    }

    const { data, error } = await sbClient.from("kassa").insert(candidates.map((c) => toDbRow(KASSA_DB_MAP, c))).select();
    if (error) { reportError(error, "Importni saqlashda xatolik"); return; }

    const imported = (data || []).map((r) => fromDbRow(KASSA_DB_MAP, r));
    if (!STORE.kassa) STORE.kassa = [];
    STORE.kassa.push(...imported);
    added = imported.length;

    saveStore();
    closeModal();
    updateNavBadges();
    renderKassa();
    toast(`Import: ${added} ta kassa operatsiyasi qo'shildi${skipped ? `, ${skipped} ta takror o'tkazib yuborildi` : ""}`);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

/* ------------------------------- Ish haqi ------------------------------- */
// I.X. yuklama.xltx (Ilova №4 — xodimlar bo'yicha tafsilot) andazasi asosida.
// Ijtimoiy soliq — hisoblangan ish haqidan ish beruvchi tomonidan qo'shimcha to'lanadi (xodim ish haqidan ushlanmaydi).
// NDFL va INPS — soliq bazasidan (ish haqi minus imtiyoz) xodim ish haqidan ushlab qolinadi;
// byudjetga to'lanadigan NDFL = hisoblangan NDFL − INPS badali (INPS shaxsiy jamg'arma hisobiga yo'naltiriladi).

function computeIshHaqiRow(r, s) {
  const oylik = toNum(r.oyliqSumma);
  const imtiyoz = toNum(r.imtiyozSumma);
  const soliqBazasi = Math.max(oylik - imtiyoz, 0);
  const ijtimoiySoliq = oylik * (toNum(s.ijtimoiySoliqStavka) / 100);
  const ndfl = soliqBazasi * (toNum(s.ndflStavka) / 100);
  const inps = soliqBazasi * (toNum(s.inpsStavka) / 100);
  const ndflByudjetga = ndfl - inps;
  const sofIshHaqi = oylik - ndfl;
  return { oylik, imtiyoz, soliqBazasi, ijtimoiySoliq, ndfl, inps, ndflByudjetga, sofIshHaqi };
}

function computeIshHaqiTotals() {
  const s = STORE.settings;
  const rows = getFilteredRows(STORE.ishHaqi);
  const totals = { count: rows.length, oylikJami: 0, imtiyozJami: 0, soliqBazasiJami: 0, ijtimoiySoliqJami: 0, ndflJami: 0, inpsJami: 0, ndflByudjetgaJami: 0, sofIshHaqiJami: 0 };
  rows.forEach((r) => {
    const c = computeIshHaqiRow(r, s);
    totals.oylikJami += c.oylik;
    totals.imtiyozJami += c.imtiyoz;
    totals.soliqBazasiJami += c.soliqBazasi;
    totals.ijtimoiySoliqJami += c.ijtimoiySoliq;
    totals.ndflJami += c.ndfl;
    totals.inpsJami += c.inps;
    totals.ndflByudjetgaJami += c.ndflByudjetga;
    totals.sofIshHaqiJami += c.sofIshHaqi;
  });
  totals.ishBeruvchiXarajati = totals.oylikJami + totals.ijtimoiySoliqJami;
  return totals;
}

// Sozlamalarda kiritilgan "Ish haqi to'lov kuni"ga asoslanib, eng yaqin
// kelgusi to'lov sanasini topadi (joriy oyda o'tib ketgan bo'lsa — keyingi oy).
const ISH_HAQI_REMINDER_LOOKAHEAD_DAYS = 5;
function daysInMonth(year, month1based) {
  return new Date(year, month1based, 0).getDate();
}
function computeIshHaqiPayReminder() {
  const day = toNum(STORE.settings.ishHaqiTolovKuni);
  if (!day || day < 1 || day > 31) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let target = new Date(today.getFullYear(), today.getMonth(), Math.min(day, daysInMonth(today.getFullYear(), today.getMonth() + 1)));
  if (target < today) {
    target = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(day, daysInMonth(today.getFullYear(), today.getMonth() + 2)));
  }
  const daysUntil = Math.round((target - today) / 86400000);
  return daysUntil <= ISH_HAQI_REMINDER_LOOKAHEAD_DAYS ? { daysUntil, date: localDateISO(target) } : null;
}

// Faktura kirim/chiqimdagi "Takrorlar" filtri bilan bir xil naqsh (qarang:
// invoiceDuplicateKey, findDuplicateInvoiceIds) — PINFL+sana+F.I.O+summa
// bo'yicha bir xil yozuvlarni KO'RSATISH uchun, hech narsani avtomat
// o'chirmaydi. Import vaqtidagi dedup tekshiruvi bilan bir xil mezon.
function ishHaqiDuplicateKey(r) {
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(r.pinfl)}|${r.sana || ""}|${norm(r.fio)}|${Math.round(toNum(r.oyliqSumma))}`;
}

function findDuplicateIshHaqiIds() {
  const groups = new Map();
  STORE.ishHaqi.forEach((r) => {
    if (!r.fio) return;
    const key = ishHaqiDuplicateKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const ids = new Set();
  let groupCount = 0;
  groups.forEach((list) => { if (list.length > 1) { groupCount++; list.forEach((r) => ids.add(r.id)); } });
  return { ids, groupCount };
}

let ISHHAQI_DUP_FILTER = false;

function renderIshHaqi() {
  const filtered = getFilteredRows(STORE.ishHaqi);
  const { ids: dupIds, groupCount: dupGroupCount } = findDuplicateIshHaqiIds();
  const visibleRows = ISHHAQI_DUP_FILTER ? filtered.filter((r) => dupIds.has(r.id)) : filtered;
  const rows = visibleRows.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");
  const t = computeIshHaqiTotals();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ish haqi</h1>
        <p class="page-desc">Xodimlarga hisoblangan ish haqi — "Ish haqi hisoboti"ga (NDFL/ijtimoiy soliq) doim avtomatik integratsiya bo'ladi. F2 (moliyaviy natija)ga qo'shish ixtiyoriy — "Sozlamalar"da yoqing.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnOpenTabel"><svg class="ic" viewBox="0 0 24 24"><use href="#i-calendar"/></svg>Davomat va Tabel (T-13)</button>
        <button class="btn" id="btnFindReplace">Izlash va almashtirish</button>
        <button class="btn" id="btnImportIshHaqi">Excel'dan import</button>
        <button class="btn" id="btnExportIshHaqi">Excel'ga eksport</button>
        <button class="btn btn-primary" id="btnAddRow">+ Xodim yozuvi qo'shish</button>
      </div>
    </div>
    <div class="grid grid-4 section">
      <div class="card stat-card"><div class="stat-label">Hisoblangan ish haqi (jami)</div><div class="stat-value" id="statOylik">${fmtSum(t.oylikJami)}</div></div>
      <div class="card stat-card"><div class="stat-label">Ijtimoiy soliq</div><div class="stat-value" id="statIjtimoiy">${fmtSum(t.ijtimoiySoliqJami)}</div></div>
      <div class="card stat-card"><div class="stat-label">NDFL + INPS</div><div class="stat-value" id="statSoliqlar">${fmtSum(t.ndflJami + t.inpsJami)}</div></div>
      <div class="card stat-card"><div class="stat-label">Sof ish haqi (jami)</div><div class="stat-value" id="statSof">${fmtSum(t.sofIshHaqiJami)}</div></div>
    </div>

    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: F.I.O, lavozim, PINFL...">
      <button class="btn ${ISHHAQI_DUP_FILTER ? "btn-primary" : ""}" id="btnDupToggle" title="PINFL+sana+F.I.O+summa bo'yicha bir xil yozuvlarni ko'rsatadi">
        <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:3px;"><use href="#i-copy"/></svg>Takrorlar${dupGroupCount ? ` (${dupGroupCount})` : ""}
      </button>
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv${ISHHAQI_DUP_FILTER ? " (faqat takrorlar)" : ""}</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sana</th>
            <th>F.I.O.</th>
            <th>Lavozimi</th>
            <th>PINFL</th>
            <th>Turi</th>
            <th>Holati</th>
            <th class="num">Hisoblangan ish haqi</th>
            <th class="num">Imtiyoz</th>
            <th class="num">Ijtimoiy soliq</th>
            <th class="num">NDFL</th>
            <th class="num">INPS</th>
            <th class="num">Sof ish haqi</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="ishHaqiBody">
          ${rows.length ? rows.map((r) => ishHaqiRowHtml(r, dupIds.has(r.id))).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-users"/></svg><div class="t">${ISHHAQI_DUP_FILTER ? "Takrorlangan yozuv topilmadi" : "Xodimlar yo'q"}</div><div class="d">${ISHHAQI_DUP_FILTER ? "PINFL+sana+F.I.O+summa bo'yicha bir xil yozuv yo'q." : `"+ Xodim yozuvi qo'shish" tugmasi orqali har oy uchun har bir xodimning hisoblangan ish haqini kiriting.`}</div></div>` : ""}
    <div class="note">Ijtimoiy soliq (${fmt(STORE.settings.ijtimoiySoliqStavka)}%) — ish beruvchi xarajati, ish haqidan ushlanmaydi. NDFL (${fmt(STORE.settings.ndflStavka)}%) va INPS (${fmt(STORE.settings.inpsStavka, 1)}%) — xodim ish haqidan ushlab qolinadi. Stavkalarni "Sozlamalar" bo'limida o'zgartirish mumkin.</div>
  `;

  document.getElementById("btnAddRow").addEventListener("click", addIshHaqiRow);
  const btnTabel = document.getElementById("btnOpenTabel");
  if (btnTabel) btnTabel.addEventListener("click", () => navigate("tabel"));
  document.getElementById("searchBox").addEventListener("input", (e) => filterIshHaqiRows(e.target.value));
  document.getElementById("btnExportIshHaqi").addEventListener("click", exportIshHaqiXlsx);
  document.getElementById("btnFindReplace").addEventListener("click", () => openFindReplaceModal({
    rows: STORE.ishHaqi, storeType: "ishHaqi",
    fields: [{ key: "fio", label: "F.I.O." }, { key: "lavozimi", label: "Lavozimi" }],
    onDone: renderIshHaqi
  }));
  document.getElementById("btnImportIshHaqi").addEventListener("click", openIshHaqiImportModal);
  document.getElementById("btnDupToggle").addEventListener("click", () => {
    ISHHAQI_DUP_FILTER = !ISHHAQI_DUP_FILTER;
    renderIshHaqi();
  });
  bindIshHaqiRowEvents();
}

function exportIshHaqiXlsx() {
  const rows = STORE.ishHaqi.slice().sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));
  const aoa = [["Sana", "F.I.O.", "Lavozimi", "PINFL", "Turi", "Holati", "Hisoblangan ish haqi", "Imtiyoz summasi"]];
  rows.forEach((r) => aoa.push([r.sana, r.fio, r.lavozimi, r.pinfl, r.turi, r.holati, toNum(r.oyliqSumma), toNum(r.imtiyozSumma)]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ish haqi");
  XLSX.writeFile(wb, `FORGET_ish_haqi_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function openIshHaqiImportModal() {
  openGenericImportModal(
    "Ish haqi — Excel'dan import",
    `Ustunlar tartibi: <b>sana, F.I.O., lavozimi, PINFL, turi, holati, hisoblangan ish haqi, imtiyoz summasi</b>. Bu bo'limdan avval eksport qilingan fayl to'g'ridan-to'g'ri qayta import qilinishi mumkin, takroriy yozuvlar o'tkazib yuboriladi.`,
    ".xlsx,.xls",
    handleIshHaqiImport
  );
}

async function handleIshHaqiImport(file) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) { toast("Fayl bo'sh", "err"); return; }

    let start = 0;
    const first = rows[0].map((c) => String(c).toLowerCase());
    const looksLikeHeader = first.some((c) => /f\.?i\.?o|ф\.и\.о|pinfl|пинфл|sana|дата/.test(c));
    if (looksLikeHeader) start = 1;

    const candidates = [];
    let skipped = 0;
    let invalid = 0;
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      if (!row.length || row.every((c) => c === "")) continue;
      const sana = normalizeDate(row[0]);
      const fio = String(row[1] || "").trim();
      const lavozimi = String(row[2] || "").trim();
      const pinfl = String(row[3] || "").trim();
      const turi = String(row[4] || "").trim() === "Norezident" ? "Norezident" : "Rezident";
      const holati = String(row[5] || "").trim() === "Tugatilgan" ? "Tugatilgan" : "Ishlayapti";
      const oyliqSumma = toNum(row[6]);
      const imtiyozSumma = toNum(row[7]);
      if (!fio && !oyliqSumma) continue;
      if ((pinfl && !/^\d{14}$/.test(pinfl)) || oyliqSumma < 0 || imtiyozSumma < 0) { invalid++; continue; }

      const dup = STORE.ishHaqi.some((r) => r.pinfl === pinfl && r.sana === sana && r.fio === fio && Math.abs(toNum(r.oyliqSumma) - oyliqSumma) < 1);
      if (dup) { skipped++; continue; }

      candidates.push({ sana, fio, lavozimi, pinfl, turi, holati, oyliqSumma, imtiyozSumma });
    }

    if (candidates.length) {
      const faylRow = await registerFaylUpload("ishHaqi", file);
      if (faylRow) candidates.forEach((c) => { c.faylId = faylRow.id; });
    }

    let added = 0;
    if (candidates.length) {
      let data;
      try {
        data = await insertRowsChunked("ish_haqi", candidates.map((r) => toDbRow(ISHHAQI_DB_MAP, r)));
      } catch (error) { reportError(error, "Bazaga yozishda xatolik"); return; }
      data.forEach((row) => STORE.ishHaqi.push(fromDbRow(ISHHAQI_DB_MAP, row)));
      added = data.length;
    }

    saveStore();
    closeModal();
    renderIshHaqi();
    toast(`Import: ${added} ta qo'shildi${skipped ? `, ${skipped} ta takror` : ""}${invalid ? `, ${invalid} ta noto'g'ri (PINFL/summa) o'tkazib yuborildi` : ""}`);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

function ishHaqiRowHtml(r, isDup) {
  const c = computeIshHaqiRow(r, STORE.settings);
  return `
    <tr data-id="${r.id}" style="${isDup ? "background:var(--warn-soft);" : ""}" title="${isDup ? "Diqqat: bu yozuv PINFL+sana+F.I.O+summa bo'yicha boshqa yozuv(lar) bilan bir xil bo'lishi mumkin" : ""}">
      <td><input type="date" class="cell-input" data-f="sana" value="${escapeHtml(r.sana || "")}"></td>
      <td><input class="cell-input" data-f="fio" value="${escapeHtml(r.fio || "")}" style="min-width:170px"></td>
      <td><input class="cell-input" data-f="lavozimi" value="${escapeHtml(r.lavozimi || "")}" style="min-width:120px"></td>
      <td><input class="cell-input" data-f="pinfl" value="${escapeHtml(r.pinfl || "")}" style="min-width:110px"></td>
      <td>
        <select class="cell-input" data-f="turi">
          <option value="Rezident" ${r.turi !== "Norezident" ? "selected" : ""}>Rezident</option>
          <option value="Norezident" ${r.turi === "Norezident" ? "selected" : ""}>Norezident</option>
        </select>
      </td>
      <td>
        <select class="cell-input" data-f="holati">
          <option value="Ishlayapti" ${r.holati !== "Tugatilgan" ? "selected" : ""}>Ishlayapti</option>
          <option value="Tugatilgan" ${r.holati === "Tugatilgan" ? "selected" : ""}>Tugatilgan</option>
        </select>
      </td>
      <td class="num"><input class="cell-input num num-fmt" data-f="oyliqSumma" value="${fmt(r.oyliqSumma)}"></td>
      <td class="num"><input class="cell-input num num-fmt" data-f="imtiyozSumma" value="${fmt(r.imtiyozSumma)}"></td>
      <td class="num ihq-ijtimoiy">${fmt(c.ijtimoiySoliq)}</td>
      <td class="num ihq-ndfl">${fmt(c.ndfl)}</td>
      <td class="num ihq-inps">${fmt(c.inps)}</td>
      <td class="num ihq-sof" style="font-weight:700">${fmtSum(c.sofIshHaqi)}</td>
      <td class="row-actions"><button class="icon-btn" data-del="${r.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></td>
    </tr>
  `;
}

function refreshIshHaqiSummary() {
  const t = computeIshHaqiTotals();
  const elOylik = document.getElementById("statOylik");
  const elIjtimoiy = document.getElementById("statIjtimoiy");
  const elSoliqlar = document.getElementById("statSoliqlar");
  const elSof = document.getElementById("statSof");
  if (elOylik) elOylik.textContent = fmtSum(t.oylikJami);
  if (elIjtimoiy) elIjtimoiy.textContent = fmtSum(t.ijtimoiySoliqJami);
  if (elSoliqlar) elSoliqlar.textContent = fmtSum(t.ndflJami + t.inpsJami);
  if (elSof) elSof.textContent = fmtSum(t.sofIshHaqiJami);
}

function filterIshHaqiRows(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll("#ishHaqiBody tr").forEach((tr) => {
    const fieldValues = Array.from(tr.querySelectorAll("input,select")).map((i) => i.value).join(" ");
    const text = (tr.textContent + " " + fieldValues).toLowerCase();
    tr.style.display = !q || text.includes(q) ? "" : "none";
  });
}

function bindIshHaqiRowEvents() {
  const body = document.getElementById("ishHaqiBody");
  if (!body) return;
  body.addEventListener("change", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const row = STORE.ishHaqi.find((r) => r.id === tr.dataset.id);
    if (!row) return;
    const field = e.target.dataset.f;
    if (!field) return;
    if (!guardRowCell(e.target, field, row)) return;
    row[field] = field === "oyliqSumma" || field === "imtiyozSumma" ? toNum(e.target.value) : e.target.value;
    pushFieldsUpdate("ishHaqi", row.id, { [field]: row[field] });
    saveStore();

    const c = computeIshHaqiRow(row, STORE.settings);
    const ijtimoiyCell = tr.querySelector(".ihq-ijtimoiy");
    const ndflCell = tr.querySelector(".ihq-ndfl");
    const inpsCell = tr.querySelector(".ihq-inps");
    const sofCell = tr.querySelector(".ihq-sof");
    if (ijtimoiyCell) ijtimoiyCell.textContent = fmt(c.ijtimoiySoliq);
    if (ndflCell) ndflCell.textContent = fmt(c.ndfl);
    if (inpsCell) inpsCell.textContent = fmt(c.inps);
    if (sofCell) sofCell.textContent = fmtSum(c.sofIshHaqi);
    refreshIshHaqiSummary();
  });
  body.addEventListener("click", (e) => {
    const delId = e.target.dataset.del;
    if (delId) deleteRowSafe("ish_haqi", "ishHaqi", delId, renderIshHaqi);
  });
}

async function addIshHaqiRow() {
  const newRow = { sana: todayISO(), fio: "", lavozimi: "", pinfl: "", turi: "Rezident", holati: "Ishlayapti", oyliqSumma: 0, imtiyozSumma: 0 };
  const { data, error } = await sbClient.from("ish_haqi").insert(toDbRow(ISHHAQI_DB_MAP, newRow)).select().single();
  if (error) { reportError(error, "Qo'shishda xatolik"); return; }
  const row = fromDbRow(ISHHAQI_DB_MAP, data);
  if (!STORE.ishHaqi.some((r) => r.id === row.id)) STORE.ishHaqi.push(row);
  saveStore();
  renderIshHaqi();
  toast("Yangi xodim yozuvi qo'shildi");
}

/* ------------------------------- Davomat va Elektron Tabel (T-13 Shakli) ------------------------------- */
// O'zbekiston Respublikasi Mehnat Kodeksi va Davlat statistika qo'mitasi
// tomonidan tasdiqlangan T-13 shaklidagi "Ish vaqtidan foydalanishni hisobga olish tabeli".
// Ish kunlari, dam olish kunlari (D), mehnat ta'tili (T / Otpusknoy),
// kasallik varaqasi (K / Bolnichniy) va haqiqiy ishlangan soatlar hisobi.

let CURRENT_TABEL_YEAR = new Date().getFullYear();
let CURRENT_TABEL_MONTH = new Date().getMonth() + 1; // 1..12
let TABEL_GRAFIK_FILTER = "5_kunlik";

const UZ_BAYRAMLARI = {
  "01-01": "Yangi yil",
  "01-02": "Yangi yil qo'shimcha dam olish kuni",
  "03-08": "Xalqaro xotin-qizlar kuni",
  "03-21": "Navro'z bayrami",
  "03-22": "Navro'z qo'shimcha dam olish kuni",
  "05-09": "Xotira va qadrlash kuni",
  "09-01": "Mustaqillik kuni",
  "10-01": "O'qituvchi va murabbiylar kuni",
  "12-08": "Konstitutsiya kuni"
};

const OYLAR_UZ = [
  "", "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"
];

const HAFTA_KUNLARI_QISQA = ["Yak", "Du", "Se", "Cho", "Pay", "Ju", "Sha"];

function getUzbekistanHolidays(year) {
  return UZ_BAYRAMLARI;
}

function getMonthlyWorkingDays(year, month, grafik = "5_kunlik") {
  const y = toNum(year) || new Date().getFullYear();
  const m = toNum(month) || (new Date().getMonth() + 1);
  const totalDays = new Date(y, m, 0).getDate();
  const holidays = getUzbekistanHolidays(y);

  let standardWorkDays = 0;
  let standardWorkHours = 0;
  const daysList = [];

  for (let d = 1; d <= totalDays; d++) {
    const dt = new Date(y, m - 1, d);
    const dayOfWeek = dt.getDay(); // 0: Yak, 1: Du, ... 6: Sha
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const mmdd = `${mm}-${dd}`;
    const isHoliday = !!holidays[mmdd];
    const holidayName = holidays[mmdd] || "";

    const isWeekend = grafik === "6_kunlik" ? (dayOfWeek === 0) : (dayOfWeek === 0 || dayOfWeek === 6);
    const isRest = isWeekend || isHoliday;

    let defaultCode = "8";
    let defaultHours = 8;

    if (isRest) {
      defaultCode = "D";
      defaultHours = 0;
    } else {
      // Bayram arafasida 1 soat qisqartiriladi
      const nextDt = new Date(y, m - 1, d + 1);
      const nextMmDd = `${String(nextDt.getMonth() + 1).padStart(2, "0")}-${String(nextDt.getDate()).padStart(2, "0")}`;
      if (holidays[nextMmDd]) {
        defaultCode = "7";
        defaultHours = 7;
      } else if (grafik === "6_kunlik") {
        defaultCode = dayOfWeek === 6 ? "5" : "7";
        defaultHours = dayOfWeek === 6 ? 5 : 7;
      }
      standardWorkDays++;
      standardWorkHours += defaultHours;
    }

    daysList.push({
      day: d,
      dateStr: `${y}-${mm}-${dd}`,
      weekday: dayOfWeek,
      weekdayShort: HAFTA_KUNLARI_QISQA[dayOfWeek],
      isWeekend,
      isHoliday,
      holidayName,
      defaultCode,
      defaultHours
    });
  }

  return {
    year: y,
    month: m,
    totalDays,
    standardWorkDays,
    standardWorkHours,
    daysList
  };
}

function calculateTabelRowTotals(row, year, month, grafik = "5_kunlik") {
  const std = getMonthlyWorkingDays(year, month, grafik);
  const kunlar = row.kunlar || {};
  let ishlanganKun = 0;
  let ishlanganSoat = 0;
  let tatilKun = 0;
  let kasallikKun = 0;
  let ozHisobidanKun = 0;
  let sababsizKun = 0;
  let xizmatSafariKun = 0;

  for (let d = 1; d <= std.totalDays; d++) {
    const val = String(kunlar[d] !== undefined ? kunlar[d] : kunlar[String(d)] || "").trim();
    if (!val) continue;

    if (val === "T" || val === "t") {
      tatilKun++;
    } else if (val === "K" || val === "k") {
      kasallikKun++;
    } else if (val === "X" || val === "x") {
      ozHisobidanKun++;
    } else if (val === "S" || val === "s") {
      sababsizKun++;
    } else if (val.toLowerCase() === "xiz") {
      xizmatSafariKun++;
      ishlanganKun++;
      ishlanganSoat += 8;
    } else if (val === "D" || val === "d") {
      // dam olish
    } else {
      const h = toNum(val);
      if (h > 0) {
        ishlanganKun++;
        ishlanganSoat += h;
      }
    }
  }

  const oklad = toNum(row.oklad);
  const stavka = toNum(row.stavka) || 1.0;
  const effektivOklad = oklad * stavka;

  // Faktik ishlangan oylik: (Effektiv Oklad / Me'yoriy ish kunlari) * Haqiqiy ishlangan kunlar
  let faktikOylik = 0;
  if (std.standardWorkDays > 0) {
    if (ishlanganKun >= std.standardWorkDays) {
      faktikOylik = Math.round(effektivOklad);
    } else {
      faktikOylik = Math.round((effektivOklad / std.standardWorkDays) * ishlanganKun);
    }
  } else {
    faktikOylik = Math.round(effektivOklad);
  }

  const tatilSumma = toNum(row.tatilSumma);
  const kasallikSumma = toNum(row.kasallikSumma);
  const mukofot = toNum(row.mukofot);
  const jamiHisoblandi = faktikOylik + tatilSumma + kasallikSumma + mukofot;

  return {
    ...row,
    ishlanganKun,
    ishlanganSoat,
    tatilKun,
    kasallikKun,
    ozHisobidanKun,
    sababsizKun,
    xizmatSafariKun,
    faktikOylik,
    tatilSumma,
    kasallikSumma,
    mukofot,
    jamiHisoblandi
  };
}

// Mehnat ta'tili (Otpusknoy) kalkulyatori — O'zbekiston Mehnat Kodeksi 233-moddasi
// 6 kunlik ish haftasi bo'yicha kunlik o'rtacha ish haqi: Oklad / 25.3
function calculateTatilPuli(oklad, tatilKunlari) {
  const okl = toNum(oklad);
  const kunlar = toNum(tatilKunlari);
  if (okl <= 0 || kunlar <= 0) return { oklad: okl, tatilKunlari: kunlar, kunlikOrtacha: 0, summa: 0 };
  const kunlikOrtacha = okl / 25.3;
  const summa = Math.round(kunlikOrtacha * kunlar);
  return {
    oklad: okl,
    tatilKunlari: kunlar,
    kunlikOrtacha: Math.round(kunlikOrtacha),
    summa
  };
}

// Kasallik varaqasi (Bolnichniy) kalkulyatori — O'zR VM Nizomi № 1136
// Kunlik o'rtacha = Oklad / Oyning ish kunlari me'yori
// Staj foizlari: 60% (8 yildan kam), 80% (8 yildan ko'p), 100% (imtiyozli/jarohat)
function calculateKasallikPuli(oklad, standardWorkDays, kasallikIshKunlari, stajFoiz = 80) {
  const okl = toNum(oklad);
  const stdDays = toNum(standardWorkDays) || 22;
  const kunlar = toNum(kasallikIshKunlari);
  const foiz = toNum(stajFoiz) || 80;
  if (okl <= 0 || kunlar <= 0) return { oklad: okl, standardWorkDays: stdDays, kasallikIshKunlari: kunlar, stajFoiz: foiz, kunlikOrtacha: 0, summa: 0 };
  const kunlikOrtacha = okl / stdDays;
  const summa = Math.round(kunlikOrtacha * kunlar * (foiz / 100));
  return {
    oklad: okl,
    standardWorkDays: stdDays,
    kasallikIshKunlari: kunlar,
    stajFoiz: foiz,
    kunlikOrtacha: Math.round(kunlikOrtacha),
    summa
  };
}

// Ish haqidagi xodimlarni tabelga sinxronlash
function syncTabelFromIshHaqi(year, month) {
  const y = toNum(year) || CURRENT_TABEL_YEAR;
  const m = toNum(month) || CURRENT_TABEL_MONTH;
  const ymPrefix = `${y}-${String(m).padStart(2, "0")}`;

  if (!STORE.tabel) STORE.tabel = [];
  const std = getMonthlyWorkingDays(y, m, TABEL_GRAFIK_FILTER);

  // Tanlangan oyga tegishli yoki barcha unikal xodimlar
  const monthEmployees = (STORE.ishHaqi || []).filter((r) => !r.sana || r.sana.startsWith(ymPrefix));
  const pool = monthEmployees.length ? monthEmployees : (STORE.ishHaqi || []);

  const seenPinfl = new Set();
  let added = 0;

  pool.forEach((emp) => {
    const key = (emp.pinfl && emp.pinfl.trim()) || (emp.fio && emp.fio.trim());
    if (!key || seenPinfl.has(key)) return;
    seenPinfl.add(key);

    const exists = STORE.tabel.find((t) =>
      toNum(t.yil) === y && toNum(t.oy) === m &&
      ((emp.pinfl && t.pinfl === emp.pinfl) || (t.fio && t.fio.toLowerCase() === (emp.fio || "").toLowerCase()))
    );

    if (!exists) {
      // Default kunlar
      const kunlar = {};
      std.daysList.forEach((d) => { kunlar[d.day] = d.defaultCode; });

      const newRow = calculateTabelRowTotals({
        id: "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        yil: y,
        oy: m,
        xodimId: emp.id || null,
        fio: emp.fio || "",
        lavozimi: emp.lavozimi || "",
        pinfl: emp.pinfl || "",
        oklad: toNum(emp.oyliqSumma) || 0,
        stavka: 1.0,
        grafik: TABEL_GRAFIK_FILTER,
        kunlar,
        tatilSumma: 0,
        kasallikSumma: 0,
        mukofot: 0,
        izoh: ""
      }, y, m, TABEL_GRAFIK_FILTER);

      STORE.tabel.push(newRow);
      added++;
    }
  });

  saveStore();
  return added;
}

// Barcha xodimlarni standart me'yor (8/D) bo'yicha to'ldirish
function autoFillAllTabelRows(year, month) {
  const y = toNum(year) || CURRENT_TABEL_YEAR;
  const m = toNum(month) || CURRENT_TABEL_MONTH;
  const std = getMonthlyWorkingDays(y, m, TABEL_GRAFIK_FILTER);

  const rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === y && toNum(r.oy) === m);
  rows.forEach((r) => {
    const kunlar = {};
    std.daysList.forEach((d) => { kunlar[d.day] = d.defaultCode; });
    r.kunlar = kunlar;
    r.tatilSumma = 0;
    r.kasallikSumma = 0;
    const updated = calculateTabelRowTotals(r, y, m, TABEL_GRAFIK_FILTER);
    Object.assign(r, updated);
    pushFieldsUpdate("tabel", r.id, {
      kunlar: r.kunlar,
      ishlanganKun: r.ishlanganKun,
      ishlanganSoat: r.ishlanganSoat,
      tatilKun: r.tatilKun,
      tatilSumma: r.tatilSumma,
      kasallikKun: r.kasallikKun,
      kasallikSumma: r.kasallikSumma,
      faktikOylik: r.faktikOylik,
      jamiHisoblandi: r.jamiHisoblandi
    });
  });

  saveStore();
  return rows.length;
}

// Tabel bo'yicha hisoblangan jami ish haqini "Ish haqi" (oylik) bo'limiga o'tkazish
async function syncTabelToIshHaqi(year, month) {
  const y = toNum(year) || CURRENT_TABEL_YEAR;
  const m = toNum(month) || CURRENT_TABEL_MONTH;
  const ymPrefix = `${y}-${String(m).padStart(2, "0")}`;
  const ymDate = `${ymPrefix}-01`;

  const rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === y && toNum(r.oy) === m);
  if (!rows.length) {
    toast("Ushbu oy uchun tabel yozuvlari mavjud emas", "err");
    return;
  }

  let updatedCount = 0;
  let createdCount = 0;

  for (const tRow of rows) {
    // 1) Mos keluvchi ish_haqi satrini qidiramiz
    let ihRow = (STORE.ishHaqi || []).find((ih) =>
      (!ih.sana || ih.sana.startsWith(ymPrefix)) &&
      ((tRow.pinfl && ih.pinfl && tRow.pinfl === ih.pinfl) || (tRow.fio && ih.fio && tRow.fio.toLowerCase() === ih.fio.toLowerCase()))
    );

    const newSalary = toNum(tRow.jamiHisoblandi);

    if (ihRow) {
      ihRow.oyliqSumma = newSalary;
      if (!ihRow.sana) ihRow.sana = ymDate;
      pushFieldsUpdate("ish_haqi", ihRow.id, { oyliqSumma: newSalary, sana: ihRow.sana });
      updatedCount++;
    } else {
      const newIh = {
        sana: ymDate,
        fio: tRow.fio || "",
        lavozimi: tRow.lavozimi || "",
        pinfl: tRow.pinfl || "",
        turi: "Rezident",
        holati: "Ishlayapti",
        oyliqSumma: newSalary,
        imtiyozSumma: 0
      };
      const { data, error } = await sbClient.from("ish_haqi").insert(toDbRow(ISHHAQI_DB_MAP, newIh)).select().single();
      if (!error && data) {
        const added = fromDbRow(ISHHAQI_DB_MAP, data);
        STORE.ishHaqi.push(added);
        createdCount++;
      }
    }
  }

  saveStore();
  updateNavBadges();
  toast(`Tabel sinxronlandi: ${updatedCount} ta xodim oyligi yangilandi${createdCount ? `, ${createdCount} ta yangi qo'shildi` : ""}`);
}

// Tabel Asosiy Sahifasi
function renderTabel() {
  const year = CURRENT_TABEL_YEAR;
  const month = CURRENT_TABEL_MONTH;
  const std = getMonthlyWorkingDays(year, month, TABEL_GRAFIK_FILTER);

  // Agar bu oy uchun tabel bo'sh bo'lsa, xodimlardan avtomatik to'ldiramiz
  let rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === year && toNum(r.oy) === month);
  if (!rows.length && (STORE.ishHaqi || []).length) {
    syncTabelFromIshHaqi(year, month);
    rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === year && toNum(r.oy) === month);
  }

  const main = document.getElementById("main");

  // Jamlovchi ko'rsatkichlar
  const totalEmployees = rows.length;
  const totalIshlanganKun = rows.reduce((s, r) => s + toNum(r.ishlanganKun), 0);
  const totalIshlanganSoat = rows.reduce((s, r) => s + toNum(r.ishlanganSoat), 0);
  const totalTatilKun = rows.reduce((s, r) => s + toNum(r.tatilKun), 0);
  const totalTatilSumma = rows.reduce((s, r) => s + toNum(r.tatilSumma), 0);
  const totalKasallikKun = rows.reduce((s, r) => s + toNum(r.kasallikKun), 0);
  const totalKasallikSumma = rows.reduce((s, r) => s + toNum(r.kasallikSumma), 0);
  const totalJamiHisoblandi = rows.reduce((s, r) => s + toNum(r.jamiHisoblandi), 0);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Davomat va Elektron Tabel (T-13 Shakli)</h1>
        <p class="page-desc">O'zbekiston Respublikasi Mehnat Kodeksi talablariga muvofiq ish vaqtini hisobga olish, ta'til (otpusknoy) va kasallik (bolnichniy) hisob-kitoblari.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnAutoFillAll" title="Barcha xodimlarga standart me'yor (8/D) qo'yish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-zap"/></svg>⚡ Standart to'ldirish (8/D)</button>
        <button class="btn" id="btnSyncFromIshHaqi" title="Ish haqi ro'yxatidan xodimlarni tabelga qo'shish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg>Xodimlarni sinxronlash</button>
        <button class="btn" id="btnOpenTatilModal"><svg class="ic" viewBox="0 0 24 24"><use href="#i-sun"/></svg>🏖️ Ta'til (Otpusknoy)</button>
        <button class="btn" id="btnOpenKasallikModal"><svg class="ic" viewBox="0 0 24 24"><use href="#i-activity"/></svg>🩺 Kasallik (Bolnichniy)</button>
        <button class="btn btn-primary" id="btnSyncToIshHaqi" title="Tabel hisob-kitobini Ish haqi (oylik) bo'limiga o'tkazish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-check"/></svg>Ish haqiga o'tkazish</button>
        <button class="btn" id="btnPrintTabelT13"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg>A4 Tabel (T-13)</button>
        <button class="btn" id="btnExportTabel"><svg class="ic" viewBox="0 0 24 24"><use href="#i-download"/></svg>Excel</button>
        <button class="btn btn-primary" id="btnAddTabelRow">+ Xodim qo'shish</button>
      </div>
    </div>

    <!-- Oy va Yil boshqaruvi Toolbar -->
    <div class="filter-bar" style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-sm" id="btnPrevMonth">◀ Oldingi oy</button>
        <div style="display:flex;align-items:center;gap:6px;background:var(--bg-sunken);border:1px solid var(--border);border-radius:6px;padding:4px 10px;">
          <svg class="ic" viewBox="0 0 24 24" style="color:var(--primary);"><use href="#i-calendar"/></svg>
          <span style="font-weight:700;font-size:13.5px;">${year}-yil ${OYLAR_UZ[month]}</span>
        </div>
        <button class="btn btn-sm" id="btnNextMonth">Keyingi oy ▶</button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;">
        <label style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">
          Ish haftasi:
          <select id="tabelGrafikSel" style="padding:3px 8px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--bg-elevated);color:var(--text);">
            <option value="5_kunlik" ${TABEL_GRAFIK_FILTER === "5_kunlik" ? "selected" : ""}>5 kunlik (40 soat)</option>
            <option value="6_kunlik" ${TABEL_GRAFIK_FILTER === "6_kunlik" ? "selected" : ""}>6 kunlik (40 soat)</option>
          </select>
        </label>
        <button class="btn btn-sm" id="btnBackToIshHaqi">← Ish haqi bo'limiga qaytish</button>
      </div>
    </div>

    <div class="grid grid-5 section">
      <div class="card stat-card"><div class="stat-label">Xodimlar soni</div><div class="stat-value">${totalEmployees} ta</div></div>
      <div class="card stat-card"><div class="stat-label">Oy me'yori (Ish kun/soat)</div><div class="stat-value">${std.standardWorkDays} k. <small style="font-size:12px;color:var(--text-muted);">(${std.standardWorkHours} s.)</small></div></div>
      <div class="card stat-card"><div class="stat-label">Haqiqiy ishlangan</div><div class="stat-value">${totalIshlanganKun} k. <small style="font-size:12px;color:var(--text-muted);">(${totalIshlanganSoat} s.)</small></div></div>
      <div class="card stat-card"><div class="stat-label">Ta'til / Kasallik</div><div class="stat-value">${totalTatilKun} ta'til <small style="font-size:11px;color:var(--text-muted);">/ ${totalKasallikKun} kasal</small></div></div>
      <div class="card stat-card"><div class="stat-label">Jami hisoblangan ish haqi</div><div class="stat-value" style="color:var(--primary);">${fmtSum(totalJamiHisoblandi)}</div></div>
    </div>

    <!-- Interaktiv Tabel Jadvali -->
    <div class="tabel-scroll-wrap">
      <table class="tabel-table">
        <thead>
          <tr>
            <th class="tabel-sticky-col" style="width:36px;text-align:center !important;">№</th>
            <th class="tabel-sticky-col" style="min-width:200px;left:36px;">Xodim (F.I.O., Lavozim)</th>
            <th class="tabel-sticky-col" style="width:110px;left:236px;">Oklad (so'm)</th>
            ${std.daysList.map((d) => `
              <th class="tabel-day-th ${d.isWeekend || d.isHoliday ? "tabel-weekend-hdr" : ""}" title="${d.day}-${OYLAR_UZ[month]} (${d.weekdayShort})${d.holidayName ? `: ${d.holidayName}` : ""}">
                <div class="tabel-day-num">${d.day}</div>
                <div class="tabel-day-name">${d.weekdayShort}</div>
              </th>
            `).join("")}
            <th style="min-width:60px;">Ishlangan kun</th>
            <th style="min-width:60px;">Ishlangan soat</th>
            <th style="min-width:80px;">Ta'til (so'm)</th>
            <th style="min-width:80px;">Kasallik (so'm)</th>
            <th style="min-width:110px;font-weight:700;">Jami hisoblandi</th>
            <th style="min-width:90px;text-align:center;">Amallar</th>
          </tr>
        </thead>
        <tbody id="tabelBody">
          ${rows.length ? rows.map((r, i) => tabelRowHtml(r, i + 1, std)).join("") : `
            <tr><td colspan="${std.totalDays + 9}" style="padding:24px;text-align:center;color:var(--text-muted);">
              Ushbu oy uchun xodimlar tabeli topilmadi. Yuqoridagi "Xodimlarni sinxronlash" tugmasi orqali avtomatik to'ldirishingiz mumkin.
            </td></tr>
          `}
        </tbody>
        ${rows.length ? `
          <tfoot>
            <tr style="font-weight:700;background:var(--bg-sunken);">
              <td class="tabel-sticky-col" colspan="2" style="text-align:right !important;padding-right:12px;">Jami:</td>
              <td class="tabel-sticky-col" style="left:236px;">${fmtSum(rows.reduce((s, r) => s + toNum(r.oklad), 0))}</td>
              <td colspan="${std.totalDays}"></td>
              <td>${totalIshlanganKun}</td>
              <td>${totalIshlanganSoat}</td>
              <td>${fmtSum(totalTatilSumma)}</td>
              <td>${fmtSum(totalKasallikSumma)}</td>
              <td style="color:var(--primary);">${fmtSum(totalJamiHisoblandi)}</td>
              <td></td>
            </tr>
          </tfoot>
        ` : ""}
      </table>
    </div>

    <!-- Tabel belgilari tavsifi (Legend) -->
    <div class="tabel-legend">
      <span style="font-weight:700;margin-right:6px;">Tabel belgilari:</span>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-work">8</span> Standart ish kuni (8 soat)</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-work">7 / 6 / 4</span> Qisqartirilgan ish soati</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-weekend">D</span> Dam olish / Bayram kuni</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-tatil">T</span> Mehnat ta'tili (Otpusknoy)</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-kasallik">K</span> Kasallik varaqasi (Bolnichniy)</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-leave">X</span> O'z hisobidan (Haq to'lanmaydigan)</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-absent">S</span> Sababsiz kelmagan (Прогул)</div>
      <div class="tabel-legend-item"><span class="tabel-tag tabel-tag-trip">Xiz</span> Xizmat safari</div>
    </div>
  `;

  bindTabelEvents(std);
}

function tabelRowHtml(r, index, std) {
  const kunlar = r.kunlar || {};

  return `
    <tr data-row-id="${escapeHtml(r.id)}">
      <td class="tabel-sticky-col" style="text-align:center !important;">${index}</td>
      <td class="tabel-sticky-col" style="left:36px;">
        <input class="cell-input tabel-fio-inp" style="font-weight:600;font-size:12.5px;width:100%;" value="${escapeHtml(r.fio || "")}" placeholder="Xodim F.I.O.">
        <div style="font-size:11px;color:var(--text-muted);display:flex;gap:6px;margin-top:2px;">
          <span>${escapeHtml(r.lavozimi || "Lavozimsiz")}</span>
          ${r.pinfl ? `<span>• PINFL: ${escapeHtml(r.pinfl)}</span>` : ""}
        </div>
      </td>
      <td class="tabel-sticky-col" style="left:236px;">
        <input class="cell-input num tabel-oklad-inp" style="font-weight:700;width:100%;" value="${fmt(r.oklad || 0)}">
      </td>
      ${std.daysList.map((d) => {
        const val = String(kunlar[d.day] !== undefined ? kunlar[d.day] : kunlar[String(d.day)] || d.defaultCode).trim();
        let cls = "tabel-tag-work";
        if (val === "D" || val === "d") cls = "tabel-tag-weekend";
        else if (val === "T" || val === "t") cls = "tabel-tag-tatil";
        else if (val === "K" || val === "k") cls = "tabel-tag-kasallik";
        else if (val === "X" || val === "x") cls = "tabel-tag-leave";
        else if (val === "S" || val === "s") cls = "tabel-tag-absent";
        else if (val.toLowerCase() === "xiz") cls = "tabel-tag-trip";

        return `
          <td class="${d.isWeekend || d.isHoliday ? "tabel-weekend" : ""}">
            <input class="tabel-cell-inp ${cls}" data-row-id="${escapeHtml(r.id)}" data-day="${d.day}" value="${escapeHtml(val)}" maxlength="3" title="${d.day}-kun (${d.weekdayShort}): ${escapeHtml(val)}">
          </td>
        `;
      }).join("")}
      <td class="num row-ishlangan-kun" style="font-weight:600;">${r.ishlanganKun || 0}</td>
      <td class="num row-ishlangan-soat">${r.ishlanganSoat || 0}</td>
      <td class="num row-tatil-summa" style="font-size:11.5px;">
        ${r.tatilKun ? `<div>${r.tatilKun} k.</div><div style="color:#d97706;font-weight:600;">${fmtSum(r.tatilSumma)}</div>` : `<span class="faint">—</span>`}
      </td>
      <td class="num row-kasallik-summa" style="font-size:11.5px;">
        ${r.kasallikKun ? `<div>${r.kasallikKun} k.</div><div style="color:#ef4444;font-weight:600;">${fmtSum(r.kasallikSumma)}</div>` : `<span class="faint">—</span>`}
      </td>
      <td class="num row-jami-hisoblandi" style="font-weight:700;color:var(--primary);font-size:12.5px;">
        ${fmtSum(r.jamiHisoblandi || 0)}
      </td>
      <td style="text-align:center;white-space:nowrap;">
        <button class="btn btn-sm" data-tatil-id="${escapeHtml(r.id)}" title="Ta'til hisoblash" style="padding:2px 5px;color:#d97706;">🏖️</button>
        <button class="btn btn-sm" data-kasallik-id="${escapeHtml(r.id)}" title="Kasallik varaqasi hisoblash" style="padding:2px 5px;color:#ef4444;">🩺</button>
        <button class="btn btn-sm btn-icon" data-del-tabel-id="${escapeHtml(r.id)}" title="O'chirish" style="padding:2px 5px;color:var(--danger);"><svg class="ic" viewBox="0 0 24 24"><use href="#i-trash"/></svg></button>
      </td>
    </tr>
  `;
}

function bindTabelEvents(std) {
  const year = CURRENT_TABEL_YEAR;
  const month = CURRENT_TABEL_MONTH;

  // Navigatsiya
  document.getElementById("btnPrevMonth").addEventListener("click", () => {
    CURRENT_TABEL_MONTH--;
    if (CURRENT_TABEL_MONTH < 1) { CURRENT_TABEL_MONTH = 12; CURRENT_TABEL_YEAR--; }
    renderTabel();
  });
  document.getElementById("btnNextMonth").addEventListener("click", () => {
    CURRENT_TABEL_MONTH++;
    if (CURRENT_TABEL_MONTH > 12) { CURRENT_TABEL_MONTH = 1; CURRENT_TABEL_YEAR++; }
    renderTabel();
  });

  const selGrafik = document.getElementById("tabelGrafikSel");
  if (selGrafik) {
    selGrafik.addEventListener("change", (e) => {
      TABEL_GRAFIK_FILTER = e.target.value;
      renderTabel();
    });
  }

  const btnBack = document.getElementById("btnBackToIshHaqi");
  if (btnBack) btnBack.addEventListener("click", () => navigate("ishhaqi"));

  document.getElementById("btnSyncFromIshHaqi").addEventListener("click", () => {
    const added = syncTabelFromIshHaqi(year, month);
    renderTabel();
    toast(added ? `${added} ta yangi xodim tabelga qo'shildi` : "Barcha xodimlar allaqachon tabelda mavjud");
  });

  document.getElementById("btnAutoFillAll").addEventListener("click", () => {
    autoFillAllTabelRows(year, month);
    renderTabel();
    toast("Barcha xodimlarga standart ish kunlari (8/D) qo'yildi");
  });

  document.getElementById("btnSyncToIshHaqi").addEventListener("click", () => {
    syncTabelToIshHaqi(year, month);
  });

  document.getElementById("btnOpenTatilModal").addEventListener("click", () => openTatilModal());
  document.getElementById("btnOpenKasallikModal").addEventListener("click", () => openKasallikModal());
  document.getElementById("btnPrintTabelT13").addEventListener("click", () => printTabelT13(year, month));
  document.getElementById("btnExportTabel").addEventListener("click", () => exportTabelXlsx(year, month));
  document.getElementById("btnAddTabelRow").addEventListener("click", () => addTabelRow(year, month));

  // Jadval kataklaridagi tahrirlashlar
  const body = document.getElementById("tabelBody");
  if (!body) return;

  // Kunlik katak o'zgarishi
  body.addEventListener("change", (e) => {
    const inp = e.target;
    if (inp.classList.contains("tabel-cell-inp")) {
      const rowId = inp.dataset.rowId;
      const day = inp.dataset.day;
      const rawVal = inp.value.trim();

      let val = rawVal.toUpperCase();
      if (!val) val = "0";

      inp.value = val;

      const row = (STORE.tabel || []).find((r) => r.id === rowId);
      if (!row) return;

      if (!row.kunlar) row.kunlar = {};
      row.kunlar[day] = val;

      const updated = calculateTabelRowTotals(row, year, month, TABEL_GRAFIK_FILTER);
      Object.assign(row, updated);

      // DOM qatorini yangilaymiz
      const tr = inp.closest("tr");
      if (tr) {
        tr.querySelector(".row-ishlangan-kun").textContent = updated.ishlanganKun;
        tr.querySelector(".row-ishlangan-soat").textContent = updated.ishlanganSoat;
        tr.querySelector(".row-tatil-summa").innerHTML = updated.tatilKun ? `<div>${updated.tatilKun} k.</div><div style="color:#d97706;font-weight:600;">${fmtSum(updated.tatilSumma)}</div>` : `<span class="faint">—</span>`;
        tr.querySelector(".row-kasallik-summa").innerHTML = updated.kasallikKun ? `<div>${updated.kasallikKun} k.</div><div style="color:#ef4444;font-weight:600;">${fmtSum(updated.kasallikSumma)}</div>` : `<span class="faint">—</span>`;
        tr.querySelector(".row-jami-hisoblandi").textContent = fmtSum(updated.jamiHisoblandi);

        // Sinflar
        inp.className = "tabel-cell-inp " + (
          val === "D" ? "tabel-tag-weekend" :
          val === "T" ? "tabel-tag-tatil" :
          val === "K" ? "tabel-tag-kasallik" :
          val === "X" ? "tabel-tag-leave" :
          val === "S" ? "tabel-tag-absent" :
          val.toLowerCase() === "xiz" ? "tabel-tag-trip" : "tabel-tag-work"
        );
      }

      saveStore();
      pushFieldsUpdate("tabel", row.id, {
        kunlar: row.kunlar,
        ishlanganKun: updated.ishlanganKun,
        ishlanganSoat: updated.ishlanganSoat,
        tatilKun: updated.tatilKun,
        tatilSumma: updated.tatilSumma,
        kasallikKun: updated.kasallikKun,
        kasallikSumma: updated.kasallikSumma,
        faktikOylik: updated.faktikOylik,
        jamiHisoblandi: updated.jamiHisoblandi
      });
    } else if (inp.classList.contains("tabel-oklad-inp")) {
      const tr = inp.closest("tr");
      const rowId = tr.dataset.rowId;
      const row = (STORE.tabel || []).find((r) => r.id === rowId);
      if (!row) return;

      row.oklad = toNum(inp.value);
      inp.value = fmt(row.oklad);

      const updated = calculateTabelRowTotals(row, year, month, TABEL_GRAFIK_FILTER);
      Object.assign(row, updated);

      tr.querySelector(".row-jami-hisoblandi").textContent = fmtSum(updated.jamiHisoblandi);
      saveStore();
      pushFieldsUpdate("tabel", row.id, { oklad: row.oklad, faktikOylik: updated.faktikOylik, jamiHisoblandi: updated.jamiHisoblandi });
    } else if (inp.classList.contains("tabel-fio-inp")) {
      const tr = inp.closest("tr");
      const rowId = tr.dataset.rowId;
      const row = (STORE.tabel || []).find((r) => r.id === rowId);
      if (!row) return;
      row.fio = inp.value.trim();
      saveStore();
      pushFieldsUpdate("tabel", row.id, { fio: row.fio });
    }
  });

  // Tugmalar
  body.addEventListener("click", (e) => {
    const btnTatil = e.target.closest("[data-tatil-id]");
    if (btnTatil) {
      openTatilModal(btnTatil.dataset.tatilId);
      return;
    }
    const btnKas = e.target.closest("[data-kasallik-id]");
    if (btnKas) {
      openKasallikModal(btnKas.dataset.kasallikId);
      return;
    }
    const btnDel = e.target.closest("[data-del-tabel-id]");
    if (btnDel) {
      deleteRowSafe("tabel", "tabel", btnDel.dataset.delTabelId, renderTabel);
      return;
    }
  });
}

// Yangi xodim qo'shish
async function addTabelRow(year, month) {
  const y = toNum(year) || CURRENT_TABEL_YEAR;
  const m = toNum(month) || CURRENT_TABEL_MONTH;
  const std = getMonthlyWorkingDays(y, m, TABEL_GRAFIK_FILTER);

  const kunlar = {};
  std.daysList.forEach((d) => { kunlar[d.day] = d.defaultCode; });

  const rawRow = {
    yil: y,
    oy: m,
    xodimId: null,
    fio: "",
    lavozimi: "",
    pinfl: "",
    oklad: 0,
    stavka: 1.0,
    grafik: TABEL_GRAFIK_FILTER,
    kunlar,
    ishlanganKun: std.standardWorkDays,
    ishlanganSoat: std.standardWorkHours,
    tatilKun: 0,
    tatilSumma: 0,
    kasallikKun: 0,
    kasallikSumma: 0,
    mukofot: 0,
    faktikOylik: 0,
    jamiHisoblandi: 0,
    izoh: ""
  };

  const { data, error } = await sbClient.from("tabel").insert(toDbRow(TABEL_DB_MAP, rawRow)).select().single();
  let row;
  if (!error && data) {
    row = fromDbRow(TABEL_DB_MAP, data);
  } else {
    row = { id: "tab_" + Date.now(), ...rawRow };
  }

  if (!STORE.tabel) STORE.tabel = [];
  STORE.tabel.push(row);
  saveStore();
  renderTabel();
  toast("Yangi xodim tabelga qo'shildi");
}

// Mehnat ta'tili (Otpusknoy) Modali
function openTatilModal(targetRowId) {
  const year = CURRENT_TABEL_YEAR;
  const month = CURRENT_TABEL_MONTH;
  const rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === year && toNum(r.oy) === month);

  if (!rows.length) {
    toast("Avval tabelga xodim qo'shing", "err");
    return;
  }

  const selectedRow = targetRowId ? rows.find((r) => r.id === targetRowId) || rows[0] : rows[0];
  const std = getMonthlyWorkingDays(year, month, TABEL_GRAFIK_FILTER);

  openModal(`
    <div style="max-width:540px;width:100%;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:36px;height:36px;border-radius:8px;background:rgba(245,158,11,0.2);display:flex;align-items:center;justify-content:center;color:#d97706;font-size:18px;">🏖️</div>
        <div>
          <h3 style="margin:0;">Mehnat ta'tili (Otpusknoy) hisoblash</h3>
          <p class="modal-sub" style="margin:2px 0 0;">O'zbekiston Mehnat Kodeksi 233-moddasi (25.3 kunlik o'rtacha koeffitsient)</p>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;">Xodimni tanlang:</label>
        <select id="tatilRowSelect" class="cell-input" style="width:100%;margin-top:4px;padding:6px 8px;">
          ${rows.map((r) => `<option value="${escapeHtml(r.id)}" ${r.id === selectedRow.id ? "selected" : ""}>${escapeHtml(r.fio || "Nomsiz xodim")} (${fmt(r.oklad)} so'm)</option>`).join("")}
        </select>
      </div>

      <div class="grid grid-2" style="gap:10px;margin-bottom:12px;">
        <div>
          <label style="font-size:12px;font-weight:600;">Boshlanish kuni:</label>
          <input type="number" id="tatilStartDay" class="cell-input" min="1" max="${std.totalDays}" value="1" style="width:100%;margin-top:4px;">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;">Tugash kuni (shu kun ham):</label>
          <input type="number" id="tatilEndDay" class="cell-input" min="1" max="${std.totalDays}" value="${Math.min(15, std.totalDays)}" style="width:100%;margin-top:4px;">
        </div>
      </div>

      <div class="tabel-calc-box">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12.5px;">
          <span style="color:var(--text-muted);">Xodim okladi:</span>
          <b id="tatilOkladLabel">${fmt(selectedRow.oklad)} so'm</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12.5px;">
          <span style="color:var(--text-muted);">Bir kunlik o'rtacha ish haqi (Oklad / 25.3):</span>
          <b id="tatilDailyRateLabel">${fmt(Math.round(toNum(selectedRow.oklad) / 25.3))} so'm</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12.5px;">
          <span style="color:var(--text-muted);">Ta'til kunlari soni:</span>
          <b id="tatilDaysCountLabel">15 kun</b>
        </div>
        <div style="border-top:1px dashed var(--border);padding-top:8px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;">Hisoblangan ta'til puli:</span>
          <span id="tatilTotalLabel" style="font-size:18px;font-weight:800;color:#d97706;">${fmt(calculateTatilPuli(selectedRow.oklad, 15).summa)} so'm</span>
        </div>
      </div>

      <div class="note" style="margin-bottom:16px;">
        "Tabelga kiritish" tugmasi bosilganda tanlangan kunlar tabelda avtomatik <b>T</b> belgisi bilan belgilanadi va ta'til puli xodim ish haqiga qo'shiladi.
      </div>

      <div class="modal-actions">
        <button class="btn" id="mCancel">Bekor qilish</button>
        <button class="btn btn-primary" id="btnApplyTatil">Tabelga kiritish va hisoblash</button>
      </div>
    </div>
  `);

  function updateCalc() {
    const selId = document.getElementById("tatilRowSelect").value;
    const r = rows.find((x) => x.id === selId) || selectedRow;
    const startDay = Math.max(1, Math.min(std.totalDays, toNum(document.getElementById("tatilStartDay").value) || 1));
    const endDay = Math.max(startDay, Math.min(std.totalDays, toNum(document.getElementById("tatilEndDay").value) || startDay));
    const daysCount = endDay - startDay + 1;

    const calc = calculateTatilPuli(r.oklad, daysCount);
    document.getElementById("tatilOkladLabel").textContent = fmt(calc.oklad) + " so'm";
    document.getElementById("tatilDailyRateLabel").textContent = fmt(calc.kunlikOrtacha) + " so'm";
    document.getElementById("tatilDaysCountLabel").textContent = daysCount + " kun";
    document.getElementById("tatilTotalLabel").textContent = fmt(calc.summa) + " so'm";
  }

  document.getElementById("tatilRowSelect").addEventListener("change", updateCalc);
  document.getElementById("tatilStartDay").addEventListener("input", updateCalc);
  document.getElementById("tatilEndDay").addEventListener("input", updateCalc);

  document.getElementById("btnApplyTatil").addEventListener("click", () => {
    const selId = document.getElementById("tatilRowSelect").value;
    const r = rows.find((x) => x.id === selId);
    if (!r) return;

    const startDay = Math.max(1, Math.min(std.totalDays, toNum(document.getElementById("tatilStartDay").value) || 1));
    const endDay = Math.max(startDay, Math.min(std.totalDays, toNum(document.getElementById("tatilEndDay").value) || startDay));
    const daysCount = endDay - startDay + 1;
    const calc = calculateTatilPuli(r.oklad, daysCount);

    if (!r.kunlar) r.kunlar = {};
    for (let d = startDay; d <= endDay; d++) {
      r.kunlar[d] = "T";
    }
    r.tatilSumma = calc.summa;

    const updated = calculateTabelRowTotals(r, year, month, TABEL_GRAFIK_FILTER);
    Object.assign(r, updated);

    saveStore();
    pushFieldsUpdate("tabel", r.id, {
      kunlar: r.kunlar,
      ishlanganKun: r.ishlanganKun,
      ishlanganSoat: r.ishlanganSoat,
      tatilKun: r.tatilKun,
      tatilSumma: r.tatilSumma,
      faktikOylik: r.faktikOylik,
      jamiHisoblandi: r.jamiHisoblandi
    });

    closeModal();
    renderTabel();
    toast(`Ta'til puli muvaffaqiyatli hisoblandi: ${fmt(calc.summa)} so'm (${daysCount} kun)`);
  });
}

// Kasallik varaqasi (Bolnichniy) Modali
function openKasallikModal(targetRowId) {
  const year = CURRENT_TABEL_YEAR;
  const month = CURRENT_TABEL_MONTH;
  const rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === year && toNum(r.oy) === month);

  if (!rows.length) {
    toast("Avval tabelga xodim qo'shing", "err");
    return;
  }

  const selectedRow = targetRowId ? rows.find((r) => r.id === targetRowId) || rows[0] : rows[0];
  const std = getMonthlyWorkingDays(year, month, TABEL_GRAFIK_FILTER);

  openModal(`
    <div style="max-width:540px;width:100%;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:36px;height:36px;border-radius:8px;background:rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:18px;">🩺</div>
        <div>
          <h3 style="margin:0;">Kasallik varaqasi (Bolnichniy) hisoblash</h3>
          <p class="modal-sub" style="margin:2px 0 0;">O'zR VM Nizomi № 1136 bo'yicha staj va ish kunlari asosida nafaqa</p>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;">Xodimni tanlang:</label>
        <select id="kasRowSelect" class="cell-input" style="width:100%;margin-top:4px;padding:6px 8px;">
          ${rows.map((r) => `<option value="${escapeHtml(r.id)}" ${r.id === selectedRow.id ? "selected" : ""}>${escapeHtml(r.fio || "Nomsiz xodim")} (${fmt(r.oklad)} so'm)</option>`).join("")}
        </select>
      </div>

      <div class="grid grid-2" style="gap:10px;margin-bottom:12px;">
        <div>
          <label style="font-size:12px;font-weight:600;">Boshlanish kuni:</label>
          <input type="number" id="kasStartDay" class="cell-input" min="1" max="${std.totalDays}" value="1" style="width:100%;margin-top:4px;">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;">Tugash kuni (shu kun ham):</label>
          <input type="number" id="kasEndDay" class="cell-input" min="1" max="${std.totalDays}" value="${Math.min(7, std.totalDays)}" style="width:100%;margin-top:4px;">
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <label style="font-size:12px;font-weight:600;">Mehnat staji bo'yicha to'lov foizi:</label>
        <select id="kasStajSelect" class="cell-input" style="width:100%;margin-top:4px;padding:6px 8px;">
          <option value="60">60% — 8 yildan kam umumiy staj</option>
          <option value="80" selected>80% — 8 yildan ortiq umumiy staj (Standart)</option>
          <option value="100">100% — Ishlab chiqarishdagi jarohat / Imtiyozli</option>
        </select>
      </div>

      <div class="tabel-calc-box">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12.5px;">
          <span style="color:var(--text-muted);">Xodim okladi:</span>
          <b id="kasOkladLabel">${fmt(selectedRow.oklad)} so'm</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12.5px;">
          <span style="color:var(--text-muted);">Bir ish kuni o'rtacha haqi (Oklad / ${std.standardWorkDays}):</span>
          <b id="kasDailyRateLabel">${fmt(Math.round(toNum(selectedRow.oklad) / (std.standardWorkDays || 22)))} so'm</b>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12.5px;">
          <span style="color:var(--text-muted);">Kasallik ish kunlari soni:</span>
          <b id="kasDaysCountLabel">5 kun</b>
        </div>
        <div style="border-top:1px dashed var(--border);padding-top:8px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:700;">Hisoblangan kasallik nafaqasi:</span>
          <span id="kasTotalLabel" style="font-size:18px;font-weight:800;color:#ef4444;">${fmt(calculateKasallikPuli(selectedRow.oklad, std.standardWorkDays, 5, 80).summa)} so'm</span>
        </div>
      </div>

      <div class="note" style="margin-bottom:16px;">
        "Tabelga kiritish" tugmasi bosilganda oraliqdagi ish kunlariga <b>K</b> belgisi qo'yiladi (dam olish kunlariga tegilmaydi) va nafaqa summasi xodim ish haqiga qo'shiladi.
      </div>

      <div class="modal-actions">
        <button class="btn" id="mCancel">Bekor qilish</button>
        <button class="btn btn-primary" id="btnApplyKasallik">Tabelga kiritish va hisoblash</button>
      </div>
    </div>
  `);

  function countWorkDaysInRange(start, end) {
    let count = 0;
    for (let d = start; d <= end; d++) {
      const item = std.daysList.find((x) => x.day === d);
      if (item && !item.isWeekend && !item.isHoliday) count++;
    }
    return count;
  }

  function updateCalc() {
    const selId = document.getElementById("kasRowSelect").value;
    const r = rows.find((x) => x.id === selId) || selectedRow;
    const startDay = Math.max(1, Math.min(std.totalDays, toNum(document.getElementById("kasStartDay").value) || 1));
    const endDay = Math.max(startDay, Math.min(std.totalDays, toNum(document.getElementById("kasEndDay").value) || startDay));
    const stajFoiz = toNum(document.getElementById("kasStajSelect").value) || 80;
    const workDays = countWorkDaysInRange(startDay, endDay);

    const calc = calculateKasallikPuli(r.oklad, std.standardWorkDays, workDays, stajFoiz);
    document.getElementById("kasOkladLabel").textContent = fmt(calc.oklad) + " so'm";
    document.getElementById("kasDailyRateLabel").textContent = fmt(calc.kunlikOrtacha) + " so'm";
    document.getElementById("kasDaysCountLabel").textContent = workDays + " ish kuni";
    document.getElementById("kasTotalLabel").textContent = fmt(calc.summa) + " so'm";
  }

  document.getElementById("kasRowSelect").addEventListener("change", updateCalc);
  document.getElementById("kasStartDay").addEventListener("input", updateCalc);
  document.getElementById("kasEndDay").addEventListener("input", updateCalc);
  document.getElementById("kasStajSelect").addEventListener("change", updateCalc);

  document.getElementById("btnApplyKasallik").addEventListener("click", () => {
    const selId = document.getElementById("kasRowSelect").value;
    const r = rows.find((x) => x.id === selId);
    if (!r) return;

    const startDay = Math.max(1, Math.min(std.totalDays, toNum(document.getElementById("kasStartDay").value) || 1));
    const endDay = Math.max(startDay, Math.min(std.totalDays, toNum(document.getElementById("kasEndDay").value) || startDay));
    const stajFoiz = toNum(document.getElementById("kasStajSelect").value) || 80;
    const workDays = countWorkDaysInRange(startDay, endDay);
    const calc = calculateKasallikPuli(r.oklad, std.standardWorkDays, workDays, stajFoiz);

    if (!r.kunlar) r.kunlar = {};
    for (let d = startDay; d <= endDay; d++) {
      const item = std.daysList.find((x) => x.day === d);
      if (item && !item.isWeekend && !item.isHoliday) {
        r.kunlar[d] = "K";
      }
    }
    r.kasallikSumma = calc.summa;

    const updated = calculateTabelRowTotals(r, year, month, TABEL_GRAFIK_FILTER);
    Object.assign(r, updated);

    saveStore();
    pushFieldsUpdate("tabel", r.id, {
      kunlar: r.kunlar,
      ishlanganKun: r.ishlanganKun,
      ishlanganSoat: r.ishlanganSoat,
      kasallikKun: r.kasallikKun,
      kasallikSumma: r.kasallikSumma,
      faktikOylik: r.faktikOylik,
      jamiHisoblandi: r.jamiHisoblandi
    });

    closeModal();
    renderTabel();
    toast(`Kasallik nafaqasi muvaffaqiyatli hisoblandi: ${fmt(calc.summa)} so'm (${workDays} ish kuni)`);
  });
}

// Rasmiy A4 Tabel (T-13 Shakli) Chop Etish
function printTabelT13(year, month) {
  const s = STORE.settings;
  const kompaniya = s.companyName || "«FORGET KORXONASI»";
  const inn = s.inn || "—";
  const rahbar = s.rahbar || "Korxona rahbari";
  const std = getMonthlyWorkingDays(year, month, TABEL_GRAFIK_FILTER);
  const rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === year && toNum(r.oy) === month);

  const html = `
    <!DOCTYPE html>
    <html lang="uz">
    <head>
      <meta charset="utf-8">
      <title>Tabel T-13 — ${year}-yil ${OYLAR_UZ[month]}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm 8mm 10mm 8mm; }
        body { font-family: "Times New Roman", Times, serif; font-size: 8.5pt; color: #000; line-height: 1.2; margin: 0; padding: 5px; }
        .stamp-block { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 9pt; }
        .title { text-align: center; font-weight: bold; font-size: 11.5pt; text-transform: uppercase; margin: 5px 0 2px; }
        .sub { text-align: center; font-size: 9.5pt; font-style: italic; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 8pt; }
        th, td { border: 1px solid #000; padding: 2px 1px; text-align: center; }
        th { background: #f2f2f2; font-weight: bold; }
        td.left { text-align: left; padding-left: 4px; }
        td.num { text-align: right; padding-right: 4px; }
        .signatures { display: flex; justify-content: space-between; margin-top: 25px; font-size: 9.5pt; }
        .sign-col { width: 30%; }
        .sign-line { border-bottom: 1px solid #000; height: 22px; margin-top: 3px; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="stamp-block">
        <div>
          <b>${escapeHtml(kompaniya)}</b><br>
          STIR / INN: ${escapeHtml(inn)}<br>
          Tarkibiy bo'linma: <b>Barcha bo'limlar</b>
        </div>
        <div style="text-align:right;">
          Davlat statistika qo'mitasi va Moliya vazirligi<br>
          tomonidan tasdiqlangan <b>T-13 shakli</b>
        </div>
      </div>

      <div class="title">ISH VAQTIDAN FOYDALANISHNI HISOBGA OLISH VA ISH HAQI HISOB-KITOBI TABELI</div>
      <div class="sub">${year}-yil ${escapeHtml(OYLAR_UZ[month])} oyi uchun</div>

      <table>
        <thead>
          <tr>
            <th rowspan="2" style="width:20px;">№</th>
            <th rowspan="2" style="width:130px;">Familiyasi, ismi, sharifi</th>
            <th rowspan="2" style="width:75px;">Lavozimi</th>
            <th rowspan="2" style="width:65px;">PINFL</th>
            <th colspan="${std.totalDays}">Oy kunlari bo'yicha belgilar (davomat)</th>
            <th colspan="2">Ishlangan</th>
            <th colspan="2">Ishlanmagan kunlar</th>
            <th rowspan="2" style="width:65px;">Oklad</th>
            <th rowspan="2" style="width:75px;">Jami hisoblandi</th>
          </tr>
          <tr>
            ${std.daysList.map((d) => `<th style="width:16px;font-size:7pt;">${d.day}</th>`).join("")}
            <th style="width:30px;">kun</th>
            <th style="width:32px;">soat</th>
            <th style="width:30px;">ta'til</th>
            <th style="width:30px;">kasal</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="left"><b>${escapeHtml(r.fio || "")}</b></td>
              <td class="left">${escapeHtml(r.lavozimi || "")}</td>
              <td>${escapeHtml(r.pinfl || "—")}</td>
              ${std.daysList.map((d) => {
                const val = (r.kunlar && (r.kunlar[d.day] || r.kunlar[String(d.day)])) || d.defaultCode;
                return `<td style="font-size:7.5pt;font-weight:${val === "8" || val === "D" ? "normal" : "bold"};">${escapeHtml(val)}</td>`;
              }).join("")}
              <td>${r.ishlanganKun || 0}</td>
              <td>${r.ishlanganSoat || 0}</td>
              <td>${r.tatilKun || "—"}</td>
              <td>${r.kasallikKun || "—"}</td>
              <td class="num">${fmt(r.oklad || 0)}</td>
              <td class="num"><b>${fmt(r.jamiHisoblandi || 0)}</b></td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr style="font-weight:bold;background:#f9f9f9;">
            <td colspan="4" class="num">Jami:</td>
            <td colspan="${std.totalDays}"></td>
            <td>${rows.reduce((s, r) => s + toNum(r.ishlanganKun), 0)}</td>
            <td>${rows.reduce((s, r) => s + toNum(r.ishlanganSoat), 0)}</td>
            <td>${rows.reduce((s, r) => s + toNum(r.tatilKun), 0)}</td>
            <td>${rows.reduce((s, r) => s + toNum(r.kasallikKun), 0)}</td>
            <td class="num">${fmt(rows.reduce((s, r) => s + toNum(r.oklad), 0))}</td>
            <td class="num">${fmt(rows.reduce((s, r) => s + toNum(r.jamiHisoblandi), 0))}</td>
          </tr>
        </tfoot>
      </table>

      <div class="signatures">
        <div class="sign-col">
          Tashkilot rahbari:<br>
          <div class="sign-line"></div>
          <b>${escapeHtml(rahbar)}</b>
        </div>
        <div class="sign-col">
          Bosh buxgalter:<br>
          <div class="sign-line"></div>
          (imzo, F.I.Sh.)
        </div>
        <div class="sign-col">
          Kadrlar bo'limi xodimi / Mas'ul shaxs:<br>
          <div class="sign-line"></div>
          (imzo, F.I.Sh.)
        </div>
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    toast("Chop etish darchasini brauzer blokladi — pop-up ruxsatini bering", "err");
  }
}

// Excelga T-13 shaklida eksport
function exportTabelXlsx(year, month) {
  const s = STORE.settings;
  const std = getMonthlyWorkingDays(year, month, TABEL_GRAFIK_FILTER);
  const rows = (STORE.tabel || []).filter((r) => toNum(r.yil) === year && toNum(r.oy) === month);

  const headerDayCols = std.daysList.map((d) => String(d.day));
  const aoa = [
    [s.companyName || "«FORGET KORXONASI»"],
    [`INN: ${s.inn || "—"}   Davr: ${year}-yil ${OYLAR_UZ[month]}`],
    ["ISH VAQTIDAN FOYDALANISHNI HISOBGA OLISH VA ISH HAQI HISOB-KITOBI TABELI (T-13 SHAKLI)"],
    [],
    ["№", "F.I.O.", "Lavozimi", "PINFL", "Oklad", ...headerDayCols, "Ishlangan kun", "Ishlangan soat", "Ta'til kun", "Ta'til summa", "Kasallik kun", "Kasallik summa", "Jami hisoblandi"]
  ];

  rows.forEach((r, i) => {
    const dayVals = std.daysList.map((d) => {
      return (r.kunlar && (r.kunlar[d.day] || r.kunlar[String(d.day)])) || d.defaultCode;
    });
    aoa.push([
      i + 1,
      r.fio || "",
      r.lavozimi || "",
      r.pinfl || "",
      toNum(r.oklad),
      ...dayVals,
      toNum(r.ishlanganKun),
      toNum(r.ishlanganSoat),
      toNum(r.tatilKun),
      toNum(r.tatilSumma),
      toNum(r.kasallikKun),
      toNum(r.kasallikSumma),
      toNum(r.jamiHisoblandi)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Tabel_${year}_${month}`);
  XLSX.writeFile(wb, `FORGET_tabel_${year}_${String(month).padStart(2, "0")}.xlsx`);
  toast("T-13 Tabel Excel fayli yuklab olindi");
}

function renderIshHaqiHisoboti() {
  const s = STORE.settings;
  const t = computeIshHaqiTotals();
  const rows = getFilteredRows(STORE.ishHaqi).slice().sort((a, b) => (a.fio || "").localeCompare(b.fio || ""));
  const main = document.getElementById("main");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ish haqi hisoboti</h1>
        <p class="page-desc">Jismoniy shaxslardan olinadigan daromad solig'i va ijtimoiy soliq hisob-kitobi — "Ish haqi" bo'limi ma'lumotlaridan avtomatik hisoblanadi.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnExportIshHaqiHisobot">Excel'ga eksport</button>
        <button class="btn" id="btnPrintIshHaqiHisobot">PDF (chop etish)</button>
        <button class="btn" data-nav="settings" data-nav-section="ishhaqi">Stavkalarni sozlash</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Hisobot yuqoridagi "Davr" filtriga mos ravishda shakllanadi.</div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Hisob-kitob</div>
        ${reportLine("010", "Hisoblangan ish haqi jamg'armasi", t.oylikJami, { code: "010" })}
        ${reportLine("030", "Soliqdan ozod qilingan summalar (imtiyozlar)", t.imtiyozJami, { code: "030" })}
        ${reportLine("040", "Soliq bazasi", t.soliqBazasiJami, { code: "040", total: true })}
        <div class="report-line"><span class="label">Ijtimoiy soliq / NDFL / INPS stavkalari</span><span class="code">050</span><span class="val">${fmt(s.ijtimoiySoliqStavka)}% / ${fmt(s.ndflStavka)}% / ${fmt(s.inpsStavka, 1)}%</span></div>
        ${reportLine("060", "Hisoblangan ijtimoiy soliq (ish beruvchi xarajati)", t.ijtimoiySoliqJami, { code: "060" })}
        ${reportLine("060", "Hisoblangan NDFL", t.ndflJami, { code: "060" })}
        ${reportLine("080", "INPS ixtiyoriy jamg'arma badali", t.inpsJami, { code: "080" })}
        ${reportLine("090", "Byudjetga to'lanadigan NDFL (NDFL − INPS)", t.ndflByudjetgaJami, { code: "090", total: true })}
      </div>
      <div class="card">
        <div class="card-title">Xulosa</div>
        <div class="report-line"><span class="label">Xodimlar soni (tanlangan davrda)</span><span class="code"></span><span class="val">${t.count}</span></div>
        ${reportLine("", "Xodimlarga to'lanadigan sof ish haqi", t.sofIshHaqiJami, { total: true })}
        ${reportLine("", "Ish beruvchi uchun jami xarajat (ish haqi + ijtimoiy soliq)", t.ishBeruvchiXarajati, { total: true })}
        <div class="note" style="margin-top:14px;">
          <b>Hisoblash mantig'i:</b><br>
          Ijtimoiy soliq — hisoblangan ish haqidan (imtiyozsiz) ish beruvchi tomonidan to'lanadi, xodim ish haqidan ushlanmaydi.<br>
          NDFL va INPS — soliq bazasidan (ish haqi minus imtiyoz) xodim ish haqidan ushlab qolinadi.<br>
          Byudjetga to'lanadigan NDFL = hisoblangan NDFL − INPS badali (INPS shaxsiy jamg'arma hisobiga yo'naltiriladi).<br>
          Manba: <b>i.x.xltx</b> (asosiy hisob-kitob, 010–090 qatorlari) va <b>I.X. yuklama.xltx</b> (Ilova №4, xodimlar bo'yicha tafsilot) andazalari asosida soddalashtirilgan.
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Xodimlar bo'yicha tafsilot (Ilova №4 andazasi)</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>№</th><th>F.I.O.</th><th>Lavozimi</th><th>PINFL</th><th>Turi</th><th>Holati</th>
              <th class="num">Hisoblangan ish haqi</th>
              <th class="num">Ijtimoiy soliq</th>
              <th class="num">NDFL</th>
              <th class="num">INPS</th>
              <th class="num">Sof ish haqi</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((r, i) => ishHaqiReportRowHtml(r, i + 1)).join("") : ""}
          </tbody>
        </table>
      </div>
      ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-users"/></svg><div class="t">Ma'lumot yo'q</div><div class="d">"Ish haqi" bo'limida xodim yozuvlarini kiriting.</div></div>` : ""}
    </div>
  `;
  document.getElementById("btnExportIshHaqiHisobot").addEventListener("click", exportIshHaqiHisobotXlsx);
  document.getElementById("btnPrintIshHaqiHisobot").addEventListener("click", printIshHaqiHisobotPdf);
  bindNavShortcuts(main);
}

function ishHaqiHisobotReportLines(t) {
  return [
    { code: "010", label: "Hisoblangan ish haqi jamg'armasi", value: t.oylikJami },
    { code: "030", label: "Soliqdan ozod qilingan summalar (imtiyozlar)", value: t.imtiyozJami },
    { code: "040", label: "Soliq bazasi", value: t.soliqBazasiJami },
    { code: "060", label: "Hisoblangan ijtimoiy soliq", value: t.ijtimoiySoliqJami },
    { code: "060", label: "Hisoblangan NDFL", value: t.ndflJami },
    { code: "080", label: "INPS ixtiyoriy jamg'arma badali", value: t.inpsJami },
    { code: "090", label: "Byudjetga to'lanadigan NDFL", value: t.ndflByudjetgaJami }
  ];
}

function exportIshHaqiHisobotXlsx() {
  const s = STORE.settings;
  const t = computeIshHaqiTotals();
  const rows = getFilteredRows(STORE.ishHaqi).slice().sort((a, b) => (a.fio || "").localeCompare(b.fio || ""));
  buildAndDownloadReportXlsx("FORGET_ish_haqi_hisoboti", "Ish haqi hisoboti", ishHaqiHisobotReportLines(t), {
    sheetName: "Xodimlar",
    headers: ["№", "F.I.O.", "Lavozimi", "PINFL", "Turi", "Holati", "Hisoblangan ish haqi", "Ijtimoiy soliq", "NDFL", "INPS", "Sof ish haqi"],
    rows: rows.map((r, i) => {
      const c = computeIshHaqiRow(r, s);
      return [i + 1, r.fio, r.lavozimi, r.pinfl, r.turi, r.holati, c.oylik, c.ijtimoiySoliq, c.ndfl, c.inps, c.sofIshHaqi];
    })
  });
}

// Faqat umumiy (010-090) qatorlar chop etiladi — xodimlar bo'yicha tafsilot
// (Ilova №4) hozircha faqat Excel eksportida bor.
function printIshHaqiHisobotPdf() {
  const t = computeIshHaqiTotals();
  const s = STORE.settings;
  printReportLines("Ish haqi hisoboti", `Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`, ishHaqiHisobotReportLines(t));
}

function ishHaqiReportRowHtml(r, n) {
  const c = computeIshHaqiRow(r, STORE.settings);
  return `
    <tr>
      <td>${n}</td>
      <td>${escapeHtml(r.fio || "—")}</td>
      <td>${escapeHtml(r.lavozimi || "—")}</td>
      <td class="tag-inn">${escapeHtml(r.pinfl || "—")}</td>
      <td>${escapeHtml(r.turi || "Rezident")}</td>
      <td>${escapeHtml(r.holati || "Ishlayapti")}</td>
      <td class="num">${fmtSum(c.oylik)}</td>
      <td class="num">${fmtSum(c.ijtimoiySoliq)}</td>
      <td class="num">${fmtSum(c.ndfl)}</td>
      <td class="num">${fmtSum(c.inps)}</td>
      <td class="num" style="font-weight:700">${fmtSum(c.sofIshHaqi)}</td>
    </tr>
  `;
}

/* ------------------------------- F2 hisobot ------------------------------- */

// Hisobot sarlavhasi ostida korxona rekvizitlarini bir xil ko'rinishda chiqaradi:
// "Korxona nomi · INN 123456789 · Davr". Barcha hisobotlar (F2, QQS, Foyda,
// Ish haqi hisoboti, F1) shu bitta yordamchidan foydalanadi.
function reportRequisiteLine() {
  const s = STORE.settings;
  const bits = [
    String(s.companyName || "").trim(),
    s.inn ? "INN " + String(s.inn).trim() : "",
    String(s.period || "").trim()
  ].filter(Boolean);
  return bits.length ? `<p class="page-desc">${escapeHtml(bits.join(" · "))}</p>` : "";
}

function reportLine(codeOrLabel, label, value, opts = {}) {
  const isTotal = opts.total;
  const neg = toNum(value) < 0;
  return `
    <div class="report-line ${isTotal ? "total" : ""}">
      <span class="label">${label}</span>
      <span class="code">${opts.code || ""}</span>
      <span class="val ${neg ? "neg" : ""}">${fmtSum(value)}</span>
    </div>
  `;
}

// F2 / Foyda solig'i sahifasida: tannarxning bir qismi taxminiy bo'lsa
// (kalkulyatsiyasiz sotuvlar yoki ombor zaxirasi yetmagan qatorlar) —
// kahrabo ogohlantirish. computeTotals() natijasini oladi.
function tannarxTaxminiyOgohlik(t) {
  if (!t.kalkulyatsiyasizSoni && !t.omborKamomadSoni) return "";
  const qismlar = [];
  if (t.kalkulyatsiyasizSoni) qismlar.push(`${t.kalkulyatsiyasizSoni} ta sotuv qatori kalkulyatsiya bilan bog'lanmagan (taxminiy tannarx: ${fmtSum(t.taxminiyTannarx)})`);
  if (t.omborKamomadSoni) qismlar.push(`${t.omborKamomadSoni} ta qatorda ombor zaxirasi (yoki kirim faktura) yetishmaydi`);
  return `<div class="note warn" style="margin:0 0 14px;">⚠️ Tannarx to'liq aniq emas: ${qismlar.join("; ")}. "Ishlab chiqarish" bo'limida kalkulyatsiyani to'g'rilang va yetishmagan xomashyoga kirim faktura kiriting.</div>`;
}

function renderF2() {
  const t = computeTotals();
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">F2 — Moliyaviy natijalar to'g'risida hisobot</h1>
        <p class="page-desc">Vazirlar Mahkamasi shakli asosida, Faktura kirim/chiqim ma'lumotlaridan avtomatik hisoblanadi.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportF2">Excel'dan import</button>
        <button class="btn" id="btnExportF2">Excel'ga eksport</button>
        <button class="btn" id="btnPrintF2">PDF (chop etish)</button>
        <button class="btn" data-nav="settings" data-nav-section="soliq">Xarajatlarni sozlash</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Hisobot yuqoridagi "Davr" filtriga mos ravishda shakllanadi.</div>
    ${tannarxTaxminiyOgohlik(t)}

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Daromad va xarajatlar</div>
        <div class="report-block-title">Asosiy faoliyat</div>
        ${reportLine("010", "Sof tushum (sotuvdan)", t.revenue, { code: "010" })}
        ${reportLine("020", "Sotilgan mahsulot tannarxi", t.tannarx, { code: "020" })}
        ${reportLine("030", "Yalpi foyda", t.yalpiFoyda, { code: "030", total: true })}
        ${reportLine("040", "Davr xarajatlari", t.davrXarajati, { code: "040" })}
        ${t.ishHaqiXarajati > 0 ? `<div class="report-line" style="opacity:.7;font-size:12px;"><span class="label">— shundan, Ish haqi bo'limidan avtomatik</span><span class="code"></span><span class="val">${fmtSum(t.ishHaqiXarajati)}</span></div>` : ""}
        ${reportLine("100", "Asosiy faoliyatdan foyda", t.asosiyFaoliyatFoyda, { code: "100", total: true })}

        <div class="report-block-title">Moliyaviy faoliyat</div>
        ${reportLine("170", "Moliyaviy faoliyat xarajatlari", t.moliyaviyXarajat, { code: "170" })}
        ${reportLine("240", "Soliqqacha foyda", t.soliqqachaFoyda, { code: "240", total: true })}

        <div class="report-block-title">Soliq</div>
        ${reportLine("250", "Foyda solig'i", t.foydaSoligi, { code: "250" })}
        ${reportLine("270", "Sof foyda (davr natijasi)", t.sofFoyda, { code: "270", total: true })}
      </div>

      <div class="card">
        <div class="card-title">Manba ma'lumotlari</div>
        <div class="report-line"><span class="label">Chiqim fakturalar (QQSsiz)</span><span class="code"></span><span class="val">${fmtSum(t.chiqimBase)}</span></div>
        <div class="report-line"><span class="label">Kalkulyatsiya bo'yicha xomashyo tannarxi</span><span class="code"></span><span class="val">${fmtSum(t.kalkulyatsiyaTannarx)}</span></div>
        <div class="note" style="margin-top:14px;">
          <b>Hisoblash mantig'i:</b><br>
          Sof tushum = tasdiqlangan <b>chiqim fakturalar</b> summasi (QQSsiz).<br>
          Tannarx = shu davrda sotilgan mahsulotlarning <b>Kalkulyatsiya</b> (Faktura chiqim'dagi 🧮 tugmasi) orqali aniqlangan xomashyo tannarxi yig'indisi — "Sozlamalar"da qo'lda tuzatish (ustidan yozish) mumkin.<br>
          Davr va moliyaviy xarajatlar — "Sozlamalar" bo'limida qo'lda kiritiladi.<br>
          Foyda solig'i shu yerda va "Foyda solig'i" hisobotida bitta manbadan (bir xil) hisoblanadi.
        </div>
      </div>
    </div>
  `;
  document.getElementById("btnExportF2").addEventListener("click", () => exportF2Xlsx());
  document.getElementById("btnPrintF2").addEventListener("click", () => printF2Pdf());
  document.getElementById("btnImportF2").addEventListener("click", () => {
    openGenericImportModal(
      "F2 — Excel'dan import",
      `Ilgari eksport qilingan F2 faylidan "Davr xarajatlari" va "Moliyaviy faoliyat xarajatlari" ko'rsatkichlari o'qib olinadi.`,
      ".xlsx,.xls",
      (file) => handleReportSettingsImport(file, {
        "Davr xarajatlari": "davrXarajati",
        "Moliyaviy faoliyat xarajatlari": "moliyaviyXarajat"
      }, renderF2)
    );
  });
  bindNavShortcuts(main);
}

function f2ReportLines(t) {
  return [
    { code: "010", label: "Sof tushum (sotuvdan)", value: t.revenue },
    { code: "020", label: "Sotilgan mahsulot tannarxi", value: t.tannarx },
    { code: "030", label: "Yalpi foyda", value: t.yalpiFoyda },
    { code: "040", label: "Davr xarajatlari", value: t.davrXarajati },
    { code: "100", label: "Asosiy faoliyatdan foyda", value: t.asosiyFaoliyatFoyda },
    { code: "170", label: "Moliyaviy faoliyat xarajatlari", value: t.moliyaviyXarajat },
    { code: "240", label: "Soliqqacha foyda", value: t.soliqqachaFoyda },
    { code: "250", label: "Foyda solig'i", value: t.foydaSoligi },
    { code: "270", label: "Sof foyda (davr natijasi)", value: t.sofFoyda }
  ];
}

function exportF2Xlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_F2", "F2 — Moliyaviy natijalar to'g'risida hisobot", f2ReportLines(t));
}

function printF2Pdf() {
  const t = computeTotals();
  const s = STORE.settings;
  printReportLines("F2 — Moliyaviy natijalar to'g'risida hisobot", `Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`, f2ReportLines(t));
}

/* ------------------------------- QQS hisobot ------------------------------- */

function renderQQS() {
  const t = computeTotals();
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Qo'shilgan qiymat solig'i (QQS) hisob-kitobi</h1>
        <p class="page-desc">Kirim va chiqim fakturalardagi QQS summalaridan avtomatik hisoblanadi.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportQQS">Excel'dan import</button>
        <button class="btn" id="btnExportQQS">Excel'ga eksport</button>
        <button class="btn" id="btnPrintQQS">PDF (chop etish)</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Hisobot yuqoridagi "Davr" filtriga mos ravishda shakllanadi.</div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Hisob-kitob</div>
        ${reportLine("010", "Zachyotga qabul qilinadigan QQS (xariddan)", t.qqsInput, { code: "010" })}
        ${reportLine("020", "Sotuvdan QQS", t.qqsOutput, { code: "020" })}
        ${reportLine("030", "Byudjetga to'lanadigan QQS (020−010)", t.qqsToPay, { code: "030", total: true })}
      </div>
      <div class="card">
        <div class="card-title">Tafsilot</div>
        <div class="report-line"><span class="label">Chiqim fakturalar soni</span><span class="code"></span><span class="val">${getFilteredRows(STORE.chiqim).filter((r) => isValidStatus(r.status)).length}</span></div>
        <div class="report-line"><span class="label">Kirim fakturalar soni</span><span class="code"></span><span class="val">${getFilteredRows(STORE.kirim).filter((r) => isValidStatus(r.status)).length}</span></div>
        <div class="report-line"><span class="label">Standart QQS stavkasi</span><span class="code"></span><span class="val">${STORE.settings.qqsStavka}%</span></div>
        <div class="note" style="margin-top:14px;">
          Manba: <b>QQS.xltx</b> andazasidagi "Hisob-kitob" bo'limi (010 — zachyotga qabul qilinadigan QQS, 020 — sotuvdan QQS, 030 — byudjetga to'lanadigan QQS) tuzilishi asosida.
          Faqat holati "Отказ/Bekor qilingan" bo'lmagan fakturalar hisoblanadi.
        </div>
      </div>
    </div>
  `;
  document.getElementById("btnExportQQS").addEventListener("click", () => exportQQSXlsx());
  document.getElementById("btnPrintQQS").addEventListener("click", () => printQQSPdf());
  document.getElementById("btnImportQQS").addEventListener("click", () => {
    openGenericImportModal(
      "QQS — Excel'dan import",
      `Ilgari eksport qilingan QQS faylidan "Standart QQS stavkasi" ko'rsatkichi o'qib olinadi.`,
      ".xlsx,.xls",
      (file) => handleReportSettingsImport(file, { "Standart QQS stavkasi (%)": "qqsStavka" }, renderQQS)
    );
  });
}

function qqsReportLines(t) {
  return [
    { code: "010", label: "Zachyotga qabul qilinadigan QQS (xariddan)", value: t.qqsInput },
    { code: "020", label: "Sotuvdan QQS", value: t.qqsOutput },
    { code: "030", label: "Byudjetga to'lanadigan QQS", value: t.qqsToPay },
    { code: "", label: "Standart QQS stavkasi (%)", value: STORE.settings.qqsStavka }
  ];
}

function exportQQSXlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_QQS", "QQS hisob-kitobi", qqsReportLines(t));
}

function printQQSPdf() {
  const t = computeTotals();
  const s = STORE.settings;
  printReportLines("QQS hisob-kitobi", `Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`, qqsReportLines(t));
}

/* ------------------------------- Foyda solig'i ------------------------------- */

function renderFoyda() {
  const t = computeTotals();
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Foyda solig'i hisob-kitobi</h1>
        <p class="page-desc">Yuridik shaxslardan olinadigan foyda solig'i, F2 bilan bir xil manbadan hisoblanadi.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportFoyda">Excel'dan import</button>
        <button class="btn" id="btnExportFoyda">Excel'ga eksport</button>
        <button class="btn" id="btnPrintFoyda">PDF (chop etish)</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Hisobot yuqoridagi "Davr" filtriga mos ravishda shakllanadi.</div>
    ${tannarxTaxminiyOgohlik(t)}

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Hisob-kitob</div>
        ${reportLine("010", "Jami daromad", t.jamiDaromad, { code: "010" })}
        ${reportLine("020", "Chegiriladigan xarajatlar", t.chegiriladiXarajat, { code: "020" })}
        ${reportLine("030", "Soliqqa tortiladigan foyda", t.soliqqaTortiladiganFoyda, { code: "030", total: true })}
        ${reportLine("040", "Imtiyozlar", t.imtiyozlar, { code: "040" })}
        ${reportLine("060", "Soliq bazasi", t.soliqBazasi, { code: "060", total: true })}
        <div class="report-line"><span class="label">Soliq stavkasi</span><span class="code">070</span><span class="val">${t.foydaStavka}%</span></div>
        ${reportLine("080", "Foyda solig'i summasi", t.foydaSoligi, { code: "080", total: true })}
      </div>
      <div class="card">
        <div class="card-title">Sozlash</div>
        <div class="field"><label>Boshqa daromadlar (qo'lda)</label><input type="text" id="inBoshqaDaromad" value="${fmt(STORE.settings.boshqaDaromad)}"></div>
        <div class="field"><label>Imtiyozlar summasi (qo'lda)</label><input type="text" id="inImtiyozlar" value="${fmt(STORE.settings.imtiyozlar)}"></div>
        <div class="field"><label>Foyda solig'i stavkasi (%)</label><input type="text" id="inFoydaStavka" value="${fmt(STORE.settings.foydaStavka)}"></div>
        <button class="btn btn-primary" id="btnSaveFoyda">Saqlash</button>
        <div class="note">Manba: <b>foyda soligi.xltx</b> andazasidagi asosiy hisob-kitob (010–080 qatorlari) tuzilishi asosida soddalashtirilgan.</div>
      </div>
    </div>
  `;

  document.getElementById("btnSaveFoyda").addEventListener("click", () => {
    if (!requireDataReady()) return;
    const partial = {
      boshqaDaromad: toNum(document.getElementById("inBoshqaDaromad").value),
      imtiyozlar: toNum(document.getElementById("inImtiyozlar").value),
      foydaStavka: toNum(document.getElementById("inFoydaStavka").value)
    };
    if (!guardSettingsPartial(partial)) return;
    applySettingsChange(partial); // STORE + baza + kesh + joriy sahifani qayta chizadi
    toast("Saqlandi");
  });
  document.getElementById("btnExportFoyda").addEventListener("click", () => exportFoydaXlsx());
  document.getElementById("btnPrintFoyda").addEventListener("click", () => printFoydaPdf());
  document.getElementById("btnImportFoyda").addEventListener("click", () => {
    openGenericImportModal(
      "Foyda solig'i — Excel'dan import",
      `Ilgari eksport qilingan fayldan "Boshqa daromadlar", "Imtiyozlar summasi" va "Foyda solig'i stavkasi" ko'rsatkichlari o'qib olinadi.`,
      ".xlsx,.xls",
      (file) => handleReportSettingsImport(file, {
        "Boshqa daromadlar (qo'lda)": "boshqaDaromad",
        "Imtiyozlar summasi (qo'lda)": "imtiyozlar",
        "Foyda solig'i stavkasi (%)": "foydaStavka"
      }, renderFoyda)
    );
  });
}

function foydaReportLines(t) {
  return [
    { code: "010", label: "Jami daromad", value: t.jamiDaromad },
    { code: "020", label: "Chegiriladigan xarajatlar", value: t.chegiriladiXarajat },
    { code: "030", label: "Soliqqa tortiladigan foyda", value: t.soliqqaTortiladiganFoyda },
    { code: "040", label: "Imtiyozlar", value: t.imtiyozlar },
    { code: "060", label: "Soliq bazasi", value: t.soliqBazasi },
    { code: "080", label: "Foyda solig'i summasi", value: t.foydaSoligi },
    { code: "", label: "Boshqa daromadlar (qo'lda)", value: STORE.settings.boshqaDaromad },
    { code: "", label: "Imtiyozlar summasi (qo'lda)", value: STORE.settings.imtiyozlar },
    { code: "070", label: "Foyda solig'i stavkasi (%)", value: t.foydaStavka }
  ];
}

function exportFoydaXlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_foyda_soligi", "Foyda solig'i hisob-kitobi", foydaReportLines(t));
}

function printFoydaPdf() {
  const t = computeTotals();
  const s = STORE.settings;
  printReportLines("Foyda solig'i hisob-kitobi", `Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`, foydaReportLines(t));
}

/* ------------------------------- F1 balans ------------------------------- */

function renderF1() {
  const t = computeTotals();
  const main = document.getElementById("main");
  const diff = t.aktivJami - t.passivJami;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">F1 — Buxgalteriya balansi (qisqartirilgan)</h1>
        <p class="page-desc">Asosiy ko'rsatkichlar avtomatik (bank, debitor/kreditor, asosiy vositalar, tovar-moddiy zaxiralar), qolganlari qo'lda kiritiladi.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportF1">Excel'dan import</button>
        <button class="btn" id="btnExportF1">Excel'ga eksport</button>
        <button class="btn" id="btnPrintF1">PDF (chop etish)</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Balans har doim yuqoridagi "Davr"ning oxirgi sanasiga ("gacha") nisbatan hisoblanadi — u kunlik holatni ko'rsatadi.</div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Aktiv</div>
        <div class="report-line"><span class="label">Asosiy vositalar <span class="faint">("Asosiy vositalar" sahifasidan)</span></span><span class="code"></span><span class="val">${fmtSum(t.asosiyVositalar)}</span></div>
        <div class="report-line"><span class="label">Tovar-moddiy zaxiralar <span class="faint">("Ombor" sahifasidan)</span></span><span class="code"></span><span class="val">${fmtSum(t.tovarZaxira)}</span></div>
        <div class="report-line"><span class="label">Debitorlik qarzdorligi <span class="faint">(to'lanmagan chiqim f.)</span></span><span class="code"></span><span class="val">${fmtSum(t.debitorlik)}</span></div>
        <div class="report-line"><span class="label">Kassa</span><span class="code"></span><input class="val editable" id="f1Kassa" value="${fmt(STORE.settings.f1Kassa)}"></div>
        <div class="report-line"><span class="label">Hisob raqamidagi pul <span class="faint">(bank qoldig'i)</span></span><span class="code"></span><span class="val">${fmtSum(t.bankQoldiq)}</span></div>
        ${reportLine("400", "Jami aktiv", t.aktivJami, { total: true })}
      </div>
      <div class="card">
        <div class="card-title">Passiv</div>
        <div class="report-line"><span class="label">Ustav kapitali</span><span class="code"></span><input class="val editable" id="f1Uk" value="${fmt(STORE.settings.f1UstavKapitali)}"></div>
        <div class="report-line"><span class="label">O'tgan davr jamg'argan foydasi</span><span class="code"></span><input class="val editable" id="f1Of" value="${fmt(STORE.settings.f1OldingiFoyda)}"></div>
        <div class="report-line"><span class="label">Joriy davr sof foydasi <span class="faint">(F2'dan)</span></span><span class="code"></span><span class="val">${fmtSum(t.sofFoyda)}</span></div>
        <div class="report-line"><span class="label">Uzoq muddatli majburiyatlar</span><span class="code"></span><input class="val editable" id="f1Um" value="${fmt(STORE.settings.f1UzoqMajburiyat)}"></div>
        <div class="report-line"><span class="label">Kreditorlik qarzdorligi <span class="faint">(to'lanmagan kirim f.)</span></span><span class="code"></span><span class="val">${fmtSum(t.kreditorlik)}</span></div>
        ${reportLine("780", "Jami passiv", t.passivJami, { total: true })}
      </div>
    </div>

    <div class="card section" style="margin-top:16px;">
      <div class="card-title">Balans tekshiruvi</div>
      <div class="report-line total">
        <span class="label">Aktiv − Passiv farqi</span><span class="code"></span>
        <span class="val ${Math.abs(diff) < 1 ? "" : "neg"}">${fmtSum(diff)}</span>
      </div>
      <div class="note">${Math.abs(diff) < 1 ? "Balans teng — aktiv va passiv mos keladi." : "Farq bor: qo'lda kiritiladigan maydonlarni (kassa, ustav kapitali, uzoq muddatli majburiyatlar va h.k.) haqiqiy holatga moslang."}</div>
      <button class="btn btn-primary" id="btnSaveF1" style="margin-top:10px;">Saqlash</button>
    </div>
  `;

  document.getElementById("btnSaveF1").addEventListener("click", () => {
    if (!requireDataReady()) return;
    const partial = {
      f1Kassa: toNum(document.getElementById("f1Kassa").value),
      f1UstavKapitali: toNum(document.getElementById("f1Uk").value),
      f1OldingiFoyda: toNum(document.getElementById("f1Of").value),
      f1UzoqMajburiyat: toNum(document.getElementById("f1Um").value)
    };
    if (!guardSettingsPartial(partial)) return;
    applySettingsChange(partial); // STORE + baza + kesh + joriy sahifani qayta chizadi
    toast("Saqlandi");
  });
  document.getElementById("btnExportF1").addEventListener("click", () => exportF1Xlsx());
  document.getElementById("btnPrintF1").addEventListener("click", () => printF1Pdf());
  document.getElementById("btnImportF1").addEventListener("click", () => {
    openGenericImportModal(
      "F1 — Excel'dan import",
      `Ilgari eksport qilingan F1 faylidan qo'lda kiritiladigan barcha ko'rsatkichlar (kassa, ustav kapitali va h.k.) o'qib olinadi.`,
      ".xlsx,.xls",
      (file) => handleReportSettingsImport(file, {
        "Kassa": "f1Kassa",
        "Ustav kapitali": "f1UstavKapitali",
        "O'tgan davr jamg'argan foydasi": "f1OldingiFoyda",
        "Uzoq muddatli majburiyatlar": "f1UzoqMajburiyat"
      }, renderF1)
    );
  });
}

function f1ReportLines(t) {
  return [
    { code: "", label: "Asosiy vositalar", value: t.asosiyVositalar },
    { code: "", label: "Tovar-moddiy zaxiralar", value: t.tovarZaxira },
    { code: "", label: "Debitorlik qarzdorligi", value: t.debitorlik },
    { code: "", label: "Kassa", value: STORE.settings.f1Kassa },
    { code: "", label: "Hisob raqamidagi pul (bank qoldig'i)", value: t.bankQoldiq },
    { code: "400", label: "Jami aktiv", value: t.aktivJami },
    { code: "", label: "Ustav kapitali", value: t.ustavKapitali },
    { code: "", label: "O'tgan davr jamg'argan foydasi", value: t.oldingiFoyda },
    { code: "", label: "Joriy davr sof foydasi", value: t.sofFoyda },
    { code: "", label: "Uzoq muddatli majburiyatlar", value: t.uzoqMajburiyat },
    { code: "", label: "Kreditorlik qarzdorligi", value: t.kreditorlik },
    { code: "780", label: "Jami passiv", value: t.passivJami }
  ];
}

function exportF1Xlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_F1", "F1 — Buxgalteriya balansi", f1ReportLines(t));
}

function printF1Pdf() {
  const t = computeTotals();
  const s = STORE.settings;
  printReportLines("F1 — Buxgalteriya balansi", `Sana: ${s.filterTo || todayISO()}`, f1ReportLines(t));
}

/* ------------------------------- Solishtirma dalolatnoma ------------------------------- */

// Har bir kontragent (INN) uchun: "Kirim" ustuni = qarzdorlikni OSHIRUVCHI hodisalar
// (chiqim-faktura chiqarildi + kontragentga bank orqali to'lov qilindi),
// "Chiqim" ustuni = qarzdorlikni KAMAYTIRUVCHI hodisalar (kirim-faktura qabul qilindi +
// kontragentdan bank orqali to'lov olindi). Musbat balans = kontragent bizga qarzdor.
function computeReconciliationRows() {
  const s = STORE.settings;
  const from = s.filterFrom;
  const to = s.filterTo;

  const innInfo = {};
  function note(inn, name) {
    inn = (inn || "").trim();
    if (!inn) return;
    if (!(inn in innInfo)) innInfo[inn] = "";
    if (name && String(name).trim()) innInfo[inn] = String(name).trim();
  }
  STORE.chiqim.forEach((r) => note(r.kontragentInn, r.kontragentNomi));
  STORE.kirim.forEach((r) => note(r.kontragentInn, r.kontragentNomi));
  STORE.bank.forEach((r) => note(r.kontragentInn, r.kontragent));
  (STORE.kassa || []).forEach((r) => note(r.kontragentInn, r.kontragent));
  // Boshlang'ich qarzi qo'lda kiritilgan, lekin hozircha faktura/bank
  // yozuvlari bo'lmagan kontragentlar ham (davr harakati nolga teng bo'lsa
  // ham) ro'yxatda ko'rinishi uchun.
  STORE.kontragentlar.forEach((k) => { if (toNum(k.boshlangichQarz)) note(k.inn, k.nomi); });

  function periodTotals(inn, matchFn) {
    const chiqimAmt = STORE.chiqim.filter((r) => (r.kontragentInn || "").trim() === inn && isValidStatus(r.status) && matchFn(r.sana)).reduce((a, r) => a + toNum(r.jamiSumma), 0);
    const kirimAmt = STORE.kirim.filter((r) => (r.kontragentInn || "").trim() === inn && isValidStatus(r.status) && matchFn(r.sana)).reduce((a, r) => a + toNum(r.jamiSumma), 0);
    const bankKirimAmt = STORE.bank.filter((r) => (r.kontragentInn || "").trim() === inn && matchFn(r.sana)).reduce((a, r) => a + toNum(r.kirim), 0);
    const bankChiqimAmt = STORE.bank.filter((r) => (r.kontragentInn || "").trim() === inn && matchFn(r.sana)).reduce((a, r) => a + toNum(r.chiqim), 0);
    const kassaKirimAmt = (STORE.kassa || []).filter((r) => (r.kontragentInn || "").trim() === inn && r.turi === "kirim" && matchFn(r.sana)).reduce((a, r) => a + toNum(r.summa), 0);
    const kassaChiqimAmt = (STORE.kassa || []).filter((r) => (r.kontragentInn || "").trim() === inn && r.turi === "chiqim" && matchFn(r.sana)).reduce((a, r) => a + toNum(r.summa), 0);
    return { kirimCol: chiqimAmt + bankChiqimAmt + kassaChiqimAmt, chiqimCol: kirimAmt + bankKirimAmt + kassaKirimAmt };
  }

  // "Davr boshiga" = Kontragentlar bo'limida qo'lda kiritilgan boshlang'ich baza
  // (odatda FORGET'dan oldingi tarixni ifodalaydi) + tanlangan "Davr"ning
  // boshigacha ("from" sanasidan OLDIN) bo'lgan barcha faktura/bank harakati.
  // Shu sabab davr filtri o'zgarganda "Davr boshiga" ham to'g'ri qayta
  // hisoblanadi (masalan "Joriy chorak" tanlansa, o'sha chorakdan oldingi
  // barcha tarix "Davr boshiga"ga yig'iladi — avval bu qiymat filtrdan
  // qat'i nazar doim bitta qo'lda kiritilgan raqamda "muzlab" qolar, natijada
  // "Davr oxiriga" ham har qanday davr uchun noto'g'ri chiqardi).
  // "from" bo'sh bo'lsa (filtr yo'q) faqat qo'lda kiritilgan baza qiymati ishlatiladi.
  return Object.keys(innInfo).map((inn) => {
    const kontragent = STORE.kontragentlar.find((k) => (k.inn || "").trim() === inn);
    const baseQarz = kontragent ? toNum(kontragent.boshlangichQarz) : 0;
    const before = from ? periodTotals(inn, (sana) => !!sana && sana < from) : { kirimCol: 0, chiqimCol: 0 };
    const boshiga = baseQarz + before.kirimCol - before.chiqimCol;
    const period = periodTotals(inn, (sana) => inRange(sana, from, to));
    const oxiriga = boshiga + period.kirimCol - period.chiqimCol;
    return { inn, nomi: innInfo[inn] || "(nomsiz)", boshiga, kirim: period.kirimCol, chiqim: period.chiqimCol, oxiriga };
  })
    .filter((r) => r.boshiga !== 0 || r.kirim !== 0 || r.chiqim !== 0)
    .sort((a, b) => Math.abs(b.oxiriga) - Math.abs(a.oxiriga));
}

// Har bir kontragent qatori uch holatdan biriga tegishli: bizga qarzdor (debtor),
// biz qarzdormiz (creditor) yoki qarz yo'q (zero). Sverka sahifasidagi filtr
// tugmalari, "Holat" ustunidagi belgi va eksport/chop etish shu bitta manbadan
// (SVERKA_STATUS_META) foydalanadi — matn bir joyda o'zgartirilsa, hammasi mos keladi.
let SVERKA_STATUS_FILTER = null;

const SVERKA_STATUS_META = {
  debtor: { text: "Bizga qarzdor", pillClass: "pill-ok", tabLabel: "Bizga qarzdor" },
  creditor: { text: "Biz qarzdormiz", pillClass: "pill-danger", tabLabel: "Biz qarzdor" },
  zero: { text: "Kvitansiya", pillClass: "pill-muted", tabLabel: "Qarz haqi yo'q" }
};

function sverkaStatusKey(r) {
  return r.oxiriga > 0.5 ? "debtor" : r.oxiriga < -0.5 ? "creditor" : "zero";
}

function sverkaRowHtml(r) {
  const meta = SVERKA_STATUS_META[sverkaStatusKey(r)];
  const statusPill = `<span class="pill ${meta.pillClass}">${meta.text}</span>`;
  return `
    <tr data-hist-inn="${escapeHtml(r.inn)}" class="cursor-pointer kontragent-row" title="Tarixni (sverka) ko'rish uchun bosing">
      <td><strong>${escapeHtml(r.nomi)}</strong></td>
      <td class="tag-inn">${escapeHtml(r.inn)}</td>
      <td class="num" title="Boshlang'ich baza (Kontragentlar bo'limida tahrirlanadi) + davr boshigacha bo'lgan tarix asosida avtomatik hisoblanadi">${fmtSum(r.boshiga)}</td>
      <td class="num">${fmtSum(r.kirim)}</td>
      <td class="num">${fmtSum(r.chiqim)}</td>
      <td class="num" style="font-weight:700">${fmtSum(r.oxiriga)}</td>
      <td>${statusPill}</td>
    </tr>
  `;
}

/* ------------------------------ Kreditorlik/Debitorlik muddati (aging) ------------------------------ */
// Solishtirma dalolatnoma "davr" bo'yicha kirim/chiqim/bank oqimini ko'rsatadi,
// lekin "qaysi to'lanmagan faktura QANCHA muddatdan buyon ochiq turibdi"
// degan savolga alohida javob bermaydi — shu sabab qo'shildi. Ataylab davr
// filtridan (STORE.settings.filterFrom/filterTo) mustaqil: bu har doim
// JORIY (bugungi kundagi) ochiq qarzdorlik holatini ko'rsatadi. Kirim uchun
// "Kreditorlik" (biz kimga qarzdormiz), chiqim uchun "Debitorlik" (kim bizga
// qarzdor) — ikkalasi ham renderInvoiceTable kabi BITTA umumiy funksiyaga
// (renderAgingReport) asoslangan, faqat AGING_CONFIG orqali farqlanadi.
function computeAgingReport(rows) {
  const today = todayISO();
  const aged = rows
    .filter((r) => isValidStatus(r.status) && !r.tolandi && toNum(r.jamiSumma) > 0)
    .map((r) => {
      const daysOverdue = r.sana ? Math.round((new Date(today) - new Date(r.sana)) / 86400000) : 0;
      const bucket = daysOverdue <= 30 ? "0-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
      return Object.assign({}, r, { daysOverdue, bucket });
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  aged.forEach((r) => { buckets[r.bucket] += toNum(r.jamiSumma); });
  const total = aged.reduce((a, r) => a + toNum(r.jamiSumma), 0);
  return { rows: aged, buckets, total };
}
function computeKreditorlikAging() { return computeAgingReport(STORE.kirim); }
function computeDebitorlikAging() { return computeAgingReport(STORE.chiqim); }

// Muddat aniq maydon (to'lov muddati) yo'qligi sababli, mavjud 30-kunlik
// "muddati o'tgan" konventsiyasidan (computeAttentionSummary) foydalanib,
// shu chegaraga yaqinlashayotgan (lekin hali o'tmagan) hujjatlarni topadi.
const REMINDER_LOOKAHEAD_DAYS = 7;
function computeUpcomingDueRows(rows) {
  return computeAgingReport(rows).rows.filter((r) => r.daysOverdue > 30 - REMINDER_LOOKAHEAD_DAYS && r.daysOverdue <= 30);
}
function computeUpcomingKreditorlik() { return computeUpcomingDueRows(STORE.kirim); }
function computeUpcomingDebitorlik() { return computeUpcomingDueRows(STORE.chiqim); }

const AGING_BUCKET_LABELS = [["0-30", "0–30 kun"], ["31-60", "31–60 kun"], ["61-90", "61–90 kun"], ["90+", "90+ kun"]];

const AGING_CONFIG = {
  kirim: {
    title: "Kreditorlik muddati", partyLabel: "Kontragent",
    desc: "To'lanmagan kirim fakturalar — hujjat sanasidan buyon necha kun o'tgani bo'yicha (aging). Sahifa tepasidagi davr filtridan qat'i nazar, har doim joriy (bugungi) ochiq qarzdorlikni ko'rsatadi.",
    totalLabel: "Jami kreditorlik", emptyTitle: "To'lanmagan kirim faktura yo'q",
    emptyDesc: "Barcha kirim fakturalar to'langan (yoki INN kiritilmagani uchun qo'lda kuzatiladi).",
    compute: computeKreditorlikAging, viewAction: (id) => openKirimDetailModal(id),
    sheetTitle: "Kreditorlik muddati (to'lanmagan kirim fakturalar)", filePrefix: "kreditorlik_muddati"
  },
  chiqim: {
    title: "Debitorlik muddati", partyLabel: "Xaridor",
    desc: "To'lanmagan chiqim fakturalar (xaridorlar qarzi) — hujjat sanasidan buyon necha kun o'tgani bo'yicha (aging). Sahifa tepasidagi davr filtridan qat'i nazar, har doim joriy (bugungi) ochiq qarzdorlikni ko'rsatadi.",
    totalLabel: "Jami debitorlik", emptyTitle: "To'lanmagan chiqim faktura yo'q",
    emptyDesc: "Barcha chiqim fakturalar to'langan (yoki INN kiritilmagani uchun qo'lda kuzatiladi).",
    compute: computeDebitorlikAging, viewAction: (id) => openChiqimKalkulyatsiyaModal(id),
    sheetTitle: "Debitorlik muddati (to'lanmagan chiqim fakturalar)", filePrefix: "debitorlik_muddati"
  }
};

function renderAgingReport(type) {
  const cfg = AGING_CONFIG[type];
  const { rows, buckets, total } = cfg.compute();
  const main = document.getElementById("main");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${cfg.title}</h1>
        <p class="page-desc">${cfg.desc}</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnExportAging">Excel'ga eksport</button>
        <button class="btn" id="btnPrintAging">PDF (chop etish)</button>
      </div>
    </div>
    <div class="grid grid-4 section">
      ${AGING_BUCKET_LABELS.map(([key, label]) => `<div class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${fmtSum(buckets[key])}</div></div>`).join("")}
    </div>
    <div class="note" style="margin:0 0 14px;">${cfg.totalLabel}: <b>${fmtSum(total)}</b> &middot; ${rows.length} ta to'lanmagan hujjat</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${cfg.partyLabel}</th><th>INN</th><th>Hujjat №</th><th>Sana</th><th class="num">Necha kun</th><th class="num">Summa</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr ${r.kontragentInn ? `data-hist-inn="${escapeHtml(r.kontragentInn)}"` : ""} class="cursor-pointer kontragent-row" title="Tarixni ko'rish uchun bosing">
              <td><strong>${escapeHtml(r.kontragentNomi || "")}</strong></td>
              <td class="tag-inn">${escapeHtml(r.kontragentInn || "")}</td>
              <td>${escapeHtml(r.hujjatRaqami || "")}</td>
              <td>${escapeHtml(r.sana || "")}</td>
              <td class="num">${r.daysOverdue}</td>
              <td class="num" style="font-weight:700">${fmtSum(r.jamiSumma)}</td>
              <td class="row-actions"><button class="icon-btn" data-view="${r.id}" title="Hujjatni ko'rish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg></button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-clipboard"/></svg><div class="t">${cfg.emptyTitle}</div><div class="d">${cfg.emptyDesc}</div></div>` : ""}
  `;
  document.getElementById("btnExportAging").addEventListener("click", () => exportAgingXlsx(rows, buckets, total, cfg));
  document.getElementById("btnPrintAging").addEventListener("click", () => printAgingPdf(rows, total, cfg));
  main.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => cfg.viewAction(b.dataset.view)));
  const agingTbody = main.querySelector("table tbody");
  if (agingTbody) {
    agingTbody.addEventListener("click", (e) => {
      if (e.target.closest("[data-view], button, a, input")) return;
      const tr = e.target.closest("tr[data-hist-inn]");
      if (tr) {
        const inn = tr.getAttribute("data-hist-inn");
        if (inn) openSverkaDetail(inn, type);
      }
    });
  }
}

function exportAgingXlsx(rows, buckets, total, cfg) {
  const s = STORE.settings;
  const aoa = [
    [s.companyName],
    [`INN: ${s.inn}   Sana: ${todayISO()}`],
    [cfg.sheetTitle],
    [],
    [cfg.partyLabel, "INN", "Hujjat №", "Sana", "Necha kun", "Summa"]
  ];
  rows.forEach((r) => aoa.push([r.kontragentNomi, r.kontragentInn, r.hujjatRaqami, r.sana, r.daysOverdue, r.jamiSumma]));
  aoa.push([]);
  AGING_BUCKET_LABELS.forEach(([key, label]) => aoa.push([label, "", "", "", "", buckets[key]]));
  aoa.push(["Jami", "", "", "", "", total]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, cfg.title);
  XLSX.writeFile(wb, `FORGET_${cfg.filePrefix}_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

// Kreditorlik va Debitorlik muddati sahifalari (AGING_CONFIG orqali) bitta
// umumiy chop etish funksiyasidan foydalanadi — exportAgingXlsx bilan bir xil naqsh.
function printAgingPdf(rows, total, cfg) {
  const bodyHtml = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.kontragentNomi || "")}</td>
      <td>${escapeHtml(r.kontragentInn || "")}</td>
      <td>${escapeHtml(r.hujjatRaqami || "")}</td>
      <td>${escapeHtml(r.sana || "")}</td>
      <td class="num">${r.daysOverdue}</td>
      <td class="num">${fmtSum(r.jamiSumma)}</td>
    </tr>
  `).join("");
  const tfootHtml = `<tr><td colspan="5">${escapeHtml(cfg.totalLabel)}</td><td class="num">${fmtSum(total)}</td></tr>`;
  openPrintWindow(buildSimpleReportPrintHtml({
    title: cfg.title,
    theadHtml: `<tr><th>${escapeHtml(cfg.partyLabel)}</th><th>INN</th><th>Hujjat №</th><th>Sana</th><th class="num">Necha kun</th><th class="num">Summa</th></tr>`,
    bodyHtml, tfootHtml
  }));
}

function renderSverka() {
  const rows = computeReconciliationRows();
  const totalDebitor = rows.reduce((a, r) => a + Math.max(r.oxiriga, 0), 0);
  const totalKreditor = rows.reduce((a, r) => a + Math.max(-r.oxiriga, 0), 0);

  const counts = { debtor: 0, creditor: 0, zero: 0 };
  rows.forEach((r) => { counts[sverkaStatusKey(r)]++; });

  const filteredRows = SVERKA_STATUS_FILTER ? rows.filter((r) => sverkaStatusKey(r) === SVERKA_STATUS_FILTER) : rows;

  const main = document.getElementById("main");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Solishtirma dalolatnoma</h1>
        <p class="page-desc">Har bir kontragent (INN) bo'yicha davr boshi/oxiri qarzdorlik holati — Faktura kirim, Faktura chiqim va Bank ma'lumotlaridan avtomatik.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnPrintSverka">PDF (chop etish)</button>
        <button class="btn" id="btnExportSverka">Excel'ga eksport</button>
      </div>
    </div>

    <div class="tabs" id="sverkaStatusTabs">
      ${["creditor", "debtor", "zero"].map((key) => `
        <button type="button" class="tab-btn${SVERKA_STATUS_FILTER === key ? " active" : ""}" data-status-filter="${key}">${SVERKA_STATUS_META[key].tabLabel} (${counts[key]})</button>
      `).join("")}
    </div>

    <div class="note" style="margin:0 0 14px;">"Davr boshiga" — boshlang'ich baza (Kontragentlar bo'limida tahrirlanadi) + davr boshigacha bo'lgan tarix asosida avtomatik hisoblanadi.</div>

    <div class="grid grid-2 section">
      <div class="card stat-card"><div class="stat-label">Jami debitorlik (bizga qarzdor)</div><div class="stat-value">${fmtSum(totalDebitor)}</div></div>
      <div class="card stat-card"><div class="stat-label">Jami kreditorlik (biz qarzdormiz)</div><div class="stat-value">${fmtSum(totalKreditor)}</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kontragent</th><th>INN</th>
            <th class="num">Davr boshiga</th>
            <th class="num">Kirim</th>
            <th class="num">Chiqim</th>
            <th class="num">Davr oxiriga</th>
            <th>Holat</th>
          </tr>
        </thead>
        <tbody id="sverkaBody">
          ${filteredRows.length ? filteredRows.map(sverkaRowHtml).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!filteredRows.length ? (rows.length
      ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-clipboard"/></svg><div class="t">Bu holatga mos kontragent yo'q</div><div class="d">Filterni bekor qilish uchun tanlangan tugmani qayta bosing.</div></div>`
      : `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-clipboard"/></svg><div class="t">Ma'lumot yo'q</div><div class="d">Faktura yoki bank yozuvlarida INN kiritilgan kontragentlar shu yerda ko'rinadi.</div></div>`) : ""}
    <div class="note">
      <b>Hisoblash mantig'i:</b> "Davr boshiga" — Kontragentlar bo'limida kiritilgan boshlang'ich baza + tanlangan davr boshigacha bo'lgan barcha tarix asosida avtomatik hisoblanadi (baza qiymatini o'zgartirish uchun "Kontragentlar" bo'limidagi shu kontragent yozuviga o'ting). "Kirim" — shu davrda chiqarilgan chiqim-fakturalar va kontragentga to'langan bank chiqimlari (qarzdorlikni oshiradi). "Chiqim" — shu davrda qabul qilingan kirim-fakturalar va kontragentdan olingan bank kirimlari (qarzdorlikni kamaytiradi). Davr oxiriga = Davr boshiga + Kirim − Chiqim. Musbat qiymat — kontragent bizga qarzdor; manfiy — biz kontragentga qarzdormiz. Har qanday kontragent qatorini bosish orqali shu kontragentning to'liq harakatlar tarixini (Акт сверка andazasida) ko'rish mumkin.
    </div>
  `;
  document.getElementById("btnExportSverka").addEventListener("click", () => exportSverkaXlsx(filteredRows, totalDebitor, totalKreditor));
  main.querySelectorAll("[data-detail-inn]").forEach((b) => b.addEventListener("click", () => openSverkaDetail(b.dataset.detailInn, "sverka")));
  const sBody = document.getElementById("sverkaBody");
  if (sBody) {
    sBody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-hist-inn]");
      if (tr) {
        const inn = tr.getAttribute("data-hist-inn");
        if (inn) openSverkaDetail(inn, "sverka");
      }
    });
  }
  main.querySelectorAll("[data-status-filter]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.statusFilter;
    SVERKA_STATUS_FILTER = SVERKA_STATUS_FILTER === key ? null : key;
    renderSverka();
  }));
}

function sverkaHolatText(r) {
  return SVERKA_STATUS_META[sverkaStatusKey(r)].text;
}

function exportSverkaXlsx(rows, totalDebitor, totalKreditor) {
  const s = STORE.settings;
  const aoa = [
    [s.companyName],
    [`INN: ${s.inn}   Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`],
    ["Solishtirma dalolatnoma"],
    [],
    ["Kontragent", "INN", "Davr boshiga", "Kirim", "Chiqim", "Davr oxiriga", "Holat"]
  ];
  rows.forEach((r) => aoa.push([r.nomi, r.inn, r.boshiga, r.kirim, r.chiqim, r.oxiriga, sverkaHolatText(r)]));
  aoa.push([]);
  aoa.push(["Jami debitorlik (bizga qarzdor)", "", "", "", "", totalDebitor]);
  aoa.push(["Jami kreditorlik (biz qarzdormiz)", "", "", "", "", totalKreditor]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sverka");
  XLSX.writeFile(wb, `FORGET_sverka_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function printSverkaPdf(rows, totalDebitor, totalKreditor) {
  const s = STORE.settings;
  const period = `${s.filterFrom || "davr boshidan"} — ${s.filterTo || "hozirgacha"}`;
  const bodyRows = rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.nomi)}</td>
      <td>${escapeHtml(r.inn)}</td>
      <td class="num">${fmtSum(r.boshiga)}</td>
      <td class="num">${fmtSum(r.kirim)}</td>
      <td class="num">${fmtSum(r.chiqim)}</td>
      <td class="num"><b>${fmtSum(r.oxiriga)}</b></td>
      <td>${sverkaHolatText(r)}</td>
    </tr>
  `).join("");

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Solishtirma dalolatnoma</title>
      <style>
        body{font-family:Arial, "Segoe UI", sans-serif; padding:28px; color:#1c2530;}
        h1{font-size:18px; margin:0 0 4px;}
        .sub{font-size:12px; color:#5b6b7b; margin:0 0 4px;}
        .period{font-size:12px; color:#5b6b7b; margin:0 0 18px;}
        table{width:100%; border-collapse:collapse; font-size:11.5px;}
        th, td{border:1px solid #ccd3da; padding:6px 8px; text-align:left;}
        th{background:#eceff2;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        tfoot td{font-weight:700; border-top:2px solid #1c2530;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(s.companyName)}</h1>
      <div class="sub">INN: ${escapeHtml(s.inn)}</div>
      <div class="period">Solishtirma dalolatnoma &middot; Davr: ${escapeHtml(period)}</div>
      <table>
        <thead>
          <tr>
            <th>Kontragent</th><th>INN</th>
            <th class="num">Davr boshiga</th><th class="num">Kirim</th>
            <th class="num">Chiqim</th><th class="num">Davr oxiriga</th><th>Holat</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr><td colspan="5">Jami debitorlik (bizga qarzdor)</td><td class="num">${fmtSum(totalDebitor)}</td><td></td></tr>
          <tr><td colspan="5">Jami kreditorlik (biz qarzdormiz)</td><td class="num">${fmtSum(totalKreditor)}</td><td></td></tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

/* --------------------------- Solishtirma dalolatnoma: kontragent tarixi --------------------------- */
// "Tarix" tugmasi orqali ochiladigan alohida sahifa — bitta kontragent bo'yicha
// barcha kirim-faktura, chiqim-faktura va bank kirim/chiqim harakatlarini
// xronologik tartibda, "Акт сверка" andazasidagi Debet/Kredit/Saldo ko'rinishida
// ko'rsatadi. Debet — kontragentga chiqarilgan chiqim-faktura va unga to'langan
// bank chiqimi (bizning foydamizga qarzni oshiradi). Kredit — kontragentdan
// qabul qilingan kirim-faktura va undan olingan bank kirimi (qarzni kamaytiradi).
// Bu xuddi computeReconciliationRows'dagi "Kirim"/"Chiqim" ustunlari bilan bir xil
// mantiq — faqat hujjat darajasida yoyilgan holda.

let SVERKA_DETAIL_INN = null;
// Bu tafsilot sahifasi Solishtirma dalolatnoma'dan tashqari Kontragentlar
// sahifasidagi "Tarix" tugmasi orqali ham ochiladi — "Ro'yxatga qaytish"
// tugmasi ochilgan joyga qaytishi uchun eslab qolinadi.
let SVERKA_DETAIL_RETURN_PAGE = "sverka";

function openSverkaDetail(inn, returnPage) {
  SVERKA_DETAIL_INN = inn;
  SVERKA_DETAIL_RETURN_PAGE = returnPage || "sverka";
  CURRENT_PAGE = "sverkaDetail";
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === SVERKA_DETAIL_RETURN_PAGE));
  renderSverkaDetail();
}

function computeKontragentLedger(inn, opts = {}) {
  const s = STORE.settings;
  const butunTarix = !!(opts && opts.butunTarix);
  const from = butunTarix ? "" : s.filterFrom;
  const to = butunTarix ? "" : s.filterTo;

  function txList(matchFn) {
    const list = [];
    STORE.chiqim.forEach((r) => {
      if ((r.kontragentInn || "").trim() !== inn || !isValidStatus(r.status) || !matchFn(r.sana)) return;
      list.push({ sana: r.sana, hujjat: `Chiqim faktura № ${r.hujjatRaqami || "—"}`, debet: toNum(r.jamiSumma), kredit: 0 });
    });
    STORE.kirim.forEach((r) => {
      if ((r.kontragentInn || "").trim() !== inn || !isValidStatus(r.status) || !matchFn(r.sana)) return;
      list.push({ sana: r.sana, hujjat: `Kirim faktura № ${r.hujjatRaqami || "—"}`, debet: 0, kredit: toNum(r.jamiSumma) });
    });
    STORE.bank.forEach((r) => {
      if ((r.kontragentInn || "").trim() !== inn || !matchFn(r.sana)) return;
      const izoh = r.tavsif ? `: ${r.tavsif}` : "";
      const hujjatNo = r.hujjatRaqami ? ` (${r.hujjatRaqami})` : "";
      if (toNum(r.chiqim) > 0) list.push({ sana: r.sana, hujjat: `Bank chiqim${izoh}${hujjatNo}`, debet: toNum(r.chiqim), kredit: 0 });
      if (toNum(r.kirim) > 0) list.push({ sana: r.sana, hujjat: `Bank kirim${izoh}${hujjatNo}`, debet: 0, kredit: toNum(r.kirim) });
    });
    (STORE.kassa || []).forEach((r) => {
      if ((r.kontragentInn || "").trim() !== inn || !matchFn(r.sana)) return;
      const izoh = r.tavsif ? `: ${r.tavsif}` : "";
      const hujjatNo = r.hujjatRaqami ? ` (${r.hujjatRaqami})` : "";
      const amt = toNum(r.summa);
      if (r.turi === "chiqim" && amt > 0) {
        list.push({ sana: r.sana, hujjat: `Kassa chiqim (KO-2)${izoh}${hujjatNo}`, debet: amt, kredit: 0 });
      } else if (r.turi === "kirim" && amt > 0) {
        list.push({ sana: r.sana, hujjat: `Kassa kirim (KO-1)${izoh}${hujjatNo}`, debet: 0, kredit: amt });
      }
    });
    return list;
  }

  // Solishtirma dalolatnoma jadvalidagi "Davr boshiga" bilan bir xil manba va
  // mantiq (computeReconciliationRows): Kontragentlar spravochnigidagi qo'lda
  // kiritilgan boshlang'ich baza + tanlangan davr boshigacha ("from" sanasidan
  // OLDIN) bo'lgan barcha harakatlar yig'indisi — shu sabab davr filtri
  // o'zgarganda "Saldo boshlang'ich" ham to'g'ri qayta hisoblanadi.
  const kontragent = STORE.kontragentlar.find((k) => (k.inn || "").trim() === inn);
  const baseQarz = kontragent ? toNum(kontragent.boshlangichQarz) : 0;
  const beforeDelta = from
    ? txList((sana) => !!sana && sana < from).reduce((a, t) => a + t.debet - t.kredit, 0)
    : 0;
  const boshlangichSaldo = baseQarz + beforeDelta;

  const period = txList((sana) => inRange(sana, from, to)).sort((a, b) => (a.sana || "").localeCompare(b.sana || ""));
  let running = boshlangichSaldo;
  const rows = period.map((t) => {
    running += t.debet - t.kredit;
    return Object.assign({}, t, { saldo: running });
  });

  return {
    boshlangichSaldo, rows, oxirgiSaldo: running,
    jamiDebet: period.reduce((a, t) => a + t.debet, 0),
    jamiKredit: period.reduce((a, t) => a + t.kredit, 0)
  };
}

let SVERKA_BUTUN_TARIX = false;

function renderSverkaDetail() {
  const inn = SVERKA_DETAIL_INN;
  const main = document.getElementById("main");
  if (!inn) { navigate(SVERKA_DETAIL_RETURN_PAGE); return; }

  const summaryRows = computeReconciliationRows();
  const info = summaryRows.find((r) => r.inn === inn);
  const kRecord = STORE.kontragentlar.find((k) => (k.inn || "").trim() === inn);
  const nomi = info ? info.nomi : (kRecord ? kRecord.nomi : inn);
  const ledger = computeKontragentLedger(inn, { butunTarix: SVERKA_BUTUN_TARIX });

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(nomi)}</h1>
        <p class="page-desc">INN ${escapeHtml(inn)} — o'zaro hisob-kitoblar tarixi (Акт сверка andazasi bo'yicha): kirim faktura, chiqim faktura va bank kirim-chiqim harakatlari.</p>
        ${reportRequisiteLine()}
      </div>
      <div class="page-actions">
        <button class="btn" id="btnBackSverka">&larr; Ro'yxatga qaytish</button>
        <button class="btn" id="btnPrintDetail">PDF (chop etish)</button>
        <button class="btn" id="btnExportDetail">Excel'ga eksport</button>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <div style="display:inline-flex;gap:4px;background:var(--bg-sunken);padding:3px;border-radius:var(--radius-sm);border:1px solid var(--border);">
        <button class="btn btn-sm ${!SVERKA_BUTUN_TARIX ? "btn-primary" : ""}" id="btnSverkaDavr" style="padding:4px 12px;">Davr bo'yicha</button>
        <button class="btn btn-sm ${SVERKA_BUTUN_TARIX ? "btn-primary" : ""}" id="btnSverkaButun" style="padding:4px 12px;">Butun tarix</button>
      </div>
      <span class="faint" style="font-size:12px;">${SVERKA_BUTUN_TARIX ? "Kontragent bilan birinchi kundan boshlab barcha hisob-kitoblar ko'rsatilmoqda" : `"Davr boshi" — tanlangan sanadan oldingi barcha tarix asosida hisoblanadi.`}</span>
    </div>

    <div class="grid grid-3 section">
      <div class="card stat-card"><div class="stat-label">Saldo boshlang'ich</div><div class="stat-value">${fmtSum(ledger.boshlangichSaldo)}</div></div>
      <div class="card stat-card"><div class="stat-label">Davr aylanmasi (Debet / Kredit)</div><div class="stat-value" style="font-size:16px">${fmtSum(ledger.jamiDebet)} / ${fmtSum(ledger.jamiKredit)}</div></div>
      <div class="card stat-card"><div class="stat-label">Saldo oxirigi</div><div class="stat-value">${fmtSum(ledger.oxirgiSaldo)}</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Sana</th><th>Hujjat</th><th class="num">Debet</th><th class="num">Kredit</th><th class="num">Saldo</th></tr>
        </thead>
        <tbody>
          <tr><td colspan="4" class="faint">Saldo boshlang'ich</td><td class="num" style="font-weight:700">${fmtSum(ledger.boshlangichSaldo)}</td></tr>
          ${ledger.rows.length ? ledger.rows.map((t) => `
            <tr>
              <td class="mono">${escapeHtml(t.sana || "—")}</td>
              <td>${escapeHtml(t.hujjat)}</td>
              <td class="num">${t.debet ? fmtSum(t.debet) : ""}</td>
              <td class="num">${t.kredit ? fmtSum(t.kredit) : ""}</td>
              <td class="num">${fmtSum(t.saldo)}</td>
            </tr>
          `).join("") : `<tr><td colspan="5" class="faint" style="text-align:center;padding:16px;">Tanlangan davrda harakat yo'q</td></tr>`}
          <tr><td colspan="4" style="font-weight:700">Saldo oxirigi</td><td class="num" style="font-weight:700">${fmtSum(ledger.oxirgiSaldo)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="note">
      <b>Debet</b> — kontragentga chiqarilgan chiqim-fakturalar va unga to'langan bank chiqimlari (bizning foydamizga qarzni oshiradi). <b>Kredit</b> — kontragentdan qabul qilingan kirim-fakturalar va undan olingan bank kirimlari (qarzni kamaytiradi). Musbat saldo — kontragent bizga qarzdor; manfiy — biz kontragentga qarzdormiz.
    </div>
  `;

  document.getElementById("btnBackSverka").addEventListener("click", () => navigate(SVERKA_DETAIL_RETURN_PAGE));
  document.getElementById("btnExportDetail").addEventListener("click", () => exportSverkaDetailXlsx(nomi, inn, ledger));
  document.getElementById("btnPrintDetail").addEventListener("click", () => printSverkaDetailPdf(nomi, inn, ledger));
  document.getElementById("btnSverkaDavr").addEventListener("click", () => {
    SVERKA_BUTUN_TARIX = false;
    renderSverkaDetail();
  });
  document.getElementById("btnSverkaButun").addEventListener("click", () => {
    SVERKA_BUTUN_TARIX = true;
    renderSverkaDetail();
  });
}

function exportSverkaDetailXlsx(nomi, inn, ledger) {
  const s = STORE.settings;
  const aoa = [
    [s.companyName],
    [`INN: ${s.inn}   Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`],
    [`Akt sverka — ${nomi} (INN ${inn})`],
    [],
    ["Sana", "Hujjat", "Debet", "Kredit", "Saldo"],
    ["", "Saldo boshlang'ich", "", "", ledger.boshlangichSaldo]
  ];
  ledger.rows.forEach((t) => aoa.push([t.sana, t.hujjat, t.debet || "", t.kredit || "", t.saldo]));
  aoa.push(["", "Saldo oxirigi", "", "", ledger.oxirgiSaldo]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Akt sverka");
  XLSX.writeFile(wb, `FORGET_sverka_${inn}_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function printSverkaDetailPdf(nomi, inn, ledger) {
  const s = STORE.settings;
  const period = `${s.filterFrom || "davr boshidan"} — ${s.filterTo || "hozirgacha"}`;
  const sideRows = ledger.rows.map((t) => `
    <tr>
      <td>${escapeHtml(t.sana || "")}</td>
      <td>${escapeHtml(t.hujjat)}</td>
      <td class="num">${t.debet ? fmt(t.debet, 2) : ""}</td>
      <td class="num">${t.kredit ? fmt(t.kredit, 2) : ""}</td>
    </tr>
  `).join("");
  const oxirgiHolat = ledger.oxirgiSaldo > 0.5
    ? `на ${escapeHtml(s.filterTo || todayISO())} задолженность в пользу ${escapeHtml(s.companyName)} ${fmt(Math.abs(ledger.oxirgiSaldo), 2)} сум`
    : ledger.oxirgiSaldo < -0.5
      ? `на ${escapeHtml(s.filterTo || todayISO())} задолженность в пользу ${escapeHtml(nomi)} ${fmt(Math.abs(ledger.oxirgiSaldo), 2)} сум`
      : `на ${escapeHtml(s.filterTo || todayISO())} задолженность отсутствует`;

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Акт сверки — ${escapeHtml(nomi)}</title>
      <style>
        body{font-family:Arial, "Segoe UI", sans-serif; padding:28px; color:#1c2530;}
        h1{font-size:17px; margin:0 0 10px; text-align:center;}
        .sub{font-size:12px; color:#3a4553; margin:0 0 18px; text-align:center;}
        .parties{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:14px; font-size:11.5px; font-weight:700; text-align:center;}
        table{width:100%; border-collapse:collapse; font-size:10.8px;}
        th, td{border:1px solid #ccd3da; padding:5px 7px; text-align:left;}
        th{background:#eceff2;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        .split{display:grid; grid-template-columns:1fr 1fr;}
        .split > div:first-child{border-right:2px solid #1c2530;}
        tfoot td{font-weight:700; border-top:2px solid #1c2530;}
        .holat{margin:18px 0; font-size:12px;}
        .sign{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:36px; font-size:12px;}
        .sign .line{margin-top:36px; border-top:1px solid #1c2530; padding-top:4px; width:70%;}
        @media print { body{padding:0;} }
      </style>
    </head>
    <body>
      <h1>Акт сверки взаимных расчётов</h1>
      <div class="sub">за период: ${escapeHtml(period)}<br>между "${escapeHtml(s.companyName)}" (ИНН ${escapeHtml(s.inn)}) и "${escapeHtml(nomi)}" (ИНН ${escapeHtml(inn)})</div>
      <div class="parties">
        <div>По данным "${escapeHtml(s.companyName)}"</div>
        <div>По данным "${escapeHtml(nomi)}"</div>
      </div>
      <div class="split">
        <div>
          <table>
            <thead><tr><th>Дата</th><th>Документ</th><th class="num">Дебет</th><th class="num">Кредит</th></tr></thead>
            <tbody>
              <tr><td colspan="3">Сальдо начальное</td><td class="num">${fmt(ledger.boshlangichSaldo, 2)}</td></tr>
              ${sideRows}
            </tbody>
            <tfoot>
              <tr><td colspan="2">Обороты за период</td><td class="num">${fmt(ledger.jamiDebet, 2)}</td><td class="num">${fmt(ledger.jamiKredit, 2)}</td></tr>
              <tr><td colspan="3">Сальдо конечное</td><td class="num">${fmt(ledger.oxirgiSaldo, 2)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div>
          <table>
            <thead><tr><th>Дата</th><th>Документ</th><th class="num">Дебет</th><th class="num">Кредит</th></tr></thead>
            <tbody>
              <tr><td colspan="3">Сальдо начальное</td><td class="num">${fmt(ledger.boshlangichSaldo, 2)}</td></tr>
              ${sideRows}
            </tbody>
            <tfoot>
              <tr><td colspan="2">Обороты за период</td><td class="num">${fmt(ledger.jamiDebet, 2)}</td><td class="num">${fmt(ledger.jamiKredit, 2)}</td></tr>
              <tr><td colspan="3">Сальдо конечное</td><td class="num">${fmt(ledger.oxirgiSaldo, 2)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div class="holat">${oxirgiHolat}</div>
      <div class="sign">
        <div>От "${escapeHtml(s.companyName)}"<div class="line"></div></div>
        <div>От "${escapeHtml(nomi)}"<div class="line"></div></div>
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

/* ------------------------------- Fayl yuklamalari ------------------------------- */
// Faktura kirim / Faktura chiqim / Bank harakati bo'limlarida "Excel'dan
// import" qilinganda, shu yerga faylning o'zi emas — faqat ma'lumoti (qaysi
// bo'lim, fayl nomi, hajmi, yuklangan sana) yoziladi va yaratilgan har bir
// yozuvga shu fayl ID'si biriktiriladi (fayl_id). Fayl o'chirilsa, bazadagi
// FOREIGN KEY ... ON DELETE CASCADE orqali unga bog'liq barcha kirim/chiqim/
// bank yozuvlari ham avtomat o'chib ketadi.

// Bu ro'yxat "fayllar.bolim" qiymatini o'qiladigan nomga moslashtiradi.
// Kalitlar STORE'dagi tegishli massiv nomi bilan bir xil bo'lishi shart
// (masalan "ishHaqi") — shunda fayllarLinkedCount/deleteFayl kabi generik
// funksiyalar hech qanday o'zgarishsiz ishlayveradi. Yangi bo'lim uchun fayl
// yuklamasi qo'shilganda shu yerga ham bitta qator qo'shish yetarli.
const FAYL_BOLIM_LABEL = {
  kirim: "Faktura kirim", chiqim: "Faktura chiqim", bank: "Bank harakati",
  ombor: "Ombor", ishHaqi: "Ish haqi"
};

// Fayllar jadvali hali yaratilmagan bo'lishi mumkin (migratsiya ishga
// tushirilmagan) — shu holatda ham asosiy import ishlashda davom etishi
// uchun xatolik jim yutiladi (faqat konsolga yoziladi).
async function registerFaylUpload(bolim, file) {
  try {
    const { data, error } = await sbClient.from("fayllar").insert(toDbRow(FAYL_DB_MAP, {
      bolim, faylNomi: file.name, hajmi: file.size
    })).select().single();
    if (error) { console.error(error); return null; }
    const row = fromDbRow(FAYL_DB_MAP, data);
    STORE.fayllar.push(row);
    updateNavBadges();
    return row;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function fmtBytes(n) {
  n = toNum(n);
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

function fayllarLinkedCount(fayl) {
  const rows = STORE[fayl.bolim] || [];
  return rows.filter((r) => r.faylId === fayl.id).length;
}

function renderFayllar() {
  const rows = STORE.fayllar.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Fayl yuklamalari</h1>
        <p class="page-desc">Faktura kirim, Faktura chiqim, Bank harakati, Ombor va Ish haqi bo'limlariga "Excel'dan import" orqali yuklangan fayllar tarixi — faylning o'zi emas, faqat ma'lumoti saqlanadi. Faylni o'chirsangiz, unga bog'liq barcha yozuvlar ham o'chib ketadi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnExportFayllar">Excel'ga eksport</button>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Yuklangan sana</th>
            <th>Bo'lim</th>
            <th>Fayl nomi</th>
            <th class="num">Hajmi</th>
            <th class="num">Bog'langan yozuvlar</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="fayllarBody">
          ${rows.length ? rows.map((f) => `
            <tr data-id="${f.id}">
              <td class="mono">${escapeHtml(f.sana ? new Date(f.sana).toLocaleString("ru-RU") : "—")}</td>
              <td><span class="pill pill-ok">${escapeHtml(FAYL_BOLIM_LABEL[f.bolim] || f.bolim || "—")}</span></td>
              <td>${escapeHtml(f.faylNomi || "—")}</td>
              <td class="num">${fmtBytes(f.hajmi)}</td>
              <td class="num">
                <span class="linked-count">${fayllarLinkedCount(f)}</span>
                <button class="icon-btn icon-btn-sync" data-sync-fayl="${f.id}" title="Bog'langan yozuvlarni yangilash (bazadan qayta integratsiya qilish)"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg></button>
              </td>
              <td class="row-actions"><button class="icon-btn" data-del-fayl="${f.id}" title="O'chirish (bog'liq yozuvlar bilan)"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></td>
            </tr>
          `).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-folder"/></svg><div class="t">Hozircha fayl yuklanmagan</div><div class="d">Faktura kirim/chiqim yoki Bank bo'limida "Excel'dan import" qilinganda shu yerda ko'rinadi.</div></div>` : ""}
  `;

  const body = document.getElementById("fayllarBody");
  if (body) body.addEventListener("click", (e) => {
    const delId = e.target.dataset.delFayl;
    if (delId) { deleteFayl(delId); return; }
    const syncId = e.target.dataset.syncFayl;
    if (syncId) syncFaylLinks(syncId, e.target);
  });
  document.getElementById("btnExportFayllar").addEventListener("click", () => exportFayllarXlsx(rows));
}

function exportFayllarXlsx(rows) {
  const s = STORE.settings;
  const aoa = [[s.companyName], [`Sana: ${todayISO()}`], ["Fayl yuklamalari"], [],
    ["Yuklangan sana", "Bo'lim", "Fayl nomi", "Hajmi", "Bog'langan yozuvlar"]];
  rows.forEach((f) => aoa.push([
    f.sana ? new Date(f.sana).toLocaleString("ru-RU") : "",
    FAYL_BOLIM_LABEL[f.bolim] || f.bolim || "",
    f.faylNomi, fmtBytes(f.hajmi), fayllarLinkedCount(f)
  ]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fayllar");
  XLSX.writeFile(wb, `FORGET_fayllar_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

// "Bog'langan yozuvlar" ustunidagi yangilash tugmasi: shu faylga tegishli
// bo'lim jadvalidan (fayl_id bo'yicha) bazadan qayta o'qiydi va STORE'dagi
// mos yozuvlarni almashtiradi — shu orqali boshqa brauzerda/xodim tomonidan
// kiritilgan/o'chirilgan yozuvlar joriy sahifadagi hisoblagichga integratsiya
// qilinadi (to'liq loadAllData() chaqirmasdan, faqat shu faylga tegishli qism).
async function syncFaylLinks(id, btnEl) {
  const fayl = STORE.fayllar.find((f) => f.id === id);
  if (!fayl) return;
  const table = TABLE_NAMES[fayl.bolim];
  const map = TABLE_MAPS[fayl.bolim];
  if (!table || !map) return;

  const btn = btnEl || document.querySelector(`[data-sync-fayl="${id}"]`);
  if (btn) { btn.disabled = true; btn.classList.add("spin"); }

  try {
    let fresh = [];
    let from = 0;
    while (true) {
      const { data, error } = await sbClient.from(table).select("*").eq("fayl_id", id).range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (error) { if (isAuthExpiredError(error)) forceReauth(); throw error; }
      fresh = fresh.concat(data || []);
      if (!data || data.length < SUPABASE_PAGE_SIZE) break;
      from += SUPABASE_PAGE_SIZE;
    }
    const freshRows = fresh.map((r) => fromDbRow(map, r));
    STORE[fayl.bolim] = STORE[fayl.bolim].filter((r) => r.faylId !== id).concat(freshRows);
    recomputeAllPaymentStatus();
    updateNavBadges();
    renderFayllar();
    toast("Ma'lumotlar integratsiya qilindi");
  } catch (err) {
    console.error(err);
    toast("Ma'lumotlarni integratsiya qilishda xatolik", "err");
    if (btn) { btn.disabled = false; btn.classList.remove("spin"); }
  }
}

function deleteFayl(id) {
  const fayl = STORE.fayllar.find((f) => f.id === id);
  if (!fayl) return;
  const count = fayllarLinkedCount(fayl);
  openModal(`
    <h3>Faylni o'chirish</h3>
    <p class="modal-sub">"${escapeHtml(fayl.faylNomi || "")}" fayli va unga bog'liq <b>${count} ta yozuv</b> (${escapeHtml(FAYL_BOLIM_LABEL[fayl.bolim] || fayl.bolim)}) butunlay o'chiriladi. Bu amalni bekor qilib bo'lmaydi.</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-danger" id="mConfirm">Ha, o'chirish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mConfirm").addEventListener("click", async () => {
    RECENTLY_DELETED.add(id);
    const bolimType = fayl.bolim;
    const linkedRows = STORE[bolimType] ? STORE[bolimType].filter((r) => r.faylId === id) : [];
    linkedRows.forEach((r) => RECENTLY_DELETED.add(r.id));
    if (STORE[bolimType]) STORE[bolimType] = STORE[bolimType].filter((r) => r.faylId !== id);

    // "chiqim" bo'limi uchun: shu faylga tegishli chiqim_tafsil qatorlari
    // (fayllar o'chirilganda ON DELETE CASCADE bilan bazada avtomat o'chadi)
    // va ularning "CHT-<id>" ombor sarf qatorlari (bazada FOREIGN KEY yo'q,
    // shu sabab qo'lda o'chiramiz — aks holda inventarizatsiya buzilib qoladi).
    const tafsilRows = STORE.chiqimTafsil.filter((t) => t.faylId === id);
    tafsilRows.forEach((t) => RECENTLY_DELETED.add(t.id));
    STORE.chiqimTafsil = STORE.chiqimTafsil.filter((t) => t.faylId !== id);
    const tafsilOmborRows = tafsilRows.length
      ? STORE.ombor.filter((r) => r.turi === "chiqim" && tafsilRows.some((t) => r.hujjatRaqami === `CHT-${t.id}`))
      : [];
    tafsilOmborRows.forEach((r) => RECENTLY_DELETED.add(r.id));
    if (tafsilOmborRows.length) {
      const tafsilOmborIds = new Set(tafsilOmborRows.map((r) => r.id));
      STORE.ombor = STORE.ombor.filter((r) => !tafsilOmborIds.has(r.id));
    }

    STORE.fayllar = STORE.fayllar.filter((f) => f.id !== id);
    updateNavBadges();
    closeModal();
    renderFayllar();

    if (tafsilOmborRows.length) {
      const { error: omborErr } = await sbClient.from("ombor").delete().in("id", tafsilOmborRows.map((r) => r.id));
      if (omborErr) console.error(omborErr);
    }
    const { error } = await sbClient.from("fayllar").delete().eq("id", id);
    if (error) {
      console.error(error);
      RECENTLY_DELETED.delete(id);
      linkedRows.forEach((r) => RECENTLY_DELETED.delete(r.id));
      tafsilRows.forEach((t) => RECENTLY_DELETED.delete(t.id));
      tafsilOmborRows.forEach((r) => RECENTLY_DELETED.delete(r.id));
      if (STORE[bolimType]) STORE[bolimType] = STORE[bolimType].concat(linkedRows);
      STORE.chiqimTafsil = STORE.chiqimTafsil.concat(tafsilRows);
      STORE.ombor = STORE.ombor.concat(tafsilOmborRows);
      STORE.fayllar.push(fayl);
      updateNavBadges();
      renderFayllar();
      toast(isPermissionError(error) ? "Sizda bu faylni o'chirish huquqi yo'q (faqat admin)" : "O'chirishda xatolik", "err");
      return;
    }
    saveStore();
    toast("Fayl va unga bog'liq yozuvlar o'chirildi");
  });
}

/* --------------------------- O'zgarishlar tarixi --------------------------- */

const AUDIT_TABLE_LABELS = {
  kirim: "Faktura kirim", chiqim: "Faktura chiqim", bank: "Bank harakati",
  ish_haqi: "Ish haqi", ombor: "Ombor", mahsulotlar: "Mahsulotlar",
  ishlab_chiqarish: "Ishlab chiqarish", fayllar: "Fayllar",
  kontragentlar: "Kontragentlar", asosiy_vositalar: "Asosiy vositalar",
  chiqim_tafsil: "Chiqim kalkulyatsiyasi",
  settings: "Sozlamalar"
};

const AUDIT_AMAL_LABELS = { INSERT: "Qo'shildi", UPDATE: "O'zgartirildi", DELETE: "O'chirildi" };

// UPDATE yozuvi uchun faqat haqiqatan o'zgargan maydonlarni "maydon: eski → yangi"
// shaklida qaytaradi (bir xil qiymatli maydonlar ko'rsatilmaydi).
function diffAuditRow(row) {
  if (row.amal !== "UPDATE" || !row.malumot) return "";
  const oldi = row.malumot.oldi || {};
  const yangi = row.malumot.yangi || {};
  const parts = [];
  Object.keys(yangi).forEach((k) => {
    if (k === "id") return;
    const a = oldi[k], b = yangi[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) parts.push(`${k}: ${a ?? "—"} → ${b ?? "—"}`);
  });
  return parts.join(", ");
}

let AUDIT_ROWS = [];
let AUDIT_LOAD_OFFSET = 0;
const AUDIT_PAGE_SIZE = 1000;
let AUDIT_HAS_MORE = false;

async function renderAudit() {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">O'zgarishlar tarixi</h1>
        <p class="page-desc">Har bir xodimning kirim/chiqim/bank/ombor va boshqa bo'limlardagi qo'shish, o'zgartirish, o'chirish amallari — kim, qachon, nima qilgani (so'nggi 1000 yozuv).</p>
      </div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: email, jadval...">
      <select class="search-input" id="auditJadval" style="min-width:150px">
        <option value="">Barcha bo'limlar</option>
        ${Object.entries(AUDIT_TABLE_LABELS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join("")}
      </select>
      <select class="search-input" id="auditAmal" style="min-width:130px">
        <option value="">Barcha amallar</option>
        ${Object.entries(AUDIT_AMAL_LABELS).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join("")}
      </select>
      <div class="spacer"></div>
      <span class="faint" id="auditCount">Yuklanmoqda…</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Vaqt</th><th>Kim</th><th>Jadval</th><th>Amal</th><th>O'zgarish</th><th></th></tr>
        </thead>
        <tbody id="auditBody">${skeletonRows(6)}</tbody>
      </table>
    </div>
    <div id="auditLoadMoreWrap" style="text-align:center;margin-top:12px;"></div>
  `;
  document.getElementById("searchBox").addEventListener("input", applyAuditFilters);
  document.getElementById("auditJadval").addEventListener("change", applyAuditFilters);
  document.getElementById("auditAmal").addEventListener("change", applyAuditFilters);

  const { data, error } = await sbClient.from("audit_log").select("*").eq("firma_id", ACTIVE_FIRMA_ID).order("created_at", { ascending: false }).range(0, AUDIT_PAGE_SIZE - 1);
  if (error) { reportError(error, "Tarixni yuklashda xatolik"); return; }
  AUDIT_ROWS = data || [];
  AUDIT_LOAD_OFFSET = AUDIT_ROWS.length;
  AUDIT_HAS_MORE = AUDIT_ROWS.length === AUDIT_PAGE_SIZE;
  document.getElementById("auditCount").textContent = `${AUDIT_ROWS.length} ta yozuv`;
  const body = document.getElementById("auditBody");
  body.innerHTML = AUDIT_ROWS.length ? AUDIT_ROWS.map(auditRowHtml).join("") :
    `<tr><td colspan="6" class="faint" style="text-align:center;padding:16px;">Hozircha o'zgarish yo'q</td></tr>`;
  body.addEventListener("click", (e) => {
    const idx = e.target.dataset.detail;
    if (idx !== undefined) openAuditDetailModal(AUDIT_ROWS[idx]);
  });
  renderAuditLoadMoreButton();
}

function auditRowHtml(row, idx) {
  const jadval = AUDIT_TABLE_LABELS[row.jadval] || row.jadval;
  const amal = AUDIT_AMAL_LABELS[row.amal] || row.amal;
  const qisqa = row.amal === "UPDATE" ? diffAuditRow(row) : `${jadval} yozuvi`;
  return `
    <tr data-jadval="${escapeHtml(row.jadval || "")}" data-amal="${escapeHtml(row.amal || "")}">
      <td class="mono">${escapeHtml((row.created_at || "").replace("T", " ").slice(0, 19))}</td>
      <td>${escapeHtml(row.actor_email || "")}</td>
      <td>${escapeHtml(jadval)}</td>
      <td>${escapeHtml(amal)}</td>
      <td style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(qisqa)}">${escapeHtml(qisqa)}</td>
      <td class="row-actions"><button class="icon-btn" data-detail="${idx}" title="Batafsil"><svg class="ic" viewBox="0 0 24 24"><use href="#i-search"/></svg></button></td>
    </tr>
  `;
}

// Qidiruv matni + Jadval + Amal filtrlari birgalikda (klient tomonda).
function applyAuditFilters() {
  const q = (document.getElementById("searchBox")?.value || "").trim().toLowerCase();
  const jadval = document.getElementById("auditJadval")?.value || "";
  const amal = document.getElementById("auditAmal")?.value || "";
  let shown = 0;
  document.querySelectorAll("#auditBody tr").forEach((tr) => {
    const okQ = !q || tr.textContent.toLowerCase().includes(q);
    const okJ = !jadval || tr.dataset.jadval === jadval;
    const okA = !amal || tr.dataset.amal === amal;
    const visible = okQ && okJ && okA;
    tr.style.display = visible ? "" : "none";
    if (visible) shown++;
  });
  const cnt = document.getElementById("auditCount");
  if (cnt) cnt.textContent = q || jadval || amal ? `${shown} / ${AUDIT_ROWS.length} ta yozuv` : `${AUDIT_ROWS.length} ta yozuv`;
}

function renderAuditLoadMoreButton() {
  const wrap = document.getElementById("auditLoadMoreWrap");
  if (!wrap) return;
  wrap.innerHTML = AUDIT_HAS_MORE ? `<button class="btn" id="btnAuditLoadMore">Yana yuklash (${AUDIT_PAGE_SIZE} tagacha)</button>` : "";
  document.getElementById("btnAuditLoadMore")?.addEventListener("click", loadMoreAuditRows);
}

async function loadMoreAuditRows() {
  const btn = document.getElementById("btnAuditLoadMore");
  if (btn) { btn.disabled = true; btn.textContent = "Yuklanmoqda…"; }
  const { data, error } = await sbClient.from("audit_log").select("*").eq("firma_id", ACTIVE_FIRMA_ID)
    .order("created_at", { ascending: false }).range(AUDIT_LOAD_OFFSET, AUDIT_LOAD_OFFSET + AUDIT_PAGE_SIZE - 1);
  if (error) {
    reportError(error, "Qo'shimcha yozuvlarni yuklashda xatolik");
    if (btn) { btn.disabled = false; btn.textContent = "Yana yuklash"; }
    return;
  }
  const startIdx = AUDIT_ROWS.length;
  AUDIT_ROWS = AUDIT_ROWS.concat(data || []);
  AUDIT_LOAD_OFFSET = AUDIT_ROWS.length;
  AUDIT_HAS_MORE = (data || []).length === AUDIT_PAGE_SIZE;
  const body = document.getElementById("auditBody");
  (data || []).forEach((row, i) => body?.insertAdjacentHTML("beforeend", auditRowHtml(row, startIdx + i)));
  document.getElementById("auditCount").textContent = `${AUDIT_ROWS.length} ta yozuv`;
  renderAuditLoadMoreButton();
  applyAuditFilters();
}

function openAuditDetailModal(row) {
  if (!row) return;
  openModal(`
    <h3>Batafsil</h3>
    <div class="field"><label>Vaqt</label><div>${escapeHtml((row.created_at || "").replace("T", " ").slice(0, 19))}</div></div>
    <div class="field"><label>Kim</label><div>${escapeHtml(row.actor_email || "")}</div></div>
    <div class="field"><label>Jadval / Amal</label><div>${escapeHtml(AUDIT_TABLE_LABELS[row.jadval] || row.jadval)} — ${escapeHtml(AUDIT_AMAL_LABELS[row.amal] || row.amal)}</div></div>
    <pre style="max-height:340px;overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px;font-size:12px;">${escapeHtml(JSON.stringify(row.malumot, null, 2))}</pre>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
}

/* --------------------------------- Firmalar --------------------------------- */
// Firma yaratish va xodimlarga (email bo'yicha) kirish huquqi berish/olib
// tashlash — faqat admin uchun (RLS server tomonda ham shunday cheklaydi,
// bu yerdagi IS_ADMIN tekshiruvi faqat UI/xabar uchun). "firmalar" va
// "firma_foydalanuvchilari" jadvallari STORE'ning bir qismi emas (realtime
// orqali sinxronlanmaydi) — sahifa har safar ochilganda qayta so'raladi,
// chunki bu kamdan-kam o'zgaradigan, admin-only ma'lumot.

// Firma boshqaruvi endi Sozlamalar ichidagi "Firmalar" bo'limi. Shu funksiya
// istalgan konteynerga render qiladi (Sozlamalardagi host yoki, alias orqali,
// alohida sahifa). withHeader — alohida sahifa uchun sarlavha + izoh chiqaradi.
async function renderFirmaManager(container, { withHeader = false } = {}) {
  if (!container) return;
  if (!IS_ADMIN) {
    container.innerHTML = `<div class="empty-state"><div class="t">Ruxsat yo'q</div><div class="d">Firmalarni faqat admin boshqara oladi.</div></div>`;
    return;
  }
  container.innerHTML = `
    ${withHeader ? `
    <div class="page-header">
      <div>
        <h1 class="page-title">Firmalar</h1>
        <p class="page-desc">Har bir firmaning ma'lumotlari (kirim/chiqim/ombor va h.k.) bir-biridan to'liq ajratilgan. Xodim faqat o'ziga ruxsat berilgan firmalarni ilova ichida (chiqmasdan) tanlab ishlaydi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnBlockedInns">Bloklangan INN'lar</button>
        <button class="btn btn-primary" id="btnAddFirma">+ Yangi firma</button>
      </div>
    </div>` : `
    <div class="card-title">Firmalar (multi-firma)</div>
    <div class="note">Har bir firmaning ma'lumotlari bir-biridan to'liq ajratilgan. Xodim faqat o'ziga ruxsat berilgan firmalarni ilova ichida tanlab ishlaydi.</div>
    <div class="page-actions" style="margin:12px 0;">
      <button class="btn" id="btnBlockedInns">Bloklangan INN'lar</button>
      <button class="btn btn-primary" id="btnAddFirma">+ Yangi firma</button>
    </div>`}
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nomi</th><th>Yaratilgan</th><th></th></tr></thead>
        <tbody id="firmalarBody">${skeletonRows(3, 4)}</tbody>
      </table>
    </div>
  `;
  container.querySelector("#btnAddFirma").addEventListener("click", () => openFirmaModal());
  container.querySelector("#btnBlockedInns").addEventListener("click", () => openBlockedInnModal());

  const { data, error } = await sbClient.from("firmalar").select("*").order("nomi");
  if (error) { reportError(error, "Firmalarni yuklashda xatolik"); return; }
  const body = container.querySelector("#firmalarBody");
  if (!body) return;
  body.innerHTML = data.length ? data.map(firmaRowHtml).join("") :
    `<tr><td colspan="3" class="faint" style="text-align:center;padding:16px;">Hozircha firma yo'q</td></tr>`;
  body.addEventListener("click", (e) => {
    const editId = e.target.dataset.edit;
    const accessId = e.target.dataset.access;
    const delId = e.target.dataset.delFirma;
    if (editId) openFirmaModal(editId, data.find((f) => f.id === editId));
    else if (accessId) openFirmaAccessModal(accessId, data.find((f) => f.id === accessId)?.nomi || "");
    else if (delId) deleteFirma(delId, data.find((f) => f.id === delId)?.nomi || "");
  });
}

// Firma qo'shilgach/o'chirilgach ro'yxatni joyida yangilaydi — Sozlamalar ichidagi
// host bo'lsa o'shanga, aks holda butun sahifaga.
function refreshFirmaManager() {
  const host = document.getElementById("firmaManagerHost");
  if (host) renderFirmaManager(host, { withHeader: false });
  else if (CURRENT_PAGE === "settings") renderSettings();
}

// Eski kod / alias uchun moslik.
async function renderFirmalar() {
  return renderFirmaManager(document.getElementById("main"), { withHeader: true });
}

// Firmani butunlay o'chiradi. "firma_foydalanuvchilari" va "settings"
// yozuvlari bazada CASCADE bilan avtomatik o'chadi, lekin buxgalteriya
// jadvallari (kirim, chiqim, bank va h.k.) ATAYLAB cascade qilinmagan —
// shu sabab firmada allaqachon ma'lumot bo'lsa, bazadan FK xatosi (23503)
// qaytadi va biz buni tushunarli xabarga aylantiramiz (tasodifan butun
// firmaning buxgalteriya tarixini yo'qotib qo'yishning oldini olish uchun).
async function deleteFirma(id, nomi) {
  if (!confirm(`"${nomi}" firmasini butunlay o'chirmoqchimisiz?\n\nBu amalni ortga qaytarib bo'lmaydi.`)) return;
  const { error } = await sbClient.from("firmalar").delete().eq("id", id);
  if (error) {
    console.error(error);
    if (error.code === "23503") {
      toast("Bu firmada buxgalteriya ma'lumotlari bor — avval ularni o'chiring", "err");
    } else if (isPermissionError(error)) {
      toast("Sizda firmani o'chirish huquqi yo'q (faqat admin)", "err");
    } else {
      toast("O'chirishda xatolik", "err");
    }
    return;
  }
  await loadAvailableFirmalar();
  if (ACTIVE_FIRMA_ID === id) {
    const next = AVAILABLE_FIRMALAR[0];
    if (next) await switchFirma(next.id);
  } else {
    renderFirmaSwitcher();
  }
  refreshFirmaManager();
  toast("Firma o'chirildi");
}

function firmaRowHtml(f) {
  return `
    <tr data-id="${f.id}">
      <td>${escapeHtml(f.nomi || "")}</td>
      <td class="mono faint">${escapeHtml((f.created_at || "").slice(0, 10))}</td>
      <td class="row-actions">
        <button class="btn btn-sm" data-access="${f.id}">Xodimlar</button>
        <button class="icon-btn" data-edit="${f.id}" title="Nomini o'zgartirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-del-firma="${f.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function openFirmaModal(existingId, existing) {
  openModal(`
    <h3>${existingId ? "Firma nomini o'zgartirish" : "Yangi firma"}</h3>
    <div class="field"><label>Nomi</label><input id="fNomi" value="${escapeHtml(existing ? existing.nomi : "")}" placeholder="masalan: &quot;Namuna Savdo&quot; MCHJ"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => saveFirmaFromModal(existingId));
}

async function saveFirmaFromModal(existingId) {
  const nomi = document.getElementById("fNomi").value.trim();
  if (!nomi) { toast("Firma nomini kiriting", "err"); return; }

  if (existingId) {
    const { error } = await sbClient.from("firmalar").update({ nomi }).eq("id", existingId);
    if (error) { reportError(error, "Saqlashda xatolik"); return; }
    // Pastdagi firma-almashtirgich (AVAILABLE_FIRMALAR) alohida so'rov bilan
    // yuklanadi — shu sabab uni ham qayta yuklab, yangi nomni darhol
    // ko'rsatish kerak, aks holda u eski nomni saqlab qoladi.
    await loadAvailableFirmalar();
    renderFirmaSwitcher();
  } else {
    const { data, error } = await sbClient.from("firmalar").insert({ nomi }).select().single();
    if (error) { reportError(error, "Yaratishda xatolik"); return; }
    // Yangi firma darhol ishlatilishi uchun: sozlamalar qatori + yaratgan
    // adminning o'ziga kirish huquqi ham shu yerda birga qo'shiladi — aks
    // holda firma yaratilgan bo'lsa-da, hech kim (yaratgan admin ham) uni
    // firma-almashtirgichda ko'ra olmaydi.
    const { error: settingsErr } = await sbClient.from("settings").insert({ firma_id: data.id });
    if (settingsErr) console.error(settingsErr);
    const { error: accessErr } = await sbClient.from("firma_foydalanuvchilari").insert({ firma_id: data.id, email: CURRENT_USER_EMAIL });
    if (accessErr) console.error(accessErr);
    await loadAvailableFirmalar();
    renderFirmaSwitcher();
  }
  closeModal();
  refreshFirmaManager();
  toast("Saqlandi");
}

async function openFirmaAccessModal(firmaId, firmaNomi) {
  const { data: settingsRow } = await sbClient.from("settings").select("inn").eq("firma_id", firmaId).maybeSingle();
  const inn = (settingsRow && settingsRow.inn) ? String(settingsRow.inn).trim() : "";

  openModal(`
    <h3>${escapeHtml(firmaNomi)} — xodimlar</h3>
    <p class="modal-sub">INN: ${inn ? escapeHtml(inn) : `<span class="faint">sozlanmagan</span>`}</p>
    <p class="modal-sub">Shu yerga qo'shilgan email'lar shu firmaga kira oladi (ilova ichida firma-tanlagichda ko'rinadi).</p>
    <div id="firmaAccessList" class="faint">Yuklanmoqda…</div>
    <div class="field" style="margin-top:14px;"><label>Email qo'shish</label>
      <div style="display:flex;gap:8px;">
        <input id="fAccessEmail" placeholder="xodim@masalan.uz" style="flex:1;">
        <button class="btn btn-sm" id="btnAddAccess">Qo'shish</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
      ${inn ? `<button class="btn btn-danger" id="btnBlockFirma">Blokla (INN bo'yicha)</button>` : ""}
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  const blockBtn = document.getElementById("btnBlockFirma");
  if (blockBtn) {
    blockBtn.addEventListener("click", async () => {
      if (!confirm(`"${firmaNomi}" (INN: ${inn}) firmasini bloklamoqchimisiz?\n\nBarcha xodimlarning shu firmaga kirish huquqi darhol bekor qilinadi va shu INN bilan qayta ro'yxatdan o'tib bo'lmaydi.\n\nBu amalni ortga qaytarib bo'lmaydi (faqat "Bloklangan INN'lar" ro'yxatidan qo'lda olib tashlash mumkin).`)) return;
      const sabab = prompt("Bloklash sababi (ixtiyoriy):", "") || null;
      const { error: delErr } = await sbClient.from("firma_foydalanuvchilari").delete().eq("firma_id", firmaId);
      if (delErr) { console.error(delErr); toast("Xodimlar ro'yxatini tozalashda xatolik", "err"); return; }
      const { error: blockErr } = await sbClient.from("bloklangan_innlar").upsert({ inn, sabab }, { onConflict: "inn" });
      if (blockErr) { console.error(blockErr); toast("Bloklashda xatolik", "err"); return; }
      toast("Firma bloklandi");
      reloadAccessList();
    });
  }

  async function reloadAccessList() {
    const { data, error } = await sbClient.from("firma_foydalanuvchilari").select("email").eq("firma_id", firmaId).order("email");
    const listEl = document.getElementById("firmaAccessList");
    if (!listEl) return;
    if (error) { listEl.textContent = "Yuklashda xatolik"; return; }
    listEl.className = "";
    listEl.innerHTML = data.length
      ? data.map((r) => `
          <div class="report-line" style="grid-template-columns:1fr auto;">
            <span>${escapeHtml(r.email)}</span>
            <button class="icon-btn" data-remove-email="${escapeHtml(r.email)}" title="Kirish huquqini olib tashlash"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
          </div>
        `).join("")
      : `<span class="faint">Hozircha hech kim qo'shilmagan</span>`;
    listEl.querySelectorAll("[data-remove-email]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.dataset.removeEmail;
        const { error: delErr } = await sbClient.from("firma_foydalanuvchilari").delete().eq("firma_id", firmaId).eq("email", email);
        if (delErr) { console.error(delErr); toast("Olib tashlashda xatolik", "err"); return; }
        reloadAccessList();
      });
    });
  }
  await reloadAccessList();

  document.getElementById("btnAddAccess").addEventListener("click", async () => {
    const email = document.getElementById("fAccessEmail").value.trim().toLowerCase();
    if (!email) { toast("Emailni kiriting", "err"); return; }
    const { error } = await sbClient.from("firma_foydalanuvchilari").insert({ firma_id: firmaId, email });
    if (error) { console.error(error); toast(error.code === "23505" ? "Bu email allaqachon qo'shilgan" : "Qo'shishda xatolik", "err"); return; }
    document.getElementById("fAccessEmail").value = "";
    reloadAccessList();
    toast("Qo'shildi");
  });
}

// Bloklangan INN'lar ro'yxati — o'z-o'zidan ro'yxatdan o'tishda (signup_create_own_firma,
// migration_self_signup.sql) shu ro'yxatdagi INN rad etiladi, qaysi email
// ishlatilishidan qat'i nazar. openFirmaAccessModal'dagi "Blokla" tugmasi shu
// jadvalga yozadi; bu yerdan qo'lda ham oldindan bloklash yoki blokdan
// chiqarish mumkin.
async function openBlockedInnModal() {
  openModal(`
    <h3>Bloklangan INN'lar</h3>
    <p class="modal-sub">Shu ro'yxatdagi INN bilan yangi o'z-o'zidan ro'yxatdan o'tish rad etiladi (qaysi email bo'lishidan qat'i nazar).</p>
    <div id="blockedInnList" class="faint">Yuklanmoqda…</div>
    <div class="field" style="margin-top:14px;"><label>INN qo'shish</label>
      <div style="display:flex;gap:8px;">
        <input id="fBlockInn" placeholder="9 ta raqam" maxlength="9" style="flex:1;">
        <button class="btn btn-sm" id="btnAddBlockInn">Bloklash</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);

  async function reloadBlockedList() {
    const { data, error } = await sbClient.from("bloklangan_innlar").select("inn, sabab").order("created_at", { ascending: false });
    const listEl = document.getElementById("blockedInnList");
    if (!listEl) return;
    if (error) { listEl.textContent = "Yuklashda xatolik"; return; }
    listEl.className = "";
    listEl.innerHTML = data.length
      ? data.map((r) => `
          <div class="report-line" style="grid-template-columns:1fr auto;">
            <span>${escapeHtml(r.inn)}${r.sabab ? ` — <span class="faint">${escapeHtml(r.sabab)}</span>` : ""}</span>
            <button class="icon-btn" data-unblock-inn="${escapeHtml(r.inn)}" title="Blokdan chiqarish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
          </div>
        `).join("")
      : `<span class="faint">Bloklangan INN yo'q</span>`;
    listEl.querySelectorAll("[data-unblock-inn]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const { error: delErr } = await sbClient.from("bloklangan_innlar").delete().eq("inn", btn.dataset.unblockInn);
        if (delErr) { console.error(delErr); toast("Blokdan chiqarishda xatolik", "err"); return; }
        reloadBlockedList();
      });
    });
  }
  await reloadBlockedList();

  document.getElementById("btnAddBlockInn").addEventListener("click", async () => {
    const inn = document.getElementById("fBlockInn").value.trim();
    const innCheck = validateField("inn", inn);
    if (!inn || !innCheck.ok) { toast(innCheck.msg || "INN kiriting", "err"); return; }
    const { error } = await sbClient.from("bloklangan_innlar").upsert({ inn }, { onConflict: "inn" });
    if (error) { console.error(error); toast("Bloklashda xatolik", "err"); return; }
    document.getElementById("fBlockInn").value = "";
    reloadBlockedList();
    toast("Bloklandi");
  });
}

/* ------------------------------- Sozlamalar ------------------------------- */

// Sozlamalar maydon kaliti -> shu sahifadagi input id. Faqat shu sahifada
// tahrirlanadigan maydonlar (mirror qiymatlar bu yerda tahrirlanmaydi).
const SETTINGS_FIELD_INPUT_ID = {
  companyName: "sCompany", inn: "sInn",
  qqsStavka: "sQqs", foydaStavka: "sFoyda", davrXarajati: "sDavr", moliyaviyXarajat: "sMoliya", tannarxManual: "sTannarx",
  ijtimoiySoliqStavka: "sIjtimoiy", ndflStavka: "sNdfl", inpsStavka: "sInps", ishHaqiTolovKuni: "sIshHaqiTolovKuni",
  defaultFoydaNormasi: "sDefaultFoyda"
};

// validateSettings() natijasini sahifadagi maydonlarga bo'yaydi: xato -> qizil
// (.invalid), ogohlantirish -> sariq (.warned), har biriga inline izoh.
function applySettingsFieldMessages(errors, warnings) {
  Object.values(SETTINGS_FIELD_INPUT_ID).forEach((id) => {
    const inp = document.getElementById(id);
    const field = inp && inp.closest(".field");
    if (!field) return;
    field.classList.remove("invalid", "warned");
    field.querySelectorAll(".field-error").forEach((n) => n.remove());
  });
  const paint = (map, cls, extraClass) => {
    Object.keys(map || {}).forEach((k) => {
      const inp = document.getElementById(SETTINGS_FIELD_INPUT_ID[k]);
      const field = inp && inp.closest(".field");
      if (!field) return;
      field.classList.add(cls);
      const d = document.createElement("div");
      d.className = "field-error" + (extraClass ? " " + extraClass : "");
      d.textContent = map[k];
      field.appendChild(d);
    });
  };
  paint(errors, "invalid");
  paint(warnings, "warned", "warn");
}

function renderSettings() {
  const s = STORE.settings;
  const main = document.getElementById("main");
  const tannarxDisplay = s.tannarxManual === null || s.tannarxManual === undefined ? "" : fmt(s.tannarxManual);
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sozlamalar</h1>
        <p class="page-desc">Korxona rekvizitlari va hisobotlarga ta'sir qiluvchi umumiy parametrlar.</p>
      </div>
    </div>

    <div class="tabs" id="settingsTabs">
      <button class="tab-btn active" data-sec="rekvizit">Rekvizitlar</button>
      <button class="tab-btn" data-sec="yonalish">Faoliyat yo'nalishi</button>
      <button class="tab-btn" data-sec="soliq">Soliq stavkalari</button>
      <button class="tab-btn" data-sec="ishhaqi">Ish haqi stavkalari</button>
      <button class="tab-btn" data-sec="hisobot">Hisobot qiymatlari</button>
      <button class="tab-btn" data-sec="integratsiya">Integratsiyalar</button>
      <button class="tab-btn" data-sec="malumot">Ma'lumotlar</button>
      ${IS_ADMIN ? `<button class="tab-btn" data-sec="firmalar">Firmalar</button>` : ""}
    </div>

    <div class="settings-section" data-sec="yonalish">
      <div class="card">
        <div class="card-title">Faoliyat yo'nalishi</div>
        <div class="field">
          <label>Yo'nalish</label>
          <select id="sYonalish">
            <option value="">— tanlanmagan —</option>
            ${YONALISHLAR.map((y) => `<option value="${y.id}" ${s.yonalish === y.id ? "selected" : ""}>${escapeHtml(y.nomi)}</option>`).join("")}
          </select>
        </div>
        <div class="note">Yo'nalish tanlansa, quyidagi bo'limlar avtomat belgilanadi. Kerak bo'lsa har birini alohida yoqing/o'chiring — o'chirilgan bo'lim menyudan yashiriladi (ma'lumot va hisobotlar o'chmaydi).</div>
        <div class="switch-row" style="margin-top:12px;">
          <span class="switch"><input type="checkbox" id="sModulOmbor" ${STORE.settings.modulOmbor !== false ? "checked" : ""}><span class="track"></span></span>
          <label for="sModulOmbor">Ombor bo'limi</label>
        </div>
        <div class="switch-row">
          <span class="switch"><input type="checkbox" id="sModulIshlabChiqarish" ${STORE.settings.modulIshlabChiqarish !== false ? "checked" : ""}><span class="track"></span></span>
          <label for="sModulIshlabChiqarish">"Ishlab chiqarish" bo'limi (mahsulot kalkulyatsiyasi)</label>
        </div>
        <div class="switch-row">
          <span class="switch"><input type="checkbox" id="sModulAsosiyVositalar" ${STORE.settings.modulAsosiyVositalar !== false ? "checked" : ""}><span class="track"></span></span>
          <label for="sModulAsosiyVositalar">"Asosiy vositalar" bo'limi</label>
        </div>
      </div>
    </div>

    <div class="settings-section active" data-sec="rekvizit">
      <div class="card">
        <div class="card-title">Korxona rekvizitlari</div>
        <div class="field"><label>Nomi</label><input id="sCompany" value="${escapeHtml(s.companyName)}"></div>
        <div class="field"><label>INN</label><input id="sInn" value="${escapeHtml(s.inn)}" inputmode="numeric" placeholder="9 ta raqam"></div>
        <div class="field"><label>Manzil</label><input id="sAddress" value="${escapeHtml(s.address)}"></div>
        <div class="field"><label>Hisobot davri</label><input id="sPeriod" value="${escapeHtml(s.period)}"></div>
        <div class="field"><label>Rahbar F.I.Sh. (kalkulyatsiya blankasida "Tasdiqlayman" bandida)</label><input id="sRahbar" value="${escapeHtml(s.rahbar || "")}" placeholder="masalan: Karimov A.A."></div>
      </div>
    </div>

    <div class="settings-section" data-sec="soliq">
      <div class="card">
        <div class="card-title">Soliq stavkalari</div>
        <div class="field"><label>QQS stavkasi (%)</label><input id="sQqs" inputmode="decimal" value="${fmt(s.qqsStavka)}"></div>
        <div class="field"><label>Foyda solig'i stavkasi (%)</label><input id="sFoyda" inputmode="decimal" value="${fmt(s.foydaStavka)}"></div>
        <div class="field"><label>Davr xarajatlari (F2, qo'lda — ish haqidan tashqari boshqa xarajatlar)</label><input id="sDavr" class="num-fmt" inputmode="decimal" value="${fmt(s.davrXarajati)}"></div>
        <div class="switch-row">
          <span class="switch"><input type="checkbox" id="sIshHaqiAvto" ${s.ishHaqiAvtoXarajat ? "checked" : ""}><span class="track"></span></span>
          <label for="sIshHaqiAvto">Ish haqi bo'limidan hisoblangan xarajatni (ish haqi + ijtimoiy soliq) yuqoridagi "Davr xarajatlari"ga avtomatik qo'shish</label>
        </div>
        <div class="field"><label>Moliyaviy xarajatlar (F2, qo'lda)</label><input id="sMoliya" class="num-fmt" inputmode="decimal" value="${fmt(s.moliyaviyXarajat)}"></div>
        <div class="field">
          <label>Tannarxni qo'lda belgilash (bo'sh = avtomatik, kirim fakturalardan)</label>
          <input id="sTannarx" class="num-fmt" inputmode="decimal" value="${tannarxDisplay}">
        </div>
      </div>
      <div class="card">
        <div class="card-title">Ombor tannarx hisobi</div>
        <div class="field">
          <label>Tannarx (ombor hisobi) usuli</label>
          <select id="sTannarxUsuli">
            <option value="fifo" ${(s.tannarxUsuli || "fifo") !== "ortacha" ? "selected" : ""}>FIFO — partiyalar bo'yicha (tavsiya)</option>
            <option value="ortacha" ${(s.tannarxUsuli || "fifo") === "ortacha" ? "selected" : ""}>O'rtacha xarid narxi (eski usul)</option>
          </select>
        </div>
        <div class="field">
          <label>Kalkulyatsiyasiz sotuv uchun taxminiy foyda normasi (0–0.95)</label>
          <input id="sDefaultFoyda" inputmode="decimal" value="${fmt(s.defaultFoydaNormasi != null ? s.defaultFoydaNormasi : 0.2, 2)}">
        </div>
        <div class="note">FIFO — har kirim partiyasi alohida hisoblanadi, sotuvda eng eski partiyadan yechiladi (1C standarti). "Kalkulyatsiyasiz sotuv" qatorining tannarxi noma'lum bo'lgani uchun taxminiy = summa × (1 − norma) sifatida olinadi; F2/Foyda solig'i sahifasida "taxminiy" belgisi chiqadi.</div>
      </div>
    </div>

    <div class="settings-section" data-sec="ishhaqi">
      <div class="card">
        <div class="card-title">Ish haqi hisoboti stavkalari</div>
        <div class="field"><label>Ijtimoiy soliq stavkasi (%)</label><input id="sIjtimoiy" inputmode="decimal" value="${fmt(s.ijtimoiySoliqStavka)}"></div>
        <div class="field"><label>NDFL stavkasi (%)</label><input id="sNdfl" inputmode="decimal" value="${fmt(s.ndflStavka)}"></div>
        <div class="field"><label>INPS stavkasi (%)</label><input id="sInps" inputmode="decimal" value="${fmt(s.inpsStavka, 1)}"></div>
        <div class="field"><label>To'lov kuni (oyning kuni, ixtiyoriy — eslatma uchun)</label><input id="sIshHaqiTolovKuni" inputmode="numeric" value="${s.ishHaqiTolovKuni || ""}" placeholder="masalan: 5"></div>
      </div>
    </div>

    <div class="settings-section" data-sec="hisobot">
      <div class="card">
        <div class="card-title">Hisobot sahifalarida kiritiladigan qiymatlar</div>
        <div class="note">Quyidagilar tegishli hisobot sahifasida tahrirlanadi — bu yerda faqat joriy holat va tez o'tish havolasi ko'rsatiladi. Bir qiymat faqat bitta joyda tahrirlanadi (dublikat kiritish maydoni yo'q).</div>
        <div style="margin-top:12px;">
          <div class="mirror-field"><span class="m-label">Bank — boshlang'ich qoldiq</span><span class="m-val">${fmtSum(s.bankOpeningBalance)}</span></div>
          <div class="mirror-field"><span class="m-label">Foyda solig'i — boshqa daromadlar (qo'lda)</span><span class="m-val">${fmtSum(s.boshqaDaromad)}</span></div>
          <div class="mirror-field"><span class="m-label">Foyda solig'i — imtiyozlar summasi (qo'lda)</span><span class="m-val">${fmtSum(s.imtiyozlar)}</span></div>
          <div class="mirror-field"><span class="m-label">F1 — kassa</span><span class="m-val">${fmtSum(s.f1Kassa)}</span></div>
          <div class="mirror-field"><span class="m-label">F1 — ustav kapitali</span><span class="m-val">${fmtSum(s.f1UstavKapitali)}</span></div>
          <div class="mirror-field"><span class="m-label">F1 — o'tgan davr jamg'argan foydasi</span><span class="m-val">${fmtSum(s.f1OldingiFoyda)}</span></div>
          <div class="mirror-field"><span class="m-label">F1 — uzoq muddatli majburiyatlar</span><span class="m-val">${fmtSum(s.f1UzoqMajburiyat)}</span></div>
        </div>
        <div class="page-actions" style="margin-top:14px;">
          <button class="btn" data-nav="bank">Bank sahifasi</button>
          <button class="btn" data-nav="foyda">Foyda solig'i</button>
          <button class="btn" data-nav="f1">F1 — Balans</button>
        </div>
      </div>
    </div>

    <div class="settings-section" data-sec="integratsiya">
      <div class="card">
        <div class="card-title">Didox.uz / E-Faktura API integratsiyasi</div>
        <div class="note" style="margin-bottom:14px;">Didox.uz elektron hisobfakturalar tizimi bilan to'g'ridan-to'g'ri integratsiya sozlamalari. Ushbu sozlama yordamida kiruvchi va chiquvchi fakturalarni Excel fayllarsiz, to'g'ridan-to'g'ri tortib olishingiz mumkin.</div>

        <div class="field">
          <label>Didox API Token</label>
          <div style="display:flex;gap:8px;">
            <input type="password" id="sDidoxToken" placeholder="Didox shaxsiy kabinetidagi token..." value="${escapeHtml(s.didoxToken || "")}" style="flex:1;">
            <button class="btn btn-sm" id="btnTestDidoxConnection" type="button">Ulanishni tekshirish</button>
          </div>
          <div class="note">Didox.uz kabinetidagi Sozlamalar -> API bo'limidan olingan token.</div>
          <div id="didoxConnStatus" style="font-size:12px;margin-top:6px;display:none;"></div>
        </div>

        <div class="field" style="margin-top:12px;">
          <label>Didox API manzili (URL)</label>
          <input type="text" id="sDidoxApiUrl" placeholder="https://api.didox.uz/v1" value="${escapeHtml(s.didoxApiUrl || "https://api.didox.uz/v1")}">
          <div class="note">Standart: "https://api.didox.uz/v1" yoki Vercel serverless proksi: "/api/didox".</div>
        </div>

        <div class="switch-row" style="margin-top:14px;">
          <span class="switch"><input type="checkbox" id="sDidoxAutoOmbor" ${s.didoxAutoOmbor !== false ? "checked" : ""}><span class="track"></span></span>
          <label for="sDidoxAutoOmbor">Kirim fakturalaridagi tovarlarni avtomatik Ombor bo'limiga kirim qilish</label>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-title" style="display:flex;align-items:center;gap:8px;">
          <span class="badge-1c">1C:Korxona / 1UZ</span> Ikki tomonlama ma'lumotlar almashinuvi
        </div>
        <div class="note" style="margin-bottom:14px;">1C:Бухгалтерия 8.3, Управление торговлей va 1UZ dasturlari bilan to'lovlar, fakturalar, kassa va tovarlar katalogini import/eksport qilish markazi.</div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btnSettingsOpen1C"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg>1C Sinxronlash markazi</button>
          <button class="btn" id="btnSettings1CBankExport">Klient-Bank (kl_to_1c.txt)</button>
          <button class="btn" id="btnSettings1CXmlExport">CommerceML 2.0 (.xml)</button>
          <button class="btn" id="btnSettings1CJsonExport">EnterpriseData (.json)</button>
        </div>
      </div>
    </div>

    <div class="settings-section" data-sec="malumot">
      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>Zaxira nusxa (Backup) va arxivlash</span>
          ${(() => {
            const b = checkBackupReminder();
            if (!b.needsBackup && b.lastDate) {
              return `<span class="badge-backup">✓ Zaxira yangi (${b.lastDate})</span>`;
            } else if (b.needsBackup && b.lastDate) {
              return `<span class="badge" style="background:rgba(217,119,6,0.15);color:#d97706;font-weight:700;">⚠ ${b.daysSince} kundan beri zaxira olinmagan</span>`;
            } else {
              return `<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-weight:700;">⚠ Zaxira olinmagan</span>`;
            }
          })()}
        </div>
        <div class="note" style="margin-bottom:14px;">Tizimdagi barcha 11 ta bo'lim (Kirim, Chiqim, Bank, Kassa, Ombor, Kontragentlar, Ishlab chiqarish, Qayta ishlash, Ish haqi, Asosiy vositalar va Sozlamalar) ma'lumotlarini bitta faylga zaxiralash.</div>
        <div class="page-actions" style="margin-bottom:12px;">
          <button class="btn btn-primary" id="btnExportFullXlsx"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg>To'liq Excel zaxira nusxasi (.xlsx — 11 varaq)</button>
          <button class="btn" id="btnExport"><svg class="ic" viewBox="0 0 24 24"><use href="#i-database"/></svg>JSON Snapshot yuklab olish (.json)</button>
          <button class="btn" id="btnImportJson">.json fayldan tiklash</button>
          <button class="btn btn-danger" id="btnReset">Hammasini tozalash</button>
        </div>
        <input type="file" id="jsonFile" accept=".json" style="display:none">
        <div class="note">Ma'lumotlar Supabase bulutida markaziy saqlanadi va jamoa a'zolari orasida real vaqtda sinxronlanadi — sahifa yangilansa ham yo'qolmaydi. Excel yoki JSON zaxira nusxasini muntazam olish tavsiya etiladi.</div>
      </div>
    </div>

    ${IS_ADMIN ? `<div class="settings-section" data-sec="firmalar"><div id="firmaManagerHost"><div class="note">Yuklanmoqda…</div></div></div>` : ""}

    <div class="settings-actionbar" id="settingsActionbar">
      <span class="dirty-note" id="settingsDirtyNote" style="display:none;">• Saqlanmagan o'zgarishlar bor</span>
      <button class="btn btn-primary" id="btnSaveSettings">Saqlash</button>
    </div>
  `;

  SETTINGS_DIRTY = false;

  const settingsTabs = document.getElementById("settingsTabs");
  const actionbar = document.getElementById("settingsActionbar");
  const setSettingsSection = (sec) => {
    settingsTabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.sec === sec));
    main.querySelectorAll(".settings-section").forEach((el) => el.classList.toggle("active", el.dataset.sec === sec));
    // "Saqlash" paneli faqat tahrirlanadigan bo'limlarda kerak.
    actionbar.style.display = ["rekvizit", "yonalish", "soliq", "ishhaqi", "integratsiya"].includes(sec) ? "" : "none";
  };
  settingsTabs.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => setSettingsSection(b.dataset.sec)));

  // Boshqa sahifadan "…ni sozlash" tugmasi orqali kelingan bo'lsa — o'sha bo'lim ochiladi.
  if (SETTINGS_TARGET_SECTION && settingsTabs.querySelector(`.tab-btn[data-sec="${SETTINGS_TARGET_SECTION}"]`)) {
    setSettingsSection(SETTINGS_TARGET_SECTION);
  }
  SETTINGS_TARGET_SECTION = null;

  const markSettingsDirty = () => {
    if (SETTINGS_DIRTY) return;
    SETTINGS_DIRTY = true;
    document.getElementById("settingsDirtyNote").style.display = "";
  };
  main.querySelectorAll(".settings-section input, .settings-section select").forEach((el) => {
    el.addEventListener("input", markSettingsDirty);
    el.addEventListener("change", markSettingsDirty);
  });

  // Yo'nalish tanlanganda — modul bayroqlarini standart holatga o'rnatamiz
  // (foydalanuvchi keyin qo'lda o'zgartira oladi).
  const sYonalish = document.getElementById("sYonalish");
  if (sYonalish) sYonalish.addEventListener("change", () => {
    const preset = YONALISH_PRESET[sYonalish.value];
    if (!preset) return;
    document.getElementById("sModulOmbor").checked = preset.modulOmbor;
    document.getElementById("sModulIshlabChiqarish").checked = preset.modulIshlabChiqarish;
    document.getElementById("sModulAsosiyVositalar").checked = preset.modulAsosiyVositalar;
    markSettingsDirty();
  });

  // Didox ulanishini tekshirish tugmasi
  const btnTestDidox = document.getElementById("btnTestDidoxConnection");
  if (btnTestDidox) {
    btnTestDidox.addEventListener("click", async () => {
      const tok = (document.getElementById("sDidoxToken")?.value || "").trim();
      const url = (document.getElementById("sDidoxApiUrl")?.value || "").trim();
      const statusEl = document.getElementById("didoxConnStatus");
      if (!tok) {
        if (statusEl) {
          statusEl.style.display = "";
          statusEl.style.color = "var(--danger)";
          statusEl.textContent = "Iltimos, avval Didox API tokenini kiriting.";
        }
        return;
      }
      if (statusEl) {
        statusEl.style.display = "";
        statusEl.style.color = "var(--text-dim)";
        statusEl.textContent = "Didox API bilan aloqa tekshirilmoqda...";
      }
      btnTestDidox.disabled = true;
      try {
        const res = await testDidoxConnection(tok, url);
        if (statusEl) {
          if (res.ok) {
            statusEl.style.color = "var(--ok)";
            statusEl.textContent = "✓ Didox API bilan aloqa muvaffaqiyatli o'rnatildi!";
          } else {
            statusEl.style.color = "var(--danger)";
            statusEl.textContent = "✗ Xatolik: " + (res.message || res.error || "Didox serveriga ulanib bo'lmadi");
          }
        }
      } catch (err) {
        if (statusEl) {
          statusEl.style.color = "var(--danger)";
          statusEl.textContent = "✗ Xatolik: " + err.message;
        }
      } finally {
        btnTestDidox.disabled = false;
      }
    });
  }

  if (IS_ADMIN) {
    const host = document.getElementById("firmaManagerHost");
    if (host) renderFirmaManager(host, { withHeader: false });
  }

  document.getElementById("btnSaveSettings").addEventListener("click", () => {
    if (!requireDataReady()) return;
    const tannarxVal = document.getElementById("sTannarx").value.trim();
    const tolovKuniVal = document.getElementById("sIshHaqiTolovKuni").value.trim();
    const next = {
      companyName: document.getElementById("sCompany").value,
      inn: document.getElementById("sInn").value,
      address: document.getElementById("sAddress").value,
      period: document.getElementById("sPeriod").value,
      rahbar: document.getElementById("sRahbar").value,
      qqsStavka: toNum(document.getElementById("sQqs").value),
      foydaStavka: toNum(document.getElementById("sFoyda").value),
      davrXarajati: toNum(document.getElementById("sDavr").value),
      ishHaqiAvtoXarajat: document.getElementById("sIshHaqiAvto").checked,
      moliyaviyXarajat: toNum(document.getElementById("sMoliya").value),
      tannarxManual: tannarxVal === "" ? null : toNum(tannarxVal),
      ijtimoiySoliqStavka: toNum(document.getElementById("sIjtimoiy").value),
      ndflStavka: toNum(document.getElementById("sNdfl").value),
      inpsStavka: toNum(document.getElementById("sInps").value),
      ishHaqiTolovKuni: tolovKuniVal === "" ? null : toNum(tolovKuniVal),
      tannarxUsuli: document.getElementById("sTannarxUsuli").value === "ortacha" ? "ortacha" : "fifo",
      defaultFoydaNormasi: toNum(document.getElementById("sDefaultFoyda").value),
      yonalish: document.getElementById("sYonalish").value,
      modulOmbor: document.getElementById("sModulOmbor").checked,
      modulIshlabChiqarish: document.getElementById("sModulIshlabChiqarish").checked,
      modulAsosiyVositalar: document.getElementById("sModulAsosiyVositalar").checked,
      didoxToken: (document.getElementById("sDidoxToken")?.value || "").trim(),
      didoxApiUrl: (document.getElementById("sDidoxApiUrl")?.value || "").trim() || "https://api.didox.uz/v1",
      didoxAutoOmbor: document.getElementById("sDidoxAutoOmbor") ? document.getElementById("sDidoxAutoOmbor").checked : true
    };
    const { ok, errors, warnings } = validateSettings(next);
    applySettingsFieldMessages(errors, warnings);
    if (!ok) {
      toast("Ba'zi qiymatlar noto'g'ri — qizil bilan belgilangan maydonlarni tuzating", "err");
      return;
    }
    // Yagona yo'l: STORE + baza + kesh. rerender:false — faol tab yo'qolmasin.
    applySettingsChange(next, { rerender: false });
    SETTINGS_DIRTY = false;
    document.getElementById("settingsDirtyNote").style.display = "none";
    toast("Sozlamalar saqlandi");
  });

  // 1C Integratsiyasi tugmalari
  const btnSettingsOpen1C = document.getElementById("btnSettingsOpen1C");
  if (btnSettingsOpen1C) btnSettingsOpen1C.addEventListener("click", () => open1CExchangeModal("bank"));

  const btnSettings1CBankExport = document.getElementById("btnSettings1CBankExport");
  if (btnSettings1CBankExport) btnSettings1CBankExport.addEventListener("click", () => {
    const text = generate1CClientBankExport(STORE.bank);
    const blob = new Blob([text], { type: "text/plain;charset=windows-1251" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kl_to_1c_${todayISO()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("kl_to_1c.txt fayli yuklab olindi (1C Klient-Bank formati)");
  });

  const btnSettings1CXmlExport = document.getElementById("btnSettings1CXmlExport");
  if (btnSettings1CXmlExport) btnSettings1CXmlExport.addEventListener("click", () => {
    const xml = generateCommerceMLExport();
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `forget_1c_commerceml_${todayISO()}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("CommerceML 2.0 XML fayli yuklab olindi");
  });

  const btnSettings1CJsonExport = document.getElementById("btnSettings1CJsonExport");
  if (btnSettings1CJsonExport) btnSettings1CJsonExport.addEventListener("click", () => {
    const data = generate1CEnterpriseJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `forget_1c_enterprisedata_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast("1C EnterpriseData JSON fayli yuklab olindi");
  });

  // To'liq Zaxira (Backup) tugmalari
  const btnExportFullXlsx = document.getElementById("btnExportFullXlsx");
  if (btnExportFullXlsx) btnExportFullXlsx.addEventListener("click", exportFullBackupXlsx);

  const btnExport = document.getElementById("btnExport");
  if (btnExport) btnExport.addEventListener("click", exportFullBackupJson);

  document.getElementById("btnImportJson").addEventListener("click", () => document.getElementById("jsonFile").click());
  document.getElementById("jsonFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!IS_ADMIN) { toast("Faqat admin ma'lumotlarni tiklashi mumkin", "err"); e.target.value = ""; return; }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const newSettings = Object.assign(defaultStore().settings, parsed.settings || {});

      const clearResults = await Promise.all([
        sbClient.from("kirim").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("chiqim").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("bank").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("ish_haqi").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("ombor").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("ishlab_chiqarish").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("mahsulotlar").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("fayllar").delete().eq("firma_id", ACTIVE_FIRMA_ID)
      ]);
      const clearError = clearResults.find((r) => r.error);
      if (clearError) throw clearError.error;
      // "chiqim_tafsil" jadvali migratsiyasi hali ishga tushirilmagan bazalarda
      // ham tiklash to'liq davom etishi uchun bu jadval xatosi alohida (jim) ushlanadi.
      try { await sbClient.from("chiqim_tafsil").delete().eq("firma_id", ACTIVE_FIRMA_ID); } catch (e) { console.error(e); }

      // Eslatma: "fayllar" jadvali reset paytida bo'shatilib qayta yaratilgani
      // uchun eski fayl_id qiymatlari endi hech qanday faylga mos kelmaydi —
      // FOREIGN KEY buzilishining oldini olish uchun tiklashda fayl_id
      // biriktirilmaydi (tranzaksiya ma'lumotlarining o'zi to'liq tiklanadi,
      // faqat "qaysi fayldan import qilingani" bog'lanishi yo'qoladi).
      const stripFaylId = (r) => ({ ...r, faylId: undefined });
      const inserts = [];
      if ((parsed.kirim || []).length) inserts.push(sbClient.from("kirim").insert(parsed.kirim.map((r) => toDbRow(INVOICE_DB_MAP, stripFaylId(r)))));
      if ((parsed.bank || []).length) inserts.push(sbClient.from("bank").insert(parsed.bank.map((r) => toDbRow(BANK_DB_MAP, stripFaylId(r)))));
      if ((parsed.ishHaqi || []).length) inserts.push(sbClient.from("ish_haqi").insert(parsed.ishHaqi.map((r) => toDbRow(ISHHAQI_DB_MAP, stripFaylId(r)))));
      if ((parsed.ombor || []).length) inserts.push(sbClient.from("ombor").insert(parsed.ombor.map((r) => toDbRow(OMBOR_DB_MAP, stripFaylId(r)))));
      if ((parsed.ishlabChiqarish || []).length) inserts.push(sbClient.from("ishlab_chiqarish").insert(parsed.ishlabChiqarish.map((r) => toDbRow(ISHLAB_CHIQARISH_DB_MAP, r))));

      // "chiqim" va "mahsulotlar" tiklanganda YANGI id bilan qayta yaratiladi
      // (eski id'lar saqlanmaydi). Lekin "chiqim_tafsil" qatorlari aynan o'sha
      // eski id'larga (chiqim_id, mahsulot_id — FOREIGN KEY orqali) bog'langan
      // edi — shu sabab .select() bilan yangi id'larni qaytarib olib,
      // eski->yangi xarita tuzamiz, aks holda kalkulyatsiya bog'lanishi
      // (demak, bosh sahifadagi "Tannarx") tiklashdan keyin butunlay yo'qolib
      // qoladi (avvalgi xato aynan shu edi).
      const chiqimIdMap = new Map();
      if ((parsed.chiqim || []).length) {
        const { data, error } = await sbClient.from("chiqim").insert(parsed.chiqim.map((r) => toDbRow(INVOICE_DB_MAP, stripFaylId(r)))).select();
        if (error) throw error;
        parsed.chiqim.forEach((r, i) => { if (data[i]) chiqimIdMap.set(r.id, data[i].id); });
      }
      const mahsulotIdMap = new Map();
      if ((parsed.mahsulotlar || []).length) {
        const { data, error } = await sbClient.from("mahsulotlar").insert(parsed.mahsulotlar.map((r) => toDbRow(MAHSULOT_DB_MAP, r))).select();
        if (error) throw error;
        parsed.mahsulotlar.forEach((r, i) => { if (data[i]) mahsulotIdMap.set(r.id, data[i].id); });
      }

      const insertResults = await Promise.all(inserts);
      const insertError = insertResults.find((r) => r.error);
      if (insertError) throw insertError.error;

      if ((parsed.chiqimTafsil || []).length) {
        const tafsilRows = parsed.chiqimTafsil
          .map((r) => ({ ...r, chiqimId: chiqimIdMap.get(r.chiqimId), mahsulotId: r.mahsulotId ? (mahsulotIdMap.get(r.mahsulotId) || null) : null, faylId: undefined }))
          .filter((r) => r.chiqimId);
        if (tafsilRows.length) {
          const { error } = await sbClient.from("chiqim_tafsil").insert(tafsilRows.map((r) => toDbRow(CHIQIM_TAFSIL_DB_MAP, r)));
          // Eski bazalarda "chiqim_tafsil" migratsiyasi hali ishga tushirilmagan
          // bo'lishi mumkin — shu holatda ham qolgan tiklash muvaffaqiyatli
          // yakunlanishi uchun bu xato tiklashni to'xtatmaydi, faqat log qilinadi.
          if (error) console.error(error);
        }
      }

      await saveSettingsToDb(newSettings);
      await loadAllData();
      applyModuleVisibility();
      renderSettings();
      toast("Ma'lumotlar tiklandi");
    } catch (err) {
      console.error(err);
      // Bazaga yozishdagi (masalan RLS ruxsat bermagan) xatolik bilan faylni
      // o'qib bo'lmasligini ajratib ko'rsatamiz — ikkalasi ham shu catch'ga tushadi.
      toast(isPermissionError(err) ? "Sizda ma'lumotlarni tiklash huquqi yo'q (faqat admin)" : "Faylni o'qib/tiklab bo'lmadi", "err");
    } finally {
      e.target.value = "";
    }
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    if (!IS_ADMIN) { toast("Faqat admin barcha ma'lumotlarni tozalashi mumkin", "err"); return; }
    openModal(`
      <h3>Hammasini tozalash</h3>
      <p class="modal-sub">Barcha kirim/chiqim/bank/ish haqi/ombor/ishlab chiqarish yozuvlari <b>butun jamoa uchun umumiy bazadan</b> o'chiriladi. Bu amalni bekor qilib bo'lmaydi.</p>
      <div class="modal-actions">
        <button class="btn" id="mCancel">Bekor qilish</button>
        <button class="btn btn-danger" id="mConfirm">Ha, tozalash</button>
      </div>
    `);
    document.getElementById("mCancel").addEventListener("click", closeModal);
    document.getElementById("mConfirm").addEventListener("click", async () => {
      const results = await Promise.all([
        sbClient.from("kirim").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("chiqim").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("bank").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("ish_haqi").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("ombor").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("ishlab_chiqarish").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("mahsulotlar").delete().eq("firma_id", ACTIVE_FIRMA_ID),
        sbClient.from("fayllar").delete().eq("firma_id", ACTIVE_FIRMA_ID)
      ]);
      const failed = results.find((r) => r.error);
      if (failed) {
        console.error(failed.error);
        closeModal();
        // Ba'zi jadvallar allaqachon tozalangan bo'lishi mumkin — haqiqiy holatni ko'rsatish uchun qayta yuklaymiz.
        await loadAllData();
        renderSettings();
        toast(isPermissionError(failed.error) ? "Sizda bu amal uchun ruxsat yo'q (faqat admin)" : "Tozalashda xatolik — ba'zi jadvallar tozalanmagan bo'lishi mumkin", "err");
        return;
      }
      try { await sbClient.from("chiqim_tafsil").delete().eq("firma_id", ACTIVE_FIRMA_ID); } catch (e) { console.error(e); }
      await saveSettingsToDb(defaultStore().settings);
      await loadAllData();
      closeModal();
      renderSettings();
      toast("Tozalandi");
    });
  });

  bindNavShortcuts(main);
}

/* ------------------------------- Hisobot export/import (Excel) ------------------------------- */
// Har bir hisobot (F2, QQS, Foyda solig'i, Ish haqi hisoboti, F1) uchun umumiy: hisoblangan
// ko'rsatkichlarni .xlsx fayl sifatida yuklab olish (eksport) va ilgari eksport qilingan
// fayldan qo'lda kiritiladigan ko'rsatkichlarni qayta o'qib olish (import).

// win.open + win.print() bo'lagi — printSverkaPdf/printOmborQoldiqPdf'dagi
// bilan bir xil, endi umumiy yordamchiga chiqarilgan (faqat YANGI chop etish
// funksiyalari shundan foydalanadi; eski funksiyalar o'zgarishsiz qoladi).
function openPrintWindow(html) {
  const win = window.open("", "_blank");
  if (!win) { toast("Chop etish oynasi ochilmadi — brauzer bloklagan bo'lishi mumkin", "err"); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 300);
}

// "Hisobot" uslubidagi sahifalar (F1/F2/QQS/Foyda/aging/ish haqi hisoboti)
// uchun umumiy chop etish HTML shabloni — mavjud printSverkaPdf bilan bir xil CSS.
function buildSimpleReportPrintHtml({ title, periodText, theadHtml, bodyHtml, tfootHtml = "" }) {
  const s = STORE.settings;
  return `
    <!doctype html><html lang="uz"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
    <style>
      body{font-family:Arial, "Segoe UI", sans-serif; padding:28px; color:#1c2530;}
      h1{font-size:18px; margin:0 0 4px;} .sub{font-size:12px; color:#5b6b7b; margin:0 0 4px;}
      .period{font-size:12px; color:#5b6b7b; margin:0 0 18px;}
      table{width:100%; border-collapse:collapse; font-size:11.5px;}
      th, td{border:1px solid #ccd3da; padding:6px 8px; text-align:left;}
      th{background:#eceff2;} td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
      tfoot td{font-weight:700; border-top:2px solid #1c2530;} @media print { body{padding:0;} }
    </style></head><body>
      <h1>${escapeHtml(s.companyName)}</h1>
      <div class="sub">INN: ${escapeHtml(s.inn)}</div>
      <div class="period">${escapeHtml(title)}${periodText ? " &middot; " + escapeHtml(periodText) : ""}</div>
      <table><thead>${theadHtml}</thead><tbody>${bodyHtml}</tbody><tfoot>${tfootHtml}</tfoot></table>
    </body></html>`;
}

// Hisobot "qator" ro'yxatini (buildAndDownloadReportXlsx uchun ishlatiladigan
// {code,label,value} shakli) chop etish jadvaliga aylantiradi — F2/QQS/Foyda/F1/
// Ish haqi hisoboti export va print funksiyalari BITTA manbadan (lines) ishlaydi.
function printReportLines(title, periodText, lines) {
  const bodyHtml = lines.map((l) => `<tr><td>${escapeHtml(l.code || "")}</td><td>${escapeHtml(l.label)}</td><td class="num">${fmtSum(l.value)}</td></tr>`).join("");
  openPrintWindow(buildSimpleReportPrintHtml({
    title, periodText,
    theadHtml: `<tr><th>Kod</th><th>Ko'rsatkich</th><th class="num">Summa</th></tr>`,
    bodyHtml
  }));
}

function buildAndDownloadReportXlsx(filenameBase, title, lines, detail) {
  const s = STORE.settings;
  const aoa = [
    [s.companyName],
    [`INN: ${s.inn}   Davr: ${s.filterFrom || "—"} — ${s.filterTo || "—"}`],
    [title],
    [],
    ["Kod", "Ko'rsatkich", "Summa"]
  ];
  lines.forEach((l) => aoa.push([l.code || "", l.label, toNum(l.value)]));
  if (s.rahbar) { aoa.push([]); aoa.push(["", "Rahbar:", s.rahbar]); }
  const ws1 = XLSX.utils.aoa_to_sheet(aoa);
  ws1["!cols"] = [{ wch: 8 }, { wch: 55 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Hisobot");

  if (detail && detail.rows.length) {
    const daoa = [detail.headers, ...detail.rows];
    const ws2 = XLSX.utils.aoa_to_sheet(daoa);
    XLSX.utils.book_append_sheet(wb, ws2, detail.sheetName || "Tafsilot");
  }
  XLSX.writeFile(wb, `${filenameBase}_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function openGenericImportModal(titleHtml, hintHtml, acceptAttr, onFile) {
  openModal(`
    <h3>${titleHtml}</h3>
    <p class="modal-sub">${hintHtml}</p>
    <div class="dropzone" id="dz">Faylni shu yerga tashlang yoki bosing<br><span class="faint">${acceptAttr}</span></div>
    <input type="file" id="impFile" accept="${acceptAttr}" style="display:none">
    <div class="modal-actions"><button class="btn" id="mCancel">Yopish</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const dz = document.getElementById("dz");
  const inp = document.getElementById("impFile");
  dz.addEventListener("click", () => inp.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag"); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
  inp.addEventListener("change", (e) => { if (e.target.files[0]) onFile(e.target.files[0]); });
}

// fieldMap: { "Excel'dagi ko'rsatkich matni": "STORE.settings kaliti" }
async function handleReportSettingsImport(file, fieldMap, rerender) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    let applied = 0;
    const changed = {};
    rows.forEach((row) => {
      const label = String(row[1] || "").trim();
      if (fieldMap[label] !== undefined && row[2] !== "" && row[2] !== undefined) {
        const key = fieldMap[label];
        STORE.settings[key] = toNum(row[2]);
        changed[key] = STORE.settings[key];
        applied++;
      }
    });
    if (Object.keys(changed).length) await saveSettingsToDb(changed);
    saveStore();
    closeModal();
    rerender();
    toast(applied ? `Import: ${applied} ta ko'rsatkich yangilandi` : "Mos ko'rsatkich topilmadi");
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

/* ------------------------------- Didox / E-Faktura API Integratsiyasi ------------------------------- */

/**
 * Didox REST API yoki Soliq.uz (GNK) E-Faktura JSON hujjatini FORGET ichki tuzilishiga o'giradi.
 * @param {Object} rawDoc - Didox yoki Soliq.uz'dan olingan xom hujjat ob'ekti
 * @param {string} [targetType] - 'kirim' | 'chiqim' | 'all' | null
 * @returns {Object|null}
 */
function parseDidoxDocument(rawDoc, targetType) {
  if (!rawDoc || typeof rawDoc !== "object") return null;

  // 1) Hujjat ob'ektining asosiy qismi
  const doc = rawDoc.document || rawDoc.data || rawDoc.Factura || rawDoc;
  const facturaDoc = doc.factura_doc || doc.FacturaDoc || doc.document_info || doc;

  // 2) Hujjat raqami va sanasi
  const hujjatRaqami = String(
    facturaDoc.factura_number ||
    facturaDoc.factura_no ||
    facturaDoc.FacturaNo ||
    facturaDoc.number ||
    rawDoc.number ||
    rawDoc.hujjat_raqami ||
    ""
  ).trim();

  const sanaRaw =
    facturaDoc.factura_date ||
    facturaDoc.FacturaDate ||
    facturaDoc.date ||
    rawDoc.date ||
    rawDoc.sana ||
    "";
  const sana = normalizeDate(sanaRaw);

  // 3) Ishtirokchilar (Sotuvchi va Xaridor)
  const seller = doc.seller || doc.Seller || rawDoc.seller || {};
  const buyer = doc.buyer || doc.Buyer || rawDoc.buyer || {};

  const sellerInn = String(seller.tin || seller.inn || seller.Tin || rawDoc.seller_tin || rawDoc.seller_inn || "").trim();
  const sellerNomi = String(seller.name || seller.Name || rawDoc.seller_name || rawDoc.seller_nomi || "").trim();
  const buyerInn = String(buyer.tin || buyer.inn || buyer.Tin || rawDoc.buyer_tin || rawDoc.buyer_inn || "").trim();
  const buyerNomi = String(buyer.name || buyer.Name || rawDoc.buyer_name || rawDoc.buyer_nomi || "").trim();

  // 4) Yo'nalishni aniqlash (kirim yoki chiqim)
  const myInn = String((STORE.settings && STORE.settings.inn) || "").trim();
  let resolvedType = targetType;
  if (!resolvedType || resolvedType === "all") {
    if (myInn && buyerInn && myInn === buyerInn) {
      resolvedType = "kirim"; // Biz xaridormiz -> Kiruvchi faktura
    } else if (myInn && sellerInn && myInn === sellerInn) {
      resolvedType = "chiqim"; // Biz sotuvchimiz -> Chiquvchi faktura
    } else {
      resolvedType = "kirim"; // Standart kirim
    }
  }

  const isKirim = resolvedType === "kirim";
  const kontragentInn = isKirim ? sellerInn : buyerInn;
  const kontragentNomi = isKirim ? sellerNomi : buyerNomi;

  // 5) Status normallashtirish
  // Didox raqamli statuslar:
  // 30: Podpisan/Qabul qilingan, 40: Otkaz/Rad, 50: Otmenen/Bekor, 10: Chernovik, 20/25: Yuborilgan
  let status = "Подписан";
  const rawStatus = rawDoc.status !== undefined ? rawDoc.status : (doc.status !== undefined ? doc.status : doc.DocStatus);
  const statusName = String(rawDoc.status_name || rawDoc.status_comment || doc.status_name || doc.StatusName || "").trim();

  if (rawStatus === 30 || rawStatus === "30") {
    status = "Подписан";
  } else if (rawStatus === 40 || rawStatus === "40") {
    status = "Отказ";
  } else if (rawStatus === 50 || rawStatus === "50") {
    status = "Отменен";
  } else if (rawStatus === 10 || rawStatus === "10") {
    status = "Черновик";
  } else if (rawStatus === 20 || rawStatus === "20" || rawStatus === 25 || rawStatus === "25") {
    status = "Отправлен";
  } else if (statusName) {
    status = statusName;
  } else if (typeof rawDoc.status === "string") {
    status = rawDoc.status;
  }

  // 6) Summalar va QQS
  const total = doc.total || doc.Total || rawDoc.total || {};
  let summaQQSsiz = toNum(
    total.summa ||
    total.delivery_sum ||
    doc.TotalSumma ||
    doc.TotalDeliverySum ||
    rawDoc.summa_qqssiz ||
    rawDoc.summa
  );
  let qqsSumma = toNum(
    total.vat_sum ||
    doc.TotalVatSum ||
    rawDoc.qqs_summa ||
    rawDoc.vat_sum
  );
  let jamiSumma = toNum(
    total.delivery_sum_with_vat ||
    total.total_sum ||
    doc.TotalDeliverySumWithVat ||
    rawDoc.jami_summa ||
    rawDoc.total_sum
  );

  // 7) Mahsulotlar (Line items)
  const rawItems =
    doc.items ||
    doc.products ||
    (doc.ProductList && doc.ProductList.Products) ||
    rawDoc.items ||
    rawDoc.products ||
    [];

  const items = [];
  if (Array.isArray(rawItems)) {
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      if (!it || typeof it !== "object") continue;

      const ordNo = it.ord_no || it.OrdNo || i + 1;
      const nomi = String(it.name || it.product_name || it.Name || it.catalog_name || "").trim();
      const birlik = String(it.package_name || it.unit || it.MeasureId || it.birlik || "dona").trim();
      const miqdor = toNum(it.count || it.quantity || it.Count || 1);
      const narx = toNum(it.price || it.Price || 0);
      const itemSumma = toNum(it.summa || it.delivery_sum || it.Summa || (miqdor * narx));
      const vatRate = toNum(it.vat_rate || it.VatRate || 12);
      const itemVat = toNum(it.vat_sum || it.VatSum || 0);
      const itemJami = toNum(it.delivery_sum_with_vat || it.total_sum || it.DeliverySumWithVat || (itemSumma + itemVat));
      const mxik = String(it.catalog_code || it.CatalogCode || it.mxik || "").trim();

      if (nomi) {
        items.push({
          ordNo,
          nomi,
          birlik,
          miqdor,
          narx: narx || (miqdor > 0 ? itemSumma / miqdor : 0),
          summaQQSsiz: itemSumma,
          qqsStavka: vatRate,
          qqsSumma: itemVat,
          jamiSumma: itemJami,
          mxik
        });
      }
    }
  }

  // Agar total headerda summa bo'lmasa, mahsulotlardan jamlaymiz
  if (!summaQQSsiz && items.length) {
    summaQQSsiz = items.reduce((a, it) => a + it.summaQQSsiz, 0);
  }
  if (!qqsSumma && items.length) {
    qqsSumma = items.reduce((a, it) => a + it.qqsSumma, 0);
  }
  if (!jamiSumma) {
    jamiSumma = summaQQSsiz + qqsSumma;
  }

  const qqsStavka = summaQQSsiz > 0 && qqsSumma > 0 ? Math.round((qqsSumma / summaQQSsiz) * 100) : (qqsSumma > 0 ? 12 : 0);

  return {
    turi: resolvedType,
    hujjatRaqami,
    sana,
    status,
    kontragentInn,
    kontragentNomi,
    summaQQSsiz,
    qqsStavka,
    qqsSumma,
    jamiSumma,
    tolandi: false,
    rawId: String(rawDoc.id || doc.id || doc.FacturaId || ""),
    items
  };
}

/**
 * Fakturaning mavjud yozuvlar ichida takrorlanganligini (dublikat) tekshiradi.
 */
function isInvoiceDuplicate(row, existingRows) {
  if (!row || !Array.isArray(existingRows)) return false;
  const num = String(row.hujjatRaqami || "").trim().toLowerCase();
  const sana = String(row.sana || "").trim();
  const sum = Math.round(toNum(row.jamiSumma));
  const inn = String(row.kontragentInn || "").trim();
  const nomi = String(row.kontragentNomi || "").trim().toLowerCase();

  return existingRows.some((ex) => {
    const exNum = String(ex.hujjatRaqami || "").trim().toLowerCase();
    const exSana = String(ex.sana || "").trim();
    const exSum = Math.round(toNum(ex.jamiSumma));
    const exInn = String(ex.kontragentInn || "").trim();
    const exNomi = String(ex.kontragentNomi || "").trim().toLowerCase();

    if (num && exNum === num && sana && exSana === sana && Math.abs(sum - exSum) < 1) {
      if (!inn || !exInn || inn === exInn || nomi === exNomi) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Didox API bilan aloqani tekshiradi (Ping / Profile).
 */
async function testDidoxConnection(token, apiUrl) {
  const base = (apiUrl || (STORE.settings && STORE.settings.didoxApiUrl) || "https://api.didox.uz/v1").replace(/\/+$/, "");

  // 1) Serverless proxy orqali urinish
  try {
    const resp = await fetch("/api/didox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ping", token, didox_url: base })
    });
    if (resp.ok) {
      return await resp.json();
    }
  } catch (e) {
    // Agar serverless proxy bo'lmasa, to'g'ridan-to'g'ri urinish
  }

  // 2) To'g'ridan-to'g'ri (Electron yoki CORS ruxsat berilgan muhitda)
  try {
    const directResp = await fetch(`${base}/profile`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });
    if (directResp.ok) {
      const data = await directResp.json().catch(() => ({}));
      return { ok: true, message: "Didox API bilan aloqa o'rnatildi", profile: data };
    }
    return {
      ok: false,
      status: directResp.status,
      message: directResp.status === 401 ? "Didox API tokeni noto'g'ri yoki muddati o'tgan" : `Didox API xatosi (${directResp.status})`
    };
  } catch (err) {
    return { ok: false, error: err.message || "Didox serveriga ulanib bo'lmadi" };
  }
}

/**
 * Didox API'dan fakturalar ro'yxatini yuklab oladi.
 */
async function fetchDidoxDocuments(opts) {
  const { token, owner, dateFrom, dateTo, status, page = 1, limit = 50, apiUrl } = opts;
  const base = (apiUrl || (STORE.settings && STORE.settings.didoxApiUrl) || "https://api.didox.uz/v1").replace(/\/+$/, "");

  // 1) Avval Vercel serverless proksi orqali chaqiramiz (brauzerda CORS muammosini oldini olish uchun)
  try {
    const resp = await fetch("/api/didox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "documents",
        owner,
        token,
        date_from: dateFrom,
        date_to: dateTo,
        status,
        page,
        limit,
        didox_url: base
      })
    });
    if (resp.ok) {
      return await resp.json();
    }
    const err = await resp.json().catch(() => ({}));
    if (resp.status !== 404 && resp.status !== 502) {
      throw new Error(err.error || err.message || `Didox API xatosi (${resp.status})`);
    }
  } catch (proxyErr) {
    // Agar serverless proxy topilmasa va muhit Electron bo'lsa yoki to'g'ridan-to'g'ri qo'llab-quvvatlasa
    if (typeof window !== "undefined" && (window.process?.versions?.electron || !window.location?.origin?.includes("vercel.app"))) {
      const q = new URLSearchParams({
        owner: owner || "incoming",
        page: String(page || 1),
        limit: String(limit || 50)
      });
      if (dateFrom) q.set("date_from", dateFrom);
      if (dateTo) q.set("date_to", dateTo);
      if (status !== "" && status !== null && status !== undefined) q.set("status", String(status));

      const direct = await fetch(`${base}/documents?${q.toString()}`, {
        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
      });
      if (direct.ok) return await direct.json();
      const directErr = await direct.json().catch(() => ({}));
      throw new Error(directErr.error || directErr.message || `Didox API xatosi (${direct.status})`);
    }
    throw proxyErr;
  }
}

/**
 * Didox API yoki JSON ma'lumotlaridan fakturalarni FORGET bazasi bilan to'liq sinxronlaydi.
 */
async function syncDidoxInvoices(opts = {}) {
  await dataReady;
  const {
    type = "all", // 'kirim', 'chiqim', or 'all'
    dateFrom = "",
    dateTo = "",
    status = "30",
    token = (STORE.settings && STORE.settings.didoxToken) || "",
    apiUrl = (STORE.settings && STORE.settings.didoxApiUrl) || "https://api.didox.uz/v1",
    autoOmbor = STORE.settings ? (STORE.settings.didoxAutoOmbor !== false) : true,
    rawJsonData = null,
    onProgress = () => {}
  } = opts;

  const result = {
    totalFound: 0,
    addedKirim: 0,
    addedChiqim: 0,
    skipped: 0,
    omborAdded: 0,
    kontragentAdded: 0,
    errors: []
  };

  try {
    let docs = [];

    if (rawJsonData) {
      onProgress("Fayldan ma'lumotlar o'qilmoqda...", 20);
      if (Array.isArray(rawJsonData)) {
        docs = rawJsonData;
      } else if (rawJsonData && typeof rawJsonData === "object") {
        docs = rawJsonData.data || rawJsonData.documents || rawJsonData.Facturas || [rawJsonData];
      }
      onProgress(`${docs.length} ta hujjat topildi. Tahlil qilinmoqda...`, 40);
    } else {
      if (!token) {
        throw new Error("Didox API tokeni kiritilmagan. Iltimos, Didox API tokenini kiriting yoki Sozlamalarda saqlang.");
      }

      onProgress("Didox API serveriga ulanmoqda...", 10);

      const directionsToFetch = type === "all" ? ["incoming", "outgoing"] : [type === "kirim" ? "incoming" : "outgoing"];

      for (let dIdx = 0; dIdx < directionsToFetch.length; dIdx++) {
        const owner = directionsToFetch[dIdx];
        const dirLabel = owner === "incoming" ? "Kiruvchi" : "Chiquvchi";
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 20) {
          onProgress(`${dirLabel} fakturalar yuklanmoqda (sahifa ${page})...`, 20 + dIdx * 25 + page * 2);
          const resp = await fetchDidoxDocuments({
            token,
            apiUrl,
            owner,
            dateFrom,
            dateTo,
            status,
            page,
            limit: 50
          });

          const pageDocs = Array.isArray(resp) ? resp : (resp.data || resp.documents || []);
          if (!pageDocs.length) {
            hasMore = false;
            break;
          }

          pageDocs.forEach((d) => {
            if (!d._owner) d._owner = owner;
          });
          docs = docs.concat(pageDocs);

          if (pageDocs.length < 50 || (resp.total && docs.length >= resp.total)) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }
    }

    result.totalFound = docs.length;
    if (!docs.length) {
      onProgress("Ko'rsatilgan parametrlar bo'yicha hech qanday faktura topilmadi.", 100);
      return result;
    }

    onProgress(`${docs.length} ta hujjat tahlil qilinmoqda...`, 60);

    const kirimCandidates = [];
    const chiqimCandidates = [];
    const kirimLineItemsMap = new Map();
    const chiqimLineItemsMap = new Map();

    for (const rawDoc of docs) {
      const explicitType = rawDoc._owner === "incoming" ? "kirim" : (rawDoc._owner === "outgoing" ? "chiqim" : (type === "all" ? null : type));
      const parsed = parseDidoxDocument(rawDoc, explicitType);
      if (!parsed || !parsed.hujjatRaqami || !parsed.sana) {
        continue;
      }

      const targetStoreType = parsed.turi === "chiqim" ? "chiqim" : "kirim";
      const existingRows = STORE[targetStoreType] || [];

      // Dublikat tekshiruvi
      if (isInvoiceDuplicate(parsed, existingRows)) {
        result.skipped++;
        continue;
      }

      const currentCandidates = targetStoreType === "kirim" ? kirimCandidates : chiqimCandidates;
      if (isInvoiceDuplicate(parsed, currentCandidates)) {
        result.skipped++;
        continue;
      }

      const invoiceRow = {
        sana: parsed.sana,
        hujjatRaqami: parsed.hujjatRaqami,
        status: parsed.status,
        kontragentInn: parsed.kontragentInn,
        kontragentNomi: parsed.kontragentNomi,
        summaQQSsiz: parsed.summaQQSsiz,
        qqsStavka: parsed.qqsStavka,
        qqsSumma: parsed.qqsSumma,
        jamiSumma: parsed.jamiSumma,
        tolandi: false
      };

      const docKey = `${parsed.hujjatRaqami}__${parsed.sana}__${parsed.jamiSumma}`;

      if (targetStoreType === "kirim") {
        kirimCandidates.push(invoiceRow);
        if (parsed.items && parsed.items.length) {
          kirimLineItemsMap.set(docKey, parsed.items);
        }
      } else {
        chiqimCandidates.push(invoiceRow);
        if (parsed.items && parsed.items.length) {
          chiqimLineItemsMap.set(docKey, parsed.items);
        }
      }
    }

    onProgress("Kontragentlar ro'yxatga olinmoqda...", 70);

    // Kontragentlarni ro'yxatga olish
    const allCandidates = [...kirimCandidates, ...chiqimCandidates];
    const seenKontragents = new Set();
    for (const c of allCandidates) {
      if (!c.kontragentNomi) continue;
      const kKey = (c.kontragentInn || "") + "|" + c.kontragentNomi.toLowerCase();
      if (!seenKontragents.has(kKey)) {
        seenKontragents.add(kKey);
        const kRes = await ensureKontragentAutoAdded(c.kontragentInn, c.kontragentNomi);
        if (kRes) result.kontragentAdded++;
      }
    }

    onProgress("FORGET bazasiga fakturalar yozilmoqda...", 80);

    // 1) Kirim fakturalarini bazaga yozish
    if (kirimCandidates.length) {
      let insertedKirim = [];
      try {
        insertedKirim = await insertRowsChunked("kirim", kirimCandidates.map((r) => toDbRow(INVOICE_DB_MAP, r)));
      } catch (err) {
        result.errors.push("Kirim fakturalarini bazaga yozishda xatolik: " + err.message);
      }

      if (insertedKirim && insertedKirim.length) {
        const mappedInserted = insertedKirim.map((r) => fromDbRow(INVOICE_DB_MAP, r));
        STORE.kirim.push(...mappedInserted);
        result.addedKirim = mappedInserted.length;

        // Omborga tovarlarni kirim qilish
        if (autoOmbor && kirimLineItemsMap.size > 0) {
          onProgress("Ombor qoldiqlari kirim qilinmoqda...", 85);
          const omborRowsToInsert = [];

          for (const kRow of mappedInserted) {
            const docKey = `${kRow.hujjatRaqami}__${kRow.sana}__${kRow.jamiSumma}`;
            const items = kirimLineItemsMap.get(docKey);
            if (!items || !items.length || !isValidStatus(kRow.status)) continue;

            for (const it of items) {
              const omborDup = STORE.ombor.some((o) =>
                o.hujjatRaqami === kRow.hujjatRaqami &&
                o.sana === kRow.sana &&
                o.nomi === it.nomi &&
                Math.abs(o.miqdor - it.miqdor) < 0.001
              );
              if (omborDup) continue;

              omborRowsToInsert.push({
                sana: kRow.sana,
                hujjatRaqami: kRow.hujjatRaqami,
                kontragentInn: kRow.kontragentInn,
                kontragentNomi: kRow.kontragentNomi,
                nomi: it.nomi,
                birlik: it.birlik || "dona",
                miqdor: it.miqdor,
                narx: it.narx,
                yetkazibBerishNarxi: it.summaQQSsiz,
                qqsSumma: it.qqsSumma,
                yetkazibBerishNarxiQQSBilan: it.jamiSumma,
                turi: "kirim",
                kirimId: kRow.id
              });
            }
          }

          if (omborRowsToInsert.length) {
            try {
              const insertedOmbor = await insertRowsChunked("ombor", omborRowsToInsert.map((r) => toDbRow(OMBOR_DB_MAP, r)));
              if (insertedOmbor && insertedOmbor.length) {
                const mappedOmbor = insertedOmbor.map((r) => fromDbRow(OMBOR_DB_MAP, r));
                STORE.ombor.push(...mappedOmbor);
                result.omborAdded = mappedOmbor.length;
              }
            } catch (oErr) {
              result.errors.push("Ombor yozuvlarini qo'shishda xatolik: " + oErr.message);
            }
          }
        }
      }
    }

    // 2) Chiqim fakturalarini bazaga yozish
    if (chiqimCandidates.length) {
      let insertedChiqim = [];
      try {
        insertedChiqim = await insertRowsChunked("chiqim", chiqimCandidates.map((r) => toDbRow(INVOICE_DB_MAP, r)));
      } catch (err) {
        result.errors.push("Chiqim fakturalarini bazaga yozishda xatolik: " + err.message);
      }

      if (insertedChiqim && insertedChiqim.length) {
        const mappedInserted = insertedChiqim.map((r) => fromDbRow(INVOICE_DB_MAP, r));
        STORE.chiqim.push(...mappedInserted);
        result.addedChiqim = mappedInserted.length;
      }
    }

    onProgress("To'lov holatlari va hisobotlar qayta hisoblanmoqda...", 95);

    await recomputeAllPaymentStatus();
    updateNavBadges();

    if (CURRENT_PAGE === "kirim" || CURRENT_PAGE === "chiqim") {
      renderInvoicePage(CURRENT_PAGE);
    } else if (CURRENT_PAGE === "dashboard") {
      renderDashboard();
    }

    onProgress("Didox sinxronlash muvaffaqiyatli yakunlandi!", 100);
    return result;
  } catch (err) {
    onProgress("Xatolik: " + err.message, 100);
    result.errors.push(err.message);
    return result;
  }
}

/**
 * Didox / E-Faktura sinxronlash dialog oynasini ochadi.
 */
function openDidoxSyncModal(defaultType = "kirim") {
  const curPeriod = (STORE.settings && STORE.settings.period) || "";
  let defaultFrom = "";
  let defaultTo = todayISO();

  if (STORE.settings && STORE.settings.filterFrom) {
    defaultFrom = STORE.settings.filterFrom;
  } else {
    // Joriy oyning 1-kunini standart qilamiz
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    defaultFrom = `${y}-${m}-01`;
  }
  if (STORE.settings && STORE.settings.filterTo) {
    defaultTo = STORE.settings.filterTo;
  }

  const s = STORE.settings || {};

  openModal(`
    <div class="didox-sync-modal">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <div style="width:36px;height:36px;border-radius:8px;background:rgba(47,111,94,0.12);display:flex;align-items:center;justify-content:center;color:var(--accent);">
          <svg class="ic" viewBox="0 0 24 24" style="width:20px;height:20px;"><use href="#i-cloud-download"/></svg>
        </div>
        <div>
          <h3 style="margin:0;">Didox.uz / E-Faktura bilan sinxronlash</h3>
          <div class="faint" style="font-size:12px;">Elektron hisobfakturalarni to'g'ridan-to'g'ri bazaga yuklab olish</div>
        </div>
      </div>

      <div class="card" style="padding:10px 14px;margin-bottom:12px;background:var(--bg-hover);">
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>Firma: <b>${escapeHtml(s.companyName || "Nomsiz")}</b></span>
          <span>INN: <b>${escapeHtml(s.inn || "Kiritilmagan")}</b></span>
        </div>
      </div>

      <div class="grid grid-2" style="gap:10px;margin-bottom:10px;">
        <div class="field">
          <label>Hujjat yo'nalishi</label>
          <select id="didoxDirection">
            <option value="kirim" ${defaultType === "kirim" ? "selected" : ""}>Kiruvchi fakturalar (Kirim)</option>
            <option value="chiqim" ${defaultType === "chiqim" ? "selected" : ""}>Chiquvchi fakturalar (Chiqim)</option>
            <option value="all" ${defaultType === "all" ? "selected" : ""}>Barcha fakturalar (Kirim + Chiqim)</option>
          </select>
        </div>
        <div class="field">
          <label>Hujjat holati (status)</label>
          <select id="didoxStatus">
            <option value="30">Faqat tasdiqlanganlar (Подписан / 30)</option>
            <option value="">Barchasi (tasdiqlangan, bekor, yangi)</option>
          </select>
        </div>
      </div>

      <div class="grid grid-2" style="gap:10px;margin-bottom:10px;">
        <div class="field">
          <label>Boshlanish sanasi</label>
          <input type="date" id="didoxDateFrom" value="${defaultFrom}">
        </div>
        <div class="field">
          <label>Tugash sanasi</label>
          <input type="date" id="didoxDateTo" value="${defaultTo}">
        </div>
      </div>

      <div class="field" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <label style="margin:0;">Didox API Token</label>
          <button class="btn btn-sm" id="btnDidoxEimzoAuth" style="padding:2px 8px;font-size:11px;" title="CAPIWS orqali E-IMZO bilan avtorizatsiya qilish">
            E-IMZO orqali olish
          </button>
        </div>
        <input type="password" id="didoxTokenInput" placeholder="Didox kabinetidagi API tokeni (Bearer ...)" value="${escapeHtml(s.didoxToken || "")}">
        <div class="faint" style="font-size:11px;margin-top:3px;">
          Didox.uz shaxsiy kabinetingizdagi Sozlamalar -&gt; API bo'limidan olingan token.
        </div>
      </div>

      <div class="switch-row" style="margin-bottom:12px;">
        <span class="switch"><input type="checkbox" id="didoxAutoOmborCheck" ${s.didoxAutoOmbor !== false ? "checked" : ""}><span class="track"></span></span>
        <label for="didoxAutoOmborCheck" style="font-size:12px;">Kirim fakturalaridagi tovarlarni avtomatik Omborga tushirish</label>
      </div>

      <!-- JSON fayl tashlash bo'limi -->
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-dim);display:flex;justify-content:space-between;">
          <span>Yoki Didox / E-Faktura JSON faylini tashlang:</span>
          <span class="faint">.json</span>
        </div>
        <div class="dropzone" id="didoxJsonDz" style="padding:14px;font-size:12px;">
          Didox yoki Soliq.uz'dan eksport qilingan .json faylni shu yerga tashlang yoki bosing
        </div>
        <input type="file" id="didoxJsonFileInput" accept=".json" style="display:none">
      </div>

      <!-- Progress va Status bo'limi -->
      <div id="didoxProgressArea" style="display:none;">
        <div class="didox-progress-wrap">
          <div class="didox-progress-bar" id="didoxProgressBar"></div>
        </div>
        <div class="didox-stat-grid" id="didoxStatGrid" style="display:none;">
          <div class="didox-stat-card"><div class="val" id="dStatTotal">0</div><div class="lbl">Topildi</div></div>
          <div class="didox-stat-card"><div class="val" id="dStatKirim" style="color:var(--ok);">0</div><div class="lbl">Yangi kirim</div></div>
          <div class="didox-stat-card"><div class="val" id="dStatChiqim" style="color:#2b6cb0;">0</div><div class="lbl">Yangi chiqim</div></div>
          <div class="didox-stat-card"><div class="val" id="dStatSkip" style="color:var(--text-dim);">0</div><div class="lbl">Takroriy</div></div>
          <div class="didox-stat-card"><div class="val" id="dStatOmbor" style="color:var(--accent);">0</div><div class="lbl">Ombor qatori</div></div>
        </div>
        <div class="didox-log-box" id="didoxLogBox"></div>
      </div>

      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn" id="didoxModalClose">Yopish</button>
        <button class="btn btn-primary" id="btnStartDidoxSync">
          <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"><use href="#i-refresh"/></svg>Sinxronlashni boshlash
        </button>
      </div>
    </div>
  `);

  document.getElementById("didoxModalClose").addEventListener("click", closeModal);

  const addLog = (msg) => {
    const box = document.getElementById("didoxLogBox");
    if (!box) return;
    const time = new Date().toLocaleTimeString("uz-UZ", { hour12: false });
    box.textContent += `[${time}] ${msg}\n`;
    box.scrollTop = box.scrollHeight;
  };

  const setProgress = (percent) => {
    const bar = document.getElementById("didoxProgressBar");
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  };

  // E-IMZO orqali avtorizatsiya tugmasi
  const btnEimzo = document.getElementById("btnDidoxEimzoAuth");
  if (btnEimzo) {
    btnEimzo.addEventListener("click", async () => {
      if (!eimzoAvailable()) {
        toast("E-IMZO moduli (vendor/capiws.js) kompyuterda topilmadi. Tokenni qo'lda kiriting.", "warn");
        return;
      }
      toast("E-IMZO orqali Didox avtorizatsiyasi boshlanmoqda...");
      addLog("E-IMZO kutubxonasi tekshirilmoqda...");
      // E-IMZO orqali token olish
      try {
        window.CAPIWS.apikey(EIMZO_DOMAIN_API_KEYS, (event, data) => {
          if (data && data.success) {
            window.CAPIWS.callFunction({ plugin: "certkey", name: "list_all_certificates" }, (e, d) => {
              if (d && d.success && d.certificates && d.certificates.length) {
                toast("E-IMZO kalitlari topildi. Didox shaxsiy kabinetidagi token orqali to'g'ridan-to'g'ri ulanish tavsiya etiladi.");
              }
            }, (e, err) => {
              addLog("E-IMZO xatosi: " + err);
            });
          }
        }, (e, err) => {
          addLog("E-IMZO ulanish xatosi: " + err);
        });
      } catch (e) {
        addLog("E-IMZO istisnosi: " + e.message);
      }
    });
  }

  // JSON fayl orqali yuklash (Dropzone)
  const jsonDz = document.getElementById("didoxJsonDz");
  const jsonInput = document.getElementById("didoxJsonFileInput");
  if (jsonDz && jsonInput) {
    jsonDz.addEventListener("click", () => jsonInput.click());
    jsonDz.addEventListener("dragover", (e) => { e.preventDefault(); jsonDz.classList.add("drag"); });
    jsonDz.addEventListener("dragleave", () => jsonDz.classList.remove("drag"));
    jsonDz.addEventListener("drop", (e) => {
      e.preventDefault();
      jsonDz.classList.remove("drag");
      if (e.dataTransfer.files[0]) handleDidoxJsonFile(e.dataTransfer.files[0]);
    });
    jsonInput.addEventListener("change", (e) => {
      if (e.target.files[0]) handleDidoxJsonFile(e.target.files[0]);
    });
  }

  const handleDidoxJsonFile = async (file) => {
    try {
      const text = await file.text();
      const parsedJson = JSON.parse(text);
      document.getElementById("didoxProgressArea").style.display = "";
      addLog(`"${file.name}" fayli qabul qilindi.`);

      const dir = document.getElementById("didoxDirection").value;
      const autoOmbor = document.getElementById("didoxAutoOmborCheck").checked;

      const res = await syncDidoxInvoices({
        type: dir,
        autoOmbor,
        rawJsonData: parsedJson,
        onProgress: (msg, pct) => {
          addLog(msg);
          setProgress(pct);
        }
      });

      renderDidoxSyncSummary(res);
    } catch (err) {
      addLog("Faylni o'qishda xatolik: " + err.message);
      toast("JSON faylni o'qishda xatolik: " + err.message, "err");
    }
  };

  const renderDidoxSyncSummary = (res) => {
    document.getElementById("didoxStatGrid").style.display = "grid";
    document.getElementById("dStatTotal").textContent = res.totalFound;
    document.getElementById("dStatKirim").textContent = res.addedKirim;
    document.getElementById("dStatChiqim").textContent = res.addedChiqim;
    document.getElementById("dStatSkip").textContent = res.skipped;
    document.getElementById("dStatOmbor").textContent = res.omborAdded;

    const btnStart = document.getElementById("btnStartDidoxSync");
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = "Tugallandi ✓";
    }

    if (res.addedKirim || res.addedChiqim) {
      toast(`Didox: ${res.addedKirim + res.addedChiqim} ta faktura bazaga yuklandi!`);
    } else if (res.totalFound > 0 && res.skipped === res.totalFound) {
      toast(`Didox: barcha ${res.totalFound} ta faktura allaqachon bazada mavjud (takroriy).`);
    } else {
      toast("Didox sinxronlash yakunlandi");
    }
  };

  // Sinxronlashni boshlash tugmasi
  const btnStart = document.getElementById("btnStartDidoxSync");
  if (btnStart) {
    btnStart.addEventListener("click", async () => {
      const token = (document.getElementById("didoxTokenInput")?.value || "").trim();
      const dir = document.getElementById("didoxDirection").value;
      const dateFrom = document.getElementById("didoxDateFrom").value;
      const dateTo = document.getElementById("didoxDateTo").value;
      const status = document.getElementById("didoxStatus").value;
      const autoOmbor = document.getElementById("didoxAutoOmborCheck").checked;

      if (!token) {
        toast("Iltimos, Didox API tokenini kiriting yoki JSON faylni yuklang", "warn");
        document.getElementById("didoxTokenInput").focus();
        return;
      }

      // Agar sozlamalardagi tokendan farq qilsa, saqlab qo'yamiz
      if (token !== (STORE.settings.didoxToken || "")) {
        STORE.settings.didoxToken = token;
        saveSettingsToDb({ didoxToken: token });
      }

      document.getElementById("didoxProgressArea").style.display = "";
      document.getElementById("didoxStatGrid").style.display = "none";
      document.getElementById("didoxLogBox").textContent = "";
      btnStart.disabled = true;
      btnStart.innerHTML = `<span class="icon-btn-sync spin" style="display:inline-block;margin-right:6px;">↻</span>Sinxronlanmoqda…`;

      addLog(`Sinxronlash boshlandi: yo'nalish=${dir}, davr=${dateFrom || "boshi"} dan ${dateTo || "bugun"} gacha`);

      const res = await syncDidoxInvoices({
        type: dir,
        dateFrom,
        dateTo,
        status,
        token,
        autoOmbor,
        onProgress: (msg, pct) => {
          addLog(msg);
          setProgress(pct);
        }
      });

      renderDidoxSyncSummary(res);
    });
  }
}

/* ------------------------------- 1C:Enterprise / 1UZ & Klient-Bank Integratsiyasi ------------------------------- */

function format1CDate(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).trim().split("T")[0].split("-");
  if (parts.length === 3) {
    return `${parts[2].padStart(2, "0")}.${parts[1].padStart(2, "0")}.${parts[0]}`;
  }
  return String(isoDate);
}

function parse1CDate(str) {
  if (!str) return "";
  const s = String(str).trim().split(" ")[0];
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [d, m, y] = s.split(".");
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return normalizeDate(s);
}

function generate1CClientBankExport(bankRows, opts = {}) {
  const rows = bankRows || STORE.bank || [];
  const s = STORE.settings || {};
  const ourInn = opts.ourInn || s.inn || "000000000";
  const ourCompany = opts.ourCompany || s.companyName || "FORGET";
  const ourAccount = opts.ourAccount || s.account || "20208000000000000001";
  const ourBank = opts.ourBank || "ATB HAMKORBANK";
  const ourBik = opts.ourBik || "00083";

  let minDate = opts.dateFrom;
  let maxDate = opts.dateTo;
  if (!minDate || !maxDate) {
    const dates = rows.map((r) => r.sana).filter(Boolean).sort();
    if (!minDate) minDate = dates[0] || todayISO();
    if (!maxDate) maxDate = dates[dates.length - 1] || todayISO();
  }

  const opening = toNum(opts.openingBalance != null ? opts.openingBalance : s.bankOpeningBalance);
  let totalKirim = 0;
  let totalChiqim = 0;

  const docLines = [];
  rows.forEach((r, idx) => {
    const kirim = toNum(r.kirim);
    const chiqim = toNum(r.chiqim);
    if (kirim <= 0 && chiqim <= 0) return;

    totalKirim += kirim;
    totalChiqim += chiqim;

    const isOut = chiqim > 0;
    const summa = isOut ? chiqim : kirim;
    const docNo = r.hujjatRaqami || String(idx + 1);
    const docDate = format1CDate(r.sana || minDate);
    const partnerInn = r.kontragentInn || "";
    const partnerName = r.kontragent || "Noma'lum kontragent";
    const tavsif = r.tavsif || (isOut ? "To'lov" : "Tushum");

    docLines.push("СекцияДокумент=Платежное поручение");
    docLines.push(`Номер=${docNo}`);
    docLines.push(`Дата=${docDate}`);
    docLines.push(`Сумма=${summa.toFixed(2)}`);

    if (isOut) {
      docLines.push(`Плательщик=${ourCompany}`);
      docLines.push(`ПлательщикИНН=${ourInn}`);
      docLines.push(`Плательщик1=${ourCompany}`);
      docLines.push(`ПлательщикРасчСчет=${ourAccount}`);
      docLines.push(`ПлательщикБанк1=${ourBank}`);
      docLines.push(`ПлательщикБИК=${ourBik}`);
      docLines.push(`ПлательщикКорсчет=10301000000000000000`);
      docLines.push(`Получатель=${partnerName}`);
      docLines.push(`ПолучательИНН=${partnerInn}`);
      docLines.push(`Получатель1=${partnerName}`);
      docLines.push(`ПолучательРасчСчет=20208000000000000002`);
      docLines.push(`ПолучательБанк1=BANK`);
      docLines.push(`ПолучательБИК=00000`);
      docLines.push(`ПолучательКорсчет=10301000000000000000`);
    } else {
      docLines.push(`Плательщик=${partnerName}`);
      docLines.push(`ПлательщикИНН=${partnerInn}`);
      docLines.push(`Плательщик1=${partnerName}`);
      docLines.push(`ПлательщикРасчСчет=20208000000000000002`);
      docLines.push(`ПлательщикБанк1=BANK`);
      docLines.push(`ПлательщикБИК=00000`);
      docLines.push(`ПлательщикКорсчет=10301000000000000000`);
      docLines.push(`Получатель=${ourCompany}`);
      docLines.push(`ПолучательИНН=${ourInn}`);
      docLines.push(`Получатель1=${ourCompany}`);
      docLines.push(`ПолучательРасчСчет=${ourAccount}`);
      docLines.push(`ПолучательБанк1=${ourBank}`);
      docLines.push(`ПолучательБИК=${ourBik}`);
      docLines.push(`ПолучательКорсчет=10301000000000000000`);
    }

    let dtSch = "5110";
    let ktSch = "4010";
    if (isOut) {
      ktSch = "5110";
      dtSch = "6010";
      if (/oylik|ish\s*haqi|maosh|avans\s*xodim/i.test(tavsif)) dtSch = "6710";
      else if (/soliq|qqs|ndfl|foyda|byudjet|pensiya/i.test(tavsif)) dtSch = "6410";
      else if (/ijtimoiy\s*soliq/i.test(tavsif)) dtSch = "6520";
      else if (/komissiya|bank\s*xizmat/i.test(tavsif)) dtSch = "9430";
    }
    docLines.push(`СчетДт=${dtSch}`);
    docLines.push(`СчетКт=${ktSch}`);

    docLines.push(`ВидОплаты=01`);
    docLines.push(`НазначениеПлатежа=${tavsif.replace(/\r?\n/g, " ")}`);
    docLines.push("КонецДокумента");
  });

  const closing = opening + totalKirim - totalChiqim;
  const now = new Date();
  const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");

  const header = [
    "1CClientBankExchange",
    "ВерсияФормата=1.03",
    "Кодировка=Windows",
    `Отправитель=${ourCompany}`,
    "Получатель=1С:Предприятие",
    `ДатаСоздания=${format1CDate(todayISO())}`,
    `ВремяСоздания=${timeStr}`,
    `ДатаНачала=${format1CDate(minDate)}`,
    `ДатаКонца=${format1CDate(maxDate)}`,
    `РасчСчет=${ourAccount}`,
    "СекцияРасчСчет",
    `ДатаНачала=${format1CDate(minDate)}`,
    `ДатаКонца=${format1CDate(maxDate)}`,
    `НачальныйОстаток=${opening.toFixed(2)}`,
    `ВсегоПоступило=${totalKirim.toFixed(2)}`,
    `ВсегоСписано=${totalChiqim.toFixed(2)}`,
    `КонечныйОстаток=${closing.toFixed(2)}`,
    "КонецРасчСчет"
  ];

  return [...header, ...docLines, "КонецФайла"].join("\r\n");
}

function parse1CClientBankExchange(content) {
  if (!content || typeof content !== "string") return { rows: [], opening: null };
  const lines = content.split(/\r?\n/);
  const rows = [];
  let opening = null;
  let closing = null;
  let totalIn = 0;
  let totalOut = 0;
  let dateStart = "";
  let dateEnd = "";
  let ourAccount = "";

  const ourInn = (STORE.settings?.inn || "").trim();
  const ourCompany = (STORE.settings?.companyName || "").toLowerCase().trim();

  let inAccountSection = false;
  let inDocSection = false;
  let docMap = {};

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    if (rawLine === "СекцияРасчСчет") {
      inAccountSection = true;
      continue;
    }
    if (rawLine === "КонецРасчСчет") {
      inAccountSection = false;
      continue;
    }

    if (inAccountSection) {
      const eqIdx = rawLine.indexOf("=");
      if (eqIdx > 0) {
        const key = rawLine.slice(0, eqIdx).trim();
        const val = rawLine.slice(eqIdx + 1).trim();
        if (key === "НачальныйОстаток") opening = toNum(val);
        else if (key === "КонечныйОстаток") closing = toNum(val);
        else if (key === "ВсегоПоступило") totalIn = toNum(val);
        else if (key === "ВсегоСписано") totalOut = toNum(val);
        else if (key === "ДатаНачала") dateStart = parse1CDate(val);
        else if (key === "ДатаКонца") dateEnd = parse1CDate(val);
        else if (key === "РасчСчет") ourAccount = val;
      }
      continue;
    }

    if (rawLine.startsWith("СекцияДокумент")) {
      inDocSection = true;
      docMap = {};
      continue;
    }

    if (rawLine === "КонецДокумента") {
      inDocSection = false;
      const docNo = docMap["Номер"] || "";
      const docDate = parse1CDate(docMap["Дата"] || "");
      const summa = toNum(docMap["Сумма"]);
      if (!docDate || summa <= 0) continue;

      const payerInn = (docMap["ПлательщикИНН"] || "").trim();
      const payerName = (docMap["Плательщик"] || docMap["Плательщик1"] || "").trim();
      const payerAccount = (docMap["ПлательщикРасчСчет"] || "").trim();

      const receiverInn = (docMap["ПолучательИНН"] || "").trim();
      const receiverName = (docMap["Получатель"] || docMap["Получатель1"] || "").trim();
      const receiverAccount = (docMap["ПолучательРасчСчет"] || "").trim();

      const tavsif = (docMap["НазначениеПлатежа"] || "").trim();

      let isOut = false;
      if (ourInn) {
        if (payerInn === ourInn) isOut = true;
        else if (receiverInn === ourInn) isOut = false;
        else if (ourCompany && payerName.toLowerCase().includes(ourCompany)) isOut = true;
        else if (ourCompany && receiverName.toLowerCase().includes(ourCompany)) isOut = false;
        else if (ourAccount && payerAccount === ourAccount) isOut = true;
        else if (ourAccount && receiverAccount === ourAccount) isOut = false;
        else isOut = true;
      } else if (ourCompany) {
        if (payerName.toLowerCase().includes(ourCompany)) isOut = true;
        else if (receiverName.toLowerCase().includes(ourCompany)) isOut = false;
        else isOut = true;
      } else {
        isOut = true;
      }

      const kontragent = isOut ? receiverName : payerName;
      const kontragentInn = isOut ? receiverInn : payerInn;
      const kirim = isOut ? 0 : summa;
      const chiqim = isOut ? summa : 0;
      const isService = /комиссия|komissiya|хизмат|xizmat|начисленные\s*%%|погашение\s*дебетовый\s*оборот|банк\s*хизмат|bank\s*xizmat/i.test(tavsif + " " + kontragent);

      rows.push({
        sana: docDate,
        hujjatRaqami: docNo,
        kontragent: kontragent.replace(/^["']+|["']+$/g, "").replace(/""/g, '"').trim(),
        kontragentInn: kontragentInn.replace(/\D/g, ""),
        tavsif,
        kirim,
        chiqim,
        xizmat: isService
      });
      continue;
    }

    if (inDocSection) {
      const eqIdx = rawLine.indexOf("=");
      if (eqIdx > 0) {
        const key = rawLine.slice(0, eqIdx).trim();
        const val = rawLine.slice(eqIdx + 1).trim();
        docMap[key] = val;
      }
    }
  }

  return {
    rows,
    opening,
    closing,
    totalIn,
    totalOut,
    dateStart,
    dateEnd,
    ourAccount
  };
}

function escapeXml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateCommerceMLExport(opts = {}) {
  const s = STORE.settings || {};
  const ourInn = opts.ourInn || s.inn || "000000000";
  const ourCompany = opts.ourCompany || s.companyName || "FORGET MCHJ";
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, "0")).join(":");

  const xml = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push(`<КоммерческаяИнформация ВерсияСхемы="2.09" ДатаФормирования="${dateStr}T${timeStr}">`);

  // 1. Katalog / Tovarlar
  xml.push('  <Каталог СодержитТовары="true">');
  xml.push('    <Ид>catalog-forget</Ид>');
  xml.push('    <Наименование>FORGET Tovarlar va Mahsulotlar</Наименование>');
  xml.push('    <Товары>');

  const catalogItems = [];
  const seenCatalog = new Set();

  (STORE.ombor || []).forEach((o) => {
    const nomi = (o.nomi || "").trim();
    if (!nomi || seenCatalog.has(nomi.toLowerCase())) return;
    seenCatalog.add(nomi.toLowerCase());
    catalogItems.push({
      id: o.id || `tovar-${catalogItems.length + 1}`,
      nomi,
      birlik: o.birlik || "dona",
      artikul: o.artikul || "",
      narx: toNum(o.narx),
      qqs: 12
    });
  });

  (STORE.ishlabChiqarish || []).forEach((ic) => {
    const nomi = (ic.mahsulotNomi || "").trim();
    if (!nomi || seenCatalog.has(nomi.toLowerCase())) return;
    seenCatalog.add(nomi.toLowerCase());
    catalogItems.push({
      id: ic.id || `prod-${catalogItems.length + 1}`,
      nomi,
      birlik: ic.birlik || "dona",
      artikul: ic.artikul || "",
      narx: toNum(ic.birlikTannarxi),
      qqs: 12
    });
  });

  catalogItems.forEach((item) => {
    xml.push('      <Товар>');
    xml.push(`        <Ид>${escapeXml(item.id)}</Ид>`);
    xml.push(`        <Наименование>${escapeXml(item.nomi)}</Наименование>`);
    xml.push(`        <БазоваяЕдиница Код="796" НаименованиеПолное="${escapeXml(item.birlik)}">${escapeXml(item.birlik)}</БазоваяЕдиница>`);
    if (item.artikul) xml.push(`        <Артикул>${escapeXml(item.artikul)}</Артикул>`);
    xml.push('        <СтавкиНалогов>');
    xml.push('          <СтавкаНалога>');
    xml.push('            <Наименование>НДС</Наименование>');
    xml.push(`            <Ставка>${item.qqs}</Ставка>`);
    xml.push('          </СтавкаНалога>');
    xml.push('        </СтавкиНалогов>');
    xml.push('      </Товар>');
  });
  xml.push('    </Товары>');
  xml.push('  </Каталог>');

  // 2. Kontragentlar
  xml.push('  <Контрагенты>');
  const kontragentlar = STORE.kontragentlar || [];
  kontragentlar.forEach((k) => {
    xml.push('    <Контрагент>');
    xml.push(`      <Ид>${escapeXml(k.id || k.inn || k.nomi)}</Ид>`);
    xml.push(`      <Наименование>${escapeXml(k.nomi)}</Наименование>`);
    xml.push(`      <ИНН>${escapeXml(k.inn || "")}</ИНН>`);
    xml.push(`      <ЮридическийАдрес>${escapeXml(k.manzil || "")}</ЮридическийАдрес>`);
    if (k.telefon) {
      xml.push('      <Контакты>');
      xml.push('        <Контакт>');
      xml.push('          <Тип>Телефон</Тип>');
      xml.push(`          <Значение>${escapeXml(k.telefon)}</Значение>`);
      xml.push('        </Контакт>');
      xml.push('      </Контакты>');
    }
    xml.push('    </Контрагент>');
  });
  xml.push('  </Контрагенты>');

  // 3. Hujjatlar
  xml.push('  <Документы>');

  (STORE.kirim || []).forEach((k) => {
    const total = toNum(k.jamiSumma);
    if (total <= 0) return;
    xml.push('    <Документ>');
    xml.push(`      <Ид>${escapeXml(k.id || `kirim-${k.hujjatRaqami}`)}</Ид>`);
    xml.push(`      <Номер>${escapeXml(k.hujjatRaqami || "")}</Номер>`);
    xml.push(`      <Дата>${escapeXml(k.sana || dateStr)}</Дата>`);
    xml.push('      <ХозОперация>ПоступлениеТоваров</ХозОперация>');
    xml.push('      <Роль>Покупатель</Роль>');
    xml.push('      <Валюта>UZS</Валюта>');
    xml.push(`      <Сумма>${total.toFixed(2)}</Сумма>`);
    xml.push('      <Контрагенты>');
    xml.push('        <КонтактноеЛицо>');
    xml.push(`          <Наименование>${escapeXml(k.kontragentNomi || "")}</Наименование>`);
    xml.push(`          <ИНН>${escapeXml(k.kontragentInn || "")}</ИНН>`);
    xml.push('          <Роль>Поставщик</Роль>');
    xml.push('        </КонтактноеЛицо>');
    xml.push('      </Контрагенты>');

    const omborItems = (STORE.ombor || []).filter((o) => o.kirim_id === k.id);
    if (omborItems.length) {
      xml.push('      <Товары>');
      omborItems.forEach((item) => {
        xml.push('        <Товар>');
        xml.push(`          <Ид>${escapeXml(item.id || item.nomi)}</Ид>`);
        xml.push(`          <Наименование>${escapeXml(item.nomi)}</Наименование>`);
        xml.push(`          <БазоваяЕдиница>${escapeXml(item.birlik || "dona")}</БазоваяЕдиница>`);
        xml.push(`          <Количество>${toNum(item.miqdor)}</Количество>`);
        xml.push(`          <ЦенаЗаЕдиницу>${toNum(item.narx).toFixed(2)}</ЦенаЗаЕдиницу>`);
        xml.push(`          <Сумма>${toNum(item.summa).toFixed(2)}</Сумма>`);
        xml.push('        </Товар>');
      });
      xml.push('      </Товары>');
    }
    xml.push('    </Документ>');
  });

  (STORE.chiqim || []).forEach((c) => {
    const total = toNum(c.jamiSumma);
    if (total <= 0) return;
    xml.push('    <Документ>');
    xml.push(`      <Ид>${escapeXml(c.id || `chiqim-${c.hujjatRaqami}`)}</Ид>`);
    xml.push(`      <Номер>${escapeXml(c.hujjatRaqami || "")}</Номер>`);
    xml.push(`      <Дата>${escapeXml(c.sana || dateStr)}</Дата>`);
    xml.push('      <ХозОперация>РеализацияТоваров</ХозОперация>');
    xml.push('      <Роль>Продавец</Роль>');
    xml.push('      <Валюта>UZS</Валюта>');
    xml.push(`      <Сумма>${total.toFixed(2)}</Сумма>`);
    xml.push('      <Контрагенты>');
    xml.push('        <КонтактноеЛицо>');
    xml.push(`          <Наименование>${escapeXml(c.kontragentNomi || "")}</Наименование>`);
    xml.push(`          <ИНН>${escapeXml(c.kontragentInn || "")}</ИНН>`);
    xml.push('          <Роль>Покупатель</Роль>');
    xml.push('        </КонтактноеЛицо>');
    xml.push('      </Контрагенты>');
    xml.push('    </Документ>');
  });

  (STORE.kassa || []).forEach((ks) => {
    const summa = toNum(ks.summa);
    if (summa <= 0) return;
    const isKirim = ks.turi === "kirim";
    xml.push('    <Документ>');
    xml.push(`      <Ид>${escapeXml(ks.id || `kassa-${ks.hujjatRaqami || ""}`)}</Ид>`);
    xml.push(`      <Номер>${escapeXml(ks.hujjatRaqami || "")}</Номер>`);
    xml.push(`      <Дата>${escapeXml(ks.sana || dateStr)}</Дата>`);
    xml.push(`      <ХозОперация>${isKirim ? "ПриходныйКассовыйОрдер" : "РасходныйКассовыйОрдер"}</ХозОперация>`);
    xml.push(`      <Сумма>${summa.toFixed(2)}</Сумма>`);
    xml.push(`      <Комментарий>${escapeXml(ks.tavsif || "")}</Комментарий>`);
    if (ks.kontragent) {
      xml.push('      <Контрагенты>');
      xml.push('        <КонтактноеЛицо>');
      xml.push(`          <Наименование>${escapeXml(ks.kontragent)}</Наименование>`);
      xml.push(`          <ИНН>${escapeXml(ks.kontragentInn || "")}</ИНН>`);
      xml.push('        </КонтактноеЛицо>');
      xml.push('      </Контрагенты>');
    }
    xml.push('    </Документ>');
  });

  xml.push('  </Документы>');
  xml.push('</КоммерческаяИнформация>');

  return xml.join("\r\n");
}

function parseCommerceML(xmlString) {
  if (!xmlString || typeof xmlString !== "string") {
    return { kontragentlar: [], tovarlar: [], hujjatlar: [] };
  }

  function getTagVal(xmlChunk, tagName) {
    const re = new RegExp("<" + tagName + "(?:\\s+[^>]*)?>([\\s\\S]*?)</" + tagName + ">", "i");
    const m = xmlChunk.match(re);
    return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim() : "";
  }

  function getTagBlocks(xmlChunk, tagName) {
    const re = new RegExp("<" + tagName + "(?:\\s+[^>]*)?>([\\s\\S]*?)</" + tagName + ">", "gi");
    const matches = [];
    let m;
    while ((m = re.exec(xmlChunk)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  }

  const kontragentlar = [];
  const tovarlar = [];
  const hujjatlar = [];

  const seenK = new Set();
  const kSection = getTagVal(xmlString, "Контрагенты");
  const kBlocks = getTagBlocks(kSection || xmlString, "Контрагент");
  kBlocks.forEach((kb) => {
    const inn = getTagVal(kb, "ИНН").replace(/\D/g, "");
    const nomi = getTagVal(kb, "Наименование");
    const manzil = getTagVal(kb, "ЮридическийАдрес");
    const tel = getTagVal(kb, "Значение") || getTagVal(kb, "Телефон");
    const key = (inn || nomi).toLowerCase();
    if ((nomi || inn) && !seenK.has(key)) {
      seenK.add(key);
      kontragentlar.push({ inn, nomi, manzil, telefon: tel });
    }
  });

  const seenT = new Set();
  const catalogSection = getTagVal(xmlString, "Каталог");
  const tBlocks = getTagBlocks(catalogSection || xmlString, "Товар");
  tBlocks.forEach((tb) => {
    const id = getTagVal(tb, "Ид");
    const nomi = getTagVal(tb, "Наименование");
    const birlik = getTagVal(tb, "БазоваяЕдиница") || "dona";
    const artikul = getTagVal(tb, "Артикул");
    const qqs = toNum(getTagVal(tb, "Ставка")) || 12;
    const key = (nomi || id).toLowerCase();
    if (nomi && !seenT.has(key)) {
      seenT.add(key);
      tovarlar.push({ id, nomi, birlik, artikul, qqs });
    }
  });

  const dBlocks = getTagBlocks(xmlString, "Документ");
  dBlocks.forEach((db) => {
    const docNo = getTagVal(db, "Номер");
    const docDate = normalizeDate(getTagVal(db, "Дата"));
    const op = getTagVal(db, "ХозОперация");
    const role = getTagVal(db, "Роль");
    const jamiSumma = toNum(getTagVal(db, "Сумма"));

    let turi = "kirim";
    if (/реализация|продаж|расходный/i.test(op) || /продавец/i.test(role)) {
      turi = /кассов/i.test(op) ? "kassa_chiqim" : "chiqim";
    } else if (/кассов|приходный/i.test(op)) {
      turi = "kassa_kirim";
    }

    const kontrName = getTagVal(db, "Наименование");
    const kontrInn = getTagVal(db, "ИНН").replace(/\D/g, "");
    const tavsif = getTagVal(db, "Комментарий") || op;

    const itemBlocks = getTagBlocks(db, "Товар");
    const items = itemBlocks.map((ib) => ({
      nomi: getTagVal(ib, "Наименование"),
      miqdor: toNum(getTagVal(ib, "Количество")),
      narx: toNum(getTagVal(ib, "ЦенаЗаЕдиницу")),
      summa: toNum(getTagVal(ib, "Сумма")),
      birlik: getTagVal(ib, "БазоваяЕдиница") || "dona"
    })).filter((it) => it.nomi);

    hujjatlar.push({
      turi,
      hujjatRaqami: docNo,
      sana: docDate,
      kontragentNomi: kontrName,
      kontragentInn: kontrInn,
      jamiSumma,
      tavsif,
      items
    });
  });

  return { kontragentlar, tovarlar, hujjatlar };
}

function generate1CEnterpriseJson(opts = {}) {
  const s = STORE.settings || {};
  return {
    format: "FORGET_1C_EnterpriseData",
    version: "1.0",
    exportDate: new Date().toISOString(),
    company: {
      inn: opts.ourInn || s.inn || "",
      name: opts.ourCompany || s.companyName || "",
      period: s.period || "",
      openingBalance: toNum(s.bankOpeningBalance)
    },
    counterparties: (STORE.kontragentlar || []).map((k) => ({
      inn: k.inn || "",
      name: k.nomi || "",
      category: k.kategoriya || "",
      phone: k.telefon || "",
      address: k.manzil || ""
    })),
    nomenclature: (STORE.ombor || []).map((o) => ({
      name: o.nomi || "",
      unit: o.birlik || "dona",
      price: toNum(o.narx),
      quantity: toNum(o.miqdor)
    })),
    invoices: [
      ...(STORE.kirim || []).map((k) => ({
        type: "incoming",
        number: k.hujjatRaqami || "",
        date: k.sana || "",
        counterpartyInn: k.kontragentInn || "",
        counterpartyName: k.kontragentNomi || "",
        amountWithoutVat: toNum(k.summaQQSsiz),
        vatRate: toNum(k.qqsStavka),
        vatAmount: toNum(k.qqsSumma),
        totalAmount: toNum(k.jamiSumma),
        status: k.status || "Подписан"
      })),
      ...(STORE.chiqim || []).map((c) => ({
        type: "outgoing",
        number: c.hujjatRaqami || "",
        date: c.sana || "",
        counterpartyInn: c.kontragentInn || "",
        counterpartyName: c.kontragentNomi || "",
        amountWithoutVat: toNum(c.summaQQSsiz),
        vatRate: toNum(c.qqsStavka),
        vatAmount: toNum(c.qqsSumma),
        totalAmount: toNum(c.jamiSumma),
        status: c.status || "Подписан"
      }))
    ],
    bankPayments: (STORE.bank || []).map((b) => ({
      date: b.sana || "",
      number: b.hujjatRaqami || "",
      counterparty: b.kontragent || "",
      counterpartyInn: b.kontragentInn || "",
      incoming: toNum(b.kirim),
      outgoing: toNum(b.chiqim),
      description: b.tavsif || "",
      isService: !!b.xizmat
    })),
    cashOrders: (STORE.kassa || []).map((ks) => ({
      date: ks.sana || "",
      number: ks.hujjatRaqami || "",
      type: ks.turi || "kirim",
      counterparty: ks.kontragent || "",
      counterpartyInn: ks.kontragentInn || "",
      amount: toNum(ks.summa),
      description: ks.tavsif || ""
    }))
  };
}

function parse1CEnterpriseJson(data) {
  if (!data || typeof data !== "object") return null;
  const counterparties = (data.counterparties || []).map((k) => ({
    inn: String(k.inn || "").trim(),
    nomi: String(k.name || "").trim(),
    kategoriya: k.category || "Boshqa",
    telefon: k.phone || "",
    manzil: k.address || ""
  }));

  const invoices = (data.invoices || []).map((inv) => ({
    turi: inv.type === "outgoing" ? "chiqim" : "kirim",
    hujjatRaqami: String(inv.number || "").trim(),
    sana: normalizeDate(inv.date),
    kontragentInn: String(inv.counterpartyInn || "").trim(),
    kontragentNomi: String(inv.counterpartyName || "").trim(),
    summaQQSsiz: toNum(inv.amountWithoutVat),
    qqsStavka: toNum(inv.vatRate) || 12,
    qqsSumma: toNum(inv.vatAmount),
    jamiSumma: toNum(inv.totalAmount),
    status: inv.status || "Подписан"
  }));

  const bankPayments = (data.bankPayments || []).map((b) => ({
    sana: normalizeDate(b.date),
    hujjatRaqami: String(b.number || "").trim(),
    kontragent: String(b.counterparty || "").trim(),
    kontragentInn: String(b.counterpartyInn || "").trim(),
    kirim: toNum(b.incoming),
    chiqim: toNum(b.outgoing),
    tavsif: String(b.description || "").trim(),
    xizmat: !!b.isService
  }));

  const cashOrders = (data.cashOrders || []).map((ks) => ({
    sana: normalizeDate(ks.date),
    hujjatRaqami: String(ks.number || "").trim(),
    turi: ks.type === "chiqim" ? "chiqim" : "kirim",
    kontragent: String(ks.counterparty || "").trim(),
    kontragentInn: String(ks.counterpartyInn || "").trim(),
    summa: toNum(ks.amount),
    tavsif: String(ks.description || "").trim()
  }));

  return { counterparties, invoices, bankPayments, cashOrders, company: data.company || {} };
}

/* ------------------------------- Avtomatik Backup (Excel & JSON) ------------------------------- */

function exportFullBackupXlsx() {
  if (typeof XLSX === "undefined") {
    toast("Excel kutubxonasi mavjud emas", "err");
    return;
  }
  const s = STORE.settings || {};
  const wb = XLSX.utils.book_new();

  // 1. Sozlamalar
  const settingsData = [
    ["Parametr", "Qiymat"],
    ["Kompaniya nomi", s.companyName || ""],
    ["INN", s.inn || ""],
    ["Manzil", s.address || ""],
    ["Hisobot davri", s.period || ""],
    ["Rahbar", s.rahbar || ""],
    ["Bank boshlang'ich qoldiq", toNum(s.bankOpeningBalance)],
    ["QQS stavkasi (%)", toNum(s.qqsStavka)],
    ["Foyda solig'i stavkasi (%)", toNum(s.foydaStavka)],
    ["Davr xarajatlari", toNum(s.davrXarajati)],
    ["Moliyaviy xarajatlar", toNum(s.moliyaviyXarajat)],
    ["Tannarx usuli", s.tannarxUsuli || "fifo"],
    ["Faoliyat yo'nalishi", s.yonalish || ""],
    ["Zaxira sanasi", todayISO()]
  ];
  const wsSettings = XLSX.utils.aoa_to_sheet(settingsData);
  XLSX.utils.book_append_sheet(wb, wsSettings, "Sozlamalar");

  // 2. Kirim fakturalar
  const kirimData = [
    ["Sana", "Hujjat №", "Kontragent", "INN", "QQSsiz", "QQS stavka", "QQS summa", "Jami summa", "Status", "To'langan", "Qarz", "To'lov holati"]
  ];
  (STORE.kirim || []).forEach((r) => {
    kirimData.push([
      r.sana || "", r.hujjatRaqami || "", r.kontragentNomi || "", r.kontragentInn || "",
      toNum(r.summaQQSsiz), toNum(r.qqsStavka), toNum(r.qqsSumma), toNum(r.jamiSumma),
      r.status || "", toNum(r.tolandi), toNum(r.qarz), r.tolovHolati || ""
    ]);
  });
  const wsKirim = XLSX.utils.aoa_to_sheet(kirimData);
  XLSX.utils.book_append_sheet(wb, wsKirim, "Kirim");

  // 3. Chiqim fakturalar
  const chiqimData = [
    ["Sana", "Hujjat №", "Xaridor", "INN", "QQSsiz", "QQS stavka", "QQS summa", "Jami summa", "Status", "To'langan", "Qarz", "To'lov holati"]
  ];
  (STORE.chiqim || []).forEach((r) => {
    chiqimData.push([
      r.sana || "", r.hujjatRaqami || "", r.kontragentNomi || "", r.kontragentInn || "",
      toNum(r.summaQQSsiz), toNum(r.qqsStavka), toNum(r.qqsSumma), toNum(r.jamiSumma),
      r.status || "", toNum(r.tolandi), toNum(r.qarz), r.tolovHolati || ""
    ]);
  });
  const wsChiqim = XLSX.utils.aoa_to_sheet(chiqimData);
  XLSX.utils.book_append_sheet(wb, wsChiqim, "Chiqim");

  // 4. Bank
  const bankData = [
    ["Sana", "Hujjat №", "Schyot", "Valyuta", "Valyuta summasi", "MB Kursi", "Kontragent", "INN", "Tavsif", "Kirim (UZS)", "Chiqim (UZS)", "Xizmat"]
  ];
  (STORE.bank || []).forEach((r) => {
    bankData.push([
      r.sana || "", r.hujjatRaqami || "", r.schyot || "5110", r.valyuta || "UZS",
      toNum(r.valyutaSumma), toNum(r.kurs) || 1, r.kontragent || "", r.kontragentInn || "",
      r.tavsif || "", toNum(r.kirim), toNum(r.chiqim), r.xizmat ? "Ha" : "Yo'q"
    ]);
  });
  const wsBank = XLSX.utils.aoa_to_sheet(bankData);
  XLSX.utils.book_append_sheet(wb, wsBank, "Bank");

  // 5. Kassa
  const kassaData = [
    ["Sana", "Hujjat №", "Turi", "Kontragent", "INN", "Tavsif", "Summa"]
  ];
  (STORE.kassa || []).forEach((r) => {
    kassaData.push([
      r.sana || "", r.hujjatRaqami || "", r.turi || "", r.kontragent || "",
      r.kontragentInn || "", r.tavsif || "", toNum(r.summa)
    ]);
  });
  const wsKassa = XLSX.utils.aoa_to_sheet(kassaData);
  XLSX.utils.book_append_sheet(wb, wsKassa, "Kassa");

  // 6. Ombor
  const omborData = [
    ["Sana", "Nomi", "Birlik", "Kirim miqdori", "Xarid narxi", "Qoldiq miqdori", "Summa", "Faktura ID"]
  ];
  (STORE.ombor || []).forEach((r) => {
    omborData.push([
      r.sana || "", r.nomi || "", r.birlik || "", toNum(r.miqdor),
      toNum(r.narx), toNum(r.qoldiq != null ? r.qoldiq : r.miqdor),
      toNum(r.summa), r.kirim_id || ""
    ]);
  });
  const wsOmbor = XLSX.utils.aoa_to_sheet(omborData);
  XLSX.utils.book_append_sheet(wb, wsOmbor, "Ombor");

  // 7. Kontragentlar
  const kontrData = [
    ["INN", "Nomi", "Kategoriya", "Telefon", "Manzil", "Izoh"]
  ];
  (STORE.kontragentlar || []).forEach((r) => {
    kontrData.push([
      r.inn || "", r.nomi || "", r.kategoriya || "", r.telefon || "",
      r.manzil || "", r.izoh || ""
    ]);
  });
  const wsKontr = XLSX.utils.aoa_to_sheet(kontrData);
  XLSX.utils.book_append_sheet(wb, wsKontr, "Kontragentlar");

  // 8. Ishlab chiqarish
  const icData = [
    ["Sana", "Hujjat №", "Mahsulot", "Birlik", "Miqdor", "Tannarx (jami)", "Birlik tannarxi"]
  ];
  (STORE.ishlabChiqarish || []).forEach((r) => {
    icData.push([
      r.sana || "", r.hujjatRaqami || "", r.mahsulotNomi || "", r.birlik || "",
      toNum(r.miqdor), toNum(r.tannarxJami), toNum(r.birlikTannarxi)
    ]);
  });
  const wsIc = XLSX.utils.aoa_to_sheet(icData);
  XLSX.utils.book_append_sheet(wb, wsIc, "Ishlab_chiqarish");

  // 9. Qayta ishlash
  const qiData = [
    ["Sana", "Hujjat №", "Mijoz", "INN", "Xizmat tavsifi", "Summa"]
  ];
  (STORE.qaytaIshlash || []).forEach((r) => {
    qiData.push([
      r.sana || "", r.hujjatRaqami || "", r.mijoz || "", r.inn || "",
      r.tavsif || "", toNum(r.summa)
    ]);
  });
  const wsQi = XLSX.utils.aoa_to_sheet(qiData);
  XLSX.utils.book_append_sheet(wb, wsQi, "Qayta_ishlash");

  // 10. Ish haqi
  const ihData = [
    ["Xodim", "Lavozim", "Oklad", "Mukofot", "Jami hisoblangan", "NDFL", "INPS", "Ijtimoiy soliq", "Qo'lga tegadigan"]
  ];
  (STORE.ishHaqi || []).forEach((r) => {
    ihData.push([
      r.xodim || "", r.lavozim || "", toNum(r.oklad), toNum(r.mukofot),
      toNum(r.jamiHisoblangan), toNum(r.ndfl), toNum(r.inps),
      toNum(r.ijtimoiySoliq), toNum(r.qolgaTegadigan)
    ]);
  });
  const wsIh = XLSX.utils.aoa_to_sheet(ihData);
  XLSX.utils.book_append_sheet(wb, wsIh, "Ish_haqi");

  // 11. Asosiy vositalar
  const avData = [
    ["Nomi", "Inventar №", "Sana", "Boshlang'ich qiymat", "Guruh", "Amortizatsiya stavkasi (%)", "Jamg'arilgan amortizatsiya", "Qoldiq qiymat"]
  ];
  (STORE.asosiyVositalar || []).forEach((r) => {
    avData.push([
      r.nomi || "", r.inventarRaqam || "", r.sana || "", toNum(r.boshlangichQiymat),
      r.guruh || "", toNum(r.amortizatsiyaStavkasi), toNum(r.jamgAmortizatsiya), toNum(r.qoldiqQiymat)
    ]);
  });
  const wsAv = XLSX.utils.aoa_to_sheet(avData);
  XLSX.utils.book_append_sheet(wb, wsAv, "Asosiy_vositalar");

  const fileName = `FORGET_Backup_TOLIQ_${todayISO()}.xlsx`;
  XLSX.writeFile(wb, fileName);

  try {
    localStorage.setItem("forget_last_backup_date", new Date().toISOString());
  } catch (e) {}

  toast("To'liq 11 varaqli Excel zaxira nusxasi yuklab olindi!");
}

function exportFullBackupJson() {
  const s = STORE.settings || {};
  const backupData = {
    format: "FORGET_Full_Backup",
    version: "2.0",
    backupDate: new Date().toISOString(),
    firmaId: typeof ACTIVE_FIRMA_ID !== "undefined" ? ACTIVE_FIRMA_ID : null,
    company: {
      name: s.companyName || "",
      inn: s.inn || "",
      period: s.period || ""
    },
    store: STORE
  };
  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `FORGET_Backup_Snapshot_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);

  try {
    localStorage.setItem("forget_last_backup_date", new Date().toISOString());
  } catch (e) {}

  toast("To'liq tizim holati (JSON) yuklab olindi!");
}

function checkBackupReminder() {
  let lastDateStr = null;
  try {
    lastDateStr = localStorage.getItem("forget_last_backup_date");
  } catch (e) {}

  if (!lastDateStr) {
    return { needsBackup: true, daysSince: null, lastDate: null };
  }

  const lastTime = new Date(lastDateStr).getTime();
  if (isNaN(lastTime)) {
    return { needsBackup: true, daysSince: null, lastDate: null };
  }

  const daysSince = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));
  return {
    needsBackup: daysSince >= 7,
    daysSince,
    lastDate: lastDateStr.split("T")[0]
  };
}

/* 1C:Korxona Sinxronlash Modali */
function open1CExchangeModal(initialTab = "bank") {
  const s = STORE.settings || {};
  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <h3 style="margin:0;display:flex;align-items:center;gap:8px;">
        <span class="badge-1c">1C:Korxona / 1UZ</span> Ma'lumotlar almashinuvi
      </h3>
      <span class="badge" style="background:var(--bg-hover);color:var(--text-dim);font-size:11px;">1C 8.3 / CommerceML / Klient-Bank</span>
    </div>
    <p class="modal-sub" style="margin-bottom:14px;">FORGET va 1C:Бухгалтерия 8.3 / УТ / УНФ o'rtasida to'lovlar, schyot-fakturalar va tovarlar katalogini ikki tomonlama sinxronlash.</p>

    <div class="tabs" id="modal1CTabs" style="margin-bottom:16px;">
      <button class="tab-btn ${initialTab === "bank" ? "active" : ""}" data-tab="bank">1. Klient-Bank (.txt)</button>
      <button class="tab-btn ${initialTab === "commerceml" ? "active" : ""}" data-tab="commerceml">2. CommerceML 2.0 (.xml)</button>
      <button class="tab-btn ${initialTab === "json" ? "active" : ""}" data-tab="json">3. EnterpriseData (.json)</button>
    </div>

    <!-- TAB 1: Klient-Bank -->
    <div class="tab-pane ${initialTab === "bank" ? "active" : ""}" id="pane1CBank">
      <div class="sync-card-grid">
        <div class="sync-card">
          <div>
            <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#i-out"/></svg> 1C uchun eksport</div>
            <div class="desc">Bank operatsiyalarini 1C:Korxonaga yuklash uchun standart <code>kl_to_1c.txt</code> faylini yaratish.</div>
          </div>
          <button class="btn btn-primary" id="btn1CExportBank">Eksport (kl_to_1c.txt)</button>
        </div>
        <div class="sync-card">
          <div>
            <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#i-in"/></svg> 1C dan import</div>
            <div class="desc">1C yoki Klient-Bankdan olingan <code>1c_to_kl.txt</code> yoki <code>kl_to_1c.txt</code> ko'chirmasini yuklash.</div>
          </div>
          <button class="btn btn-secondary" id="btn1CTriggerBankImport">Faylni tanlash (.txt)</button>
          <input type="file" id="file1CBankInput" accept=".txt" style="display:none;">
        </div>
      </div>
      <div class="note">Format: 1CClientBankExchange v1.03. Payer/Payee INN va hisob raqamlari bo'yicha kirim/chiqim avtomatik ajratiladi.</div>
    </div>

    <!-- TAB 2: CommerceML 2.0 XML -->
    <div class="tab-pane ${initialTab === "commerceml" ? "active" : ""}" id="pane1CCommerceML">
      <div class="sync-card-grid">
        <div class="sync-card">
          <div>
            <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg> CommerceML Eksport</div>
            <div class="desc">Kontragentlar, tovarlar katalogi, schyot-fakturalar (Kirim/Chiqim) va kassa orderlarini CommerceML 2.0 XML formatida yuklab olish.</div>
          </div>
          <button class="btn btn-primary" id="btn1CExportXml">XML yuklab olish</button>
        </div>
        <div class="sync-card">
          <div>
            <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#i-cloud-download"/></svg> CommerceML Import</div>
            <div class="desc">1C dan eksport qilingan CommerceML 2.0 XML faylini yuklab, kontragentlar va fakturalarni bazaga kiritish.</div>
          </div>
          <button class="btn btn-secondary" id="btn1CTriggerXmlImport">Faylni tanlash (.xml)</button>
          <input type="file" id="file1CXmlInput" accept=".xml" style="display:none;">
        </div>
      </div>
      <div class="note">1C:Бухгалтерия 8.3, Управление торговлей va 1UZ dasturlarining standart XML formati.</div>
    </div>

    <!-- TAB 3: EnterpriseData JSON -->
    <div class="tab-pane ${initialTab === "json" ? "active" : ""}" id="pane1CJson">
      <div class="sync-card-grid">
        <div class="sync-card">
          <div>
            <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#i-database"/></svg> JSON Eksport</div>
            <div class="desc">Barcha operatsiyalar va ma'lumotnomalarni 1C REST / EnterpriseData JSON formatida yuklab olish.</div>
          </div>
          <button class="btn btn-primary" id="btn1CExportJson">JSON yuklab olish</button>
        </div>
        <div class="sync-card">
          <div>
            <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#i-in"/></svg> JSON Import</div>
            <div class="desc">1C dan olingan EnterpriseData JSON faylini FORGET tizimiga yuklash.</div>
          </div>
          <button class="btn btn-secondary" id="btn1CTriggerJsonImport">Faylni tanlash (.json)</button>
          <input type="file" id="file1CJsonInput" accept=".json" style="display:none;">
        </div>
      </div>
      <div class="note">Zamonaviy JSON protokoli orqali 1C 8.3 bazasi bilan oson va tezkor ma'lumot almashish imkonini beradi.</div>
    </div>

    <div class="modal-actions" style="margin-top:16px;">
      <button class="btn" id="mCancel">Yopish</button>
    </div>
  `);

  document.getElementById("mCancel").addEventListener("click", closeModal);

  const tabs = document.getElementById("modal1CTabs");
  if (tabs) {
    tabs.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const targetTab = btn.dataset.tab;
        const root = document.getElementById("modalRoot");
        if (root) {
          root.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
          if (targetTab === "bank") root.querySelector("#pane1CBank")?.classList.add("active");
          else if (targetTab === "commerceml") root.querySelector("#pane1CCommerceML")?.classList.add("active");
          else if (targetTab === "json") root.querySelector("#pane1CJson")?.classList.add("active");
        }
      });
    });
  }

  // Tab 1: Bank
  const btn1CExportBank = document.getElementById("btn1CExportBank");
  if (btn1CExportBank) {
    btn1CExportBank.addEventListener("click", () => {
      const text = generate1CClientBankExport(STORE.bank);
      const blob = new Blob([text], { type: "text/plain;charset=windows-1251" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kl_to_1c_${todayISO()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast("kl_to_1c.txt fayli yuklab olindi (1C Klient-Bank formati)");
    });
  }

  const file1CBankInput = document.getElementById("file1CBankInput");
  const btn1CTriggerBankImport = document.getElementById("btn1CTriggerBankImport");
  if (file1CBankInput && btn1CTriggerBankImport) {
    btn1CTriggerBankImport.addEventListener("click", () => file1CBankInput.click());
    file1CBankInput.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (f) {
        closeModal();
        await handleBankImport(f);
      }
    });
  }

  // Tab 2: CommerceML XML
  const btn1CExportXml = document.getElementById("btn1CExportXml");
  if (btn1CExportXml) {
    btn1CExportXml.addEventListener("click", () => {
      const xml = generateCommerceMLExport();
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `forget_1c_commerceml_${todayISO()}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast("CommerceML 2.0 XML fayli yuklab olindi");
    });
  }

  const file1CXmlInput = document.getElementById("file1CXmlInput");
  const btn1CTriggerXmlImport = document.getElementById("btn1CTriggerXmlImport");
  if (file1CXmlInput && btn1CTriggerXmlImport) {
    btn1CTriggerXmlImport.addEventListener("click", () => file1CXmlInput.click());
    file1CXmlInput.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const xmlStr = await f.text();
        const parsed = parseCommerceML(xmlStr);
        let addedK = 0;
        if (parsed.kontragentlar.length) {
          for (const k of parsed.kontragentlar) {
            if (k.inn || k.nomi) {
              await ensureKontragentAutoAdded(k.inn, k.nomi, { manzil: k.manzil, telefon: k.telefon });
              addedK++;
            }
          }
        }
        toast(`CommerceML import: ${addedK} ta kontragent, ${parsed.hujjatlar.length} ta hujjat qayta ishlandi`);
        closeModal();
        renderKontragentlar();
      } catch (err) {
        console.error(err);
        toast("CommerceML XML faylni o'qishda xatolik: " + err.message, "err");
      }
    });
  }

  // Tab 3: EnterpriseData JSON
  const btn1CExportJson = document.getElementById("btn1CExportJson");
  if (btn1CExportJson) {
    btn1CExportJson.addEventListener("click", () => {
      const data = generate1CEnterpriseJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `forget_1c_enterprisedata_${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast("1C EnterpriseData JSON fayli yuklab olindi");
    });
  }

  const file1CJsonInput = document.getElementById("file1CJsonInput");
  const btn1CTriggerJsonImport = document.getElementById("btn1CTriggerJsonImport");
  if (file1CJsonInput && btn1CTriggerJsonImport) {
    btn1CTriggerJsonImport.addEventListener("click", () => file1CJsonInput.click());
    file1CJsonInput.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const parsedRaw = JSON.parse(text);
        const parsed = parse1CEnterpriseJson(parsedRaw);
        if (!parsed) {
          toast("Fayl formati yaroqsiz", "err");
          return;
        }
        let addedK = 0;
        for (const k of parsed.counterparties) {
          if (k.inn || k.nomi) {
            await ensureKontragentAutoAdded(k.inn, k.nomi, { manzil: k.manzil, telefon: k.telefon });
            addedK++;
          }
        }
        toast(`EnterpriseData import: ${addedK} ta kontragent muvaffaqiyatli saqlandi`);
        closeModal();
        renderKontragentlar();
      } catch (err) {
        console.error(err);
        toast("JSON faylni o'qishda xatolik: " + err.message, "err");
      }
    });
  }
}

/* ------------------------------- Markaziy Bank (CBU) & Ko'p Valyutali Hisob (5210) ------------------------------- */
// O'zbekiston Respublikasi Markaziy Banki (CBU) rasmiy API integratsiyasi
// va BHMS 22 "Xorijiy valyutada ifodalangan aktivlar va majburiyatlarning hisobi"
// standarti bo'yicha valyuta hisobvarag'i (5210) hamda kurs farqlari (9540/9640) hisoblagichi.

const CBU_FALLBACK_RATES = {
  USD: { ccy: "USD", rate: 12850, diff: "0.00", date: todayISO(), name: "AQSH dollari", code: "840" },
  EUR: { ccy: "EUR", rate: 13900, diff: "0.00", date: todayISO(), name: "Yevro", code: "978" },
  RUB: { ccy: "RUB", rate: 140, diff: "0.00", date: todayISO(), name: "Rossiya rubli", code: "643" }
};

let CBU_RATES_CACHE = {}; // YYYY-MM-DD -> Array of CBU items

function normalizeCbuRateItem(item) {
  if (!item) return null;
  const ccy = String(item.Ccy || item.ccy || "").trim().toUpperCase();
  const rate = toNum(item.Rate || item.rate || 0);
  if (!ccy || rate <= 0) return null;
  const rawDiff = String(item.Diff || item.diff || "0.00").trim().replace(",", ".");
  const diff = rawDiff || "0.00";
  const date = item.Date || item.date || todayISO();
  const code = String(item.Code || item.code || "").trim();
  const name = item.CcyNm_UZ || item.CcyNm_RU || item.name || ccy;
  return { ccy, rate, diff, date, code, name };
}

async function fetchCbuRates(dateStr) {
  const date = (dateStr || todayISO()).trim();
  if (CBU_RATES_CACHE[date] && CBU_RATES_CACHE[date].length) {
    return CBU_RATES_CACHE[date];
  }
  // LocalStorage keshidan tekshirish
  try {
    const cached = localStorage.getItem("forget_cbu_rates_" + date);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) {
        CBU_RATES_CACHE[date] = parsed.map(normalizeCbuRateItem);
        return CBU_RATES_CACHE[date];
      }
    }
  } catch (e) {}

  // 1) /api/cbu serverless proksi
  try {
    const resp = await fetch(`/api/cbu?date=${encodeURIComponent(date)}`);
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json) && json.length) {
        const normalized = json.map(normalizeCbuRateItem);
        CBU_RATES_CACHE[date] = normalized;
        try { localStorage.setItem("forget_cbu_rates_" + date, JSON.stringify(normalized)); } catch (e) {}
        return normalized;
      }
    }
  } catch (err) {}

  // 2) To'g'ridan-to'g'ri CBU rasmiy API
  try {
    const url = `https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/${encodeURIComponent(date)}/`;
    const resp = await fetch(url);
    if (resp.ok) {
      const json = await resp.json();
      if (Array.isArray(json) && json.length) {
        const normalized = json.map(normalizeCbuRateItem);
        CBU_RATES_CACHE[date] = normalized;
        try { localStorage.setItem("forget_cbu_rates_" + date, JSON.stringify(normalized)); } catch (e) {}
        return normalized;
      }
    }
  } catch (err) {}

  // 3) Fallback
  const fallbackList = Object.values(CBU_FALLBACK_RATES).map((f) => ({ ...f, date }));
  CBU_RATES_CACHE[date] = fallbackList;
  return fallbackList;
}

function getCbuRate(ccy, dateStr) {
  if (!ccy || ccy.toUpperCase() === "UZS") return 1;
  const code = ccy.toUpperCase();
  const date = (dateStr || todayISO()).trim();
  const list = CBU_RATES_CACHE[date] || [];
  const found = list.find((c) => c.ccy === code);
  if (found && found.rate > 0) return found.rate;
  if (CBU_FALLBACK_RATES[code]) return CBU_FALLBACK_RATES[code].rate;
  return 1;
}

function getCbuDiff(ccy, dateStr) {
  if (!ccy || ccy.toUpperCase() === "UZS") return "0.00";
  const code = ccy.toUpperCase();
  const date = (dateStr || todayISO()).trim();
  const list = CBU_RATES_CACHE[date] || [];
  const found = list.find((c) => c.ccy === code);
  return found ? found.diff : "0.00";
}

function convertCbuCurrency(amount, fromCcy, toCcy, customRate) {
  const amt = toNum(amount);
  if (!amt) return 0;
  const f = (fromCcy || "UZS").toUpperCase();
  const t = (toCcy || "UZS").toUpperCase();
  if (f === t) return amt;

  if (f === "UZS") {
    const rate = customRate || getCbuRate(t);
    return rate > 0 ? amt / rate : 0;
  }
  if (t === "UZS") {
    const rate = customRate || getCbuRate(f);
    return amt * rate;
  }
  const uzsAmt = amt * (customRate || getCbuRate(f));
  const toRate = getCbuRate(t);
  return toRate > 0 ? uzsAmt / toRate : 0;
}

async function updateCbuTopbarWidget() {
  const wrap = document.getElementById("topbarCurrencyWidget");
  if (!wrap) return;
  try {
    await fetchCbuRates();
    const usdRate = getCbuRate("USD");
    const usdDiff = getCbuDiff("USD");
    const eurRate = getCbuRate("EUR");
    const eurDiff = getCbuDiff("EUR");
    const rubRate = getCbuRate("RUB");
    const rubDiff = getCbuDiff("RUB");

    const elUsd = document.getElementById("cbuUsdRate");
    const elUsdDiff = document.getElementById("cbuUsdDiff");
    const elEur = document.getElementById("cbuEurRate");
    const elEurDiff = document.getElementById("cbuEurDiff");
    const elRub = document.getElementById("cbuRubRate");
    const elRubDiff = document.getElementById("cbuRubDiff");

    if (elUsd) elUsd.textContent = fmt(Math.round(usdRate));
    if (elUsdDiff) {
      const d = toNum(usdDiff);
      elUsdDiff.textContent = (d > 0 ? "▲ +" : d < 0 ? "▼ " : "") + usdDiff;
      elUsdDiff.className = "cbu-diff " + (d > 0 ? "up" : d < 0 ? "down" : "");
    }
    if (elEur) elEur.textContent = fmt(Math.round(eurRate));
    if (elEurDiff) {
      const d = toNum(eurDiff);
      elEurDiff.textContent = (d > 0 ? "▲ +" : d < 0 ? "▼ " : "") + eurDiff;
      elEurDiff.className = "cbu-diff " + (d > 0 ? "up" : d < 0 ? "down" : "");
    }
    if (elRub) elRub.textContent = fmt(Math.round(rubRate * 100) / 100);
    if (elRubDiff) {
      const d = toNum(rubDiff);
      elRubDiff.textContent = (d > 0 ? "▲ +" : d < 0 ? "▼ " : "") + rubDiff;
      elRubDiff.className = "cbu-diff " + (d > 0 ? "up" : d < 0 ? "down" : "");
    }
  } catch (e) {
    console.warn("CBU Topbar widget error:", e);
  }
}

// BHMS 22 bo'yicha Kurs Farqlari (9540 / 9640) hisoblash dvigateli
function computeKursFarqlari(asOfDate) {
  const date = (asOfDate || STORE.settings.filterTo || todayISO()).trim();
  const bankRows = (STORE.bank || []).filter((r) => !date || (r.sana && r.sana <= date));

  // 5210 valyuta hisobvarag'i yoki valyutada (UZS emas) yuritilgan qatorlar
  const valyutaRows = bankRows.filter((r) => r.schyot === "5210" || (r.valyuta && r.valyuta !== "UZS"));

  const currencies = ["USD", "EUR", "RUB"];
  const details = [];
  let jamiIjobiy = 0;
  let jamiSalbiy = 0;

  const initialUsd = toNum(STORE.settings.valyutaOpeningBalance);

  for (const ccy of currencies) {
    const rows = valyutaRows.filter((r) => (r.valyuta || "").toUpperCase() === ccy);
    let valyutaKirim = 0;
    let valyutaChiqim = 0;
    let somKirim = 0;
    let somChiqim = 0;

    rows.forEach((r) => {
      const vAmt = toNum(r.valyutaSumma) || (toNum(r.kurs) > 0 ? (toNum(r.kirim) || toNum(r.chiqim)) / toNum(r.kurs) : 0);
      if (toNum(r.kirim) > 0) {
        valyutaKirim += vAmt;
        somKirim += toNum(r.kirim);
      }
      if (toNum(r.chiqim) > 0) {
        valyutaChiqim += vAmt;
        somChiqim += toNum(r.chiqim);
      }
    });

    const initValyuta = ccy === "USD" ? initialUsd : 0;
    const valyutaQoldiq = initValyuta + valyutaKirim - valyutaChiqim;

    if (valyutaQoldiq <= 0 && !rows.length && !initValyuta) {
      continue;
    }

    const firstRowRate = rows.length && toNum(rows[0].kurs) > 0 ? toNum(rows[0].kurs) : getCbuRate(ccy, date);
    const initSomVal = initValyuta * firstRowRate;
    const totalInSom = somKirim + initSomVal;
    const totalInValyuta = valyutaKirim + initValyuta;
    const avgHistoricalRate = totalInValyuta > 0 ? totalInSom / totalInValyuta : getCbuRate(ccy, date);

    const buxgalteriyaQiymati = Math.round(valyutaQoldiq * avgHistoricalRate);
    const cbuRate = getCbuRate(ccy, date);
    const qaytaBaholanganQiymat = Math.round(valyutaQoldiq * cbuRate);
    const kursFarqi = qaytaBaholanganQiymat - buxgalteriyaQiymati;

    let ijobiy = 0;
    let salbiy = 0;
    let provodka = "";

    if (kursFarqi > 0) {
      ijobiy = kursFarqi;
      jamiIjobiy += ijobiy;
      provodka = "Dt 5210 - Kt 9540 (Daromad)";
    } else if (kursFarqi < 0) {
      salbiy = Math.abs(kursFarqi);
      jamiSalbiy += salbiy;
      provodka = "Dt 9640 - Kt 5210 (Zarar)";
    } else {
      provodka = "Farq yo'q";
    }

    details.push({
      ccy,
      valyutaQoldiq: Math.round(valyutaQoldiq * 100) / 100,
      avgHistoricalRate: Math.round(avgHistoricalRate * 100) / 100,
      buxgalteriyaQiymati,
      cbuRate,
      qaytaBaholanganQiymat,
      kursFarqi,
      ijobiy,
      salbiy,
      provodka
    });
  }

  return {
    asOfDate: date,
    details,
    jamiIjobiy,
    jamiSalbiy,
    sofKursFarqi: jamiIjobiy - jamiSalbiy
  };
}

// Markaziy Bank kurslari va valyuta kalkulyatori modali
async function openCbuRatesModal(initialDate) {
  const selDate = initialDate || todayISO();
  let rates = await fetchCbuRates(selDate);

  function renderModalHtml(currentRates, d) {
    const usd = currentRates.find((c) => c.ccy === "USD") || { rate: 12850, diff: "0.00" };
    const eur = currentRates.find((c) => c.ccy === "EUR") || { rate: 13900, diff: "0.00" };
    const rub = currentRates.find((c) => c.ccy === "RUB") || { rate: 140, diff: "0.00" };
    const cny = currentRates.find((c) => c.ccy === "CNY") || { rate: 1820, diff: "0.00" };

    return `
      <div style="max-width:760px;width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="margin:0;display:flex;align-items:center;gap:8px;">
              <svg class="ic" viewBox="0 0 24 24" style="color:var(--primary);"><use href="#i-currency"/></svg>
              Markaziy Bank (CBU) rasmiy kurslari
            </h3>
            <p class="modal-sub" style="margin:4px 0 0;">O'zbekiston Respublikasi Markaziy Bankining rasmiy ochiq valyuta kurslari</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:12px;font-weight:600;">Sana:</label>
            <input type="date" id="cbuModalDate" value="${escapeHtml(d)}" style="padding:4px 8px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);">
          </div>
        </div>

        <!-- Asosiy valyutalar mini-kartalari -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;">
          <div class="card stat-card" style="padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--text-muted);">
              <span>USD</span> <span class="cbu-diff ${toNum(usd.diff) > 0 ? "up" : toNum(usd.diff) < 0 ? "down" : ""}">${toNum(usd.diff) > 0 ? "+" : ""}${usd.diff}</span>
            </div>
            <div style="font-size:18px;font-weight:700;margin-top:4px;">${fmt(usd.rate)} <small style="font-size:11px;font-weight:normal;color:var(--text-muted);">so'm</small></div>
          </div>
          <div class="card stat-card" style="padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--text-muted);">
              <span>EUR</span> <span class="cbu-diff ${toNum(eur.diff) > 0 ? "up" : toNum(eur.diff) < 0 ? "down" : ""}">${toNum(eur.diff) > 0 ? "+" : ""}${eur.diff}</span>
            </div>
            <div style="font-size:18px;font-weight:700;margin-top:4px;">${fmt(eur.rate)} <small style="font-size:11px;font-weight:normal;color:var(--text-muted);">so'm</small></div>
          </div>
          <div class="card stat-card" style="padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--text-muted);">
              <span>RUB</span> <span class="cbu-diff ${toNum(rub.diff) > 0 ? "up" : toNum(rub.diff) < 0 ? "down" : ""}">${toNum(rub.diff) > 0 ? "+" : ""}${rub.diff}</span>
            </div>
            <div style="font-size:18px;font-weight:700;margin-top:4px;">${fmt(rub.rate)} <small style="font-size:11px;font-weight:normal;color:var(--text-muted);">so'm</small></div>
          </div>
          <div class="card stat-card" style="padding:10px 14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--text-muted);">
              <span>CNY</span> <span class="cbu-diff ${toNum(cny.diff) > 0 ? "up" : toNum(cny.diff) < 0 ? "down" : ""}">${toNum(cny.diff) > 0 ? "+" : ""}${cny.diff}</span>
            </div>
            <div style="font-size:18px;font-weight:700;margin-top:4px;">${fmt(cny.rate)} <small style="font-size:11px;font-weight:normal;color:var(--text-muted);">so'm</small></div>
          </div>
        </div>

        <!-- Valyuta konvertori -->
        <div class="cbu-calc-card">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <svg class="ic" viewBox="0 0 24 24"><use href="#i-calc"/></svg>
            Tezkor Valyuta Konvertori
          </div>
          <div class="cbu-calc-row">
            <input type="number" id="calcAmount" value="100" style="width:120px;padding:6px 10px;font-size:14px;font-weight:700;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);">
            <select id="calcFromCcy" style="padding:6px 10px;font-size:13px;font-weight:600;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);">
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="RUB">RUB (₽)</option>
              <option value="UZS">UZS (so'm)</option>
            </select>
            <span style="font-size:16px;font-weight:700;color:var(--text-muted);">➔</span>
            <select id="calcToCcy" style="padding:6px 10px;font-size:13px;font-weight:600;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);">
              <option value="UZS">UZS (so'm)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="RUB">RUB (₽)</option>
            </select>
            <div style="flex:1;min-width:160px;text-align:right;">
              <span id="calcResult" style="font-size:18px;font-weight:800;color:var(--primary);">—</span>
            </div>
          </div>
        </div>

        <!-- Qidiruv maydoni -->
        <div style="margin-bottom:10px;">
          <input type="text" id="cbuSearchInput" placeholder="Valyuta nomi yoki kodini qidirish (USD, evro, rubl, yuan...)..." style="width:100%;padding:7px 12px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);">
        </div>

        <!-- Kurslar jadvali -->
        <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
          <table class="cbu-rates-table">
            <thead>
              <tr style="background:var(--bg-sunken);position:sticky;top:0;z-index:2;">
                <th>Kodi</th>
                <th>Valyuta nomi</th>
                <th class="num">Rasmiy kursi (UZS)</th>
                <th class="num">O'zgarish</th>
              </tr>
            </thead>
            <tbody id="cbuRatesTbody">
              ${currentRates.map((r) => `
                <tr data-search="${escapeHtml((r.ccy + " " + r.name + " " + r.code).toLowerCase())}">
                  <td><span class="badge-currency">${escapeHtml(r.ccy)}</span></td>
                  <td>${escapeHtml(r.name)}</td>
                  <td class="num" style="font-weight:700;">${fmt(r.rate)}</td>
                  <td class="num"><span class="cbu-diff ${toNum(r.diff) > 0 ? "up" : toNum(r.diff) < 0 ? "down" : ""}">${toNum(r.diff) > 0 ? "+" : ""}${r.diff}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div class="modal-actions" style="margin-top:16px;">
          <button class="btn" id="btnOpenKfFromCbu"><svg class="ic" viewBox="0 0 24 24"><use href="#i-scale"/></svg>Kurs farqi (9540/9640)</button>
          <button class="btn btn-primary" id="mCancel">Yopish</button>
        </div>
      </div>
    `;
  }

  openModal(renderModalHtml(rates, selDate));

  function updateConverter() {
    const amt = toNum(document.getElementById("calcAmount").value);
    const from = document.getElementById("calcFromCcy").value;
    const to = document.getElementById("calcToCcy").value;
    const res = convertCbuCurrency(amt, from, to);
    const el = document.getElementById("calcResult");
    if (el) {
      el.textContent = fmt(Math.round(res * 100) / 100) + " " + to;
    }
  }

  updateConverter();

  document.getElementById("calcAmount").addEventListener("input", updateConverter);
  document.getElementById("calcFromCcy").addEventListener("change", updateConverter);
  document.getElementById("calcToCcy").addEventListener("change", updateConverter);

  const dateInput = document.getElementById("cbuModalDate");
  if (dateInput) {
    dateInput.addEventListener("change", async (e) => {
      const newD = e.target.value;
      if (!newD) return;
      toast("Kurslar yuklanmoqda...");
      rates = await fetchCbuRates(newD);
      openCbuRatesModal(newD);
    });
  }

  const sInput = document.getElementById("cbuSearchInput");
  if (sInput) {
    sInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll("#cbuRatesTbody tr");
      rows.forEach((tr) => {
        const text = tr.getAttribute("data-search") || "";
        tr.style.display = !q || text.includes(q) ? "" : "none";
      });
    });
  }

  const btnKf = document.getElementById("btnOpenKfFromCbu");
  if (btnKf) {
    btnKf.addEventListener("click", () => {
      closeModal();
      openKursFarqiModal(selDate);
    });
  }
}

// Kurs Farqini Qayta Baholash Modali (BHMS 22)
function openKursFarqiModal(asOfDate) {
  const d = (asOfDate || STORE.settings.filterTo || todayISO()).trim();
  const kf = computeKursFarqlari(d);

  openModal(`
    <div style="max-width:780px;width:100%;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div>
          <h3 style="margin:0;display:flex;align-items:center;gap:8px;">
            <svg class="ic" viewBox="0 0 24 24" style="color:var(--primary);"><use href="#i-scale"/></svg>
            Valyutani qayta baholash va kurs farqlari (BHMS 22)
          </h3>
          <p class="modal-sub" style="margin:4px 0 0;">5210 valyuta hisobvarag'i va xorijiy valyuta mablag'larini davr yakunida qayta baholash</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:12px;font-weight:600;">Sana holatiga:</label>
          <input type="date" id="kfAsOfDate" value="${escapeHtml(d)}" style="padding:4px 8px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);">
        </div>
      </div>

      <!-- Xulosa panellari -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:16px;">
        <div class="card stat-card" style="padding:10px 14px;border-left:4px solid #10b981;">
          <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);">9540 — Kurs farqidan daromad</div>
          <div style="font-size:18px;font-weight:800;color:#10b981;margin-top:4px;">+${fmtSum(kf.jamiIjobiy)} <small style="font-size:11px;">so'm</small></div>
        </div>
        <div class="card stat-card" style="padding:10px 14px;border-left:4px solid #ef4444;">
          <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);">9640 — Kurs farqidan zarar</div>
          <div style="font-size:18px;font-weight:800;color:#ef4444;margin-top:4px;">-${fmtSum(kf.jamiSalbiy)} <small style="font-size:11px;">so'm</small></div>
        </div>
        <div class="card stat-card" style="padding:10px 14px;border-left:4px solid var(--primary);">
          <div style="font-size:11.5px;font-weight:700;color:var(--text-muted);">Sof moliyaviy natija</div>
          <div style="font-size:18px;font-weight:800;color:${kf.sofKursFarqi >= 0 ? "var(--primary)" : "#ef4444"};margin-top:4px;">
            ${kf.sofKursFarqi >= 0 ? "+" : ""}${fmtSum(kf.sofKursFarqi)} <small style="font-size:11px;">so'm</small>
          </div>
        </div>
      </div>

      <!-- Qayta baholash hisob-kitob jadvali -->
      <div style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:14px;">
        <table class="cbu-rates-table">
          <thead>
            <tr style="background:var(--bg-sunken);position:sticky;top:0;">
              <th>Valyuta</th>
              <th class="num">Qoldiq</th>
              <th class="num">Hisob kursi</th>
              <th class="num">Buxg. qiymati</th>
              <th class="num">MB kursi</th>
              <th class="num">Qayta baholangan</th>
              <th class="num">Kurs farqi</th>
              <th>BHMS 22 provodka</th>
            </tr>
          </thead>
          <tbody>
            ${!kf.details.length ? `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-faint);">Ushbu sana holatiga 5210 valyuta hisobvarag'ida qoldiq topilmadi. Bank bo'limidan 5210 valyuta operatsiyasini qo'shing.</td></tr>` : ""}
            ${kf.details.map((row) => `
              <tr>
                <td><span class="badge-5210">${escapeHtml(row.ccy)}</span></td>
                <td class="num" style="font-weight:700;">${fmt(row.valyutaQoldiq)}</td>
                <td class="num">${fmt(row.avgHistoricalRate)}</td>
                <td class="num">${fmt(row.buxgalteriyaQiymati)}</td>
                <td class="num" style="font-weight:700;color:var(--primary);">${fmt(row.cbuRate)}</td>
                <td class="num" style="font-weight:700;">${fmt(row.qaytaBaholanganQiymat)}</td>
                <td class="num" style="font-weight:800;color:${row.kursFarqi >= 0 ? "#10b981" : "#ef4444"};">
                  ${row.kursFarqi >= 0 ? "+" : ""}${fmt(row.kursFarqi)}
                </td>
                <td style="font-size:12px;font-weight:600;">${escapeHtml(row.provodka)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="note" style="margin-bottom:16px;">
        <b>BHMS 22 qoidasi:</b> Xorijiy valyuta mablag'lari har bir hisobot davri oxirida O'zbekiston Respublikasi Markaziy Bankining rasmiy kursi bo'yicha majburiy qayta baholanadi. Ijobiy kurs farqi 9540 hisobvarag'i (Daromad), salbiy kurs farqi esa 9640 hisobvarag'i (Zarar) sifatida F2 hisoboti va soliq hisob-kitoblariga kiritiladi.
      </div>

      <div class="modal-actions">
        <button class="btn" id="btnPrintKfAct" ${!kf.details.length ? "disabled" : ""}><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg>A4 Dalolatnoma chop etish</button>
        <button class="btn btn-primary" id="mCancel">Yopish</button>
      </div>
    </div>
  `);

  const dInp = document.getElementById("kfAsOfDate");
  if (dInp) {
    dInp.addEventListener("change", (e) => {
      openKursFarqiModal(e.target.value);
    });
  }

  const btnPrint = document.getElementById("btnPrintKfAct");
  if (btnPrint) {
    btnPrint.addEventListener("click", () => {
      printKursFarqiAct(kf);
    });
  }
}

// Kurs Farqini Qayta Baholash Rasmiy A4 Dalolatnomasi (Chop etish)
function printKursFarqiAct(kf) {
  const s = STORE.settings;
  const kompaniya = s.companyName || "«FORGET KORXONASI»";
  const inn = s.inn || "—";
  const rahbar = s.rahbar || "Korxona rahbari";
  const dateFormatted = format1CDate(kf.asOfDate);

  const html = `
    <!DOCTYPE html>
    <html lang="uz">
    <head>
      <meta charset="utf-8">
      <title>Valyuta mablag'larini qayta baholash dalolatnomasi — ${dateFormatted}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm 15mm 15mm 20mm; }
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; line-height: 1.35; margin: 0; padding: 10px; }
        .stamp-block { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .stamp-box { width: 240px; text-align: left; }
        .title { text-align: center; font-weight: bold; font-size: 13pt; text-transform: uppercase; margin: 15px 0 5px; }
        .sub { text-align: center; font-size: 10pt; font-style: italic; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
        th, td { border: 1px solid #000; padding: 5px 7px; }
        th { background: #f2f2f2; text-align: center; font-weight: bold; }
        td.num { text-align: right; }
        .summary-box { margin: 15px 0; padding: 8px; border: 1px dashed #444; font-size: 10.5pt; }
        .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
        .sign-col { width: 45%; }
        .sign-line { border-bottom: 1px solid #000; height: 30px; margin-top: 5px; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="stamp-block">
        <div>
          <b>${escapeHtml(kompaniya)}</b><br>
          STIR / INN: ${escapeHtml(inn)}<br>
          Buxgalteriya hisobi
        </div>
        <div class="stamp-box">
          <b>«TASDIQLAYMAN»</b><br>
          Rahbar: __________________<br>
          <b>${escapeHtml(rahbar)}</b><br>
          «____» ____________ ${kf.asOfDate.slice(0, 4)} y.
        </div>
      </div>

      <div class="title">VALYUTA MABLAG'LARINI QAYTA BAHOLASH VA KURS FARQLARI DALOLATNOMASI</div>
      <div class="sub">O'zbekiston Respublikasi BHMS 22 talablariga muvofiq ${escapeHtml(dateFormatted)} holatiga</div>

      <p style="text-indent: 25px; margin: 10px 0;">
        Ushbu dalolatnoma tuzildi shul haqdakim, <b>${escapeHtml(kompaniya)}</b> buxgalteriyasi tomonidan hisobot sanasidagi O'zbekiston Respublikasi Markaziy Bankining rasmiy valyuta kurslari asosida korxonaning 5210 "Mamlakat ichidagi valyuta hisobvaraqlari" qoldiqlari qayta baholandi va quyidagi kurs farqlari aniqlandi:
      </p>

      <table>
        <thead>
          <tr>
            <th style="width:5%;">№</th>
            <th>Valyuta</th>
            <th>Qoldiq (valyutada)</th>
            <th>Hisobga olingan kursi</th>
            <th>Qayta baholashgacha balans (so'm)</th>
            <th>Markaziy Bank kursi</th>
            <th>Qayta baholangan yangi balans (so'm)</th>
            <th>Kurs farqi (so'm)</th>
            <th>Buxgalteriya o'tkazmasi</th>
          </tr>
        </thead>
        <tbody>
          ${kf.details.map((r, i) => `
            <tr>
              <td style="text-align:center;">${i + 1}</td>
              <td style="text-align:center;font-weight:bold;">${escapeHtml(r.ccy)}</td>
              <td class="num">${fmt(r.valyutaQoldiq)}</td>
              <td class="num">${fmt(r.avgHistoricalRate)}</td>
              <td class="num">${fmt(r.buxgalteriyaQiymati)}</td>
              <td class="num" style="font-weight:bold;">${fmt(r.cbuRate)}</td>
              <td class="num" style="font-weight:bold;">${fmt(r.qaytaBaholanganQiymat)}</td>
              <td class="num" style="font-weight:bold;">${r.kursFarqi >= 0 ? "+" : ""}${fmt(r.kursFarqi)}</td>
              <td style="font-size:9pt;">${escapeHtml(r.provodka)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="summary-box">
        <b>Xulosa va moliyaviy natijalar:</b><br>
        1. 9540 hisobvarag'i ("Valyutalar kurs farqidan daromadlar") bo'yicha daromad: <b>${fmt(kf.jamiIjobiy)} so'm</b><br>
        2. 9640 hisobvarag'i ("Valyutalar kurs farqidan zararlar") bo'yicha xarajat: <b>${fmt(kf.jamiSalbiy)} so'm</b><br>
        3. Davr yakunidagi sof kurs farqi ta'siri: <b>${kf.sofKursFarqi >= 0 ? "+" : ""}${fmt(kf.sofKursFarqi)} so'm</b>
      </div>

      <div class="signatures">
        <div class="sign-col">
          Bosh buxgalter:<br>
          <div class="sign-line"></div>
          (imzo, F.I.Sh.)
        </div>
        <div class="sign-col">
          Moddiy javobgar shaxs / Kassir:<br>
          <div class="sign-line"></div>
          (imzo, F.I.Sh.)
        </div>
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    toast("Chop etish darchasini brauzer blokladi — pop-up ruxsatini bering", "err");
  }
}

/* ------------------------------- Import (Excel) ------------------------------- */

function openImportModal(type) {
  const info = INVOICE_LABELS[type];
  const omborNote = type === "kirim" ? ` Fayldagi mahsulot ustunlari (nomi/miqdor/narx) bo'lsa, "Ombor" bo'limi ham shu bitta import bilan birga avtomatik to'ldiriladi — alohida qayta yuklash shart emas.` : "";
  openModal(`
    <h3>${info.title} — Excel'dan import</h3>
    <p class="modal-sub">didox.uz eksport qilgan .xlsx faylni yuklang (masalan: "factura ${type === "kirim" ? "kirim" : "chiqim"}.xlsx"). Har bir hujjat bitta qator sifatida qo'shiladi, takroriy hujjatlar o'tkazib yuboriladi.${omborNote}</p>
    <div class="dropzone" id="dz">Faylni shu yerga tashlang yoki bosing<br><span class="faint">.xlsx / .xls</span></div>
    <input type="file" id="impFile" accept=".xlsx,.xls" style="display:none">
    <div class="modal-actions"><button class="btn" id="mCancel">Yopish</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const dz = document.getElementById("dz");
  const inp = document.getElementById("impFile");
  dz.addEventListener("click", () => inp.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    if (e.dataTransfer.files[0]) handleInvoiceImport(e.dataTransfer.files[0], type);
  });
  inp.addEventListener("change", (e) => {
    if (e.target.files[0]) handleInvoiceImport(e.target.files[0], type);
  });
}

function normalizeDate(v) {
  if (v === "" || v === null || v === undefined) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const str = String(v).trim();
  let m = str.match(/^(\d{2})[./\-](\d{2})[./\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = str.match(/^(\d{4})[./\-](\d{2})[./\-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return str;
}

// Didox.uz / soliqservis.uz eksport fayllarining ustunlar tartibi versiyadan
// versiyaga sal-pal farq qilishi mumkin (masalan, chetda qo'shimcha bo'sh ustun
// bo'lishi). Shu sabab ustun RAQAMIGA emas, birinchi qatordagi SARLAVHA
// MATNIGA qarab moslashuvchan tarzda topamiz — bu qaysi eksport variantida
// ham to'g'ri ishlaydi.
function findCol(headerRow, predicate) {
  for (let i = 0; i < headerRow.length; i++) {
    if (predicate(String(headerRow[i] || "").trim().toLowerCase())) return i;
  }
  return -1;
}

function detectInvoiceColumns(headerRow) {
  return {
    id: findCol(headerRow, (s) => s === "id"),
    status: findCol(headerRow, (s) => s === "статус" || s === "holati" || s === "status"),
    hujjat: findCol(headerRow, (s) => s.includes("номер документ") || s.includes("hujjat")),
    sana: findCol(headerRow, (s) => s.includes("дата документ") || (s.includes("sana") && !s.includes("отправки"))),
    sellerInn: findCol(headerRow, (s) => s.startsWith("продавец") && s.includes("инн")),
    sellerNomi: findCol(headerRow, (s) => s.startsWith("продавец") && s.includes("наименование")),
    buyerInn: findCol(headerRow, (s) => s.startsWith("покупатель") && s.includes("инн")),
    buyerNomi: findCol(headerRow, (s) => s.startsWith("покупатель") && s.includes("наименование")),
    base: findCol(headerRow, (s) => s === "стоимость поставки"),
    qqsStavka: findCol(headerRow, (s) => s.includes("ндс") && s.includes("ставка")),
    qqsSumma: findCol(headerRow, (s) => s.includes("ндс") && s.includes("сумма")),
    jami: findCol(headerRow, (s) => s.includes("стоимость поставки") && s.includes("учётом")),
    // Ombor (mahsulot darajasidagi) qatorlar uchun qo'shimcha ustunlar
    nomi: findCol(headerRow, (s) => s.includes("примечание") && s.includes("товар")),
    birlik: findCol(headerRow, (s) => s.includes("единица") && s.includes("измерен")),
    miqdor: findCol(headerRow, (s) => s === "количество"),
    narx: findCol(headerRow, (s) => s === "цена")
  };
}

async function handleInvoiceImport(file, type) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) { toast("Fayl bo'sh", "err"); return; }

    const col = detectInvoiceColumns(rows[0]);
    if (col.id === -1 || col.hujjat === -1 || col.base === -1) {
      toast("Fayl tuzilishi tanilmadi — ustunlar mos kelmayapti", "err");
      return;
    }

    const isSellerSideKirim = type === "kirim";
    const candidates = [];
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const idCell = row[col.id];
      if (!idCell) continue; // faqat hujjat sarlavha qatorlari (bo'lim qatorlari o'tkazib yuboriladi)

      const status = String(row[col.status] || "Подписан").trim();
      const hujjatRaqami = String(row[col.hujjat] || "").trim();
      const sana = normalizeDate(row[col.sana]);
      const kontragentInn = String((isSellerSideKirim ? row[col.sellerInn] : row[col.buyerInn]) || "").trim();
      const kontragentNomi = String((isSellerSideKirim ? row[col.sellerNomi] : row[col.buyerNomi]) || "").trim();
      const summaQQSsiz = toNum(row[col.base]);
      const qqsStavka = toNum(row[col.qqsStavka]);
      const qqsSumma = toNum(row[col.qqsSumma]);
      const jamiSumma = toNum(row[col.jami]) || (summaQQSsiz + qqsSumma);

      const dupExists = STORE[type].some((r) => r.hujjatRaqami === hujjatRaqami && r.sana === sana && Math.abs(r.jamiSumma - jamiSumma) < 1 && r.kontragentNomi === kontragentNomi);
      if (dupExists) { skipped++; continue; }

      candidates.push({ sana, hujjatRaqami, status, kontragentInn, kontragentNomi, summaQQSsiz, qqsStavka, qqsSumma, jamiSumma, tolandi: false });
    }

    if (candidates.length) {
      const seenKontragents = new Set();
      for (const c of candidates) {
        if (!c.kontragentNomi) continue;
        const key = c.kontragentInn + "|" + c.kontragentNomi.toLowerCase();
        if (seenKontragents.has(key)) continue;
        seenKontragents.add(key);
        await ensureKontragentAutoAdded(c.kontragentInn, c.kontragentNomi);
      }
    }

    // Chiqim faktura uchun mahsulot qatorlarini (nomi/miqdor/narx) oldindan
    // ajratib qo'yamiz — hujjat header qatorlari hammasi takror bo'lsa ham
    // (masalan, avval kalkulyatsiyasiz import qilingan faylni endi shu
    // funksiya bilan qayta yuklab, o'sha eski fakturalarni orqaga qaytib
    // kalkulyatsiya bilan bog'lash uchun) shu qatorlar baribir tekshiriladi.
    let newTafsilItems = [];
    if (type === "chiqim" && col.nomi !== -1) {
      const lineItems = parseChiqimLineItems(rows, col);
      newTafsilItems = lineItems.filter((it) => !STORE.chiqimTafsil.some((t) =>
        t.hujjatRaqami === it.hujjatRaqami && t.nomi === it.nomi && Math.abs(t.miqdor - it.miqdor) < 0.001));
    }

    // "Ombor" (mahsulot darajasidagi) qatorlarini ham shu YAGONA importdan
    // avtomatik to'ldiramiz — ilgari xuddi shu faylni "Ombor" sahifasida
    // IKKINCHI marta, alohida import qilish kerak edi (aks holda moliyaviy
    // summa bor-u, ombor miqdori yo'q holat yuzaga kelardi). Har bir mahsulot
    // qatori ombor.kirim_id orqali shu hujjatga bog'lanadi — qarang:
    // OMBOR_DB_MAP, openKirimDetailModal. Dedup mantig'i handleOmborImport
    // bilan bir xil, shu sabab avval "Ombor" sahifasidan alohida import
    // qilingan fayl bu yerdan qayta yuklansa ham takrorlanmaydi (va aksincha).
    let newOmborItems = [];
    if (type === "kirim" && col.nomi !== -1) {
      const lineItems = parseOmborLineItems(rows, col);
      newOmborItems = lineItems.filter((it) => !STORE.ombor.some((r) =>
        r.hujjatRaqami === it.hujjatRaqami && r.sana === it.sana && r.nomi === it.nomi && Math.abs(r.miqdor - it.miqdor) < 0.001));
    }

    let faylRow = null;
    if (candidates.length || newTafsilItems.length || newOmborItems.length) {
      faylRow = await registerFaylUpload(type, file);
      if (faylRow) candidates.forEach((c) => { c.faylId = faylRow.id; });
    }

    let added = 0;
    if (candidates.length) {
      let data;
      try {
        data = await insertRowsChunked(TABLE_NAMES[type], candidates.map((r) => toDbRow(INVOICE_DB_MAP, r)));
      } catch (error) { reportError(error, "Bazaga yozishda xatolik"); return; }
      data.forEach((row) => STORE[type].push(fromDbRow(INVOICE_DB_MAP, row)));
      added = data.length;
    }

    // Har bir yangi mahsulot qatorini "Mahsulotlar" kalkulyatsiyasi bilan
    // moslashtirib, chiqim_tafsil'ga yozamiz va topilganda ombordan avtomat
    // ayiramiz (qarang: matchMahsulotForChiqimLine, applyChiqimTafsilConsumption).
    let tafsilMatched = 0, tafsilUnmatched = 0, tafsilFailed = 0, tafsilShortageRows = 0;
    for (const it of newTafsilItems) {
      const chiqimRow = STORE.chiqim.find((r) => r.hujjatRaqami === it.hujjatRaqami && r.sana === it.sana);
      if (!chiqimRow) continue; // hujjat sarlavhasi topilmadi (masalan status noto'g'ri) — o'tkazib yuboriladi

      const { mahsulot, mosTuri } = await matchMahsulotForChiqimLine(it.nomi, it.narx);
      const tafsilPayload = {
        chiqimId: chiqimRow.id, hujjatRaqami: it.hujjatRaqami, sana: it.sana,
        nomi: it.nomi, birlik: it.birlik, miqdor: it.miqdor, narx: it.narx, summa: it.summa,
        mahsulotId: mahsulot ? mahsulot.id : null, mosTuri, faylId: faylRow ? faylRow.id : null
      };
      let tafsilRow;
      try {
        const { data, error } = await sbClient.from("chiqim_tafsil").insert(toDbRow(CHIQIM_TAFSIL_DB_MAP, tafsilPayload)).select().single();
        if (error) throw error;
        tafsilRow = fromDbRow(CHIQIM_TAFSIL_DB_MAP, data);
      } catch (error) { console.error(error); tafsilFailed++; continue; }

      STORE.chiqimTafsil.push(tafsilRow);
      if (mahsulot) {
        const shortages = await applyChiqimTafsilConsumption(tafsilRow, mahsulot);
        if (shortages.length) tafsilShortageRows++;
        tafsilMatched++;
      } else {
        tafsilUnmatched++;
      }
    }
    if (newTafsilItems.length) updateNavBadges();

    // Kirim uchun mahsulot qatorlarini "ombor" jadvaliga yozamiz — chiqim_tafsil'dan
    // farqli o'laroq bu yerda kalkulyatsiya moslashtirish shart emas (Ombor
    // kirimi xomashyo/mahsulot nomini faylda yozilganidek, o'zgartirmasdan
    // saqlaydi — o'xshash nomlarni birlashtirish "Nomlarni birlashtirish"
    // tugmasi orqali qo'lda amalga oshiriladi, qarang: openOmborMergeNomiModal),
    // faqat qaysi hujjatga tegishli ekanini kirim_id bilan belgilaymiz.
    let omborAdded = 0, omborFailed = false;
    if (newOmborItems.length) {
      const omborRows = newOmborItems.map((it) => {
        const kirimRow = STORE.kirim.find((r) => r.hujjatRaqami === it.hujjatRaqami && r.sana === it.sana);
        return Object.assign({}, it, { turi: "kirim", faylId: faylRow ? faylRow.id : null, kirimId: kirimRow ? kirimRow.id : null });
      });
      try {
        let data;
        try {
          data = await insertRowsChunked("ombor", omborRows.map((r) => toDbRow(OMBOR_DB_MAP, r)));
        } catch (error) {
          // "kirim_id" ustuni hali qo'shilmagan (migration_kirim_yaxshilash.sql
          // ishga tushirilmagan) eski bazalarda ham import ishlashda davom
          // etishi uchun, shu ustunsiz qayta urinamiz — mahsulot qatorlari
          // baribir qo'shiladi, faqat hujjatga bog'lanish (kirim_id) bo'lmaydi.
          if (isMissingColumnError(error) && extractMissingColumnName(error) === "kirim_id") {
            data = await insertRowsChunked("ombor", omborRows.map((r) => {
              const dbRow = toDbRow(OMBOR_DB_MAP, r);
              delete dbRow.kirim_id;
              return dbRow;
            }));
          } else {
            throw error;
          }
        }
        data.forEach((row) => STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, row)));
        omborAdded = data.length;
      } catch (error) {
        console.error(error);
        omborFailed = true;
      }
    }
    if (omborAdded) updateNavBadges();

    saveStore();
    closeModal();
    renderInvoiceTable(type);
    let msg = `Import: ${added} ta qo'shildi, ${skipped} ta takror o'tkazib yuborildi`;
    if (omborAdded) msg += `, ${omborAdded} ta ombor qatori qo'shildi`;
    if (omborFailed) msg += ` (ombor qatorlarini yozishda xatolik)`;
    if (tafsilMatched || tafsilUnmatched) msg += `, ${tafsilMatched} ta mahsulot qatori kalkulyatsiya bilan bog'landi${tafsilUnmatched ? `, ${tafsilUnmatched} ta kalkulyatsiya qilinmagan` : ""}`;
    if (tafsilFailed) msg += ` (${tafsilFailed} ta mahsulot qatorini yozishda xatolik — baza migratsiyasi ishga tushirilmagan bo'lishi mumkin)`;
    if (tafsilShortageRows) msg += `, ${tafsilShortageRows} ta qatorda ombor zaxirasi yetarli emas`;
    toast(msg, tafsilShortageRows ? "err" : "ok");

    // Import qilingan chiqim fakturalar orasida "tasdiqlanmagan" (kalkulyatsiyasiz
    // yoki ombor manfiy) bo'lganlarini alohida qizil xabar bilan ko'rsatamiz.
    if (type === "chiqim") {
      invalidateFifo();
      const raqamlar = getFilteredRows(STORE.chiqim)
        .filter((r) => computeChiqimHisobHolati(r.id).holat === "tasdiqlanmagan")
        .map((r) => r.hujjatRaqami || "—");
      if (raqamlar.length) {
        const bosh = raqamlar.slice(0, 8).join(", ");
        toast(`DIQQAT: ${raqamlar.length} ta chiqim faktura tasdiqlanmagan (${bosh}${raqamlar.length > 8 ? "…" : ""}) — kalkulyatsiya/ombor kirimini to'g'rilang`, "err");
      }
    }
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

function openBankImportModal() {
  openModal(`
    <h3>Bank harakati — fayldan import</h3>
    <p class="modal-sub">ABS/Klient-Bank ko'chirmasi (.xlsx, .xls, .csv) yoki 1C Klient-Bank (.txt — 1CClientBankExchange) fayli avtomatik tanib olinadi va qayta ishlanadi.</p>
    <div class="dropzone" id="dz">Faylni shu yerga tashlang yoki bosing<br><span class="faint">.xlsx / .xls / .csv / .txt (1C Klient-Bank)</span></div>
    <input type="file" id="impFile" accept=".xlsx,.xls,.csv,.txt" style="display:none">
    <div class="modal-actions"><button class="btn" id="mCancel">Yopish</button></div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const dz = document.getElementById("dz");
  const inp = document.getElementById("impFile");
  dz.addEventListener("click", () => inp.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("drag"); if (e.dataTransfer.files[0]) handleBankImport(e.dataTransfer.files[0]); });
  inp.addEventListener("change", (e) => { if (e.target.files[0]) handleBankImport(e.target.files[0]); });
}

function parseBalanceLine(cell, pattern) {
  const re = new RegExp(pattern + ".*?:?\\s*([\\d\\s.,]+)", "i");
  const m = String(cell).match(re);
  return m ? toNum(m[1]) : null;
}

// ABS/Klient-Bank ko'chirmasi: ham eski birlashgan "Cчет/ИНН/Наименование", ham zamonaviy "Biznes 24/7" (TurnoverOperationsInfoByDate),
// Markaziy Bank va boshqa O'zbekiston banklari formatlarini (alohida "ИНН", "Наименование корреспондента", "Сумма дебет/кредит")
// avtomatik va to'liq tanib oladi.
function tryParseAbsBankStatement(rows) {
  let headerIdx = -1;
  const col = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const joined = rows[i].map((c) => String(c).trim().toLowerCase());
    const dateI = joined.findIndex((c) => /дата|sana/i.test(c) && !/tugash|boshlanish|davr/i.test(c));
    const debetI = joined.findIndex((c) => /дебет|расход|chiqim/i.test(c));
    const kreditI = joined.findIndex((c) => /кредит|приход|kirim/i.test(c));
    if (dateI >= 0 && debetI >= 0 && kreditI >= 0) {
      headerIdx = i;
      col.date = dateI;
      col.debet = debetI;
      col.kredit = kreditI;
      col.doc = joined.findIndex((c) => /№\s*док|номер\s*док|hujjat/i.test(c));
      col.naznach = joined.findIndex((c) => /назначен|детали|tavsif|izoh|maqsad/i.test(c));

      // Kontragent nomi ustuni (lekin "Счет", "Банк", "МФО" so'zlari aralashmasin)
      col.kontragentNomi = joined.findIndex((c) =>
        (/наименование\s*корреспондент|наименование\s*клиент|получател|плательщик/i.test(c) ||
        ((/корреспондент|контрагент|kontragent/i.test(c)) && !/счет|hisob|банк|мфо/i.test(c))) &&
        !/банк/i.test(c)
      );

      // Alohida INN ustuni (bank INN'i emas)
      col.inn = joined.findIndex((c) => /^инн$|^inn$|stir|инн.*корреспондент|инн.*клиент|инн.*получател|инн.*плательщик|инн\/стир/i.test(c) && !/банк/i.test(c));

      // Birlashtirilgan счет/инн ustuni (eski ABS formati)
      col.schetCombined = joined.findIndex((c) => /счет\/инн|cчет\/инн/i.test(c));
      break;
    }
  }
  if (headerIdx === -1) return null;

  // Boshlang'ich qoldiqni topish (matn ichida yoki yonma-yon kataklarda)
  let opening = null;
  for (let i = 0; i < headerIdx; i++) {
    const row = rows[i];
    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] || "").trim();
      if (!cellStr) continue;
      if (/остаток\s*на\s*начал|входящ.*остаток|сальдо\s*на\s*начал|входящ.*сальдо|boshlang'ich\s*qoldiq/i.test(cellStr)) {
        const m = cellStr.match(/:\s*(-?[\d\s.,]+)/) || cellStr.match(/(-?[\d\s.,]+)$/);
        if (m && m[1] && !isNaN(toNum(m[1]))) {
          opening = toNum(m[1]);
          break;
        }
        for (let nextC = c + 1; nextC < Math.min(row.length, c + 5); nextC++) {
          if (typeof row[nextC] === "number" || (typeof row[nextC] === "string" && /^[\d\s.,]+$/.test(row[nextC].trim()))) {
            opening = toNum(row[nextC]);
            break;
          }
        }
        if (opening !== null) break;
      }
    }
    if (opening !== null) break;
  }

  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const dateCell = row[col.date];
    const isValidDateCell = (typeof dateCell === "number" && dateCell > 0) ||
      (dateCell instanceof Date && !isNaN(dateCell.getTime())) ||
      (typeof dateCell === "string" && /^\d{2}[./\-]\d{2}[./\-]\d{4}|^\d{4}[./\-]\d{2}[./\-]\d{2}/.test(dateCell.trim()));
    if (!isValidDateCell) continue;

    let kontragentInn = "";
    let kontragentNomi = "";

    if (col.inn >= 0) {
      kontragentInn = String(row[col.inn] || "").replace(/\D/g, "").trim();
    }
    if (col.kontragentNomi >= 0) {
      kontragentNomi = String(row[col.kontragentNomi] || "")
        .replace(/^["']+|["']+$/g, "")
        .replace(/""/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }

    if ((!kontragentInn || !kontragentNomi) && col.schetCombined >= 0) {
      const schetCell = String(row[col.schetCombined] || "");
      const parts = schetCell.split("/");
      if (!kontragentInn && parts[1]) kontragentInn = parts[1].replace(/\D/g, "").trim();
      if (!kontragentNomi && parts[2]) {
        kontragentNomi = parts.slice(2).join("/")
          .replace(/^["']+|["']+$/g, "")
          .replace(/""/g, '"')
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    const hujjatRaqami = col.doc >= 0 ? String(row[col.doc] || "").trim() : "";
    const chiqim = toNum(row[col.debet]);
    const kirim = toNum(row[col.kredit]);
    if (chiqim <= 0 && kirim <= 0) continue; // Nol yoki bo'sh yakuniy qatorlarni o'tkazib yuborish

    const tavsif = col.naznach >= 0 ? String(row[col.naznach] || "").trim() : "";

    // Bank xizmati / komissiyasi avtomatik aniqlanishi (xizmat xarajatlariga avtomat belgilash)
    const isService = /комиссия|komissiya|хизмат|xizmat|начисленные\s*%%|погашение\s*дебетовый\s*оборот|банк\s*хизмат|bank\s*xizmat/i.test(tavsif + " " + kontragentNomi);

    parsed.push({
      sana: normalizeDate(typeof dateCell === "string" ? dateCell.split(" ")[0] : dateCell),
      hujjatRaqami,
      kontragent: kontragentNomi,
      kontragentInn,
      tavsif,
      kirim,
      chiqim,
      xizmat: isService
    });
  }
  return { rows: parsed, opening };
}

async function handleBankImport(file) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();

    let is1CText = file.name && file.name.toLowerCase().endsWith(".txt");
    let text1C = "";
    if (is1CText || file.size < 10 * 1024 * 1024) {
      try {
        const dec1251 = new TextDecoder("windows-1251");
        text1C = dec1251.decode(buf);
        if (!text1C.includes("1CClientBankExchange") && !text1C.includes("КлиентСбербанк")) {
          text1C = new TextDecoder("utf-8").decode(buf);
        }
        if (text1C.includes("1CClientBankExchange") || text1C.includes("КлиентСбербанк")) {
          is1CText = true;
        }
      } catch (e) {}
    }

    const wasEmpty = STORE.bank.length === 0;
    const candidates = [];
    let skipped = 0;
    let newOpening = null;

    if (is1CText) {
      const parsed1C = parse1CClientBankExchange(text1C);
      if (parsed1C.opening !== null && (wasEmpty || !toNum(STORE.settings.bankOpeningBalance))) {
        newOpening = parsed1C.opening;
      }
      for (const r of parsed1C.rows) {
        const dup = STORE.bank.some((b) => {
          const sameDate = b.sana === r.sana;
          const sameKirim = Math.abs(toNum(b.kirim) - toNum(r.kirim)) < 1;
          const sameChiqim = Math.abs(toNum(b.chiqim) - toNum(r.chiqim)) < 1;
          if (!sameDate || !sameKirim || !sameChiqim) return false;
          if (r.hujjatRaqami && r.hujjatRaqami !== "0" && b.hujjatRaqami && b.hujjatRaqami !== "0") {
            return b.hujjatRaqami === r.hujjatRaqami;
          }
          const sameKontragent = normalizeKontragentNomi(b.kontragent) === normalizeKontragentNomi(r.kontragent);
          const sameTavsif = (b.tavsif || "").trim().toLowerCase() === (r.tavsif || "").trim().toLowerCase();
          return sameKontragent && (sameTavsif || !r.tavsif || !b.tavsif);
        });
        if (dup) { skipped++; continue; }
        candidates.push(r);
      }
    } else {
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      if (!rows.length) { toast("Fayl bo'sh", "err"); return; }

      const abs = tryParseAbsBankStatement(rows);

    if (abs) {
      if (abs.opening !== null && (wasEmpty || !toNum(STORE.settings.bankOpeningBalance))) {
        newOpening = abs.opening;
      }
      for (const r of abs.rows) {
        const dup = STORE.bank.some((b) => {
          const sameDate = b.sana === r.sana;
          const sameKirim = Math.abs(toNum(b.kirim) - toNum(r.kirim)) < 1;
          const sameChiqim = Math.abs(toNum(b.chiqim) - toNum(r.chiqim)) < 1;
          if (!sameDate || !sameKirim || !sameChiqim) return false;
          if (r.hujjatRaqami && r.hujjatRaqami !== "0" && b.hujjatRaqami && b.hujjatRaqami !== "0") {
            return b.hujjatRaqami === r.hujjatRaqami;
          }
          const sameKontragent = normalizeKontragentNomi(b.kontragent) === normalizeKontragentNomi(r.kontragent);
          const sameTavsif = (b.tavsif || "").trim().toLowerCase() === (r.tavsif || "").trim().toLowerCase();
          return sameKontragent && (sameTavsif || !r.tavsif || !b.tavsif);
        });
        if (dup) { skipped++; continue; }
        candidates.push(r);
      }
    } else {
      let start = 0;
      const first = rows[0];
      const looksLikeHeader = first.some((c) => typeof c === "string" && /sana|дата|hujjat|kirim|chiqim|приход|расход|сумма/i.test(c));
      if (looksLikeHeader) start = 1;

      for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row.length || row.every((c) => c === "")) continue;
        const sana = normalizeDate(row[0]);
        const hujjatRaqami = String(row[1] || "").trim();
        const kontragent = String(row[2] || "").replace(/^["']+|["']+$/g, "").replace(/""/g, '"').trim();
        const tavsif = String(row[3] || "").trim();
        const kirim = toNum(row[4]);
        const chiqim = toNum(row[5]);
        if (!sana && !kirim && !chiqim) continue;
        if (kirim <= 0 && chiqim <= 0) continue;
        const dup = STORE.bank.some((b) => {
          const sameDate = b.sana === sana;
          const sameKirim = Math.abs(toNum(b.kirim) - toNum(kirim)) < 1;
          const sameChiqim = Math.abs(toNum(b.chiqim) - toNum(chiqim)) < 1;
          if (!sameDate || !sameKirim || !sameChiqim) return false;
          if (hujjatRaqami && hujjatRaqami !== "0" && b.hujjatRaqami && b.hujjatRaqami !== "0") {
            return b.hujjatRaqami === hujjatRaqami;
          }
          return normalizeKontragentNomi(b.kontragent) === normalizeKontragentNomi(kontragent);
        });
        if (dup) { skipped++; continue; }
        const isService = /комиссия|komissiya|хизмат|xizmat|начисленные\s*%%|погашение\s*дебетовый\s*оборот|банк\s*хизмат|bank\s*xizmat/i.test(tavsif + " " + kontragent);
        candidates.push({ sana, hujjatRaqami, kontragent, kontragentInn: "", tavsif, kirim, chiqim, xizmat: isService });
      }
    }
  }

    if (newOpening !== null) {
      STORE.settings.bankOpeningBalance = newOpening;
      await saveSettingsToDb({ bankOpeningBalance: newOpening });
    }

    // Placeholder INN'larni ("000000000" va h.k.) xuddi shu kontragent
    // nomidagi HAQIQIY INN bilan avtomat to'ldiramiz (qarang: isPlaceholderInn,
    // resolveRealInnByNomi). Bu shunchaki kosmetika emas — placeholder INN
    // bazada saqlanib qolsa, recomputePaymentStatusForType uni "haqiqiy INN"
    // sifatida guruhlab, turli (aslida bir-biriga aloqasi yo'q) kontragentlarni
    // bitta soxta guruhga qo'shib, to'lov moslashtirishni buzishi mumkin edi.
    // Hech qayerda topilmasa — bo'sh qoldiramiz (soxta INN o'ylab topmaymiz)
    // va importdan keyin foydalanuvchidan so'raymiz (openBankInnPromptModal).
    const unresolvedNomi = new Set();
    candidates.forEach((c) => {
      if (!isPlaceholderInn(c.kontragentInn)) return;
      const real = resolveRealInnByNomi(c.kontragent, candidates);
      if (real) {
        c.kontragentInn = real;
      } else {
        c.kontragentInn = "";
        if (c.kontragent) unresolvedNomi.add(c.kontragent);
      }
    });

    if (candidates.length) {
      const seenKontragents = new Set();
      for (const c of candidates) {
        if (!c.kontragent) continue;
        const key = c.kontragentInn + "|" + c.kontragent.toLowerCase();
        if (seenKontragents.has(key)) continue;
        seenKontragents.add(key);
        await ensureKontragentAutoAdded(c.kontragentInn, c.kontragent);
      }
    }

    if (candidates.length) {
      const faylRow = await registerFaylUpload("bank", file);
      if (faylRow) candidates.forEach((c) => { c.faylId = faylRow.id; });
    }

    let added = 0;
    if (candidates.length) {
      let data;
      try {
        data = await insertRowsChunked("bank", candidates.map((r) => toDbRow(BANK_DB_MAP, r)));
      } catch (error) { reportError(error, "Bazaga yozishda xatolik"); return; }
      data.forEach((row) => STORE.bank.push(fromDbRow(BANK_DB_MAP, row)));
      added = data.length;
    }

    recomputeAllPaymentStatus();
    updateNavBadges();
    saveStore();
    closeModal();
    renderBank();
    const openingNote = (newOpening !== null) ? `, boshlang'ich qoldiq: ${fmtSum(newOpening)}` : "";
    toast(`Import: ${added} ta qo'shildi${skipped ? `, ${skipped} ta takror o'tkazib yuborildi` : ""}${openingNote}`);
    if (unresolvedNomi.size) openBankInnPromptModal([...unresolvedNomi]);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

// Import paytida placeholder INN'i xuddi shu nomdagi boshqa qatordan/mavjud
// ma'lumotdan topilmagan kontragentlar uchun — foydalanuvchidan qo'lda INN
// so'raydi (qarang: handleBankImport). Kiritilgan INN shu nomdagi BARCHA
// (yangi import qilingan va avvaldan mavjud, hali placeholder/bo'sh INN'li)
// Bank yozuvlariga, hamda Kontragentlar spravochnigiga qo'llaniladi — shunda
// keyingi importlar ham avtomat moslashadi.
function openBankInnPromptModal(names) {
  openModal(`
    <h3>Ba'zi kontragentlar uchun INN aniqlanmadi</h3>
    <p class="modal-sub">Bank ko'chirmasida quyidagi kontragentlarning INN'i noma'lum (masalan "000000000") edi va boshqa hech qanday yozuvda haqiqiy INN topilmadi. Xohlasangiz shu yerda kiriting — barcha tegishli bank yozuvlariga va Kontragentlar spravochnigiga qo'llaniladi. Bo'sh qoldirsangiz, keyinroq jadvalning o'zida qo'lda to'ldirishingiz mumkin.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Kontragent</th><th>INN</th></tr></thead>
        <tbody>
          ${names.map((n, i) => `
            <tr>
              <td>${escapeHtml(n)}</td>
              <td><input class="cell-input" data-inn-input="${i}" placeholder="INN kiriting"></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Keyinroq</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", async () => {
    const inputs = document.querySelectorAll("[data-inn-input]");
    const pairs = [];
    inputs.forEach((inp, i) => {
      const inn = inp.value.trim();
      if (inn) pairs.push({ nomi: names[i], inn });
    });
    if (!pairs.length) { closeModal(); return; }
    closeModal();
    let updated = 0;
    for (const { nomi, inn } of pairs) {
      const key = normalizeKontragentNomi(nomi);
      const rows = STORE.bank.filter((b) => normalizeKontragentNomi(b.kontragent) === key && isPlaceholderInn(b.kontragentInn));
      for (const row of rows) {
        row.kontragentInn = inn;
        pushFieldsUpdate("bank", row.id, { kontragentInn: inn });
        updated++;
      }
      await ensureKontragentAutoAdded(inn, nomi);
    }
    recomputeAllPaymentStatus();
    updateNavBadges();
    saveStore();
    renderBank();
    toast(`${updated} ta bank yozuviga INN qo'llanildi`);
  });
}

/* --------------------------------- theme --------------------------------- */

function applyTheme() {
  if (THEME === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("themeLabel").textContent = "Tungi rejim";
    document.getElementById("themeIcon").innerHTML = '<svg class="ic" viewBox="0 0 24 24"><use href="#i-moon"/></svg>';
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    document.getElementById("themeLabel").textContent = "Yorug' rejim";
    document.getElementById("themeIcon").innerHTML = '<svg class="ic" viewBox="0 0 24 24"><use href="#i-sun"/></svg>';
  }
}

document.getElementById("themeToggle").addEventListener("click", () => {
  THEME = THEME === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, THEME);
  applyTheme();
});

/* --------------------------------- realtime sync --------------------------------- */

let REALTIME_CHANNEL = null;

// Foydalanuvchi HOZIR (so'nggi 1.5 soniya ichida) inputga yozayotgan bo'lsa, uzoqdan
// kelgan yangilanish uning tugallanmagan yozuvini o'chirib yubormasligi uchun sahifani
// qayta chizishni bir zumga to'xtatib turamiz. Faqat maydonga bosib qo'yish (lekin
// yozmaslik) sinxronlashni bloklamaydi — bu eski usuldagi kamchilik edi.
let lastTypingAt = 0;
document.addEventListener("input", (e) => {
  if (e.target && e.target.closest && e.target.closest("#main")) lastTypingAt = Date.now();
}, true);

// Raqam maydonlari (.num-fmt): fokusда — xom son (tahrirlash oson), fokusdan
// chiqganda — minglik ajratgichли ko'rinish ("1 234 567"). toNum() ajratgichларни
// tozalagani uchun saqlash mantig'i o'zgarmaydi.
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains("num-fmt")) return;
  if (t.value.trim() !== "") t.value = String(toNum(t.value));
});
document.addEventListener("focusout", (e) => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains("num-fmt")) return;
  if (t.value.trim() === "") return;
  t.value = fmt(toNum(t.value), t.dataset.fmtDigits ? Number(t.dataset.fmtDigits) : 0);
});

function rerenderCurrentPage() {
  if (Date.now() - lastTypingAt < 1500) return;
  invalidateFifo();
  PAGES[CURRENT_PAGE].render();
}

// Bitta xil obyektga tegishli real vaqtli xabarlar bazadagi tartibda kelishi
// kafolatlanmaydi — masalan, "qo'shildi" xabari network kechikishi tufayli
// foydalanuvchi allaqachon o'sha qatorni o'chirib ulgurganidan KEYIN yetib
// kelishi mumkin. Shu holatda uni qayta "tiriltirib" qo'ymaslik uchun,
// shu klient o'chirgan id'larni eslab qolamiz va ular uchun kelgan eskirgan
// "qo'shildi/yangilandi" xabarlarini e'tiborsiz qoldiramiz.
const RECENTLY_DELETED = new Set();

function applyRemoteRowChange(type, payload) {
  // Realtime kanal firma_id bo'yicha filtrlangan bo'lsa-da, switchFirma()
  // eski kanalni yopish bilan yangi ma'lumotni yuklashni bir vaqtda (atomik)
  // qilmaydi — shu oraliqda ESKI kanaldan kelib qolgan xabar YANGI firma
  // STORE'siga noto'g'ri qo'shilib ketmasligi uchun qo'shimcha tekshiruv.
  const fid = payload.new?.firma_id ?? payload.old?.firma_id;
  if (fid && fid !== ACTIVE_FIRMA_ID) return;
  const map = TABLE_MAPS[type];
  if (payload.eventType === "INSERT") {
    if (RECENTLY_DELETED.has(payload.new.id)) return;
    if (!STORE[type].some((r) => r.id === payload.new.id)) STORE[type].push(fromDbRow(map, payload.new));
  } else if (payload.eventType === "UPDATE") {
    if (RECENTLY_DELETED.has(payload.new.id)) return;
    const idx = STORE[type].findIndex((r) => r.id === payload.new.id);
    if (idx >= 0) STORE[type][idx] = fromDbRow(map, payload.new);
    else STORE[type].push(fromDbRow(map, payload.new));
  } else if (payload.eventType === "DELETE") {
    STORE[type] = STORE[type].filter((r) => r.id !== payload.old.id);
    RECENTLY_DELETED.delete(payload.old.id);
  }
  invalidateFifo();
  recomputeAllPaymentStatus();
  updateNavBadges();
  rerenderCurrentPage();
}

function setSyncStatus(connected) {
  const dot = document.getElementById("syncDot");
  const label = document.getElementById("syncLabel");
  if (!dot || !label) return;
  dot.classList.toggle("off", !connected);
  label.textContent = connected ? "Onlayn — real vaqtda sinxron" : "Ulanish yo'q";
}

function setupRealtime() {
  if (REALTIME_CHANNEL) { sbClient.removeChannel(REALTIME_CHANNEL); REALTIME_CHANNEL = null; }
  const firmaFilter = { filter: `firma_id=eq.${ACTIVE_FIRMA_ID}` };
  // Kanal nomiga firma id qo'shiladi — bir vaqtning o'zida bir nechta firma
  // uchun (masalan ikkita brauzer oynasida) alohida kanal ochilishini
  // ta'minlaydi va eski/yangi kanal chalkashib ketmasligini osonlashtiradi.
  REALTIME_CHANNEL = sbClient.channel("bux2112-sync-" + ACTIVE_FIRMA_ID)
    .on("postgres_changes", { event: "*", schema: "public", table: "kirim", ...firmaFilter }, (p) => applyRemoteRowChange("kirim", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "chiqim", ...firmaFilter }, (p) => applyRemoteRowChange("chiqim", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "bank", ...firmaFilter }, (p) => applyRemoteRowChange("bank", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "ish_haqi", ...firmaFilter }, (p) => applyRemoteRowChange("ishHaqi", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "tabel", ...firmaFilter }, (p) => applyRemoteRowChange("tabel", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "ombor", ...firmaFilter }, (p) => applyRemoteRowChange("ombor", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "mahsulotlar", ...firmaFilter }, (p) => applyRemoteRowChange("mahsulotlar", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "ishlab_chiqarish", ...firmaFilter }, (p) => applyRemoteRowChange("ishlabChiqarish", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "fayllar", ...firmaFilter }, (p) => applyRemoteRowChange("fayllar", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "kontragentlar", ...firmaFilter }, (p) => applyRemoteRowChange("kontragentlar", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "asosiy_vositalar", ...firmaFilter }, (p) => applyRemoteRowChange("asosiyVositalar", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "chiqim_tafsil", ...firmaFilter }, (p) => applyRemoteRowChange("chiqimTafsil", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "settings", ...firmaFilter }, (p) => {
      if (p.new?.firma_id && p.new.firma_id !== ACTIVE_FIRMA_ID) return;
      STORE.settings = Object.assign(STORE.settings, fromDbSettings(p.new), loadLocalFilters());
      applyModuleVisibility();
      rerenderCurrentPage();
    })
    .subscribe((status) => {
      setSyncStatus(status === "SUBSCRIBED");
      // Kanal (qayta) ulanganda — masalan noutbuk uyg'ongandan yoki Wi-Fi
      // tiklangandan keyin — shu oraliqda o'tkazib yuborilgan o'zgarishlarni
      // to'ldirish uchun ma'lumotlarni bazadan qaytadan yuklaymiz.
      if (status === "SUBSCRIBED") reconcileData();
    });
}

let RECONCILING = false;
async function reconcileData() {
  if (!hasBooted || RECONCILING) return;
  RECONCILING = true;
  try {
    // Ilgari bu yerda "sbClient.auth.refreshSession()" ham majburan chaqirilardi
    // (tab uzoq fon rejimida turgandan keyin token eskirmasligi uchun) — lekin
    // persistSession: true bo'lgach (sessiya barcha tablarda bitta localStorage
    // orqali ULASHILADI), bir nechta tab ochiq bo'lganda har biri o'z fokusida
    // shu chaqiruvni alohida-alohida qilishi Supabase'ning refresh token
    // ROTATSIYASI bilan poyga holatiga (race condition) olib kelardi — bitta
    // tab eskirgan refresh tokendan foydalanib "allaqachon ishlatilgan" xatosini
    // olib, forceReauth() orqali BARCHA tablardagi sessiyani buzib qo'yishi
    // mumkin edi. SDK'ning o'zidagi autoRefreshToken (standart yoqilgan, tab
    // fokusiga ham sezgir) buni allaqachon xavfsizroq bajaradi — shu sabab bu
    // yerda alohida qo'lda yangilash endi shart emas.
    await loadAllData();
    rerenderCurrentPage();
  } catch (err) {
    console.error(err);
    if (isAuthExpiredError(err)) forceReauth();
  } finally {
    RECONCILING = false;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") reconcileData();
});
window.addEventListener("online", reconcileData);
window.addEventListener("focus", reconcileData);

/* --------------------------------- auth gate --------------------------------- */

function showAuthGate() {
  document.getElementById("authGate").style.display = "flex";
  if (typeof setAuthMode === "function") setAuthMode("login");
}
function hideAuthGate() {
  document.getElementById("authGate").style.display = "none";
}

// "foydalanuvchi_rollari" jadvali (migration_roles.sql orqali qo'shiladi) —
// email bo'yicha "admin"/"xodim" rolini belgilaydi. Jadval hali yaratilmagan
// yoki shu email uchun qator kiritilmagan bo'lsa — eng xavfsiz variant sifatida
// oddiy xodim (IS_ADMIN=false) deb hisoblanadi (o'chirish huquqi bo'lmaydi).
// Haqiqiy cheklov bazadagi RLS policy orqali ta'minlanadi — bu shunchaki UI'ni
// shu bilan mos holda ko'rsatish/xabar berish uchun.
let IS_ADMIN = false;

async function loadUserRole() {
  IS_ADMIN = false;
  if (!CURRENT_USER_EMAIL) return;
  try {
    const { data, error } = await sbClient.from("foydalanuvchi_rollari").select("role").eq("email", CURRENT_USER_EMAIL).maybeSingle();
    if (error) { console.error(error); return; }
    IS_ADMIN = !!(data && data.role === "admin");
  } catch (err) {
    console.error(err);
  }
}

async function bootAfterAuth() {
  hideAuthGate();
  applyTheme();
  bindGlobalSearch();
  bindKontragentHistoryDelegation();
  document.getElementById("topbarNotifBtn").addEventListener("click", openAttentionModal);

  const topbarCurrencyEl = document.getElementById("topbarCurrencyWidget");
  if (topbarCurrencyEl) {
    topbarCurrencyEl.addEventListener("click", () => openCbuRatesModal());
  }
  updateCbuTopbarWidget();

  await loadAvailableFirmalar();
  // Foydalanuvchi hozirgina "Ro'yxatdan o'tish" orqali ro'yxatdan o'tgan bo'lsa
  // (qarang: authSubmit signup shoxobchasi), lekin hali hech qanday firmaga ega
  // bo'lmasa — o'zi uchun yangi (bo'sh) firmani shu yerda avtomatik yaratamiz.
  // LocalStorage'da saqlanishi sababi: agar loyihada email tasdiqlash yoqilgan
  // bo'lsa, signUp() darhol sessiya bermaydi — foydalanuvchi emailidagi havolani
  // bosib, ALOHIDA sahifa yuklanishida (qayta) kirganda ham shu bayroq saqlanib
  // qolishi kerak.
  const pendingRaw = localStorage.getItem(PENDING_SIGNUP_KEY);
  if (!AVAILABLE_FIRMALAR.length && pendingRaw) {
    localStorage.removeItem(PENDING_SIGNUP_KEY);
    let pending = null;
    try { pending = JSON.parse(pendingRaw); } catch { pending = null; }
    if (pending && pending.nomi && pending.inn) {
      const { error } = await sbClient.rpc("signup_create_own_firma", { p_nomi: pending.nomi, p_inn: pending.inn });
      if (error) {
        console.error(error);
        toast(error.message || "Firma yaratishda xatolik", "err");
      }
      await loadAvailableFirmalar();
    }
  }
  renderFirmaSwitcher();
  if (!AVAILABLE_FIRMALAR.length) {
    document.getElementById("main").innerHTML = `<div class="empty-state"><div class="d">Sizga hali birorta firma biriktirilmagan — administratorga murojaat qiling.</div></div>`;
    return;
  }
  const savedFirma = localStorage.getItem(ACTIVE_FIRMA_KEY);
  ACTIVE_FIRMA_ID = AVAILABLE_FIRMALAR.some((f) => f.id === savedFirma) ? savedFirma : AVAILABLE_FIRMALAR[0].id;
  localStorage.setItem(ACTIVE_FIRMA_KEY, ACTIVE_FIRMA_ID);
  renderFirmaSwitcher();

  renderTopbarPeriod();
  navigate("dashboard");
  try {
    await Promise.all([loadAllData(), loadUserRole()]);
  } catch (err) {
    console.error(err);
    if (isAuthExpiredError(err)) forceReauth();
    else toast("Ma'lumotlarni yuklashda xatolik", "err");
  }
  setupRealtime();
  updateNavBadges();
  // "Firmalar" endi Sozlamalar ichidagi bo'lim — alohida nav elementi ko'rsatilmaydi.
  const navFirmalarEl = document.getElementById("navFirmalar");
  if (navFirmalarEl) navFirmalarEl.style.display = "none";
  applyModuleVisibility();
  // "loadAllData" tugashi bir necha yuz millisekund cho'zilishi mumkin — shu oraliqda
  // foydalanuvchi allaqachon boshqa bo'limga o'tgan bo'lishi mumkin. Shu sabab uni
  // majburan "dashboard"ga qaytarmaymiz, aksincha HOZIRGI turgan sahifasini yangi
  // (endi yuklangan) ma'lumot bilan qayta chizamiz.
  PAGES[CURRENT_PAGE].render();
}

// Login qilgan foydalanuvchi ruxsat berilgan firmalar ro'yxatini (nomi bilan)
// yuklaydi — bu FIRMA MA'LUMOTLARIGA emas, balki "firma_foydalanuvchilari"
// jadvaliga (kim qaysi firmaga kira oladi) so'rov, shu sabab ataylab
// firma_id bo'yicha filtrlanmagan.
async function loadAvailableFirmalar() {
  AVAILABLE_FIRMALAR = [];
  if (!CURRENT_USER_EMAIL) return;
  try {
    const { data, error } = await sbClient
      .from("firma_foydalanuvchilari")
      .select("firma_id, firmalar(id, nomi)")
      .eq("email", CURRENT_USER_EMAIL);
    if (error) { console.error(error); return; }
    AVAILABLE_FIRMALAR = (data || [])
      .filter((r) => r.firmalar)
      .map((r) => ({ id: r.firmalar.id, nomi: r.firmalar.nomi }))
      .sort((a, b) => a.nomi.localeCompare(b.nomi));
  } catch (err) {
    console.error(err);
  }
}

function renderFirmaSwitcher() {
  const sel = document.getElementById("firmaSwitcher");
  if (!sel) return;
  if (!AVAILABLE_FIRMALAR.length) { sel.innerHTML = ""; sel.style.display = "none"; return; }
  sel.style.display = "";
  sel.innerHTML = AVAILABLE_FIRMALAR.map((f) => `<option value="${f.id}">${escapeHtml(f.nomi)}</option>`).join("");
  sel.value = ACTIVE_FIRMA_ID;
}

// Foydalanuvchi tizimdan chiqmasdan, ilova ichida boshqa firmaga o'tadi:
// realtime kanalni yopadi, STORE'ni tozalaydi, yangi firma bo'yicha
// ma'lumotlarni qayta yuklaydi va kanalni qayta ochadi — auth sessiyasiga
// umuman tegmaydi.
async function switchFirma(firmaId) {
  if (!firmaId || firmaId === ACTIVE_FIRMA_ID) return;
  if (REALTIME_CHANNEL) { sbClient.removeChannel(REALTIME_CHANNEL); REALTIME_CHANNEL = null; }
  STORE = defaultStore();
  ACTIVE_FIRMA_ID = firmaId;
  localStorage.setItem(ACTIVE_FIRMA_KEY, firmaId);
  try {
    await Promise.all([loadAllData(), loadUserRole()]);
  } catch (err) {
    console.error(err);
    if (isAuthExpiredError(err)) forceReauth();
    else toast("Ma'lumotlarni yuklashda xatolik", "err");
  }
  setupRealtime();
  updateNavBadges();
  renderFirmaSwitcher();
  // "Firmalar" endi Sozlamalar ichidagi bo'lim — alohida nav elementi ko'rsatilmaydi.
  const navFirmalarEl = document.getElementById("navFirmalar");
  if (navFirmalarEl) navFirmalarEl.style.display = "none";
  applyModuleVisibility();
  PAGES[CURRENT_PAGE].render();
}

// Supabase "onAuthStateChange" nafaqat kirish/chiqishda, balki fon rejimida
// xavfsizlik tokeni yangilanganda (TOKEN_REFRESHED) ham ishga tushadi.
// Shu sabab "hasBooted" bayrog'i orqali to'liq yuklash+navigatsiyani FAQAT
// haqiqiy kirishda bir marta bajaramiz — aks holda foydalanuvchi ishlab
// turgan sahifasidan kutilmaganda "Bosh sahifa"ga uloqtirilib qolardi.
let hasBooted = false;

const LAST_EMAIL_KEY = "bux2112_last_email";
// {nomi, inn} JSON obyekti sifatida saqlanadi — INN qo'shilgani sababli ikkita
// qiymatni birga saqlash kerak. Qarang: authSubmit signup shoxobchasi, bootAfterAuth.
const PENDING_SIGNUP_KEY = "bux2112_pending_signup";
let CURRENT_USER_EMAIL = "";

// Bitta umumiy Supabase loyihasiga bir marta ulanadi (index.html'dagi
// SUPABASE_URL/SUPABASE_ANON_KEY) va auth-hodisalarini tinglashni o'rnatadi.
// persistSession: true — sessiya brauzer localStorage'ida saqlanadi, shu sabab
// sahifani yangilash (F5) yoki qayta ochish foydalanuvchini chiqarib yubormaydi;
// Supabase JWT'ni fonda avtomatik yangilab turadi (autoRefreshToken, standart
// yoqilgan). Umumiy/ofis kompyuterida ishlatilganda "Chiqish" tugmasi orqali
// aniq chiqish shart — aks holda keyingi ochuvchi shu sessiyada qolib ketishi
// mumkin. Aniq sessiya muddati (masalan "N kundan keyin" yoki "M soat
// harakatsizlikdan keyin avtomat chiqarish") Supabase Dashboard -> Authentication
// -> Sessions bo'limida sozlanadi, bu yerdagi koddan mustaqil.
function initSupabaseClient() {
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true } });
  sbClient.auth.onAuthStateChange((event, session) => {
    if (session) {
      if (!hasBooted) {
        hasBooted = true;
        CURRENT_USER_EMAIL = session.user.email || "";
        localStorage.setItem(LAST_EMAIL_KEY, CURRENT_USER_EMAIL);
        const label = document.getElementById("currentUserLabel");
        if (label) label.textContent = CURRENT_USER_EMAIL;
        bootAfterAuth();
      }
    } else {
      hasBooted = false;
      CURRENT_USER_EMAIL = "";
      IS_ADMIN = false;
      ACTIVE_FIRMA_ID = null;
      AVAILABLE_FIRMALAR = [];
      const label = document.getElementById("currentUserLabel");
      if (label) label.textContent = "";
      if (REALTIME_CHANNEL) { sbClient.removeChannel(REALTIME_CHANNEL); REALTIME_CHANNEL = null; }
      setSyncStatus(false);
      showAuthGate();
    }
  });
}

const authEmailEl = document.getElementById("authEmail");
authEmailEl.value = localStorage.getItem(LAST_EMAIL_KEY) || "";

initSupabaseClient();

// "Kirish" (login) va "Ro'yxatdan o'tish" (signup) bitta forma ichida,
// #authToggleMode orqali almashtiriladi. Ro'yxatdan o'tishda kiritilgan
// "Kompaniya nomi"/INN darhol firma sifatida yaratilmaydi — chunki hali sessiya
// yo'q (yoki email tasdiqlash yoqilgan bo'lsa umuman bo'lmaydi); shu sabab
// PENDING_SIGNUP_KEY orqali saqlanadi va haqiqiy yaratish bootAfterAuth()
// ichida (birinchi muvaffaqiyatli kirishda) amalga oshadi — qarang:
// signup_create_own_firma() (migration_self_signup.sql).
let AUTH_MODE = "login";

function setAuthMode(mode) {
  AUTH_MODE = mode;
  const isSignup = mode === "signup";
  document.getElementById("authFirmaNomi").style.display = isSignup ? "" : "none";
  document.getElementById("authInn").style.display = isSignup ? "" : "none";
  document.getElementById("authPassword2").style.display = isSignup ? "" : "none";
  document.getElementById("authIntro").textContent = isSignup
    ? "Yangi kompaniya uchun hisob yarating"
    : "Shaxsiy login/parolingizni kiriting";
  document.getElementById("authSubmit").textContent = isSignup ? "Ro'yxatdan o'tish" : "Kirish";
  document.getElementById("authToggleMode").textContent = isSignup
    ? "Hisobingiz bormi? Kirish"
    : "Hisobingiz yo'qmi? Ro'yxatdan o'ting";
  document.getElementById("authError").textContent = "";
}
document.getElementById("authToggleMode").addEventListener("click", (e) => {
  e.preventDefault();
  setAuthMode(AUTH_MODE === "signup" ? "login" : "signup");
});

document.getElementById("authSubmit").addEventListener("click", async () => {
  const emailEl = document.getElementById("authEmail");
  const pwdEl = document.getElementById("authPassword");
  const pwd2El = document.getElementById("authPassword2");
  const firmaNomiEl = document.getElementById("authFirmaNomi");
  const innEl = document.getElementById("authInn");
  const errEl = document.getElementById("authError");
  const btn = document.getElementById("authSubmit");
  const email = emailEl.value.trim();
  const pwd = pwdEl.value;
  errEl.textContent = "";
  if (!email) { errEl.textContent = "Emailni kiriting"; return; }
  if (!pwd) { errEl.textContent = "Parolni kiriting"; return; }

  if (AUTH_MODE === "signup") {
    const firmaNomi = firmaNomiEl.value.trim();
    const inn = innEl.value.trim();
    if (!firmaNomi) { errEl.textContent = "Kompaniya nomini kiriting"; return; }
    const innCheck = validateField("inn", inn);
    if (!inn || !innCheck.ok) { errEl.textContent = innCheck.msg || "INN kiriting"; return; }
    if (pwd.length < 6) { errEl.textContent = "Parol kamida 6 ta belgidan iborat bo'lsin"; return; }
    if (pwd !== pwd2El.value) { errEl.textContent = "Parollar mos kelmadi"; return; }
    btn.disabled = true;
    btn.textContent = "Ro'yxatdan o'tilmoqda…";
    const { data, error } = await sbClient.auth.signUp({ email, password: pwd });
    btn.disabled = false;
    btn.textContent = "Ro'yxatdan o'tish";
    if (error) {
      errEl.textContent = error.message === "User already registered" ? "Bu email allaqachon ro'yxatdan o'tgan" : "Ro'yxatdan o'tishda xatolik: " + error.message;
      return;
    }
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify({ nomi: firmaNomi, inn }));
    if (!data.session) {
      // Loyihada email tasdiqlash yoqilgan — sessiya darhol berilmaydi.
      // Foydalanuvchi havolani bosgach, oddiy "Kirish" bilan kiradi va shu
      // paytda pending firma bootAfterAuth() orqali yaratiladi.
      setAuthMode("login");
      document.getElementById("authError").textContent = "";
      document.getElementById("authIntro").textContent = "Emailingizga tasdiqlash xati yuborildi — tasdiqlagach shu yerdan kiring.";
      pwdEl.value = ""; pwd2El.value = ""; firmaNomiEl.value = ""; innEl.value = "";
    } else {
      pwdEl.value = ""; pwd2El.value = ""; firmaNomiEl.value = ""; innEl.value = "";
    }
    return;
  }

  btn.disabled = true;
  btn.textContent = "Tekshirilmoqda…";
  const { error } = await sbClient.auth.signInWithPassword({ email, password: pwd });
  btn.disabled = false;
  btn.textContent = "Kirish";
  if (error) {
    errEl.textContent = "Email yoki parol noto'g'ri";
  } else {
    pwdEl.value = "";
  }
});
document.getElementById("authPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("authSubmit").click();
});

/* ------------------------------- E-IMZO orqali kirish -------------------------------
   Email/parolga QO'SHIMCHA variant (uni almashtirmaydi) — E-IMZO'ning rasmiy
   "CAPIWS" JS mijozi orqali (qarang: vendor/capiws.js, github.com/qo0p/e-imzo-doc)
   foydalanuvchi kompyuteridagi tashkilotga tegishli elektron imzo (sertifikat)
   tanlanadi, tasodifiy "nonce" shu kalit bilan imzolanadi, so'ng imzo (PKCS7)
   "api/eimzo-login.js" serverless funksiyasiga yuboriladi — u E-IMZO-SERVER
   orqali IMZONING HAQIQIYLIGINI (soxta emasligini) tekshiradi, sertifikatdan
   INN'ni chiqarib oladi va Supabase sessiyasini (Admin API orqali) yaratib
   qaytaradi. Bu yerdagi kod E-IMZO-SERVER'ning o'zi bilan ISHLAMAYDI — faqat
   frontend (sertifikat tanlash/imzolash) qismi shu yerda, backend tekshiruv
   "api/eimzo-login.js"da (u alohida, EIMZO_SERVER_URL sozlamasi bilan ishga
   tushiriladi — qarang shu faylning boshidagi izoh).
   DIQQAT: "list_all_certificates" va CAPIWS ulanish protokoli haqiqiy
   vendor/capiws.js kutubxonasiga bog'liq — bu ilova bilan birga kelmaydi,
   E-IMZO bilan rasman ro'yxatdan o'tgandan keyin ularning integratsiya
   paketidan olinadi. Shu fayl mavjud bo'lmasa, tugma aniq xabar bilan
   to'xtaydi (email/parol bilan kirish bunga bog'liq emas). */
const EIMZO_INN_OID = "1.2.860.3.16.1.1"; // yuridik shaxs INN'i (sertifikat subjectName maydoni)

function eimzoAvailable() {
  return typeof window.CAPIWS !== "undefined" && !window.EIMZO_MISSING;
}

function setEimzoStatus(msg, isErr) {
  const el = document.getElementById("eimzoStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isErr ? "var(--danger)" : "";
}

document.getElementById("authEimzoBtn").addEventListener("click", async () => {
  if (!eimzoAvailable()) {
    setEimzoStatus("E-IMZO kutubxonasi topilmadi (vendor/capiws.js) — administratorga murojaat qiling.", true);
    return;
  }
  setEimzoStatus("E-IMZO'ga ulanmoqda…");
  try {
    await new Promise((resolve, reject) => {
      window.CAPIWS.apikey(EIMZO_DOMAIN_API_KEYS, (event, data) => {
        if (data && data.success) resolve(); else reject(new Error("API-KEY qabul qilinmadi"));
      }, () => reject(new Error("E-IMZO dasturi ishga tushirilmagan yoki ulanib bo'lmadi")));
    });

    const certs = await new Promise((resolve, reject) => {
      window.CAPIWS.callFunction({ plugin: "pfx", name: "list_all_certificates" }, (event, data) => {
        if (data && data.success) resolve(data.certificates || []); else reject(new Error("Sertifikatlar ro'yxati olinmadi"));
      }, () => reject(new Error("Sertifikatlar ro'yxatini olishda xatolik")));
    });

    // Faqat YURIDIK SHAXS (tashkilot) sertifikatlari — shaxsiy (jismoniy
    // shaxs) sertifikatlarda bu OID bo'lmaydi.
    const orgCerts = certs.filter((c) => c.subjectName && c.subjectName[EIMZO_INN_OID]);
    if (!orgCerts.length) {
      setEimzoStatus("Tashkilotga tegishli (yuridik shaxs) elektron imzo topilmadi.", true);
      return;
    }
    const chosen = orgCerts.length === 1 ? orgCerts[0] : await pickEimzoCertificate(orgCerts);
    if (!chosen) { setEimzoStatus(""); return; }

    setEimzoStatus("Imzolanmoqda… (PIN so'ralishi mumkin)");
    const nonce = btoa(String(Date.now()) + "-" + Math.random().toString(36).slice(2));
    const pkcs7 = await new Promise((resolve, reject) => {
      window.CAPIWS.callFunction({ plugin: "pkcs7", name: "create_pkcs7", arguments: [nonce, chosen.id, "no"] }, (event, data) => {
        if (data && data.success) resolve(data.pkcs7_64); else reject(new Error("Imzolashda xatolik yoki bekor qilindi"));
      }, () => reject(new Error("Imzolashda xatolik")));
    });

    setEimzoStatus("Tekshirilmoqda…");
    const resp = await fetch(EIMZO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pkcs7 })
    });
    const result = await resp.json();
    if (!resp.ok || !result.token_hash) throw new Error(result.error || "Tasdiqlashda xatolik");

    const { error } = await sbClient.auth.verifyOtp({ email: result.email, token_hash: result.token_hash, type: "magiclink" });
    if (error) throw error;
    setEimzoStatus("");
  } catch (err) {
    console.error(err);
    setEimzoStatus(err.message || "E-IMZO orqali kirishda xatolik", true);
  }
});

function pickEimzoCertificate(certs) {
  return new Promise((resolve) => {
    openModal(`
      <h3>Sertifikatni tanlang</h3>
      <div class="table-wrap">
        ${certs.map((c, i) => `
          <div class="report-line" style="grid-template-columns:1fr auto;cursor:pointer;" data-cert-idx="${i}">
            <span>${escapeHtml((c.subjectName && c.subjectName.CN) || c.name || "")} — INN ${escapeHtml(c.subjectName[EIMZO_INN_OID])}</span>
            <span class="faint">${escapeHtml(c.validTo || "")}</span>
          </div>
        `).join("")}
      </div>
      <div class="modal-actions"><button class="btn" id="mCancel">Bekor qilish</button></div>
    `);
    document.getElementById("mCancel").addEventListener("click", () => { closeModal(); resolve(null); });
    document.querySelectorAll("[data-cert-idx]").forEach((row) => {
      row.addEventListener("click", () => { closeModal(); resolve(certs[Number(row.dataset.certIdx)]); });
    });
  });
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  openModal(`
    <h3>Tizimdan chiqish</h3>
    <p class="modal-sub">Rostdan ham tizimdan chiqmoqchimisiz?</p>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-danger" id="mConfirm">Ha, chiqish</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mConfirm").addEventListener("click", () => {
    closeModal();
    sbClient.auth.signOut();
  });
});

/* --------------------------------- init --------------------------------- */

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    navigate(item.dataset.page);
    closeMobileSidebar();
  });
});

const firmaSwitcherEl = document.getElementById("firmaSwitcher");
if (firmaSwitcherEl) {
  firmaSwitcherEl.addEventListener("change", () => switchFirma(firmaSwitcherEl.value));
}

const SIDEBAR_COLLAPSE_KEY = "bux2112_sidebar_collapsed";
const sidebarEl = document.querySelector(".sidebar");
const collapseBtn = document.getElementById("collapseBtn");
if (sidebarEl && collapseBtn) {
  if (localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1") sidebarEl.classList.add("collapsed");
  collapseBtn.addEventListener("click", () => {
    sidebarEl.classList.toggle("collapsed");
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, sidebarEl.classList.contains("collapsed") ? "1" : "0");
  });

  const navTooltip = document.createElement("div");
  navTooltip.className = "nav-tooltip";
  document.body.appendChild(navTooltip);
  sidebarEl.querySelectorAll(".nav-item[data-tip]").forEach((item) => {
    item.addEventListener("mouseenter", () => {
      if (!sidebarEl.classList.contains("collapsed")) return;
      const tip = item.getAttribute("data-tip");
      if (!tip) return;
      navTooltip.textContent = tip;
      const r = item.getBoundingClientRect();
      navTooltip.style.top = `${r.top + r.height / 2}px`;
      navTooltip.style.left = `${r.right + 8}px`;
      navTooltip.classList.add("show");
    });
    item.addEventListener("mouseleave", () => navTooltip.classList.remove("show"));
  });
}

const hamburgerBtn = document.getElementById("hamburgerBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
function openMobileSidebar() {
  if (!sidebarEl) return;
  sidebarEl.classList.add("mobile-open");
  if (sidebarBackdrop) sidebarBackdrop.classList.add("show");
}
function closeMobileSidebar() {
  if (!sidebarEl) return;
  sidebarEl.classList.remove("mobile-open");
  if (sidebarBackdrop) sidebarBackdrop.classList.remove("show");
}
if (hamburgerBtn) {
  hamburgerBtn.addEventListener("click", () => {
    if (sidebarEl && sidebarEl.classList.contains("mobile-open")) closeMobileSidebar();
    else openMobileSidebar();
  });
}
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", closeMobileSidebar);
}

applyTheme();
bindGlobalSearch();
bindKontragentHistoryDelegation();
