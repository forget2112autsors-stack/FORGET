-- BUX2112 — ikkinchi (mustaqil) Supabase loyihasi uchun baza sxemasi.
-- Yangi Supabase loyihasida SQL Editor'ga shu faylni to'liq nusxalab, "Run" bosing.
-- Skript qayta-qayta ishga tushirilsa ham xato bermasligi uchun avval
-- eski (agar mavjud bo'lsa, masalan oldingi urinishdan qolgan) jadvallar
-- tozalanadi — bu FAQAT hozir sozlanayotgan YANGI loyihaga tegishli bo'lishi
-- kerak, aks holda mavjud ma'lumot o'chib ketadi!

drop table if exists
  public.ishlab_chiqarish, public.kirim, public.chiqim, public.bank,
  public.ish_haqi, public.ombor, public.fayllar, public.settings, public.mahsulotlar
  cascade;

create extension if not exists pgcrypto;

/* ---------------------------- kirim / chiqim ---------------------------- */

create table public.kirim (
  id uuid primary key default gen_random_uuid(),
  sana date,
  hujjat_raqami text,
  status text,
  kontragent_inn text,
  kontragent_nomi text,
  summa_qqssiz numeric,
  qqs_stavka numeric,
  qqs_summa numeric,
  jami_summa numeric,
  tolandi boolean default false,
  fayl_id uuid
);

create table public.chiqim (
  id uuid primary key default gen_random_uuid(),
  sana date,
  hujjat_raqami text,
  status text,
  kontragent_inn text,
  kontragent_nomi text,
  summa_qqssiz numeric,
  qqs_stavka numeric,
  qqs_summa numeric,
  jami_summa numeric,
  tolandi boolean default false,
  fayl_id uuid
);

/* --------------------------------- bank --------------------------------- */

create table public.bank (
  id uuid primary key default gen_random_uuid(),
  sana date,
  hujjat_raqami text,
  kontragent text,
  kontragent_inn text,
  tavsif text,
  kirim numeric,
  chiqim numeric,
  fayl_id uuid
);

/* ------------------------------- ish_haqi ------------------------------- */

create table public.ish_haqi (
  id uuid primary key default gen_random_uuid(),
  sana date,
  fio text,
  lavozimi text,
  pinfl text,
  turi text,
  holati text,
  oyliq_summa numeric,
  imtiyoz_summa numeric,
  fayl_id uuid
);

/* -------------------------------- ombor --------------------------------- */

create table public.ombor (
  id uuid primary key default gen_random_uuid(),
  sana date,
  hujjat_raqami text,
  kontragent_inn text,
  kontragent_nomi text,
  nomi text,
  birlik text,
  miqdor numeric,
  narx numeric,
  yetkazib_berish_narxi numeric,
  qqs_summa numeric,
  yetkazib_berish_narxi_qqs_bilan numeric,
  turi text,
  fayl_id uuid
);

/* ----------------------------- mahsulotlar ------------------------------ */

create table public.mahsulotlar (
  id uuid primary key default gen_random_uuid(),
  nomi text,
  birlik text,
  tarkib jsonb default '[]'::jsonb
);

/* --------------------------- ishlab_chiqarish ---------------------------- */

create table public.ishlab_chiqarish (
  id uuid primary key default gen_random_uuid(),
  sana date,
  mahsulot_id uuid references public.mahsulotlar(id) on delete set null,
  mahsulot_nomi text,
  miqdor numeric,
  birlik text,
  tannarx numeric,
  izoh text
);

/* -------------------------------- fayllar -------------------------------- */

create table public.fayllar (
  id uuid primary key default gen_random_uuid(),
  bolim text,
  fayl_nomi text,
  hajmi numeric,
  sana date default current_date
);

-- fayllar o'chirilganda bog'liq kirim/chiqim/bank/ish_haqi/ombor yozuvlari
-- ham avtomat o'chib ketishi uchun fayl_id ustunlariga FOREIGN KEY qo'shamiz
-- (jadval yaratilgandan keyin, chunki fayllar shundan keyin yaratildi).
alter table public.kirim add constraint kirim_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
alter table public.chiqim add constraint chiqim_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
alter table public.bank add constraint bank_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
alter table public.ish_haqi add constraint ish_haqi_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
alter table public.ombor add constraint ombor_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;

/* -------------------------------- settings -------------------------------- */

create table public.settings (
  id integer primary key,
  company_name text default '',
  inn text default '',
  address text default '',
  qqs_stavka numeric default 12,
  foyda_stavka numeric default 15,
  period text default '',
  davr_xarajati numeric default 0,
  moliyaviy_xarajat numeric default 0,
  boshqa_daromad numeric default 0,
  imtiyozlar numeric default 0,
  tannarx_manual numeric,
  bank_opening_balance numeric default 0,
  f1_asosiy_vositalar numeric default 0,
  f1_tovar_zaxira numeric default 0,
  f1_kassa numeric default 0,
  f1_ustav_kapitali numeric default 0,
  f1_oldingi_foyda numeric default 0,
  f1_uzoq_majburiyat numeric default 0,
  ijtimoiy_soliq_stavka numeric default 12,
  ndfl_stavka numeric default 12,
  inps_stavka numeric default 0.1
);

insert into public.settings (id) values (1);

/* ------------------------------ Xavfsizlik (RLS) ------------------------------ */
-- Ilova bitta umumiy (jamoaviy) login orqali ishlaydi: kimki ulanib
-- (authenticated) bo'lsa, barcha amallarni bajara oladi. Anonim (kirmagan)
-- foydalanuvchilar hech narsaga ruxsat olmaydi.

do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar','ishlab_chiqarish','fayllar','settings'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

/* ------------------------------- Realtime ------------------------------- */
-- Ilova real vaqtli sinxronlash uchun shu jadvallarni tinglaydi.

alter publication supabase_realtime add table
  public.kirim, public.chiqim, public.bank, public.ish_haqi, public.ombor,
  public.mahsulotlar, public.ishlab_chiqarish, public.fayllar, public.settings;

/* --------------------------------------------------------------------------
   SQL shu yerda tugadi. Keyingi qadam — Supabase Dashboard'da:
   1) Authentication -> Users -> "Add user" -> shu loyiha uchun umumiy
      email (masalan "buxgalter@ikkinchibaza.app") va parol yarating.
      "Auto Confirm User" belgisini albatta yoqing.
   2) Project Settings -> API -> "Project URL" va "anon public" kalitini
      nusxalab oling — ular ilova kodiga (index.html) yoziladi.
   -------------------------------------------------------------------------- */
