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

const STATUS_INVALID = ["Отказ", "Bekor qilingan", "Отменён", "Отменен", "Rad etilgan", "Не настоящий"];

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
  jamiSumma: "jami_summa", tolandi: "tolandi", tolandiOverride: "tolandi_override", faylId: "fayl_id"
};
const BANK_DB_MAP = {
  sana: "sana", hujjatRaqami: "hujjat_raqami", kontragent: "kontragent",
  kontragentInn: "kontragent_inn", tavsif: "tavsif", kirim: "kirim", chiqim: "chiqim", faylId: "fayl_id"
};
const FAYL_DB_MAP = { bolim: "bolim", faylNomi: "fayl_nomi", hajmi: "hajmi", sana: "sana" };
const ISHHAQI_DB_MAP = {
  sana: "sana", fio: "fio", lavozimi: "lavozimi", pinfl: "pinfl",
  turi: "turi", holati: "holati", oyliqSumma: "oyliq_summa", imtiyozSumma: "imtiyoz_summa", faylId: "fayl_id"
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
  kirimId: "kirim_id"
};

// Ombor kirimida turli polimer navlari (masalan "Полипропилен марки TPP D30S",
// "Поливинилхлорид С-70") bitta umumiy zaxira nomi ostida yuritiladi — miqdorlar
// BIRLASHTIRILMAYDI (har bir qator alohida qoladi), faqat "nomi" maydoni shu
// umumiy nom bilan almashtiriladi. Nomida quyidagi kalit so'zlardan birortasi
// uchrasa (katta-kichik harfga qaramasdan), canonicalizeOmborNomi shu umumiy
// nomni qaytaradi. Ombor kirimi Excel importida (parseOmborLineItems) avtomat
// qo'llanadi; mavjud (import qilib bo'lingan) yozuvlar esa Ombor kirimi
// sahifasidagi "Nomlarni birlashtirish" tugmasi orqali qo'lda tanlab
// birlashtiriladi (openOmborMergeNomiModal).
const OMBOR_UNIFY_KEYWORDS = ["полиэтилен", "полипропилен", "поливинилхлорид", "пвх", "шпагат", "полиацетали"];
const OMBOR_UNIFIED_NOMI = "Polietilen granula";

function canonicalizeOmborNomi(nomi) {
  const s = String(nomi || "").trim();
  if (!s) return s;
  const low = s.toLowerCase();
  if (OMBOR_UNIFY_KEYWORDS.some((k) => low.includes(k))) return OMBOR_UNIFIED_NOMI;
  return s;
}
const MAHSULOT_DB_MAP = { nomi: "nomi", birlik: "birlik", tarkib: "tarkib", standartNarxi: "standart_narxi" };
const ISHLAB_CHIQARISH_DB_MAP = {
  sana: "sana", mahsulotId: "mahsulot_id", mahsulotNomi: "mahsulot_nomi",
  miqdor: "miqdor", birlik: "birlik", tannarx: "tannarx", izoh: "izoh"
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
  kirim: INVOICE_DB_MAP, chiqim: INVOICE_DB_MAP, bank: BANK_DB_MAP, ishHaqi: ISHHAQI_DB_MAP, ombor: OMBOR_DB_MAP,
  mahsulotlar: MAHSULOT_DB_MAP, ishlabChiqarish: ISHLAB_CHIQARISH_DB_MAP, fayllar: FAYL_DB_MAP,
  kontragentlar: KONTRAGENT_DB_MAP, asosiyVositalar: ASOSIY_VOSITA_DB_MAP, chiqimTafsil: CHIQIM_TAFSIL_DB_MAP
};
const TABLE_NAMES = {
  kirim: "kirim", chiqim: "chiqim", bank: "bank", ishHaqi: "ish_haqi", ombor: "ombor",
  mahsulotlar: "mahsulotlar", ishlabChiqarish: "ishlab_chiqarish", fayllar: "fayllar",
  kontragentlar: "kontragentlar", asosiyVositalar: "asosiy_vositalar", chiqimTafsil: "chiqim_tafsil"
};

const SETTINGS_DB_MAP = {
  companyName: "company_name", inn: "inn", address: "address",
  qqsStavka: "qqs_stavka", foydaStavka: "foyda_stavka", period: "period",
  davrXarajati: "davr_xarajati", moliyaviyXarajat: "moliyaviy_xarajat",
  boshqaDaromad: "boshqa_daromad", imtiyozlar: "imtiyozlar", tannarxManual: "tannarx_manual",
  bankOpeningBalance: "bank_opening_balance",
  f1AsosiyVositalar: "f1_asosiy_vositalar", f1TovarZaxira: "f1_tovar_zaxira", f1Kassa: "f1_kassa",
  f1UstavKapitali: "f1_ustav_kapitali", f1OldingiFoyda: "f1_oldingi_foyda", f1UzoqMajburiyat: "f1_uzoq_majburiyat",
  ijtimoiySoliqStavka: "ijtimoiy_soliq_stavka", ndflStavka: "ndfl_stavka", inpsStavka: "inps_stavka",
  rahbar: "rahbar"
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
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); }
  });
}

// RLS policy o'chirishni rad etganda (masalan, faqat admin o'chira oladigan
// qatorni oddiy xodim o'chirishga urinishi) Supabase/Postgres "42501" xato
// kodini qaytaradi — buni tushunarli xabarga aylantiramiz.
function isPermissionError(error) {
  return !!(error && (error.code === "42501" || /permission|policy|rls/i.test(String(error.message || ""))));
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
      boshqaDaromad: 0,
      imtiyozlar: 0,
      tannarxManual: null,
      bankOpeningBalance: 0,
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
      // Kalkulyatsiya blankasi (chop etish) "UTVERJDAYU" bandida ko'rsatiladi
      rahbar: ""
    },
    kirim: [],
    chiqim: [],
    bank: [],
    ishHaqi: [],
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

/* ------------------------------ utilities ------------------------------ */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function toNum(v) {
  if (v === "" || v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function fmt(n, digits = 0) {
  n = toNum(n);
  const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return n.toLocaleString("ru-RU", opts);
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
  if (abs >= 1e9) return `${fmt(n / 1e9, 1).replace(/,0$/, "")} mlrd`;
  if (abs >= 1e6) return `${fmt(n / 1e6, 1).replace(/,0$/, "")} mln`;
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

function isValidStatus(status) {
  return !STATUS_INVALID.includes(status);
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

function toast(msg, type = "ok") {
  const stack = document.getElementById("toastStack");
  const node = el(`<div class="toast ${type}">${escapeHtml(msg)}</div>`);
  stack.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

function openModal(html) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
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

function sumRows(rows, field, onlyValid = true) {
  return rows.reduce((acc, r) => {
    if (onlyValid && !isValidStatus(r.status)) return acc;
    return acc + toNum(r[field]);
  }, 0);
}

function computeTotals() {
  const s = STORE.settings;
  const to = s.filterTo;

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

  const bankKirim = asOfBank.reduce((a, r) => a + toNum(r.kirim), 0);
  const bankChiqim = asOfBank.reduce((a, r) => a + toNum(r.chiqim), 0);
  const bankOpening = toNum(s.bankOpeningBalance);
  const bankQoldiq = bankOpening + bankKirim - bankChiqim;

  const kreditorlik = asOfKirim.reduce((a, r) => (isValidStatus(r.status) && !r.tolandi ? a + toNum(r.jamiSumma) : a), 0);
  const debitorlik = asOfChiqim.reduce((a, r) => (isValidStatus(r.status) && !r.tolandi ? a + toNum(r.jamiSumma) : a), 0);

  // Kalkulyatsiya (chiqim_tafsil) asosida davr uchun sotilgan mahsulotlarning
  // xomashyo tannarxi — F2/Foyda solig'ida "Sotilgan mahsulot tannarxi"
  // (020-qator) manbai sifatida ishlatiladi (avvalgi "kirim fakturalar
  // summasi" taxminidan aniqroq, chunki faqat HAQIQATDA sotilgan mahsulotning
  // o'zi uchun ketgan xomashyo hisoblanadi). Kalkulyatsiya bilan bog'lanmagan
  // (mahsulotId=null) qatorlar hisobga olinmaydi.
  const periodChiqimTafsil = getFilteredRows(STORE.chiqimTafsil);
  const kalkulyatsiyaTannarx = periodChiqimTafsil.reduce((sum, t) => {
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    if (!mahsulot) return sum;
    return sum + computeMahsulotConsumption(mahsulot, t.miqdor).tannarx;
  }, 0);
  // Bosh sahifadagi "Kalkulyatsiya bo'yicha foyda" statistika kartasi uchun —
  // faqat kalkulyatsiya bilan bog'langan chiqim_tafsil qatorlarining o'zidan
  // (davr bo'yicha), kirim/chiqim fakturalar jamisidan emas.
  const kalkulyatsiyaSavdo = periodChiqimTafsil.reduce((sum, t) => sum + (toNum(t.summa) || toNum(t.miqdor) * toNum(t.narx)), 0);
  const kalkulyatsiyaFoyda = kalkulyatsiyaSavdo - kalkulyatsiyaTannarx;

  // ---- F2: Moliyaviy natijalar ----
  const revenue = chiqimBase;
  const tannarx = s.tannarxManual !== null && s.tannarxManual !== undefined && s.tannarxManual !== "" ? toNum(s.tannarxManual) : kalkulyatsiyaTannarx;
  const yalpiFoyda = revenue - tannarx;
  const davrXarajati = toNum(s.davrXarajati);
  const asosiyFaoliyatFoyda = yalpiFoyda - davrXarajati;
  const moliyaviyXarajat = toNum(s.moliyaviyXarajat);
  const soliqqachaFoyda = asosiyFaoliyatFoyda - moliyaviyXarajat;

  // ---- Foyda solig'i (F2 va Foyda solig'i hisoboti bitta manbadan hisoblanadi) ----
  const jamiDaromad = revenue + toNum(s.boshqaDaromad);
  const chegiriladiXarajat = tannarx + davrXarajati + moliyaviyXarajat;
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
  const pulMablaglari = bankQoldiq + toNum(s.f1Kassa);
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
    bankKirim, bankChiqim, bankOpening, bankQoldiq,
    kreditorlik, debitorlik,
    revenue, tannarx, kalkulyatsiyaTannarx, kalkulyatsiyaSavdo, kalkulyatsiyaFoyda, yalpiFoyda, davrXarajati, asosiyFaoliyatFoyda,
    moliyaviyXarajat, soliqqachaFoyda, foydaSoligi, sofFoyda,
    jamiDaromad, chegiriladiXarajat, soliqqaTortiladiganFoyda, imtiyozlar, soliqBazasi, foydaStavka,
    qqsInput, qqsOutput, qqsToPay,
    pulMablaglari, asosiyVositalar, tovarZaxira, aktivJami,
    ustavKapitali, oldingiFoyda, jamgarilganFoyda, uzoqMajburiyat, passivJami
  };
}

/* -------------------------------- routing -------------------------------- */

const PAGES = {
  dashboard: { render: renderDashboard },
  kirim: { render: () => renderInvoiceTable("kirim") },
  chiqim: { render: () => renderInvoiceTable("chiqim") },
  bank: { render: renderBank },
  ombor: { render: renderOmbor },
  kontragentlar: { render: renderKontragentlar },
  asosiyvositalar: { render: renderAsosiyVositalar },
  ishlabchiqarish: { render: renderIshlabChiqarish },
  fayllar: { render: renderFayllar },
  ishhaqi: { render: renderIshHaqi },
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
  firmalar: { render: renderFirmalar }
};

function navigate(page) {
  CURRENT_PAGE = page;
  if (page === "sverka") SVERKA_STATUS_FILTER = null;
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  PAGES[page].render();
}

function updateNavBadges() {
  document.getElementById("navKirimCount").textContent = STORE.kirim.length;
  document.getElementById("navChiqimCount").textContent = STORE.chiqim.length;
  document.getElementById("navBankCount").textContent = STORE.bank.length;
  document.getElementById("navIshHaqiCount").textContent = STORE.ishHaqi.length;
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
  const muddatiOtganKirim = computeKreditorlikAging().rows.filter((r) => r.daysOverdue > 30).length;
  const muddatiOtganChiqim = computeDebitorlikAging().rows.filter((r) => r.daysOverdue > 30).length;
  const innsiz = ["kirim", "chiqim"].reduce((a, type) =>
    a + STORE[type].filter((r) => isValidStatus(r.status) && !(r.kontragentInn && String(r.kontragentInn).trim())).length, 0);
  const takrorlar = ["kirim", "chiqim"].reduce((a, type) => a + findDuplicateInvoiceIds(type).groupCount, 0);
  return {
    kalkulyatsiyasiz, muddatiOtganKirim, muddatiOtganChiqim, innsiz, takrorlar,
    total: kalkulyatsiyasiz + muddatiOtganKirim + muddatiOtganChiqim + innsiz + takrorlar
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
    { count: s.kalkulyatsiyasiz, label: "Kalkulyatsiya bilan bog'lanmagan sotuv qatorlari", desc: "Sotilgan mahsulot ombordan hali sarflanmagan — \"Ishlab chiqarish\" bo'limida bog'lang.", action: () => navigate("ishlabchiqarish") },
    { count: s.muddatiOtganKirim, label: "30 kundan ortiq to'lanmagan kirim fakturalar", desc: "Muddati o'tgan kreditorlik — \"Kreditorlik muddati\" hisobotida ko'ring.", action: () => navigate("kreditorlik") },
    { count: s.muddatiOtganChiqim, label: "30 kundan ortiq to'lanmagan chiqim fakturalar", desc: "Muddati o'tgan debitorlik (xaridorlar qarzi) — \"Debitorlik muddati\" hisobotida ko'ring.", action: () => navigate("debitorlik") },
    { count: s.innsiz, label: "INN kiritilmagan kirim/chiqim yozuvlari", desc: "Bunday yozuvlarda to'lov holati avtomatik solishtirilmaydi, \"To'landi\" belgisi qo'lda qo'yiladi.", action: () => navigate("kirim") },
    { count: s.takrorlar, label: "Ehtimoliy takrorlangan hujjatlar", desc: "Hujjat №+sana+summa+kontragent bo'yicha bir xil yozuvlar — \"Faktura kirim/chiqim\" sahifasidagi \"Takrorlar\" tugmasi orqali tekshiring.", action: () => navigate("kirim") }
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
      results.push({ type: "Kontragent", label: `${k.nomi || "—"}${k.inn ? " · " + k.inn : ""}`, page: "kontragentlar" });
    }
  });
  STORE.kirim.forEach((r) => {
    if ((r.hujjatRaqami || "").toLowerCase().includes(q) || (r.kontragentNomi || "").toLowerCase().includes(q)) {
      results.push({ type: "Kirim", label: `${r.hujjatRaqami || "—"} · ${r.kontragentNomi || ""}`, page: "kirim" });
    }
  });
  STORE.chiqim.forEach((r) => {
    if ((r.hujjatRaqami || "").toLowerCase().includes(q) || (r.kontragentNomi || "").toLowerCase().includes(q)) {
      results.push({ type: "Chiqim", label: `${r.hujjatRaqami || "—"} · ${r.kontragentNomi || ""}`, page: "chiqim" });
    }
  });
  STORE.bank.forEach((r) => {
    if ((r.tavsif || "").toLowerCase().includes(q) || (r.kontragent || "").toLowerCase().includes(q) || (r.hujjatRaqami || "").toLowerCase().includes(q)) {
      results.push({ type: "Bank", label: `${r.kontragent || r.tavsif || "—"}`, page: "bank" });
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
      navigate(r.page);
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
    if (mahsulot) b.tannarx += computeMahsulotConsumption(mahsulot, tf.miqdor).tannarx;
  });

  buckets.forEach((b) => { b.foyda = b.savdo - b.tannarx; });
  return buckets;
}

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

function dashboardTrendChartHtml(trend) {
  const W = 640, H = 230, padL = 54, padR = 64, padT = 16, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxVal = Math.max(1, ...trend.flatMap((b) => [b.savdo, b.tannarx, Math.abs(b.foyda)]));
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

  const seriesPaths = DASHBOARD_TREND_SERIES.map((s) => {
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

  const legend = DASHBOARD_TREND_SERIES.map((s) => `
    <span class="chart-legend-item"><span class="chart-legend-key" style="background:var(${s.varName})"></span>${escapeHtml(s.label)}</span>
  `).join("");

  const tableRows = trend.map((b) => `
    <tr><td>${escapeHtml(b.label)}</td><td class="num">${fmtSum(b.savdo)}</td><td class="num">${fmtSum(b.tannarx)}</td><td class="num">${fmtSum(b.foyda)}</td></tr>
  `).join("");

  return `
    <div class="chart-legend">${legend}<button class="btn btn-sm" id="btnDashChartTable" style="margin-left:auto;">Jadval ko'rinishida</button></div>
    <div class="chart-wrap" id="dashChartWrap" style="position:relative;">
      <svg id="dashTrendSvg" viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block;">
        ${gridLines.join("")}
        ${xLabels}
        ${seriesPaths}
        <line id="dashCrosshair" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="var(--border-strong)" stroke-width="1" style="display:none;"/>
        ${hitCols}
      </svg>
      <div id="dashChartTooltip" class="chart-tooltip" style="display:none;"></div>
    </div>
    <div class="table-wrap" id="dashChartTableWrap" style="display:none; margin-top:10px;">
      <table>
        <thead><tr><th>Oy</th><th class="num">Savdo</th><th class="num">Tannarx</th><th class="num">Foyda</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function bindDashboardChart(trend) {
  const wrap = document.getElementById("dashChartWrap");
  const svg = document.getElementById("dashTrendSvg");
  const crosshair = document.getElementById("dashCrosshair");
  const tooltip = document.getElementById("dashChartTooltip");
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
      ${DASHBOARD_TREND_SERIES.map((s) => `
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

  const tableBtn = document.getElementById("btnDashChartTable");
  const tableWrap = document.getElementById("dashChartTableWrap");
  if (tableBtn && tableWrap) tableBtn.addEventListener("click", () => {
    const showingTable = tableWrap.style.display !== "none";
    tableWrap.style.display = showingTable ? "none" : "";
    wrap.style.display = showingTable ? "" : "none";
    tableBtn.textContent = showingTable ? "Jadval ko'rinishida" : "Grafik ko'rinishida";
  });
}

function renderDashboard() {
  const t = computeTotals();
  const trend = computeMonthlyTrend(6);
  const uncostedCount = STORE.chiqimTafsil.filter((tf) => !tf.mahsulotId).length;
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

    <div class="note" style="margin:0 0 14px;">Ko'rsatkichlar yuqoridagi "Davr" filtriga mos ravishda hisoblanadi.</div>

    <div class="grid grid-4 section">
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-label">Sof tushum (savdo)</div>${sparklineSvg(trend.map((b) => b.savdo), "--ok")}</div>
        <div class="stat-value">${fmtSum(t.revenue)}</div>
        <div class="stat-sub">${trendDeltaChip(trend.map((b) => b.savdo), true)} ${getFilteredRows(STORE.chiqim).length} ta chiqim faktura</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-label">Xaridlar (tannarx)</div>${sparklineSvg(trend.map((b) => b.tannarx), "--accent")}</div>
        <div class="stat-value">${fmtSum(t.tannarx)}</div>
        <div class="stat-sub">${trendDeltaChip(trend.map((b) => b.tannarx), false)} ${getFilteredRows(STORE.kirim).length} ta kirim faktura</div>
      </div>
      <div class="card stat-card">
        <div class="stat-top"><div class="stat-label">Sof foyda</div>${sparklineSvg(trend.map((b) => b.foyda), t.sofFoyda >= 0 ? "--ok" : "--danger")}</div>
        <div class="stat-value">${fmtSum(t.sofFoyda)}</div>
        <div class="stat-sub ${t.sofFoyda >= 0 ? "pos" : "neg"}">${trendDeltaChip(trend.map((b) => b.foyda), true)} ${t.sofFoyda >= 0 ? "Foyda" : "Zarar"}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Bank qoldig'i</div>
        <div class="stat-value">${fmtSum(t.bankQoldiq)}</div>
        <div class="stat-sub">${STORE.bank.length} ta bank operatsiyasi</div>
      </div>
    </div>

    <div class="grid grid-3 section">
      <div class="card stat-card">
        <div class="stat-label">QQS (byudjetga)</div>
        <div class="stat-value">${fmtSum(t.qqsToPay)}</div>
        <div class="stat-sub">Chiqim QQS ${fmtSum(t.qqsOutput)} − Kirim QQS ${fmtSum(t.qqsInput)}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Foyda solig'i</div>
        <div class="stat-value">${fmtSum(t.foydaSoligi)}</div>
        <div class="stat-sub">Stavka ${t.foydaStavka}%</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">Debitor / Kreditor</div>
        <div class="stat-value" style="font-size:16px">${fmtSum(t.debitorlik)} / ${fmtSum(t.kreditorlik)}</div>
        <div class="stat-sub">Mijozlar qarzi / bizning qarzimiz</div>
      </div>
    </div>

    <div class="grid grid-2 section">
      <div class="card stat-card">
        <div class="stat-label">Kalkulyatsiya bo'yicha foyda</div>
        <div class="stat-value">${fmtSum(t.kalkulyatsiyaFoyda)}</div>
        <div class="stat-sub">Sotuv ${fmtSum(t.kalkulyatsiyaSavdo)} − tannarx ${fmtSum(t.kalkulyatsiyaTannarx)}</div>
      </div>
      <div class="card stat-card" ${uncostedCount ? `data-nav="ishlabchiqarish" style="cursor:pointer;"` : ""}>
        <div class="stat-label">Kalkulyatsiya qilinmagan sotuvlar</div>
        <div class="stat-value ${uncostedCount ? "neg" : ""}">${uncostedCount}</div>
        <div class="stat-sub">${uncostedCount ? "Ishlab chiqarish sahifasida ko'rish uchun bosing" : "Barcha sotuvlar kalkulyatsiya bilan bog'langan"}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">So'nggi 6 oy — savdo, tannarx, foyda</h2>
      <div class="card" style="padding:18px;">
        ${dashboardTrendChartHtml(trend)}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Bo'limlar orasidagi bog'liqlik</h2>
      <div class="card" style="padding:22px;">
        <div class="note" style="margin-top:0;">
          <b>Qanday ishlaydi:</b> Faktura kirim/chiqim va Bank bo'limlariga kiritilgan ma'lumotlar avtomatik ravishda
          <b>QQS</b>, <b>F2 (moliyaviy natija)</b>, <b>Foyda solig'i</b> va <b>F1 (balans)</b> hisobotlariga integratsiya bo'ladi —
          alohida qayta kiritish shart emas. Faqat har bir hujjatning holati (status) "Отказ/Bekor qilingan" bo'lmasa, hisobga olinadi.
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
}

function recentList(type) {
  const rows = STORE[type].slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || "")).slice(0, 5);
  const title = type === "kirim" ? "Oxirgi kirim fakturalar" : "Oxirgi chiqim fakturalar";
  if (!rows.length) {
    return `<div class="card"><div class="card-title">${title}</div><div class="empty-state" style="padding:20px 0;"><div class="d">Hozircha hujjat yo'q</div></div></div>`;
  }
  return `
    <div class="card">
      <div class="card-title">${title}</div>
      ${rows.map((r) => `
        <div class="report-line" style="grid-template-columns:70px 1fr 120px;">
          <span class="faint mono">${escapeHtml(r.sana || "—")}</span>
          <span>${escapeHtml(r.kontragentNomi || "—")}</span>
          <span class="val">${fmtSum(r.jamiSumma)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function bindNavShortcuts(scope) {
  scope.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
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

function renderInvoiceTable(type) {
  const info = INVOICE_LABELS[type];
  const filtered = getFilteredRows(STORE[type]);
  const { ids: dupIds, groupCount: dupGroupCount } = findDuplicateInvoiceIds(type);
  const visibleRows = INVOICE_DUP_FILTER[type] ? filtered.filter((r) => dupIds.has(r.id)) : filtered;
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
        <button class="btn" id="btnImport">Excel'dan import</button>
        <button class="btn btn-primary" id="btnAddRow">+ Qo'lda qo'shish</button>
      </div>
    </div>
    <div class="grid grid-3 section">
      <div class="card stat-card"><div class="stat-label">Summa (QQSsiz)</div><div class="stat-value" id="statBase">${fmtSum(totalBase)}</div></div>
      <div class="card stat-card"><div class="stat-label">QQS summasi</div><div class="stat-value" id="statQQS">${fmtSum(totalQQS)}</div></div>
      <div class="card stat-card"><div class="stat-label">Jami (QQS bilan)</div><div class="stat-value" id="statJami">${fmtSum(totalJami)}</div></div>
    </div>

    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: kontragent, hujjat raqami...">
      <button class="btn ${INVOICE_DUP_FILTER[type] ? "btn-primary" : ""}" id="btnDupToggle" title="Hujjat raqami+sana+summa+kontragent bo'yicha bir xil yozuvlarni ko'rsatadi">
        <svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:3px;"><use href="#i-copy"/></svg>Takrorlar${dupGroupCount ? ` (${dupGroupCount})` : ""}
      </button>
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv${INVOICE_DUP_FILTER[type] ? " (faqat takrorlar)" : ""}</span>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
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
        <tbody id="invoiceBody">
          ${rows.length ? rows.map((r) => invoiceRowHtml(type, r, dupIds.has(r.id))).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-doc"/></svg><div class="t">${INVOICE_DUP_FILTER[type] ? "Takrorlangan hujjat topilmadi" : "Hujjatlar yo'q"}</div><div class="d">${INVOICE_DUP_FILTER[type] ? "Hujjat raqami+sana+summa+kontragent bo'yicha bir xil yozuv yo'q." : `"Excel'dan import" tugmasi orqali didox.uz eksport faylini yuklang yoki qo'lda qo'shing.`}</div></div>` : ""}
    ${kontragentlarDatalistHtml()}
  `;

  document.getElementById("btnAddRow").addEventListener("click", () => addInvoiceRow(type));
  document.getElementById("btnImport").addEventListener("click", () => openImportModal(type));
  document.getElementById("searchBox").addEventListener("input", (e) => filterInvoiceRows(e.target.value));
  document.getElementById("btnDupToggle").addEventListener("click", () => {
    INVOICE_DUP_FILTER[type] = !INVOICE_DUP_FILTER[type];
    renderInvoiceTable(type);
  });

  bindInvoiceRowEvents(type);
}

function invoiceRowHtml(type, r, isDup) {
  const invalid = !isValidStatus(r.status);
  const statusPill = invalid ? "pill-danger" : (r.status === "Ожидает" ? "pill-warn" : "pill-ok");
  const rowStyle = [invalid ? "opacity:.55" : "", isDup ? "background:var(--warn-soft)" : ""].filter(Boolean).join(";");
  return `
    <tr data-id="${r.id}" style="${rowStyle}" title="${isDup ? "Diqqat: bu hujjat raqami+sana+summa+kontragent bo'yicha boshqa yozuv(lar) bilan bir xil bo'lishi mumkin" : ""}">
      <td><input type="date" class="cell-input" data-f="sana" value="${escapeHtml(r.sana || "")}"></td>
      <td><input class="cell-input" data-f="hujjatRaqami" value="${escapeHtml(r.hujjatRaqami || "")}" style="min-width:90px"></td>
      <td><input class="cell-input" data-f="kontragentNomi" list="kontragentlarList" value="${escapeHtml(r.kontragentNomi || "")}" style="min-width:170px"></td>
      <td><input class="cell-input" data-f="kontragentInn" value="${escapeHtml(r.kontragentInn || "")}" style="min-width:90px"></td>
      <td><span class="pill ${statusPill}">${escapeHtml(r.status || "Подписан")}</span></td>
      <td style="text-align:center">${tolandiCellHtml(r)}</td>
      <td class="num"><input class="cell-input num" data-f="summaQQSsiz" value="${fmt(r.summaQQSsiz)}"></td>
      <td class="num"><input class="cell-input num" data-f="qqsStavka" value="${fmt(r.qqsStavka)}" style="width:50px"></td>
      <td class="num"><input class="cell-input num" data-f="qqsSumma" value="${fmt(r.qqsSumma)}"></td>
      <td class="num jami-cell" style="font-weight:700">${fmtSum(r.jamiSumma)}</td>
      <td class="row-actions">
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
  if (error) { console.error(error); toast("Qo'shishda xatolik", "err"); return; }
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

// Xomashyoning o'rtacha xarid narxi (QQSsiz, 1 birlik uchun) — barcha "kirim"
// qatorlaridagi shu nomdagi yozuvlar bo'yicha. Mahsulot kalkulyatsiyasi va
// Ishlab chiqarish tannarxini hisoblashda ishlatiladi.
function avgOmborNarx(nomi) {
  const rows = omborKirimRows().filter((r) => r.nomi === nomi);
  const totalMiqdor = rows.reduce((a, r) => a + toNum(r.miqdor), 0);
  if (!totalMiqdor) return 0;
  const totalBaza = rows.reduce((a, r) => a + toNum(r.yetkazibBerishNarxi), 0);
  return totalBaza / totalMiqdor;
}

// Ombordagi joriy tovar-moddiy zaxiralar qiymati (QQSsiz) — "asOfDate"
// sanasiga nisbatan (F1 balans uchun). Har bir nom bo'yicha shu sanagacha
// bo'lgan kirim/chiqim miqdorlari asosida qoldiq va o'rtacha xarid narxi
// hisoblanadi, so'ng qoldiq * o'rtacha narx yig'indisi qaytariladi.
function omborQoldiqQiymatiAsOf(asOfDate) {
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
        <button class="btn" id="btnImport">Excel'dan import</button>
        <button class="btn" id="btnUnifyNomi">Nomlarni birlashtirish</button>
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
        <tbody id="omborBody">
          ${rows.length ? rows.map((r) => omborRowHtml(r)).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-package"/></svg><div class="t">Ombor bo'sh</div><div class="d">"Excel'dan import" tugmasi orqali didox.uz "faktura kirim" eksport faylini yuklang yoki qo'lda qo'shing.</div></div>` : ""}
  `;

  bindOmborTabBar(main);
  document.getElementById("btnAddRow").addEventListener("click", () => addOmborRow());
  document.getElementById("btnImport").addEventListener("click", () => openOmborImportModal());
  document.getElementById("btnUnifyNomi").addEventListener("click", () => openOmborMergeNomiModal());
  document.getElementById("searchBox").addEventListener("input", (e) => filterOmborRows(e.target.value));

  bindOmborRowEvents();
}

function omborChiqimRowHtml(r) {
  const icId = (r.hujjatRaqami || "").startsWith("IC-") ? r.hujjatRaqami.slice(3) : "";
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
      <td class="row-actions"><button class="icon-btn" data-del-chiqim="${r.id}" data-ic="${icId}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></td>
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
        <button class="btn" id="btnImportChiqim">Excel'dan import</button>
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
  const body = document.getElementById("omborChiqimBody");
  if (body) body.addEventListener("click", (e) => {
    const delId = e.target.dataset.delChiqim;
    if (!delId) return;
    const icId = e.target.dataset.ic;
    if (icId) deleteIshlabChiqarishEntry(icId);
    else deleteOmborChiqimRow(delId);
  });
}

async function deleteOmborChiqimRow(id) {
  const ok = await deleteRowSafe("ombor", "ombor", id, renderOmborChiqim);
  if (ok) toast("O'chirildi, ombor qoldig'i yangilandi");
}

function renderOmborQoldiq() {
  const main = document.getElementById("main");
  const qoldiq = omborQoldiqList();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ombor</h1>
        <p class="page-desc">Har bir xomashyo/mahsulot bo'yicha joriy zaxira — jami kirim va sarflangan (chiqim) miqdor asosida, barcha davr uchun.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnPrintOmborQoldiq">PDF (chop etish)</button>
        <button class="btn" id="btnExportOmborQoldiq">Excel'ga eksport</button>
      </div>
    </div>

    ${omborTabBarHtml()}

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Maxsulot nomi</th><th>O'lchov birligi</th><th class="num">Kirim (jami)</th><th class="num">Sarflandi (chiqim)</th><th class="num">Qoldiq</th></tr>
        </thead>
        <tbody>
          ${qoldiq.length ? qoldiq.map((q) => `
            <tr>
              <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(q.nomi)}">${escapeHtml(q.nomi)}</td>
              <td>${escapeHtml(q.birlik || "")}</td>
              <td class="num">${fmt(q.kirim, 3)}</td>
              <td class="num">${fmt(q.chiqim, 3)}</td>
              <td class="num" style="font-weight:700;${q.qoldiq < 0 ? "color:var(--danger,#e5484d)" : ""}">${fmt(q.qoldiq, 3)}</td>
            </tr>
          `).join("") : `<tr><td colspan="5" class="faint" style="text-align:center;padding:16px;">Hozircha ma'lumot yo'q</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  bindOmborTabBar(main);
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
    ["Maxsulot nomi", "O'lchov birligi", "Kirim (jami)", "Sarflandi (chiqim)", "Qoldiq"]
  ];
  qoldiq.forEach((q) => aoa.push([q.nomi, q.birlik || "", q.kirim, q.chiqim, q.qoldiq]));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ombor qoldig'i");
  XLSX.writeFile(wb, `FORGET_ombor_qoldiq_${todayISO()}.xlsx`);
  toast("Excel fayl yuklab olindi");
}

function printOmborQoldiqPdf(qoldiq) {
  const s = STORE.settings;
  const bodyRows = qoldiq.map((q) => `
    <tr>
      <td>${escapeHtml(q.nomi)}</td>
      <td>${escapeHtml(q.birlik || "")}</td>
      <td class="num">${fmt(q.kirim, 3)}</td>
      <td class="num">${fmt(q.chiqim, 3)}</td>
      <td class="num"><b>${fmt(q.qoldiq, 3)}</b></td>
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
          <tr><th>Maxsulot nomi</th><th>O'lchov birligi</th><th class="num">Kirim (jami)</th><th class="num">Sarflandi (chiqim)</th><th class="num">Qoldiq</th></tr>
        </thead>
        <tbody>${bodyRows}</tbody>
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
      <td class="row-actions"><button class="icon-btn" data-del="${r.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></td>
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
    const delId = e.target.dataset.del;
    if (delId) deleteRowSafe("ombor", "ombor", delId, renderOmbor);
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
  if (error) { console.error(error); toast("Qo'shishda xatolik", "err"); return; }
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
    const rawNomi = String(row[col.nomi] || "").trim();
    if (!rawNomi || !isValidStatus(ctx.status)) continue;
    const nomi = canonicalizeOmborNomi(rawNomi);

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
      } catch (error) { console.error(error); toast("Bazaga yozishda xatolik", "err"); return; }
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
function omborUniqueNomiList() {
  const map = new Map();
  STORE.ombor.forEach((r) => {
    if (!r.nomi) return;
    map.set(r.nomi, (map.get(r.nomi) || 0) + 1);
  });
  return [...map.entries()]
    .map(([nomi, count]) => ({ nomi, count }))
    .sort((a, b) => a.nomi.localeCompare(b.nomi, "ru"));
}

function openOmborMergeNomiModal() {
  const list = omborUniqueNomiList();
  if (list.length < 2) { toast("Birlashtirish uchun ombordagi nomlar yetarli emas"); return; }
  openModal(`
    <h3>Nomlarni birlashtirish</h3>
    <p class="modal-sub">Ombordagi nomlar ro'yxatidan birlashtiriladiganlarini belgilang, so'ng yangi nomni yozing — belgilangan nomdagi barcha yozuvlar shu yangi nomga o'tkaziladi:</p>
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
    const targets = STORE.ombor.filter((r) => selected.includes(r.nomi));
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
      <td>${escapeHtml(r.mahsulotNomi || "—")}</td>
      <td class="num">${fmt(r.miqdor, 3)}</td>
      <td>${escapeHtml(r.birlik || "")}</td>
      <td class="num">${fmtSum(r.tannarx)}</td>
      <td>${escapeHtml(r.izoh || "")}</td>
      <td class="row-actions"><button class="icon-btn" data-del-ic="${r.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></td>
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
          <thead><tr><th>Sana</th><th>Hujjat</th><th>Nomi (facturada)</th><th class="num">Miqdor</th><th class="num">Narx</th><th></th></tr></thead>
          <tbody id="uncostedBody">
            ${uncostedRows.map((t) => `
              <tr data-id="${t.id}">
                <td class="mono">${escapeHtml(t.sana || "")}</td>
                <td>${escapeHtml(t.hujjatRaqami || "")}</td>
                <td>${escapeHtml(t.nomi || "")}</td>
                <td class="num">${fmt(t.miqdor, 3)} ${escapeHtml(t.birlik || "")}</td>
                <td class="num">${fmtSum(t.narx)}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-rematch="${t.id}" title="Qayta moslashtirishga urinish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-refresh"/></svg></button>
                  <button class="icon-btn" data-open-kalk="${t.chiqimId}" title="Kalkulyatsiyaga o'tish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-calc"/></svg></button>
                </td>
              </tr>
            `).join("")}
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
        <div class="page-actions"><button class="btn btn-primary" id="btnAddIC">+ Yozuv qo'shish</button></div>
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
  document.getElementById("btnAddIC").addEventListener("click", () => openIshlabChiqarishModal());
  const rematchAllBtn = document.getElementById("btnRematchAll");
  if (rematchAllBtn) rematchAllBtn.addEventListener("click", rematchAllChiqimTafsil);
  main.querySelectorAll("[data-edit-m]").forEach((b) => b.addEventListener("click", () => openMahsulotModal(b.dataset.editM)));
  main.querySelectorAll("[data-del-m]").forEach((b) => b.addEventListener("click", () => deleteMahsulot(b.dataset.delM)));
  const icBody = document.getElementById("icBody");
  if (icBody) icBody.addEventListener("click", (e) => {
    const id = e.target.dataset.delIc;
    if (id) deleteIshlabChiqarishEntry(id);
  });
  const uncostedBody = document.getElementById("uncostedBody");
  if (uncostedBody) uncostedBody.addEventListener("click", (e) => {
    const rematchId = e.target.dataset.rematch;
    if (rematchId) { rematchChiqimTafsil(rematchId).then(() => renderIshlabChiqarish()); return; }
    const kalkChiqimId = e.target.dataset.openKalk;
    if (kalkChiqimId) openChiqimKalkulyatsiyaModal(kalkChiqimId);
  });
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
    <div class="tarkib-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
      <input class="search-input tarkib-nomi" list="omborNomiList" placeholder="Xomashyo nomi (Ombordagi nomi bilan bir xil bo'lishi kerak)" value="${escapeHtml(item.nomi || "")}" style="flex:2">
      <input class="search-input tarkib-birlik" placeholder="Birlik" value="${escapeHtml(item.birlik || "")}" style="width:90px">
      <input class="search-input tarkib-norma" placeholder="Norma" value="${item.norma ? fmt(item.norma, 4) : ""}" style="width:110px">
      <button type="button" class="icon-btn tarkib-del" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
    </div>
  `;
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
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("btnAddTarkibRow").addEventListener("click", () => {
    document.getElementById("tarkibRows").insertAdjacentHTML("beforeend", tarkibRowHtml({}));
  });
  document.getElementById("tarkibRows").addEventListener("click", (e) => {
    if (e.target.classList.contains("tarkib-del")) e.target.closest(".tarkib-row").remove();
  });
  document.getElementById("mSave").addEventListener("click", () => saveMahsulotFromModal(existingId));
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
  if (!nomi) { toast("Mahsulot nomini kiriting", "err"); return; }
  const tarkib = Array.from(document.querySelectorAll("#tarkibRows .tarkib-row")).map((row) => ({
    nomi: row.querySelector(".tarkib-nomi").value.trim(),
    birlik: row.querySelector(".tarkib-birlik").value.trim(),
    norma: toNum(row.querySelector(".tarkib-norma").value)
  })).filter((t) => t.nomi && t.norma > 0);

  const payload = { nomi, birlik, tarkib, standartNarxi };
  let warnMissingMigration = false;

  if (existingId) {
    let { data, error } = await sbClient.from("mahsulotlar").update(toDbRow(MAHSULOT_DB_MAP, payload)).eq("id", existingId).select().single();
    if (error && isMissingColumnError(error)) {
      warnMissingMigration = true;
      ({ data, error } = await sbClient.from("mahsulotlar").update(toDbRow(MAHSULOT_DB_MAP, { nomi, birlik, tarkib })).eq("id", existingId).select().single());
    }
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
    const idx = STORE.mahsulotlar.findIndex((m) => m.id === existingId);
    if (idx >= 0) STORE.mahsulotlar[idx] = fromDbRow(MAHSULOT_DB_MAP, data);
  } else {
    let { data, error } = await sbClient.from("mahsulotlar").insert(toDbRow(MAHSULOT_DB_MAP, payload)).select().single();
    if (error && isMissingColumnError(error)) {
      warnMissingMigration = true;
      ({ data, error } = await sbClient.from("mahsulotlar").insert(toDbRow(MAHSULOT_DB_MAP, { nomi, birlik, tarkib })).select().single());
    }
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
    STORE.mahsulotlar.push(fromDbRow(MAHSULOT_DB_MAP, data));
  }
  closeModal();
  renderIshlabChiqarish();
  toast(warnMissingMigration ? "Saqlandi (standart narx saqlanmadi — baza migratsiyasi ishga tushirilmagan)" : "Saqlandi");
}

async function deleteMahsulot(id) {
  const ok = await deleteRowSafe("mahsulotlar", "mahsulotlar", id, renderIshlabChiqarish);
  if (ok) toast("Mahsulot o'chirildi");
}

/* ------------------------------ Kontragentlar ------------------------------ */

function renderKontragentlar() {
  const main = document.getElementById("main");
  const rows = STORE.kontragentlar.slice().sort((a, b) => (a.nomi || "").localeCompare(b.nomi || ""));

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kontragentlar</h1>
        <p class="page-desc">Mijoz va yetkazib beruvchilar spravochnigi — bu yerga kiritilgan nomlar Faktura kirim/chiqim va Bank harakati sahifalarida avtomatik taklif qilinadi, INN esa avtomat to'ldiriladi.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btnAddKontragent">+ Yangi kontragent</button>
      </div>
    </div>

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
  document.getElementById("searchBox").addEventListener("input", (e) => filterKontragentRows(e.target.value));
  const body = document.getElementById("kontragentBody");
  if (body) body.addEventListener("click", (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    const detailInn = e.target.dataset.detailInn;
    if (editId) openKontragentModal(editId);
    else if (delId) deleteKontragent(delId);
    else if (detailInn) openSverkaDetail(detailInn, "kontragentlar");
  });
}

function kontragentRowHtml(k) {
  return `
    <tr data-id="${k.id}">
      <td>${escapeHtml(k.nomi || "")}</td>
      <td class="mono">${escapeHtml(k.inn || "")}</td>
      <td>${escapeHtml(k.turi || "")}</td>
      <td>${escapeHtml(k.telefon || "")}</td>
      <td>${escapeHtml(k.manzil || "")}</td>
      <td class="mono">${escapeHtml(k.bankHisob || "")}</td>
      <td class="mono">${escapeHtml(k.bankMfo || "")}</td>
      <td class="row-actions">
        ${(k.inn || "").trim()
          ? `<button class="btn btn-sm" data-detail-inn="${escapeHtml(k.inn)}">Tarix</button>`
          : `<button class="btn btn-sm" disabled title="Tarixni ko'rish uchun avval INN kiriting">Tarix</button>`}
        <button class="icon-btn" data-edit="${k.id}" title="Tahrirlash"><svg class="ic" viewBox="0 0 24 24"><use href="#i-edit"/></svg></button>
        <button class="icon-btn" data-del="${k.id}" title="O'chirish"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
      </td>
    </tr>
  `;
}

function filterKontragentRows(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll("#kontragentBody tr").forEach((tr) => {
    tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
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
    <div class="field"><label>Boshlang'ich qarz (qo'lda, Solishtirma dalolatnoma uchun)</label><input id="kBoshlangichQarz" value="${existing && existing.boshlangichQarz ? fmt(existing.boshlangichQarz) : ""}" placeholder="masalan: 1500000 (musbat — u bizga qarzdor)"></div>
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
  const nomi = document.getElementById("kNomi").value.trim();
  if (!nomi) { toast("Kontragent nomini kiriting", "err"); return; }
  const payload = {
    nomi,
    inn: document.getElementById("kInn").value.trim(),
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
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
    const idx = STORE.kontragentlar.findIndex((k) => k.id === existingId);
    if (idx >= 0) STORE.kontragentlar[idx] = fromDbRow(KONTRAGENT_DB_MAP, data);
  } else {
    const { data, error } = await sbClient.from("kontragentlar").insert(toDbRow(KONTRAGENT_DB_MAP, payload)).select().single();
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
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
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
    const idx = STORE.asosiyVositalar.findIndex((a) => a.id === existingId);
    if (idx >= 0) STORE.asosiyVositalar[idx] = fromDbRow(ASOSIY_VOSITA_DB_MAP, data);
  } else {
    const { data, error } = await sbClient.from("asosiy_vositalar").insert(toDbRow(ASOSIY_VOSITA_DB_MAP, payload)).select().single();
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
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

function openIshlabChiqarishModal() {
  if (!STORE.mahsulotlar.length) { toast("Avval mahsulot va kalkulyatsiya qo'shing", "err"); return; }
  openModal(`
    <h3>Ishlab chiqarish / sotuv yozuvi</h3>
    <div class="field"><label>Mahsulot</label>
      <select id="icMahsulot">${STORE.mahsulotlar.map((m) => `<option value="${m.id}">${escapeHtml(m.nomi)}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Sana</label><input type="date" id="icSana" value="${todayISO()}"></div>
    <div class="field"><label>Miqdor</label><input id="icMiqdor" placeholder="masalan: 120"></div>
    <div class="field"><label>Izoh (ixtiyoriy)</label><input id="icIzoh" placeholder=""></div>
    <div class="note" id="icPreview"></div>
    <div class="modal-actions">
      <button class="btn" id="mCancel">Bekor qilish</button>
      <button class="btn btn-primary" id="mSave">Saqlash</button>
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("icMahsulot").addEventListener("change", updateIshlabChiqarishPreview);
  document.getElementById("icMiqdor").addEventListener("input", updateIshlabChiqarishPreview);
  updateIshlabChiqarishPreview();
  document.getElementById("mSave").addEventListener("click", addIshlabChiqarishEntry);
}

// Har bir kerakli xomashyo (consumptions — computeMahsulotConsumption natijasi)
// uchun ombordagi JORIY qoldiqni biriktirib qaytaradi ("qoldiq" va "yetarli"
// maydonlari bilan). Ilgari bu tekshiruv faqat "Ishlab chiqarish" formasidagi
// qo'lda kiritish oldindan ko'rish (preview)da bo'lgan — chiqim faktura import
// qilinganda yoki kalkulyatsiya qo'lda qayta moslashtirilganda (avtomatik
// yo'llar) HECH QANDAY tekshiruv yo'q edi, shu sabab import ombor zaxirasini
// hech qanday ogohlantirishsiz manfiyga tushirib yuborishi mumkin edi. Qarang:
// updateIshlabChiqarishPreview, applyChiqimTafsilConsumption.
function annotateOmborShortages(consumptions) {
  const qoldiqMap = {};
  omborQoldiqList().forEach((q) => { qoldiqMap[q.nomi] = q.qoldiq; });
  return consumptions.map((c) => {
    const qoldiq = qoldiqMap[c.nomi] || 0;
    return Object.assign({}, c, { qoldiq, yetarli: qoldiq >= c.miqdor - 0.0001 });
  });
}

function checkOmborShortages(consumptions) {
  return annotateOmborShortages(consumptions).filter((c) => !c.yetarli);
}

function updateIshlabChiqarishPreview() {
  const el = document.getElementById("icPreview");
  if (!el) return;
  const mahsulotId = document.getElementById("icMahsulot").value;
  const miqdor = toNum(document.getElementById("icMiqdor").value);
  const m = STORE.mahsulotlar.find((x) => x.id === mahsulotId);
  if (!m || !miqdor) { el.innerHTML = `<span class="faint">Mahsulot va miqdorni kiriting</span>`; return; }

  const { consumptions, tannarx } = computeMahsulotConsumption(m, miqdor);
  const annotated = annotateOmborShortages(consumptions);
  const lines = annotated.map((c) =>
    `<div style="${c.yetarli ? "" : "color:var(--danger,#e5484d);font-weight:600;"}">${escapeHtml(c.nomi)}: ${fmt(c.miqdor, 3)} ${escapeHtml(c.birlik || "")} sarflanadi (qoldiq: ${fmt(c.qoldiq, 3)})${c.yetarli ? "" : " — YETARLI EMAS"}</div>`
  );
  el.innerHTML = `${lines.join("") || `<span class="faint">Bu mahsulotda tarkib belgilanmagan</span>`}<div style="margin-top:8px;"><b>Taxminiy tannarx: ${fmtSum(tannarx)}</b></div>`;
}

// Mahsulot kalkulyatsiyasi (tarkib) asosida berilgan miqdor uchun qaysi
// xomashyodan qancha kerakligini va taxminiy tannarxni hisoblaydi — faqat
// hisoblash, bazaga yozmaydi. performMahsulotConsumption va
// applyChiqimTafsilConsumption ikkalasi ham shu funksiyani ishlatadi.
function computeMahsulotConsumption(m, miqdor) {
  let tannarx = 0;
  const consumptions = (m.tarkib || []).map((t) => {
    const need = toNum(t.norma) * miqdor;
    tannarx += need * avgOmborNarx(t.nomi);
    return { nomi: t.nomi, birlik: t.birlik, miqdor: need };
  }).filter((c) => c.miqdor > 0);
  return { consumptions, tannarx };
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
  return true;
}

// Mahsulot kalkulyatsiyasi (tarkib) asosida bitta ishlab chiqarish/sotuv
// yozuvini yaratadi: "ishlab_chiqarish" jadvaliga bitta qator + shu
// mahsulotning har bir xomashyo tarkibiy qismi uchun "ombor" jadvaliga
// turi="chiqim" qatorlari yoziladi (hujjatRaqami="IC-<yozuv id>" — shu orqali
// keyinchalik birgalikda o'chirish/topish mumkin). "Ombor chiqimi" bo'limidan
// mahsulot nomi kiritilganda ham, "Ishlab chiqarish" jurnalidan qo'shilganda
// ham xuddi shu funksiya ishlatiladi — ikkala joyda bitta manba/mantiq.
async function performMahsulotConsumption(m, miqdor, sana, izoh) {
  const { consumptions, tannarx } = computeMahsulotConsumption(m, miqdor);

  const { data, error } = await sbClient.from("ishlab_chiqarish").insert(toDbRow(ISHLAB_CHIQARISH_DB_MAP, {
    sana, mahsulotId: m.id, mahsulotNomi: m.nomi, miqdor, birlik: m.birlik, tannarx, izoh
  })).select().single();
  if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return false; }
  const icRow = fromDbRow(ISHLAB_CHIQARISH_DB_MAP, data);
  STORE.ishlabChiqarish.push(icRow);

  await insertOmborConsumptionRows(consumptions, sana, `IC-${icRow.id}`, `Ishlab chiqarish: ${m.nomi}`);

  updateNavBadges();
  return true;
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
// afzal). Hech biri topilmasa "kalkulyatsiya qilinmagan" hisoblanadi.
const CHIQIM_NARX_MATCH_TOLERANCE = 0.2; // ±20%

function matchMahsulotForChiqimLine(nomi, narx) {
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
  return { mahsulot: null, mosTuri: "none" };
}

// Bitta "chiqim_tafsil" qatoriga mos kalkulyatsiya asosida ombordan xomashyo
// ayiradi (hujjatRaqami="CHT-<tafsil id>" — keyinchalik topish/bekor qilish
// uchun). Faqat mahsulot topilganda chaqiriladi. Zaxira YETARLI bo'lmasa ham
// yozuv baribir amalga oshiriladi (savdo/kalkulyatsiya to'xtatilmaydi) — faqat
// qaysi xomashyolar yetarli emasligi qaytariladi, chaqiruvchi buni foydalanuvchiga
// ko'rsatadi (qarang: checkOmborShortages, handleInvoiceImport, setChiqimTafsilMahsulot).
async function applyChiqimTafsilConsumption(tafsilRow, mahsulot) {
  const { consumptions } = computeMahsulotConsumption(mahsulot, tafsilRow.miqdor);
  const shortages = checkOmborShortages(consumptions);
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
    if (error) { console.error(error); toast(isPermissionError(error) ? "Sizda bu amal uchun ruxsat yo'q (faqat admin)" : "Eski sarfni bekor qilishda xatolik", "err"); return { ok: false, shortages: [] }; }
    STORE.ombor = STORE.ombor.filter((r) => !ids.includes(r.id));
  }

  const mahsulot = mahsulotId ? STORE.mahsulotlar.find((m) => m.id === mahsulotId) : null;
  const { data, error } = await sbClient.from("chiqim_tafsil")
    .update(toDbRow(CHIQIM_TAFSIL_DB_MAP, { mahsulotId: mahsulot ? mahsulot.id : null, mosTuri: mosTuri || (mahsulot ? "qolda" : "none") }))
    .eq("id", tafsilId).select().single();
  if (error) { console.error(error); toast(isPermissionError(error) ? "Sizda bu amal uchun ruxsat yo'q (faqat admin)" : "Saqlashda xatolik", "err"); return { ok: false, shortages: [] }; }
  const idx = STORE.chiqimTafsil.findIndex((t) => t.id === tafsilId);
  if (idx >= 0) STORE.chiqimTafsil[idx] = fromDbRow(CHIQIM_TAFSIL_DB_MAP, data);

  let shortages = [];
  if (mahsulot) shortages = await applyChiqimTafsilConsumption(STORE.chiqimTafsil[idx], mahsulot);
  updateNavBadges();
  return { ok: true, shortages };
}

function shortageToastSuffix(shortages) {
  return shortages.length ? ` — DIQQAT: ombor zaxirasi yetarli emas: ${shortages.map((s) => s.nomi).join(", ")}` : "";
}

// "Kalkulyatsiya qilinmagan" ro'yxatidagi "Yangilash" tugmasi — foydalanuvchi
// yangi mahsulot/standart narx qo'shgandan keyin joriy STORE.mahsulotlar
// asosida moslashtirishni qayta urinadi.
async function rematchChiqimTafsil(tafsilId) {
  const tafsil = STORE.chiqimTafsil.find((t) => t.id === tafsilId);
  if (!tafsil) return;
  const { mahsulot, mosTuri } = matchMahsulotForChiqimLine(tafsil.nomi, tafsil.narx);
  if (!mahsulot) { toast("Hamon mos kalkulyatsiya topilmadi"); return; }
  const { ok, shortages } = await setChiqimTafsilMahsulot(tafsilId, mahsulot.id, mosTuri);
  if (ok) toast(`"${mahsulot.nomi}" kalkulyatsiyasi bilan bog'landi${shortageToastSuffix(shortages)}`, shortages.length ? "err" : "ok");
}

// "Barchasini qayta moslashtirish" — Ishlab chiqarish sahifasidagi "Kalkulyatsiya
// qilinmagan sotuvlar" ro'yxatidagi HAMMA qatorni bittalab bosish o'rniga bir
// marta bosib, mavjud mahsulot katalogi bo'yicha qayta moslashtirishga urinadi
// (masalan bir nechta yangi mahsulot/standart narx qo'shilgandan keyin).
async function rematchAllChiqimTafsil() {
  const uncosted = STORE.chiqimTafsil.filter((t) => !t.mahsulotId);
  if (!uncosted.length) { toast("Kalkulyatsiya qilinmagan qator yo'q"); return; }
  let matched = 0, shortageRows = 0;
  for (const t of uncosted) {
    const { mahsulot, mosTuri } = matchMahsulotForChiqimLine(t.nomi, t.narx);
    if (!mahsulot) continue;
    const { ok, shortages } = await setChiqimTafsilMahsulot(t.id, mahsulot.id, mosTuri);
    if (ok) {
      matched++;
      if (shortages.length) shortageRows++;
    }
  }
  renderIshlabChiqarish();
  const stillUnmatched = uncosted.length - matched;
  let msg = `${matched} ta bog'landi`;
  if (stillUnmatched) msg += `, ${stillUnmatched} ta hali mos kelmadi`;
  if (shortageRows) msg += `, ${shortageRows} ta qatorda ombor zaxirasi yetarli emas`;
  toast(msg, shortageRows ? "err" : "ok");
}

const CHIQIM_TAFSIL_MOS_LABEL = {
  nomi: '<span class="pill pill-ok">Nomi bo\'yicha</span>',
  narx: '<span class="pill pill-warn">Narxi bo\'yicha</span>',
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
  let savdo = 0, tannarx = 0;
  rows.forEach((t) => {
    savdo += toNum(t.summa) || toNum(t.miqdor) * toNum(t.narx);
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    if (mahsulot) tannarx += computeMahsulotConsumption(mahsulot, t.miqdor).tannarx;
  });
  const foyda = savdo - tannarx;
  const foydaStavka = toNum(STORE.settings.foydaStavka);
  const soligi = Math.max(foyda, 0) * (foydaStavka / 100);
  return { savdo, tannarx, foyda, foydaStavka, soligi };
}

// Bitta chiqim fakturaning sotilgan mahsulot qatorlarini va ularning
// kalkulyatsiya bilan bog'lanishini ko'rsatadigan/tahrirlaydigan oyna
// ("blanka"). "Kalkulyatsiya" ustunidagi <select> o'zgartirilganda darhol
// setChiqimTafsilMahsulot chaqirilib, ombor sarfi ham qayta hisoblanadi.
function openChiqimKalkulyatsiyaModal(chiqimId) {
  const chiqimRow = STORE.chiqim.find((r) => r.id === chiqimId);
  if (!chiqimRow) return;
  const rows = STORE.chiqimTafsil.filter((t) => t.chiqimId === chiqimId);

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
  const foydaHtml = rows.length ? `
    <div class="note" style="margin-top:12px;">
      <div class="report-line"><span class="label">Sotuv summasi</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.savdo)}</span></div>
      <div class="report-line"><span class="label">Xomashyo tannarxi</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.tannarx)}</span></div>
      <div class="report-line"><span class="label"><b>Foyda</b></span><span class="code"></span><span class="val"><b>${fmtSum(foydaInfo.foyda)}</b></span></div>
      <div class="report-line"><span class="label">Taxminiy foyda solig'i (${fmt(foydaInfo.foydaStavka)}%)</span><span class="code"></span><span class="val">${fmtSum(foydaInfo.soligi)}</span></div>
    </div>
  ` : "";

  openModal(`
    <h3>Kalkulyatsiya — faktura ${escapeHtml(chiqimRow.hujjatRaqami || "")}</h3>
    <p class="modal-sub">${escapeHtml(chiqimRow.sana || "")} &middot; ${escapeHtml(chiqimRow.kontragentNomi || "")}. Kalkulyatsiya ustunini o'zgartirsangiz, eski ombor sarfi bekor qilinib, yangisiga qarab qayta hisoblanadi.</p>
    ${bodyHtml}
    ${addRowHtml}
    ${foydaHtml}
    <div class="modal-actions">
      <button class="btn" id="mCancel">Yopish</button>
      ${rows.length ? `<button class="btn btn-primary" id="mPrint">Chop etish</button>` : ""}
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  const printBtn = document.getElementById("mPrint");
  if (printBtn) printBtn.addEventListener("click", () => printChiqimKalkulyatsiyaBlanka(chiqimId));
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
  const materialMap = new Map();
  rows.forEach((t) => {
    const mahsulot = t.mahsulotId ? STORE.mahsulotlar.find((m) => m.id === t.mahsulotId) : null;
    if (!mahsulot) return;
    const { consumptions } = computeMahsulotConsumption(mahsulot, t.miqdor);
    consumptions.forEach((c) => {
      const cur = materialMap.get(c.nomi) || { nomi: c.nomi, birlik: c.birlik, miqdor: 0 };
      cur.miqdor += c.miqdor;
      materialMap.set(c.nomi, cur);
    });
  });
  let materialsTotal = 0;
  const materialRows = Array.from(materialMap.values()).map((c) => {
    const narx = avgOmborNarx(c.nomi);
    const summa = c.miqdor * narx;
    materialsTotal += summa;
    return `
      <tr>
        <td>${escapeHtml(c.nomi)}</td>
        <td class="num">${escapeHtml(c.birlik || "")}</td>
        <td class="num">${fmt(c.miqdor, 3)}</td>
        <td class="num">${fmtSum(narx)}</td>
        <td class="num">${fmtSum(summa)}</td>
      </tr>
    `;
  }).join("");

  // 3-bo'lim: shu ikki jamidan hisoblangan foyda va undan taxminiy foyda
  // solig'i ulushi (STORE.settings.foydaStavka bo'yicha) — computeTotals()
  // orqali Foyda solig'i hisobotidagi umumiy soliq bilan bir xil stavka.
  const foydaInfo = { foyda: productsTotal - materialsTotal, foydaStavka: toNum(s.foydaStavka) };
  foydaInfo.soligi = Math.max(foydaInfo.foyda, 0) * (foydaInfo.foydaStavka / 100);

  const html = `
    <!doctype html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <title>Kalkulyatsiya ${escapeHtml(chiqimRow.hujjatRaqami || "")}</title>
      <style>
        body{font-family:Arial, "Segoe UI", sans-serif; padding:32px; color:#1c2530; font-size:12.5px;}
        .approve{float:right; text-align:center; width:260px; font-size:12px;}
        .approve .line{margin-top:6px;}
        .approve .dots{border-bottom:1px dotted #1c2530; display:inline-block; min-width:170px;}
        h1{font-size:19px; text-align:center; margin:70px 0 14px;}
        .meta{font-size:12.5px; margin-bottom:6px;}
        .meta b{font-weight:700;}
        .section-title{font-weight:700; margin:20px 0 8px; font-size:13px;}
        table{width:100%; border-collapse:collapse; font-size:11.5px; margin-bottom:6px;}
        th, td{border:1px solid #1c2530; padding:5px 8px; text-align:left;}
        th{background:#eceff2; text-align:center;}
        td.num, th.num{text-align:right; font-variant-numeric:tabular-nums;}
        .jami{margin:6px 0 0; font-weight:700;}
        .sign{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:48px; font-size:12px;}
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
  if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return false; }
  STORE.ombor.push(fromDbRow(OMBOR_DB_MAP, data));
  updateNavBadges();
  return true;
}

async function addIshlabChiqarishEntry() {
  const mahsulotId = document.getElementById("icMahsulot").value;
  const sana = document.getElementById("icSana").value || todayISO();
  const miqdor = toNum(document.getElementById("icMiqdor").value);
  const izoh = document.getElementById("icIzoh").value.trim();
  const m = STORE.mahsulotlar.find((x) => x.id === mahsulotId);
  if (!m) { toast("Mahsulot tanlanmadi", "err"); return; }
  if (!miqdor || miqdor <= 0) { toast("Miqdorni kiriting", "err"); return; }

  const ok = await performMahsulotConsumption(m, miqdor, sana, izoh);
  if (!ok) return;

  closeModal();
  renderIshlabChiqarish();
  toast("Yozildi, ombordagi xomashyo avtomat kamaytirildi");
}

async function deleteIshlabChiqarishEntry(id) {
  const entryIdx = STORE.ishlabChiqarish.findIndex((r) => r.id === id);
  const entry = entryIdx >= 0 ? STORE.ishlabChiqarish[entryIdx] : null;
  const linked = STORE.ombor.filter((r) => r.turi === "chiqim" && r.hujjatRaqami === `IC-${id}`);
  RECENTLY_DELETED.add(id);
  linked.forEach((r) => RECENTLY_DELETED.add(r.id));
  STORE.ishlabChiqarish = STORE.ishlabChiqarish.filter((r) => r.id !== id);
  STORE.ombor = STORE.ombor.filter((r) => !(r.turi === "chiqim" && r.hujjatRaqami === `IC-${id}`));
  updateNavBadges();
  // Ombor chiqimi tabidan chaqirilganda ham to'g'ri sahifa qayta chizilishi
  // uchun "Ishlab chiqarish"ga majburan o'tkazib yubormay, joriy sahifani
  // (qaysi bo'lsa ham) qayta render qilamiz.
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
  toast("O'chirildi, hom ashyo qoldig'i tiklandi");
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
  update();
  document.getElementById("mSave").addEventListener("click", saveOmborChiqim);
}

function updateOmborChiqimPreview() {
  const el = document.getElementById("ocPreview");
  if (!el) return;
  const nomi = document.getElementById("ocNomi").value.trim();
  const miqdor = toNum(document.getElementById("ocMiqdor").value);
  if (!nomi || !miqdor) { el.innerHTML = `<span class="faint">Nom va miqdorni kiriting</span>`; return; }

  const qoldiqMap = {};
  omborQoldiqList().forEach((q) => { qoldiqMap[q.nomi] = q.qoldiq; });
  const target = resolveOmborChiqimTarget(nomi);

  if (target.kind === "xomashyo") {
    const qoldiq = qoldiqMap[nomi] || 0;
    const yetarli = qoldiq >= miqdor - 0.0001;
    el.innerHTML = `<div class="faint" style="margin-bottom:4px;">Xomashyo sifatida aniqlandi — to'g'ridan-to'g'ri ayiriladi:</div><div style="${yetarli ? "" : "color:var(--danger,#e5484d);font-weight:600;"}">${escapeHtml(nomi)}: ${fmt(miqdor, 3)} (qoldiq: ${fmt(qoldiq, 3)})${yetarli ? "" : " — YETARLI EMAS"}</div>`;
  } else if (target.kind === "mahsulot") {
    const m = target.mahsulot;
    let tannarx = 0;
    const lines = (m.tarkib || []).map((t) => {
      const need = toNum(t.norma) * miqdor;
      tannarx += need * avgOmborNarx(t.nomi);
      const qoldiq = qoldiqMap[t.nomi] || 0;
      const yetarli = qoldiq >= need - 0.0001;
      return `<div style="${yetarli ? "" : "color:var(--danger,#e5484d);font-weight:600;"}">${escapeHtml(t.nomi)}: ${fmt(need, 3)} ${escapeHtml(t.birlik || "")} sarflanadi (qoldiq: ${fmt(qoldiq, 3)})${yetarli ? "" : " — YETARLI EMAS"}</div>`;
    });
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
// jo'natiladi — va har bir qator turi="chiqim" bilan yoziladi. Ombor kirimiga
// xos polimer nomlarini birlashtirish qoidasi (canonicalizeOmborNomi) bu
// yerda QO'LLANILMAYDI.
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
      } catch (error) { console.error(error); toast("Bazaga yozishda xatolik", "err"); return; }
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

/* --------------------------------- Bank --------------------------------- */

function renderBank() {
  const filtered = getFilteredRows(STORE.bank);
  const rows = filtered.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");
  const t = computeTotals();
  const periodKirim = filtered.reduce((a, r) => a + toNum(r.kirim), 0);
  const periodChiqim = filtered.reduce((a, r) => a + toNum(r.chiqim), 0);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Bank harakati</h1>
        <p class="page-desc">Hisob raqami bo'yicha kirim/chiqim operatsiyalari. Qoldiq F1 hisobotidagi "Pul mablag'lari"ga avtomatik qo'shiladi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImport">Fayldan import</button>
        <button class="btn btn-primary" id="btnAddRow">+ Qo'lda qo'shish</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">"Joriy qoldiq" har doim yuqoridagi "Davr"ning oxirgi sanasiga nisbatan hisoblanadi.</div>

    <div class="grid grid-4 section">
      <div class="card stat-card">
        <div class="stat-label">Boshlang'ich qoldiq</div>
        <input class="cell-input num" id="inOpening" style="font-size:19px;font-weight:700;padding:2px 4px;" value="${fmt(STORE.settings.bankOpeningBalance)}">
      </div>
      <div class="card stat-card"><div class="stat-label">Davr kirimi</div><div class="stat-value" id="statBankKirim">${fmtSum(periodKirim)}</div></div>
      <div class="card stat-card"><div class="stat-label">Davr chiqimi</div><div class="stat-value" id="statBankChiqim">${fmtSum(periodChiqim)}</div></div>
      <div class="card stat-card"><div class="stat-label">Joriy qoldiq</div><div class="stat-value" id="statBankQoldiq">${fmtSum(t.bankQoldiq)}</div></div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sana</th><th>Hujjat №</th><th>Kontragent</th><th>INN</th><th>Tavsif</th>
            <th class="num">Kirim</th><th class="num">Chiqim</th><th></th>
          </tr>
        </thead>
        <tbody id="bankBody">
          ${rows.map(bankRowHtml).join("")}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-bank"/></svg><div class="t">Bank operatsiyalari yo'q</div><div class="d">"Fayldan import" tugmasi orqali bank ko'chirmasini (masalan, Bank.xlsx) yuklang yoki qo'lda kiriting.</div></div>` : ""}
    <div class="note">Bank.xlsx (ABS/Klient-Bank ko'chirmasi) formati avtomatik tanib olinadi — sana, kontragent/INN, hujjat №, "Оборот Дебет" (chiqim) va "Оборот Кредит" (kirim) ustunlari, shuningdek davr boshidagi qoldiq faylning o'zidan olinadi. Boshqa formatdagi fayl uchun ustunlar tartibi: <b>sana, hujjat №, kontragent, tavsif, kirim, chiqim</b> bo'lishi kerak.</div>
    ${kontragentlarDatalistHtml()}
  `;

  document.getElementById("btnAddRow").addEventListener("click", addBankRow);
  document.getElementById("btnImport").addEventListener("click", openBankImportModal);
  document.getElementById("inOpening").addEventListener("change", (e) => {
    STORE.settings.bankOpeningBalance = toNum(e.target.value);
    saveSettingsToDb({ bankOpeningBalance: STORE.settings.bankOpeningBalance });
    saveStore();
    refreshBankSummary();
  });
  bindBankRowEvents();
}

function bankRowHtml(r) {
  return `
    <tr data-id="${r.id}">
      <td><input type="date" class="cell-input" data-f="sana" value="${escapeHtml(r.sana || "")}"></td>
      <td><input class="cell-input" data-f="hujjatRaqami" value="${escapeHtml(r.hujjatRaqami || "")}" style="min-width:90px"></td>
      <td><input class="cell-input" data-f="kontragent" list="kontragentlarList" value="${escapeHtml(r.kontragent || "")}" style="min-width:170px"></td>
      <td><input class="cell-input" data-f="kontragentInn" value="${escapeHtml(r.kontragentInn || "")}" style="min-width:90px"></td>
      <td><input class="cell-input" data-f="tavsif" value="${escapeHtml(r.tavsif || "")}" style="min-width:220px" title="${escapeHtml(r.tavsif || "")}"></td>
      <td class="num"><input class="cell-input num" data-f="kirim" value="${fmt(r.kirim)}"></td>
      <td class="num"><input class="cell-input num" data-f="chiqim" value="${fmt(r.chiqim)}"></td>
      <td class="row-actions"><button class="icon-btn" data-del="${r.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></td>
    </tr>
  `;
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
  if (elQ) elQ.textContent = fmtSum(t.bankQoldiq);
}

function bindBankRowEvents() {
  const body = document.getElementById("bankBody");
  if (!body) return;
  body.addEventListener("change", (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const row = STORE.bank.find((r) => r.id === tr.dataset.id);
    if (!row) return;
    const field = e.target.dataset.f;
    if (!field) return;
    row[field] = field === "kirim" || field === "chiqim" ? toNum(e.target.value) : e.target.value;
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

async function addBankRow() {
  const newRow = { sana: todayISO(), hujjatRaqami: "", kontragent: "", kontragentInn: "", tavsif: "", kirim: 0, chiqim: 0 };
  const { data, error } = await sbClient.from("bank").insert(toDbRow(BANK_DB_MAP, newRow)).select().single();
  if (error) { console.error(error); toast("Qo'shishda xatolik", "err"); return; }
  const row = fromDbRow(BANK_DB_MAP, data);
  if (!STORE.bank.some((r) => r.id === row.id)) STORE.bank.push(row);
  saveStore();
  renderBank();
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
  const sofIshHaqi = oylik - ndfl - inps;
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

function renderIshHaqi() {
  const filtered = getFilteredRows(STORE.ishHaqi);
  const rows = filtered.slice().sort((a, b) => (b.sana || "").localeCompare(a.sana || ""));
  const main = document.getElementById("main");
  const t = computeIshHaqiTotals();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ish haqi</h1>
        <p class="page-desc">Xodimlarga hisoblangan ish haqi — "Ish haqi hisoboti"ga avtomatik integratsiya bo'ladi, alohida qayta kiritish shart emas.</p>
      </div>
      <div class="page-actions">
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
      <div class="spacer"></div>
      <span class="faint">${rows.length} ta yozuv</span>
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
          ${rows.length ? rows.map(ishHaqiRowHtml).join("") : ""}
        </tbody>
      </table>
    </div>
    ${!rows.length ? `<div class="empty-state"><svg class="ic" viewBox="0 0 24 24"><use href="#i-users"/></svg><div class="t">Xodimlar yo'q</div><div class="d">"+ Xodim yozuvi qo'shish" tugmasi orqali har oy uchun har bir xodimning hisoblangan ish haqini kiriting.</div></div>` : ""}
    <div class="note">Ijtimoiy soliq (${fmt(STORE.settings.ijtimoiySoliqStavka)}%) — ish beruvchi xarajati, ish haqidan ushlanmaydi. NDFL (${fmt(STORE.settings.ndflStavka)}%) va INPS (${fmt(STORE.settings.inpsStavka, 1)}%) — xodim ish haqidan ushlab qolinadi. Stavkalarni "Sozlamalar" bo'limida o'zgartirish mumkin.</div>
  `;

  document.getElementById("btnAddRow").addEventListener("click", addIshHaqiRow);
  document.getElementById("searchBox").addEventListener("input", (e) => filterIshHaqiRows(e.target.value));
  document.getElementById("btnExportIshHaqi").addEventListener("click", exportIshHaqiXlsx);
  document.getElementById("btnImportIshHaqi").addEventListener("click", openIshHaqiImportModal);
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
      } catch (error) { console.error(error); toast("Bazaga yozishda xatolik", "err"); return; }
      data.forEach((row) => STORE.ishHaqi.push(fromDbRow(ISHHAQI_DB_MAP, row)));
      added = data.length;
    }

    saveStore();
    closeModal();
    renderIshHaqi();
    toast(`Import: ${added} ta qo'shildi${skipped ? `, ${skipped} ta takror o'tkazib yuborildi` : ""}`);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

function ishHaqiRowHtml(r) {
  const c = computeIshHaqiRow(r, STORE.settings);
  return `
    <tr data-id="${r.id}">
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
      <td class="num"><input class="cell-input num" data-f="oyliqSumma" value="${fmt(r.oyliqSumma)}"></td>
      <td class="num"><input class="cell-input num" data-f="imtiyozSumma" value="${fmt(r.imtiyozSumma)}"></td>
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
  if (error) { console.error(error); toast("Qo'shishda xatolik", "err"); return; }
  const row = fromDbRow(ISHHAQI_DB_MAP, data);
  if (!STORE.ishHaqi.some((r) => r.id === row.id)) STORE.ishHaqi.push(row);
  saveStore();
  renderIshHaqi();
  toast("Yangi xodim yozuvi qo'shildi");
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
      </div>
      <div class="page-actions">
        <button class="btn" id="btnExportIshHaqiHisobot">Excel'ga eksport</button>
        <button class="btn" data-nav="settings">Stavkalarni sozlash</button>
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
  bindNavShortcuts(main);
}

function exportIshHaqiHisobotXlsx() {
  const s = STORE.settings;
  const t = computeIshHaqiTotals();
  const rows = getFilteredRows(STORE.ishHaqi).slice().sort((a, b) => (a.fio || "").localeCompare(b.fio || ""));
  buildAndDownloadReportXlsx("FORGET_ish_haqi_hisoboti", "Ish haqi hisoboti", [
    { code: "010", label: "Hisoblangan ish haqi jamg'armasi", value: t.oylikJami },
    { code: "030", label: "Soliqdan ozod qilingan summalar (imtiyozlar)", value: t.imtiyozJami },
    { code: "040", label: "Soliq bazasi", value: t.soliqBazasiJami },
    { code: "060", label: "Hisoblangan ijtimoiy soliq", value: t.ijtimoiySoliqJami },
    { code: "060", label: "Hisoblangan NDFL", value: t.ndflJami },
    { code: "080", label: "INPS ixtiyoriy jamg'arma badali", value: t.inpsJami },
    { code: "090", label: "Byudjetga to'lanadigan NDFL", value: t.ndflByudjetgaJami }
  ], {
    sheetName: "Xodimlar",
    headers: ["№", "F.I.O.", "Lavozimi", "PINFL", "Turi", "Holati", "Hisoblangan ish haqi", "Ijtimoiy soliq", "NDFL", "INPS", "Sof ish haqi"],
    rows: rows.map((r, i) => {
      const c = computeIshHaqiRow(r, s);
      return [i + 1, r.fio, r.lavozimi, r.pinfl, r.turi, r.holati, c.oylik, c.ijtimoiySoliq, c.ndfl, c.inps, c.sofIshHaqi];
    })
  });
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

function renderF2() {
  const t = computeTotals();
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">F2 — Moliyaviy natijalar to'g'risida hisobot</h1>
        <p class="page-desc">Vazirlar Mahkamasi shakli asosida, Faktura kirim/chiqim ma'lumotlaridan avtomatik hisoblanadi.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportF2">Excel'dan import</button>
        <button class="btn" id="btnExportF2">Excel'ga eksport</button>
        <button class="btn" data-nav="settings">Xarajatlarni sozlash</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Hisobot yuqoridagi "Davr" filtriga mos ravishda shakllanadi.</div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Daromad va xarajatlar</div>
        <div class="report-block-title">Asosiy faoliyat</div>
        ${reportLine("010", "Sof tushum (sotuvdan)", t.revenue, { code: "010" })}
        ${reportLine("020", "Sotilgan mahsulot tannarxi", t.tannarx, { code: "020" })}
        ${reportLine("030", "Yalpi foyda", t.yalpiFoyda, { code: "030", total: true })}
        ${reportLine("040", "Davr xarajatlari", t.davrXarajati, { code: "040" })}
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

function exportF2Xlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_F2", "F2 — Moliyaviy natijalar to'g'risida hisobot", [
    { code: "010", label: "Sof tushum (sotuvdan)", value: t.revenue },
    { code: "020", label: "Sotilgan mahsulot tannarxi", value: t.tannarx },
    { code: "030", label: "Yalpi foyda", value: t.yalpiFoyda },
    { code: "040", label: "Davr xarajatlari", value: t.davrXarajati },
    { code: "100", label: "Asosiy faoliyatdan foyda", value: t.asosiyFaoliyatFoyda },
    { code: "170", label: "Moliyaviy faoliyat xarajatlari", value: t.moliyaviyXarajat },
    { code: "240", label: "Soliqqacha foyda", value: t.soliqqachaFoyda },
    { code: "250", label: "Foyda solig'i", value: t.foydaSoligi },
    { code: "270", label: "Sof foyda (davr natijasi)", value: t.sofFoyda }
  ]);
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
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportQQS">Excel'dan import</button>
        <button class="btn" id="btnExportQQS">Excel'ga eksport</button>
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
  document.getElementById("btnImportQQS").addEventListener("click", () => {
    openGenericImportModal(
      "QQS — Excel'dan import",
      `Ilgari eksport qilingan QQS faylidan "Standart QQS stavkasi" ko'rsatkichi o'qib olinadi.`,
      ".xlsx,.xls",
      (file) => handleReportSettingsImport(file, { "Standart QQS stavkasi (%)": "qqsStavka" }, renderQQS)
    );
  });
}

function exportQQSXlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_QQS", "QQS hisob-kitobi", [
    { code: "010", label: "Zachyotga qabul qilinadigan QQS (xariddan)", value: t.qqsInput },
    { code: "020", label: "Sotuvdan QQS", value: t.qqsOutput },
    { code: "030", label: "Byudjetga to'lanadigan QQS", value: t.qqsToPay },
    { code: "", label: "Standart QQS stavkasi (%)", value: STORE.settings.qqsStavka }
  ]);
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
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportFoyda">Excel'dan import</button>
        <button class="btn" id="btnExportFoyda">Excel'ga eksport</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">Hisobot yuqoridagi "Davr" filtriga mos ravishda shakllanadi.</div>

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
    STORE.settings.boshqaDaromad = toNum(document.getElementById("inBoshqaDaromad").value);
    STORE.settings.imtiyozlar = toNum(document.getElementById("inImtiyozlar").value);
    STORE.settings.foydaStavka = toNum(document.getElementById("inFoydaStavka").value);
    saveSettingsToDb({ boshqaDaromad: STORE.settings.boshqaDaromad, imtiyozlar: STORE.settings.imtiyozlar, foydaStavka: STORE.settings.foydaStavka });
    saveStore();
    renderFoyda();
    toast("Saqlandi");
  });
  document.getElementById("btnExportFoyda").addEventListener("click", () => exportFoydaXlsx());
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

function exportFoydaXlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_foyda_soligi", "Foyda solig'i hisob-kitobi", [
    { code: "010", label: "Jami daromad", value: t.jamiDaromad },
    { code: "020", label: "Chegiriladigan xarajatlar", value: t.chegiriladiXarajat },
    { code: "030", label: "Soliqqa tortiladigan foyda", value: t.soliqqaTortiladiganFoyda },
    { code: "040", label: "Imtiyozlar", value: t.imtiyozlar },
    { code: "060", label: "Soliq bazasi", value: t.soliqBazasi },
    { code: "080", label: "Foyda solig'i summasi", value: t.foydaSoligi },
    { code: "", label: "Boshqa daromadlar (qo'lda)", value: STORE.settings.boshqaDaromad },
    { code: "", label: "Imtiyozlar summasi (qo'lda)", value: STORE.settings.imtiyozlar },
    { code: "070", label: "Foyda solig'i stavkasi (%)", value: t.foydaStavka }
  ]);
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
      </div>
      <div class="page-actions">
        <button class="btn" id="btnImportF1">Excel'dan import</button>
        <button class="btn" id="btnExportF1">Excel'ga eksport</button>
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
    STORE.settings.f1Kassa = toNum(document.getElementById("f1Kassa").value);
    STORE.settings.f1UstavKapitali = toNum(document.getElementById("f1Uk").value);
    STORE.settings.f1OldingiFoyda = toNum(document.getElementById("f1Of").value);
    STORE.settings.f1UzoqMajburiyat = toNum(document.getElementById("f1Um").value);
    saveSettingsToDb({
      f1Kassa: STORE.settings.f1Kassa,
      f1UstavKapitali: STORE.settings.f1UstavKapitali,
      f1OldingiFoyda: STORE.settings.f1OldingiFoyda,
      f1UzoqMajburiyat: STORE.settings.f1UzoqMajburiyat
    });
    saveStore();
    renderF1();
    toast("Saqlandi");
  });
  document.getElementById("btnExportF1").addEventListener("click", () => exportF1Xlsx());
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

function exportF1Xlsx() {
  const t = computeTotals();
  buildAndDownloadReportXlsx("FORGET_F1", "F1 — Buxgalteriya balansi", [
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
  ]);
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
  // Boshlang'ich qarzi qo'lda kiritilgan, lekin hozircha faktura/bank
  // yozuvlari bo'lmagan kontragentlar ham (davr harakati nolga teng bo'lsa
  // ham) ro'yxatda ko'rinishi uchun.
  STORE.kontragentlar.forEach((k) => { if (toNum(k.boshlangichQarz)) note(k.inn, k.nomi); });

  function periodTotals(inn, matchFn) {
    const chiqimAmt = STORE.chiqim.filter((r) => (r.kontragentInn || "").trim() === inn && isValidStatus(r.status) && matchFn(r.sana)).reduce((a, r) => a + toNum(r.jamiSumma), 0);
    const kirimAmt = STORE.kirim.filter((r) => (r.kontragentInn || "").trim() === inn && isValidStatus(r.status) && matchFn(r.sana)).reduce((a, r) => a + toNum(r.jamiSumma), 0);
    const bankKirimAmt = STORE.bank.filter((r) => (r.kontragentInn || "").trim() === inn && matchFn(r.sana)).reduce((a, r) => a + toNum(r.kirim), 0);
    const bankChiqimAmt = STORE.bank.filter((r) => (r.kontragentInn || "").trim() === inn && matchFn(r.sana)).reduce((a, r) => a + toNum(r.chiqim), 0);
    return { kirimCol: chiqimAmt + bankChiqimAmt, chiqimCol: kirimAmt + bankKirimAmt };
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
    <tr>
      <td>${escapeHtml(r.nomi)}</td>
      <td class="tag-inn">${escapeHtml(r.inn)}</td>
      <td class="num" title="Boshlang'ich baza (Kontragentlar bo'limida tahrirlanadi) + davr boshigacha bo'lgan tarix asosida avtomatik hisoblanadi">${fmtSum(r.boshiga)}</td>
      <td class="num">${fmtSum(r.kirim)}</td>
      <td class="num">${fmtSum(r.chiqim)}</td>
      <td class="num" style="font-weight:700">${fmtSum(r.oxiriga)}</td>
      <td>${statusPill}</td>
      <td class="row-actions"><button class="btn btn-sm" data-detail-inn="${escapeHtml(r.inn)}">Tarix</button></td>
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
      </div>
      <div class="page-actions">
        <button class="btn" id="btnExportAging">Excel'ga eksport</button>
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
            <tr>
              <td>${escapeHtml(r.kontragentNomi || "")}</td>
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
  main.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => cfg.viewAction(b.dataset.view)));
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
            <th></th>
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
      <b>Hisoblash mantig'i:</b> "Davr boshiga" — Kontragentlar bo'limida kiritilgan boshlang'ich baza + tanlangan davr boshigacha bo'lgan barcha tarix asosida avtomatik hisoblanadi (baza qiymatini o'zgartirish uchun "Kontragentlar" bo'limidagi shu kontragent yozuviga o'ting). "Kirim" — shu davrda chiqarilgan chiqim-fakturalar va kontragentga to'langan bank chiqimlari (qarzdorlikni oshiradi). "Chiqim" — shu davrda qabul qilingan kirim-fakturalar va kontragentdan olingan bank kirimlari (qarzdorlikni kamaytiradi). Davr oxiriga = Davr boshiga + Kirim − Chiqim. Musbat qiymat — kontragent bizga qarzdor; manfiy — biz kontragentga qarzdormiz. Har bir qatordagi <b>"Tarix"</b> tugmasi orqali shu kontragentning to'liq harakatlar tarixini (Акт сверка andazasida) ko'rish mumkin.
    </div>
  `;
  document.getElementById("btnExportSverka").addEventListener("click", () => exportSverkaXlsx(filteredRows, totalDebitor, totalKreditor));
  document.getElementById("btnPrintSverka").addEventListener("click", () => printSverkaPdf(filteredRows, totalDebitor, totalKreditor));
  main.querySelectorAll("[data-detail-inn]").forEach((b) => b.addEventListener("click", () => openSverkaDetail(b.dataset.detailInn, "sverka")));
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

function computeKontragentLedger(inn) {
  const s = STORE.settings;
  const from = s.filterFrom;
  const to = s.filterTo;

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

function renderSverkaDetail() {
  const inn = SVERKA_DETAIL_INN;
  const main = document.getElementById("main");
  if (!inn) { navigate(SVERKA_DETAIL_RETURN_PAGE); return; }

  const summaryRows = computeReconciliationRows();
  const info = summaryRows.find((r) => r.inn === inn);
  const kRecord = STORE.kontragentlar.find((k) => (k.inn || "").trim() === inn);
  const nomi = info ? info.nomi : (kRecord ? kRecord.nomi : inn);
  const ledger = computeKontragentLedger(inn);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${escapeHtml(nomi)}</h1>
        <p class="page-desc">INN ${escapeHtml(inn)} — o'zaro hisob-kitoblar tarixi (Акт сверка andazasi bo'yicha): kirim faktura, chiqim faktura va bank kirim-chiqim harakatlari.</p>
      </div>
      <div class="page-actions">
        <button class="btn" id="btnBackSverka">&larr; Ro'yxatga qaytish</button>
        <button class="btn" id="btnPrintDetail">PDF (chop etish)</button>
        <button class="btn" id="btnExportDetail">Excel'ga eksport</button>
      </div>
    </div>

    <div class="note" style="margin:0 0 14px;">"Davr boshi" — tanlangan sanadan oldingi barcha tarix asosida hisoblanadi.</div>

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

async function renderAudit() {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">O'zgarishlar tarixi</h1>
        <p class="page-desc">Har bir xodimning kirim/chiqim/bank/ombor va boshqa bo'limlardagi qo'shish, o'zgartirish, o'chirish amallari — kim, qachon, nima qilgani (so'nggi 300 yozuv).</p>
      </div>
    </div>
    <div class="toolbar">
      <input class="search-input" id="searchBox" placeholder="Qidirish: email, jadval...">
      <div class="spacer"></div>
      <span class="faint" id="auditCount">Yuklanmoqda…</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Vaqt</th><th>Kim</th><th>Jadval</th><th>Amal</th><th>O'zgarish</th><th></th></tr>
        </thead>
        <tbody id="auditBody"><tr><td colspan="6" class="faint" style="text-align:center;padding:16px;">Yuklanmoqda…</td></tr></tbody>
      </table>
    </div>
  `;
  document.getElementById("searchBox").addEventListener("input", (e) => filterAuditRows(e.target.value));

  const { data, error } = await sbClient.from("audit_log").select("*").eq("firma_id", ACTIVE_FIRMA_ID).order("created_at", { ascending: false }).limit(300);
  if (error) { console.error(error); toast("Tarixni yuklashda xatolik", "err"); return; }
  AUDIT_ROWS = data || [];
  document.getElementById("auditCount").textContent = `${AUDIT_ROWS.length} ta yozuv`;
  const body = document.getElementById("auditBody");
  body.innerHTML = AUDIT_ROWS.length ? AUDIT_ROWS.map(auditRowHtml).join("") :
    `<tr><td colspan="6" class="faint" style="text-align:center;padding:16px;">Hozircha o'zgarish yo'q</td></tr>`;
  body.addEventListener("click", (e) => {
    const idx = e.target.dataset.detail;
    if (idx !== undefined) openAuditDetailModal(AUDIT_ROWS[idx]);
  });
}

function auditRowHtml(row, idx) {
  const jadval = AUDIT_TABLE_LABELS[row.jadval] || row.jadval;
  const amal = AUDIT_AMAL_LABELS[row.amal] || row.amal;
  const qisqa = row.amal === "UPDATE" ? diffAuditRow(row) : `${jadval} yozuvi`;
  return `
    <tr>
      <td class="mono">${escapeHtml((row.created_at || "").replace("T", " ").slice(0, 19))}</td>
      <td>${escapeHtml(row.actor_email || "")}</td>
      <td>${escapeHtml(jadval)}</td>
      <td>${escapeHtml(amal)}</td>
      <td style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(qisqa)}">${escapeHtml(qisqa)}</td>
      <td class="row-actions"><button class="icon-btn" data-detail="${idx}" title="Batafsil"><svg class="ic" viewBox="0 0 24 24"><use href="#i-search"/></svg></button></td>
    </tr>
  `;
}

function filterAuditRows(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll("#auditBody tr").forEach((tr) => {
    tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
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

async function renderFirmalar() {
  const main = document.getElementById("main");
  if (!IS_ADMIN) {
    main.innerHTML = `<div class="empty-state"><div class="t">Ruxsat yo'q</div><div class="d">Firmalarni faqat admin boshqara oladi.</div></div>`;
    return;
  }
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Firmalar</h1>
        <p class="page-desc">Har bir firmaning ma'lumotlari (kirim/chiqim/ombor va h.k.) bir-biridan to'liq ajratilgan. Xodim faqat o'ziga ruxsat berilgan firmalarni ilova ichida (chiqmasdan) tanlab ishlaydi.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btnAddFirma">+ Yangi firma</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nomi</th><th>Yaratilgan</th><th></th></tr></thead>
        <tbody id="firmalarBody"><tr><td colspan="3" class="faint" style="text-align:center;padding:16px;">Yuklanmoqda…</td></tr></tbody>
      </table>
    </div>
  `;
  document.getElementById("btnAddFirma").addEventListener("click", () => openFirmaModal());

  const { data, error } = await sbClient.from("firmalar").select("*").order("nomi");
  if (error) { console.error(error); toast("Firmalarni yuklashda xatolik", "err"); return; }
  const body = document.getElementById("firmalarBody");
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
  renderFirmalar();
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
    if (error) { console.error(error); toast("Saqlashda xatolik", "err"); return; }
    // Pastdagi firma-almashtirgich (AVAILABLE_FIRMALAR) alohida so'rov bilan
    // yuklanadi — shu sabab uni ham qayta yuklab, yangi nomni darhol
    // ko'rsatish kerak, aks holda u eski nomni saqlab qoladi.
    await loadAvailableFirmalar();
    renderFirmaSwitcher();
  } else {
    const { data, error } = await sbClient.from("firmalar").insert({ nomi }).select().single();
    if (error) { console.error(error); toast("Yaratishda xatolik", "err"); return; }
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
  renderFirmalar();
  toast("Saqlandi");
}

async function openFirmaAccessModal(firmaId, firmaNomi) {
  openModal(`
    <h3>${escapeHtml(firmaNomi)} — xodimlar</h3>
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
    </div>
  `);
  document.getElementById("mCancel").addEventListener("click", closeModal);

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

/* ------------------------------- Sozlamalar ------------------------------- */

function renderSettings() {
  const s = STORE.settings;
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sozlamalar</h1>
        <p class="page-desc">Korxona rekvizitlari va hisobotlarga ta'sir qiluvchi umumiy parametrlar.</p>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Korxona rekvizitlari</div>
        <div class="field"><label>Nomi</label><input id="sCompany" value="${escapeHtml(s.companyName)}"></div>
        <div class="field"><label>INN</label><input id="sInn" value="${escapeHtml(s.inn)}"></div>
        <div class="field"><label>Manzil</label><input id="sAddress" value="${escapeHtml(s.address)}"></div>
        <div class="field"><label>Hisobot davri</label><input id="sPeriod" value="${escapeHtml(s.period)}"></div>
        <div class="field"><label>Rahbar F.I.Sh. (kalkulyatsiya blankasida "Tasdiqlayman" bandida)</label><input id="sRahbar" value="${escapeHtml(s.rahbar || "")}" placeholder="masalan: Karimov A.A."></div>
      </div>
      <div class="card">
        <div class="card-title">Soliq stavkalari</div>
        <div class="field"><label>QQS stavkasi (%)</label><input id="sQqs" value="${fmt(s.qqsStavka)}"></div>
        <div class="field"><label>Foyda solig'i stavkasi (%)</label><input id="sFoyda" value="${fmt(s.foydaStavka)}"></div>
        <div class="field"><label>Davr xarajatlari (F2, qo'lda)</label><input id="sDavr" value="${fmt(s.davrXarajati)}"></div>
        <div class="field"><label>Moliyaviy xarajatlar (F2, qo'lda)</label><input id="sMoliya" value="${fmt(s.moliyaviyXarajat)}"></div>
        <div class="field">
          <label>Tannarxni qo'lda belgilash (bo'sh = avtomatik, kirim fakturalardan)</label>
          <input id="sTannarx" value="${s.tannarxManual === null || s.tannarxManual === undefined ? "" : fmt(s.tannarxManual)}">
        </div>
      </div>
      <div class="card">
        <div class="card-title">Ish haqi hisoboti stavkalari</div>
        <div class="field"><label>Ijtimoiy soliq stavkasi (%)</label><input id="sIjtimoiy" value="${fmt(s.ijtimoiySoliqStavka)}"></div>
        <div class="field"><label>NDFL stavkasi (%)</label><input id="sNdfl" value="${fmt(s.ndflStavka)}"></div>
        <div class="field"><label>INPS stavkasi (%)</label><input id="sInps" value="${fmt(s.inpsStavka, 1)}"></div>
      </div>
    </div>

    <div class="card section">
      <div class="card-title">Ma'lumotlar</div>
      <div class="page-actions">
        <button class="btn" id="btnExport">Barcha ma'lumotlarni yuklab olish (.json)</button>
        <button class="btn" id="btnImportJson">.json fayldan tiklash</button>
        <button class="btn btn-danger" id="btnReset">Hammasini tozalash</button>
      </div>
      <input type="file" id="jsonFile" accept=".json" style="display:none">
      <div class="note">Barcha ma'lumotlar faqat shu brauzerning xotirasida (localStorage) saqlanadi. Boshqa qurilmaga ko'chirish uchun ".json" formatida eksport/import qiling.</div>
    </div>

    <div class="page-actions" style="margin-top:16px;">
      <button class="btn btn-primary" id="btnSaveSettings">Saqlash</button>
    </div>
  `;

  document.getElementById("btnSaveSettings").addEventListener("click", () => {
    if (!requireDataReady()) return;
    s.companyName = document.getElementById("sCompany").value;
    s.inn = document.getElementById("sInn").value;
    s.address = document.getElementById("sAddress").value;
    s.period = document.getElementById("sPeriod").value;
    s.rahbar = document.getElementById("sRahbar").value;
    s.qqsStavka = toNum(document.getElementById("sQqs").value);
    s.foydaStavka = toNum(document.getElementById("sFoyda").value);
    s.davrXarajati = toNum(document.getElementById("sDavr").value);
    s.moliyaviyXarajat = toNum(document.getElementById("sMoliya").value);
    const tannarxVal = document.getElementById("sTannarx").value.trim();
    s.tannarxManual = tannarxVal === "" ? null : toNum(tannarxVal);
    s.ijtimoiySoliqStavka = toNum(document.getElementById("sIjtimoiy").value);
    s.ndflStavka = toNum(document.getElementById("sNdfl").value);
    s.inpsStavka = toNum(document.getElementById("sInps").value);
    saveSettingsToDb({
      companyName: s.companyName, inn: s.inn, address: s.address, period: s.period, rahbar: s.rahbar,
      qqsStavka: s.qqsStavka, foydaStavka: s.foydaStavka, davrXarajati: s.davrXarajati,
      moliyaviyXarajat: s.moliyaviyXarajat, tannarxManual: s.tannarxManual,
      ijtimoiySoliqStavka: s.ijtimoiySoliqStavka, ndflStavka: s.ndflStavka, inpsStavka: s.inpsStavka
    });
    saveStore();
    toast("Sozlamalar saqlandi");
  });

  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STORE, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `FORGET_${todayISO()}.json`;
    a.click();
  });

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
}

/* ------------------------------- Hisobot export/import (Excel) ------------------------------- */
// Har bir hisobot (F2, QQS, Foyda solig'i, Ish haqi hisoboti, F1) uchun umumiy: hisoblangan
// ko'rsatkichlarni .xlsx fayl sifatida yuklab olish (eksport) va ilgari eksport qilingan
// fayldan qo'lda kiritiladigan ko'rsatkichlarni qayta o'qib olish (import).

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
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const str = String(v).trim();
  let m = str.match(/^(\d{2})[.\-](\d{2})[.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = str.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})/);
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
      } catch (error) { console.error(error); toast("Bazaga yozishda xatolik", "err"); return; }
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

      const { mahsulot, mosTuri } = matchMahsulotForChiqimLine(it.nomi, it.narx);
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
    // kirimi xomashyo/mahsulot nomini o'zicha, canonicalizeOmborNomi orqali
    // saqlaydi), faqat qaysi hujjatga tegishli ekanini kirim_id bilan belgilaymiz.
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
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
}

function openBankImportModal() {
  openModal(`
    <h3>Bank harakati — fayldan import</h3>
    <p class="modal-sub">ABS/Klient-Bank ko'chirmasi (masalan, Bank.xlsx) formati avtomatik tanib olinadi. Boshqa formatdagi fayl uchun ustunlar tartibi: sana, hujjat №, kontragent, tavsif, kirim, chiqim.</p>
    <div class="dropzone" id="dz">Faylni shu yerga tashlang yoki bosing<br><span class="faint">.xlsx / .xls / .csv</span></div>
    <input type="file" id="impFile" accept=".xlsx,.xls,.csv" style="display:none">
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

function parseBalanceLine(cell, label) {
  const re = new RegExp(label + ".*?:\\s*([\\d\\s.,]+)", "i");
  const m = String(cell).match(re);
  return m ? toNum(m[1]) : null;
}

// ABS/Klient-Bank ko'chirmasi: "Дата", "Cчет/ИНН", "№ док", "Оп", "МФО", "Оборот Дебет" (chiqim), "Оборот Кредит" (kirim), "Назначение платежа"
function tryParseAbsBankStatement(rows) {
  let headerIdx = -1;
  const col = {};
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const joined = rows[i].map((c) => String(c).toLowerCase());
    const dateI = joined.findIndex((c) => /дата/.test(c));
    const debetI = joined.findIndex((c) => /дебет/.test(c));
    const kreditI = joined.findIndex((c) => /кредит/.test(c));
    if (dateI >= 0 && debetI >= 0 && kreditI >= 0) {
      headerIdx = i;
      col.date = dateI;
      col.schet = joined.findIndex((c) => /инн/.test(c));
      col.doc = joined.findIndex((c) => /док/.test(c));
      col.debet = debetI;
      col.kredit = kreditI;
      col.naznach = joined.findIndex((c) => /назначен/.test(c));
      break;
    }
  }
  if (headerIdx === -1) return null;

  let opening = null;
  for (let i = 0; i < headerIdx; i++) {
    for (const cell of rows[i]) {
      if (typeof cell !== "string") continue;
      const o = parseBalanceLine(cell, "Остаток на начало");
      if (o !== null) opening = o;
    }
  }

  const parsed = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const dateCell = row[col.date];
    // Sana katakchasi Excel'da matn ("01.06.2026 11:18") yoki sonli sana
    // (masalan 46237.60...) ko'rinishida bo'lishi mumkin — ikkalasini ham
    // qabul qilamiz. Boshqa turdagi (masalan "Итоговый оборот" yozuvi yoki
    // bo'sh) qatorlar o'tkazib yuboriladi.
    const isValidDateCell = (typeof dateCell === "number" && dateCell > 0) ||
      (typeof dateCell === "string" && /^\d{2}\.\d{2}\.\d{4}/.test(dateCell));
    if (!isValidDateCell) continue;
    const schetCell = String(row[col.schet] || "");
    const parts = schetCell.split("/");
    const kontragentInn = (parts[1] || "").trim();
    const kontragentNomi = (parts.slice(2).join("/") || "").trim();
    const hujjatRaqami = String(row[col.doc] || "").trim();
    const chiqim = toNum(row[col.debet]);
    const kirim = toNum(row[col.kredit]);
    const tavsif = String(row[col.naznach] || "").trim();
    parsed.push({
      sana: normalizeDate(typeof dateCell === "string" ? dateCell.split(" ")[0] : dateCell),
      hujjatRaqami,
      kontragent: kontragentNomi,
      kontragentInn,
      tavsif,
      kirim,
      chiqim
    });
  }
  return { rows: parsed, opening };
}

async function handleBankImport(file) {
  try {
    await dataReady;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    if (!rows.length) { toast("Fayl bo'sh", "err"); return; }

    const wasEmpty = STORE.bank.length === 0;
    const abs = tryParseAbsBankStatement(rows);
    const candidates = [];
    let skipped = 0;
    let newOpening = null;

    if (abs) {
      if (abs.opening !== null && wasEmpty) newOpening = abs.opening;
      for (const r of abs.rows) {
        const dup = STORE.bank.some((b) => b.hujjatRaqami === r.hujjatRaqami && b.sana === r.sana && Math.abs(b.kirim - r.kirim) < 1 && Math.abs(b.chiqim - r.chiqim) < 1);
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
        const kontragent = String(row[2] || "").trim();
        const tavsif = String(row[3] || "").trim();
        const kirim = toNum(row[4]);
        const chiqim = toNum(row[5]);
        if (!sana && !kirim && !chiqim) continue;
        const dup = STORE.bank.some((b) => b.sana === sana && b.hujjatRaqami === hujjatRaqami && Math.abs(b.kirim - kirim) < 1 && Math.abs(b.chiqim - chiqim) < 1 && b.kontragent === kontragent);
        if (dup) { skipped++; continue; }
        candidates.push({ sana, hujjatRaqami, kontragent, kontragentInn: "", tavsif, kirim, chiqim });
      }
    }

    if (newOpening !== null) {
      STORE.settings.bankOpeningBalance = newOpening;
      await saveSettingsToDb({ bankOpeningBalance: newOpening });
    }

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
      } catch (error) { console.error(error); toast("Bazaga yozishda xatolik", "err"); return; }
      data.forEach((row) => STORE.bank.push(fromDbRow(BANK_DB_MAP, row)));
      added = data.length;
    }

    saveStore();
    closeModal();
    renderBank();
    toast(`Import: ${added} ta qo'shildi${skipped ? `, ${skipped} ta takror o'tkazib yuborildi` : ""}`);
  } catch (err) {
    console.error(err);
    toast("Faylni o'qishda xatolik", "err");
  }
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

function rerenderCurrentPage() {
  if (Date.now() - lastTypingAt < 1500) return;
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
  document.getElementById("topbarNotifBtn").addEventListener("click", openAttentionModal);

  await loadAvailableFirmalar();
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
  const navFirmalarEl = document.getElementById("navFirmalar");
  if (navFirmalarEl) navFirmalarEl.style.display = IS_ADMIN ? "" : "none";
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
  const navFirmalarEl = document.getElementById("navFirmalar");
  if (navFirmalarEl) navFirmalarEl.style.display = IS_ADMIN ? "" : "none";
  PAGES[CURRENT_PAGE].render();
}

// Supabase "onAuthStateChange" nafaqat kirish/chiqishda, balki fon rejimida
// xavfsizlik tokeni yangilanganda (TOKEN_REFRESHED) ham ishga tushadi.
// Shu sabab "hasBooted" bayrog'i orqali to'liq yuklash+navigatsiyani FAQAT
// haqiqiy kirishda bir marta bajaramiz — aks holda foydalanuvchi ishlab
// turgan sahifasidan kutilmaganda "Bosh sahifa"ga uloqtirilib qolardi.
let hasBooted = false;

const LAST_EMAIL_KEY = "bux2112_last_email";
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

document.getElementById("authSubmit").addEventListener("click", async () => {
  const emailEl = document.getElementById("authEmail");
  const pwdEl = document.getElementById("authPassword");
  const errEl = document.getElementById("authError");
  const btn = document.getElementById("authSubmit");
  const email = emailEl.value.trim();
  const pwd = pwdEl.value;
  errEl.textContent = "";
  if (!email) { errEl.textContent = "Emailni kiriting"; return; }
  if (!pwd) { errEl.textContent = "Parolni kiriting"; return; }
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
  item.addEventListener("click", () => navigate(item.dataset.page));
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
}

applyTheme();
