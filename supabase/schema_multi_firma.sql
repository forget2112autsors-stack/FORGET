-- FORGET (BUX2112) — bir nechta firma (multi-tenant) uchun yagona baza sxemasi.
-- Bu fayl YANGI, bo'sh Supabase loyihasida bir marta to'liq ishga tushiriladi
-- (Supabase Dashboard -> SQL Editor -> shu faylni to'liq nusxalab -> "Run").
--
-- Eskisidan farqi: har bir buxgalteriya jadvaliga "firma_id" ustuni qo'shildi —
-- endi bitta bazada bir nechta firma (kompaniya) ma'lumotlari, bir-biridan
-- to'liq ajratilgan holda, saqlanadi. Foydalanuvchi ilova ichida (chiqmasdan)
-- o'ziga ruxsat berilgan firmalar orasida almashtiradi.
--
-- Skript qayta-qayta ishga tushirilsa ham xato bermaydi (idempotent) —
-- sozlashni bosqichma-bosqich sinab ko'rish uchun qulay.

create extension if not exists pgcrypto;

/* ============================ 1) Firmalar ============================ */

create table if not exists public.firmalar (
  id uuid primary key default gen_random_uuid(),
  nomi text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Qaysi xodim (email) qaysi firmaga kira olishini belgilaydi. Ruxsat
-- ikkilik (bor/yo'q) — firma ichidagi rol emas, u global "foydalanuvchi_rollari"
-- (admin/xodim) orqali belgilanadi.
create table if not exists public.firma_foydalanuvchilari (
  firma_id uuid not null references public.firmalar(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (firma_id, email)
);

/* ======================= 2) Asosiy buxgalteriya jadvallari ======================= */
-- Har biriga "firma_id" bor — shu orqali firmalar ma'lumotlari ajratiladi.

create table if not exists public.kirim (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date, hujjat_raqami text, status text,
  kontragent_inn text, kontragent_nomi text,
  summa_qqssiz numeric, qqs_stavka numeric, qqs_summa numeric, jami_summa numeric,
  tolandi boolean default false, fayl_id uuid
);

create table if not exists public.chiqim (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date, hujjat_raqami text, status text,
  kontragent_inn text, kontragent_nomi text,
  summa_qqssiz numeric, qqs_stavka numeric, qqs_summa numeric, jami_summa numeric,
  tolandi boolean default false, fayl_id uuid
);

create table if not exists public.bank (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date, hujjat_raqami text, kontragent text, kontragent_inn text,
  tavsif text, kirim numeric, chiqim numeric, fayl_id uuid
);

create table if not exists public.ish_haqi (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date, fio text, lavozimi text, pinfl text, turi text, holati text,
  oyliq_summa numeric, imtiyoz_summa numeric, fayl_id uuid
);

create table if not exists public.ombor (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date, hujjat_raqami text, kontragent_inn text, kontragent_nomi text,
  nomi text, birlik text, miqdor numeric, narx numeric,
  yetkazib_berish_narxi numeric, qqs_summa numeric,
  yetkazib_berish_narxi_qqs_bilan numeric, turi text, fayl_id uuid
);

create table if not exists public.mahsulotlar (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  nomi text, birlik text, tarkib jsonb default '[]'::jsonb,
  standart_narxi numeric
);

create table if not exists public.ishlab_chiqarish (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date, mahsulot_id uuid references public.mahsulotlar(id) on delete set null,
  mahsulot_nomi text, miqdor numeric, birlik text, tannarx numeric, izoh text
);

create table if not exists public.fayllar (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  bolim text, fayl_nomi text, hajmi numeric, sana date default current_date
);

create table if not exists public.kontragentlar (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  nomi text, inn text, manzil text, telefon text,
  bank_hisob text, bank_mfo text, bank_nomi text, turi text, izoh text,
  boshlangich_qarz numeric default 0
);

create table if not exists public.asosiy_vositalar (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  nomi text, inventar_raqami text, ishga_tushirish_sanasi date,
  boshlangich_qiymati numeric, amortizatsiya_stavkasi numeric,
  holati text default 'Ishlatilmoqda', izoh text
);

create table if not exists public.chiqim_tafsil (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  chiqim_id uuid references public.chiqim(id) on delete cascade,
  hujjat_raqami text, sana date, nomi text, birlik text,
  miqdor numeric, narx numeric, summa numeric,
  mahsulot_id uuid references public.mahsulotlar(id) on delete set null,
  mos_turi text,        -- 'nomi' | 'narx' | 'qolda' | 'none'
  fayl_id uuid references public.fayllar(id) on delete cascade
);

-- fayl_id -> fayllar bog'lanishi (fayl o'chirilsa, tegishli qatorlar ham o'chsin)
do $$ begin
  alter table public.kirim add constraint kirim_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.chiqim add constraint chiqim_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.bank add constraint bank_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ish_haqi add constraint ish_haqi_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ombor add constraint ombor_fayl_id_fkey foreign key (fayl_id) references public.fayllar(id) on delete cascade;
exception when duplicate_object then null; end $$;

create index if not exists kirim_firma_id_idx on public.kirim(firma_id);
create index if not exists chiqim_firma_id_idx on public.chiqim(firma_id);
create index if not exists bank_firma_id_idx on public.bank(firma_id);
create index if not exists ish_haqi_firma_id_idx on public.ish_haqi(firma_id);
create index if not exists ombor_firma_id_idx on public.ombor(firma_id);
create index if not exists mahsulotlar_firma_id_idx on public.mahsulotlar(firma_id);
create index if not exists ishlab_chiqarish_firma_id_idx on public.ishlab_chiqarish(firma_id);
create index if not exists fayllar_firma_id_idx on public.fayllar(firma_id);
create index if not exists kontragentlar_firma_id_idx on public.kontragentlar(firma_id);
create index if not exists asosiy_vositalar_firma_id_idx on public.asosiy_vositalar(firma_id);
create index if not exists chiqim_tafsil_firma_id_idx on public.chiqim_tafsil(firma_id);

/* ================================ 3) Settings ================================ */
-- Eski sxemada bitta umumiy qator (id=1) edi — endi har bir firma o'z
-- sozlamalar qatoriga ega, PK endi "firma_id".

create table if not exists public.settings (
  firma_id uuid primary key references public.firmalar(id) on delete cascade,
  company_name text default '', inn text default '', address text default '',
  qqs_stavka numeric default 12, foyda_stavka numeric default 15,
  period text default '', davr_xarajati numeric default 0,
  moliyaviy_xarajat numeric default 0, boshqa_daromad numeric default 0,
  imtiyozlar numeric default 0, tannarx_manual numeric,
  bank_opening_balance numeric default 0,
  f1_asosiy_vositalar numeric default 0, f1_tovar_zaxira numeric default 0,
  f1_kassa numeric default 0, f1_ustav_kapitali numeric default 0,
  f1_oldingi_foyda numeric default 0, f1_uzoq_majburiyat numeric default 0,
  ijtimoiy_soliq_stavka numeric default 12, ndfl_stavka numeric default 12,
  inps_stavka numeric default 0.1,
  rahbar text default ''
);

/* ========================= 4) Rollar (global, firmadan mustaqil) ========================= */

create table if not exists public.foydalanuvchi_rollari (
  email text primary key,
  role text not null default 'xodim' check (role in ('admin', 'xodim')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.foydalanuvchi_rollari
    where email = auth.email() and role = 'admin'
  );
$$;

-- Firma-ruxsat tekshiruvi: joriy login qilgan foydalanuvchi berilgan
-- firmaga kira olishini tekshiradi. "security definer" — RLS policy
-- ichida chaqirilganda ham "firma_foydalanuvchilari" jadvaliga to'g'ridan
-- to'g'ri kirish huquqiga ega bo'ladi.
create or replace function public.has_firma_access(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.firma_foydalanuvchilari
    where firma_id = fid and email = auth.email()
  );
$$;

/* ============================== 5) Audit log ============================== */

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text,
  jadval text,
  amal text,
  row_id text,
  malumot jsonb,
  firma_id uuid   -- global jadvallar (firmalar, firma_foydalanuvchilari, rollar) uchun NULL
);

create or replace function public.audit_log_trigger() returns trigger
language plpgsql security definer as $$
declare
  actor text := coalesce(auth.email(), 'noma''lum');
  fid uuid := nullif(coalesce(to_jsonb(new), to_jsonb(old))->>'firma_id', '')::uuid;
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot, firma_id)
    values (actor, tg_table_name, tg_op, new.id::text, to_jsonb(new), fid);
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot, firma_id)
    values (actor, tg_table_name, tg_op, new.id::text, jsonb_build_object('oldi', to_jsonb(old), 'yangi', to_jsonb(new)), fid);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot, firma_id)
    values (actor, tg_table_name, tg_op, old.id::text, to_jsonb(old), fid);
    return old;
  end if;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar','settings','chiqim_tafsil'])
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()', t);
  end loop;
end $$;

/* ============================ 6) Xavfsizlik (RLS) ============================ */

-- 6.1 — 11 ta firma-scoped jadval: SELECT/INSERT/UPDATE — shu firmaga ruxsati
-- bor har kimga; DELETE — shu firmaga ruxsati bor VA admin bo'lganlargagina.
do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar','chiqim_tafsil'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "firma_select" on public.%I', t);
    execute format('drop policy if exists "firma_insert" on public.%I', t);
    execute format('drop policy if exists "firma_update" on public.%I', t);
    execute format('drop policy if exists "firma_delete_admin" on public.%I', t);
    execute format('create policy "firma_select" on public.%I for select to authenticated using (public.has_firma_access(firma_id))', t);
    execute format('create policy "firma_insert" on public.%I for insert to authenticated with check (public.has_firma_access(firma_id))', t);
    execute format('create policy "firma_update" on public.%I for update to authenticated using (public.has_firma_access(firma_id)) with check (public.has_firma_access(firma_id))', t);
    execute format('create policy "firma_delete_admin" on public.%I for delete to authenticated using (public.is_admin() and public.has_firma_access(firma_id))', t);
  end loop;
end $$;

-- 6.2 — settings: PK firma_id, xuddi shu qoida (DELETE odatda ishlatilmaydi,
-- lekin izchillik uchun qo'shilgan).
alter table public.settings enable row level security;
drop policy if exists "firma_select" on public.settings;
drop policy if exists "firma_insert" on public.settings;
drop policy if exists "firma_update" on public.settings;
drop policy if exists "firma_delete_admin" on public.settings;
create policy "firma_select" on public.settings for select to authenticated using (public.has_firma_access(firma_id));
create policy "firma_insert" on public.settings for insert to authenticated with check (public.has_firma_access(firma_id));
create policy "firma_update" on public.settings for update to authenticated using (public.has_firma_access(firma_id)) with check (public.has_firma_access(firma_id));
create policy "firma_delete_admin" on public.settings for delete to authenticated using (public.is_admin() and public.has_firma_access(firma_id));

-- 6.3 — firmalar: har kim o'ziga ruxsat berilgan firmalarni ko'radi, admin esa
-- hammasini (hali ruxsat berilmagan, yangi yaratilgan firmani ham) ko'radi.
-- Yozish (yaratish/o'zgartirish/o'chirish) faqat admin uchun.
alter table public.firmalar enable row level security;
drop policy if exists "firmalar_select" on public.firmalar;
drop policy if exists "firmalar_write_admin" on public.firmalar;
create policy "firmalar_select" on public.firmalar for select to authenticated
  using (public.has_firma_access(id) or public.is_admin());
create policy "firmalar_write_admin" on public.firmalar for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6.4 — firma_foydalanuvchilari: bu jadval "has_firma_access()"ning o'zi
-- so'rov qiladigan jadval, shu sabab bu yerda ATAYLAB o'sha funksiya orqali
-- emas, to'g'ridan-to'g'ri "email = auth.email()" bilan tekshiriladi
-- (mantiqiy davriylikdan qochish uchun). Har kim FAQAT o'z qatorlarini,
-- admin esa hammasini ko'radi. Yozish faqat admin uchun.
alter table public.firma_foydalanuvchilari enable row level security;
drop policy if exists "own_or_admin_select" on public.firma_foydalanuvchilari;
drop policy if exists "admin_write" on public.firma_foydalanuvchilari;
create policy "own_or_admin_select" on public.firma_foydalanuvchilari for select to authenticated
  using (email = auth.email() or public.is_admin());
create policy "admin_write" on public.firma_foydalanuvchilari for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6.5 — foydalanuvchi_rollari: eskisi bilan bir xil (global, firmadan mustaqil).
alter table public.foydalanuvchi_rollari enable row level security;
drop policy if exists "authenticated_read" on public.foydalanuvchi_rollari;
drop policy if exists "admin_write_rollar" on public.foydalanuvchi_rollari;
create policy "authenticated_read" on public.foydalanuvchi_rollari for select to authenticated using (true);
create policy "admin_write_rollar" on public.foydalanuvchi_rollari for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6.6 — audit_log: firma_id bor yozuvlar — shu firmaga ruxsati borlarga;
-- firma_id NULL (global jadvallar) — faqat adminga.
alter table public.audit_log enable row level security;
drop policy if exists "authenticated_read" on public.audit_log;
drop policy if exists "audit_select" on public.audit_log;
create policy "audit_select" on public.audit_log for select to authenticated using (
  (firma_id is not null and public.has_firma_access(firma_id))
  or (firma_id is null and public.is_admin())
);

/* ============================== 7) Realtime ============================== */

do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar','chiqim_tafsil','settings'])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

/* --------------------------------------------------------------------------
   SQL shu yerda tugadi. Keyingi qadamlar:

   1) Authentication -> Users -> "Add user" -> xodimlarning email/parolini
      shu YANGI loyihada qayta yarating ("Auto Confirm User"ni yoqing).
      Eski ikki loyihadagi foydalanuvchilar avtomatik ko'chib o'tmaydi.

   2) Kamida bitta o'zingizni admin qiling (o'z emailingizni almashtiring):

        insert into public.foydalanuvchi_rollari (email, role)
        values ('sizning-emailingiz@masalan.uz', 'admin')
        on conflict (email) do update set role = 'admin';

   3) Kamida bitta firma yarating va o'zingizga ruxsat bering (keyinchalik
      bularni ilova ichidagi "Firmalar" sahifasidan qilish mumkin bo'ladi):

        insert into public.firmalar (nomi) values ('Firma A') returning id;
        -- yuqoridagi buyruq qaytargan id'ni pastga qo'ying:
        insert into public.firma_foydalanuvchilari (firma_id, email)
        values ('<firma-id>', 'sizning-emailingiz@masalan.uz');
        insert into public.settings (firma_id) values ('<firma-id>');

   4) Project Settings -> API -> "Project URL" va "anon public" kalitini
      nusxalab, ilova kodiga (index.html) yozish uchun tayyorlab qo'ying.
   -------------------------------------------------------------------------- */
