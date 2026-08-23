// FORGET (BUX2112) — 2 ta eski baza ("1-baza", "2-baza")dagi ma'lumotlarni
// yangi, yagona (multi-firma) Supabase loyihasiga ko'chiradi.
//
// TALAB QILINADIGAN MUHIT O'ZGARUVCHILARI (barchasi SERVICE ROLE kalit,
// "anon" kalit EMAS — service role RLS'ni chetlab o'tadi, bu skript uchun
// shart, chunki manba loyihalarda o'qish, maqsad loyihada yozish kerak):
//
//   BAZA1_URL, BAZA1_SERVICE_KEY        — eski "1-baza" (manba)
//   BAZA2_URL, BAZA2_SERVICE_KEY        — eski "2-baza" (manba)
//   DEST_URL,  DEST_SERVICE_KEY         — yangi, bo'sh (schema_multi_firma.sql
//                                         allaqachon ishga tushirilgan) loyiha
//
// Ixtiyoriy: FIRMA1_NOMI (standart "Firma A"), FIRMA2_NOMI (standart "Firma B")
//
// Ishga tushirish:
//   npm install
//   BAZA1_URL=... BAZA1_SERVICE_KEY=... BAZA2_URL=... BAZA2_SERVICE_KEY=... \
//   DEST_URL=... DEST_SERVICE_KEY=... node supabase/migrate-to-multi-firma.mjs
//
// Skript idempotent EMAS — ikki marta ishga tushirilsa, qatorlar IKKI marta
// yoziladi (firma_id/id juftligi bo'yicha "upsert" qilinmaydi, chunki bu
// moliyaviy ma'lumot uchun "aniq nusxa yaratish" xavfini oshiradi — buning
// o'rniga xato bo'lsa, DEST loyihadagi jadvallarni tozalab qaytadan
// ishga tushiring).

import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`XATO: ${name} muhit o'zgaruvchisi berilmagan.`);
    process.exit(1);
  }
  return v;
}

const BAZA1_URL = requireEnv("BAZA1_URL");
const BAZA1_KEY = requireEnv("BAZA1_SERVICE_KEY");
const BAZA2_URL = requireEnv("BAZA2_URL");
const BAZA2_KEY = requireEnv("BAZA2_SERVICE_KEY");
const DEST_URL = requireEnv("DEST_URL");
const DEST_KEY = requireEnv("DEST_SERVICE_KEY");

const FIRMA1_NOMI = process.env.FIRMA1_NOMI || "Firma A";
const FIRMA2_NOMI = process.env.FIRMA2_NOMI || "Firma B";

const opts = { auth: { persistSession: false } };
const baza1 = createClient(BAZA1_URL, BAZA1_KEY, opts);
const baza2 = createClient(BAZA2_URL, BAZA2_KEY, opts);
const dest = createClient(DEST_URL, DEST_KEY, opts);

// ---- yordamchi funksiyalar ----------------------------------------------

async function fetchAll(client, table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: o'qishda xatolik — ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function insertChunked(table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await dest.from(table).insert(chunk);
    if (error) throw new Error(`${table}: yozishda xatolik (${i}-${i + chunk.length}) — ${error.message}`);
  }
}

// Bitta manba loyihadan bitta jadvalni to'liq o'qib, firma_id qo'shib,
// DEST'ga yozadi. "settingsMode" bo'lsa (settings jadvali uchun) bitta
// qatorni o'qib, "id" ustunini olib tashlaydi, o'rniga firma_id qo'yadi.
async function migrateTable(sourceClient, table, firmaId, { settingsMode = false } = {}) {
  const rows = settingsMode
    ? await (async () => {
        const { data, error } = await sourceClient.from(table).select("*").eq("id", 1).maybeSingle();
        if (error) throw new Error(`${table}: o'qishda xatolik — ${error.message}`);
        return data ? [data] : [];
      })()
    : await fetchAll(sourceClient, table);

  const stamped = rows.map((r) => {
    const copy = { ...r, firma_id: firmaId };
    if (settingsMode) delete copy.id;
    return copy;
  });

  if (stamped.length) await insertChunked(table, stamped);
  return stamped.length;
}

// FK bog'liqligi tartibi bo'yicha (avval "ota" jadval, keyin unga
// bog'liqlari): fayllar/mahsulotlar -> kirim/chiqim/bank/ish_haqi/ombor ->
// kontragentlar/asosiy_vositalar -> ishlab_chiqarish -> chiqim_tafsil.
const TABLE_ORDER = [
  "fayllar", "mahsulotlar",
  "kirim", "chiqim", "bank", "ish_haqi", "ombor",
  "kontragentlar", "asosiy_vositalar",
  "ishlab_chiqarish",
  "chiqim_tafsil",
];

async function checkIdCollisions(table) {
  const [rows1, rows2] = await Promise.all([fetchAll(baza1, table), fetchAll(baza2, table)]);
  const ids1 = new Set(rows1.map((r) => r.id));
  const overlap = rows2.filter((r) => ids1.has(r.id));
  if (overlap.length) {
    console.error(`XATO: "${table}" jadvalida ${overlap.length} ta id ikkala manba loyihada ham uchraydi — bu asossiz, migratsiyani to'xtataman.`);
    console.error("Mos keluvchi id'lar: ", overlap.slice(0, 10).map((r) => r.id));
    process.exit(1);
  }
}

// ---- asosiy oqim ----------------------------------------------------------

async function main() {
  console.log("1) UUID to'qnashuvlarini tekshirish...");
  for (const t of TABLE_ORDER) await checkIdCollisions(t);
  console.log("   Tozalik tasdiqlandi — id'lar to'qnashmaydi.\n");

  console.log("2) Yangi loyihada firma qatorlarini yaratish...");
  const { data: f1, error: f1err } = await dest.from("firmalar").insert({ nomi: FIRMA1_NOMI }).select().single();
  if (f1err) throw new Error(`firmalar (${FIRMA1_NOMI}): ${f1err.message}`);
  const { data: f2, error: f2err } = await dest.from("firmalar").insert({ nomi: FIRMA2_NOMI }).select().single();
  if (f2err) throw new Error(`firmalar (${FIRMA2_NOMI}): ${f2err.message}`);
  console.log(`   ${FIRMA1_NOMI} -> ${f1.id}`);
  console.log(`   ${FIRMA2_NOMI} -> ${f2.id}\n`);

  const sources = [
    { client: baza1, label: "1-baza", firmaId: f1.id, firmaNomi: FIRMA1_NOMI },
    { client: baza2, label: "2-baza", firmaId: f2.id, firmaNomi: FIRMA2_NOMI },
  ];

  console.log("3) Jadvallarni ko'chirish (FK tartibida)...");
  const counts = {}; // { "1-baza": { table: n } }
  for (const src of sources) {
    counts[src.label] = {};
    for (const table of TABLE_ORDER) {
      const n = await migrateTable(src.client, table, src.firmaId);
      counts[src.label][table] = n;
      console.log(`   [${src.label}] ${table}: ${n} qator`);
    }
    const nSettings = await migrateTable(src.client, "settings", src.firmaId, { settingsMode: true });
    counts[src.label].settings = nSettings;
    console.log(`   [${src.label}] settings: ${nSettings} qator`);
  }
  console.log("");

  console.log("4) Auth foydalanuvchilarini ro'yxatga olish (parolsiz, faqat ma'lumot uchun)...");
  for (const src of sources) {
    const { data, error } = await src.client.auth.admin.listUsers();
    if (error) {
      console.warn(`   [${src.label}] auth ro'yxatini o'qib bo'lmadi: ${error.message}`);
      continue;
    }
    const emails = data.users.map((u) => u.email).filter(Boolean);
    console.log(`   [${src.label}] ${emails.length} ta foydalanuvchi: ${emails.join(", ")}`);
  }
  console.log(`
   ESLATMA: Yuqoridagi email'lar YANGI loyihada Authentication -> Users
   bo'limida qo'lda ("Add user", "Auto Confirm User" yoqilgan holda,
   yangi parol bilan) qayta yaratilishi kerak — bu skript buni
   avtomatlashtirmaydi, chunki eski parollarni hech qanday usulda o'qib
   bo'lmaydi (Supabase ularni qaytarib bermaydi).
`);

  console.log("5) Tekshiruv: qator sonlarini solishtirish...");
  let allOk = true;
  for (const src of sources) {
    for (const table of [...TABLE_ORDER, "settings"]) {
      const { count, error } = await dest
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq("firma_id", src.firmaId);
      if (error) { console.error(`   [${src.label}] ${table}: tekshirishda xato — ${error.message}`); allOk = false; continue; }
      const expected = counts[src.label][table];
      const ok = count === expected;
      if (!ok) allOk = false;
      console.log(`   [${src.label}] ${table}: manba=${expected}, dest=${count} ${ok ? "OK" : "MOS EMAS!"}`);
    }
  }

  console.log(`\n${allOk ? "MIGRATSIYA MUVAFFAQIYATLI YAKUNLANDI." : "DIQQAT: yuqorida \"MOS EMAS\" belgilangan jadvallar bor — qo'lda tekshiring."}`);
}

main().catch((err) => {
  console.error("\nMIGRATSIYA TO'XTATILDI:", err.message);
  process.exit(1);
});
