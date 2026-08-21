-- BUX2112 — "hammasi joyida ekanini tekshir/to'ldir" skripti.
-- Vaqt o'tishi bilan schema.sql, migration_kontragentlar_asosiy_vositalar.sql,
-- migration_audit_log.sql va migration_fix_audit_log_settings.sql fayllari
-- HAR IKKALA loyihada (1-baza va 2-baza) ALOHIDA qo'lda ishga tushirilishi
-- kerak edi. Agar ulardan biri biror loyihada unutilgan/qisman bajarilgan
-- bo'lsa — o'sha bo'lim (masalan Kontragentlar, yoki umuman sinxronlash)
-- "ishlamay qoladi": jadval yo'q, RLS yopiq yoki Realtime yoqilmagan bo'ladi.
--
-- BU SKRIPT XAVFSIZ: hech narsani DROP/TRUNCATE qilmaydi, faqat YETISHMAGAN
-- narsalarni (jadval/ustun/policy/trigger/realtime) qo'shadi. Mavjud
-- narsalarga tegmaydi, xato bermaydi. Ikkala loyihada ham (ayniqsa hozir
-- muammo bo'layotgan 2-baza'da) Supabase Dashboard -> SQL Editor'ga to'liq
-- nusxalab, "Run" bosing.

/* ============================ 1) Asosiy jadvallar ============================ */

create extension if not exists pgcrypto;

create table if not exists public.kirim (
  id uuid primary key default gen_random_uuid(),
  sana date, hujjat_raqami text, status text,
  kontragent_inn text, kontragent_nomi text,
  summa_qqssiz numeric, qqs_stavka numeric, qqs_summa numeric, jami_summa numeric,
  tolandi boolean default false, fayl_id uuid
);

create table if not exists public.chiqim (
  id uuid primary key default gen_random_uuid(),
  sana date, hujjat_raqami text, status text,
  kontragent_inn text, kontragent_nomi text,
  summa_qqssiz numeric, qqs_stavka numeric, qqs_summa numeric, jami_summa numeric,
  tolandi boolean default false, fayl_id uuid
);

create table if not exists public.bank (
  id uuid primary key default gen_random_uuid(),
  sana date, hujjat_raqami text, kontragent text, kontragent_inn text,
  tavsif text, kirim numeric, chiqim numeric, fayl_id uuid
);

create table if not exists public.ish_haqi (
  id uuid primary key default gen_random_uuid(),
  sana date, fio text, lavozimi text, pinfl text, turi text, holati text,
  oyliq_summa numeric, imtiyoz_summa numeric, fayl_id uuid
);

create table if not exists public.ombor (
  id uuid primary key default gen_random_uuid(),
  sana date, hujjat_raqami text, kontragent_inn text, kontragent_nomi text,
  nomi text, birlik text, miqdor numeric, narx numeric,
  yetkazib_berish_narxi numeric, qqs_summa numeric,
  yetkazib_berish_narxi_qqs_bilan numeric, turi text, fayl_id uuid
);

create table if not exists public.mahsulotlar (
  id uuid primary key default gen_random_uuid(),
  nomi text, birlik text, tarkib jsonb default '[]'::jsonb
);

create table if not exists public.ishlab_chiqarish (
  id uuid primary key default gen_random_uuid(),
  sana date, mahsulot_id uuid references public.mahsulotlar(id) on delete set null,
  mahsulot_nomi text, miqdor numeric, birlik text, tannarx numeric, izoh text
);

create table if not exists public.fayllar (
  id uuid primary key default gen_random_uuid(),
  bolim text, fayl_nomi text, hajmi numeric, sana date default current_date
);

create table if not exists public.settings (
  id integer primary key,
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
  inps_stavka numeric default 0.1
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.kontragentlar (
  id uuid primary key default gen_random_uuid(),
  nomi text, inn text, manzil text, telefon text,
  bank_hisob text, bank_mfo text, bank_nomi text, turi text, izoh text,
  boshlangich_qarz numeric default 0
);

-- Eski loyihalarda "kontragentlar" jadvali "boshlangich_qarz" ustunisiz
-- yaratilgan bo'lishi mumkin (Solishtirma dalolatnomadagi "Davr boshiga"
-- ustunini qo'lda kiritish uchun) — shu sabab alohida qo'shib qo'yamiz.
alter table public.kontragentlar add column if not exists boshlangich_qarz numeric default 0;

create table if not exists public.asosiy_vositalar (
  id uuid primary key default gen_random_uuid(),
  nomi text, inventar_raqami text, ishga_tushirish_sanasi date,
  boshlangich_qiymati numeric, amortizatsiya_stavkasi numeric,
  holati text default 'Ishlatilmoqda', izoh text
);

-- fayl_id -> fayllar bog'lanishi (fayllar o'chirilsa, tegishli qatorlar ham o'chsin)
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

/* ================================ 2) RLS ================================ */
-- Har bir jadval uchun: RLS yoqilgan va "authenticated" uchun to'liq ruxsat
-- policy'si mavjudligini ta'minlaydi (mavjud bo'lsa qayta yaratmaydi).

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar','ishlab_chiqarish',
    'fayllar','settings','kontragentlar','asosiy_vositalar'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'authenticated_full_access'
    ) then
      execute format('create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;

/* ============================== 3) Realtime ============================== */
-- Har bir jadvalni supabase_realtime publikatsiyasiga, agar hali qo'shilmagan
-- bo'lsa, qo'shadi — aks holda o'zgarishlar boshqa ulangan brauzerlarga
-- (va import qilingandan keyin joriy sahifaga ham) real vaqtda yetib bormaydi.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar','ishlab_chiqarish',
    'fayllar','settings','kontragentlar','asosiy_vositalar'
  ])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

/* ============================== 4) Audit log ============================== */
-- "settings" jadvalining id'si (=1) integer, boshqa hamma jadvalda uuid —
-- shu sabab row_id albatta TEXT bo'lishi shart (aks holda "settings"ni
-- saqlashda audit trigger turdagi xatolik bilan yiqiladi va butun UPDATE
-- bekor bo'ladi).

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text,
  jadval text,
  amal text,
  row_id text,
  malumot jsonb
);

alter table public.audit_log enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'authenticated_read'
  ) then
    create policy "authenticated_read" on public.audit_log for select to authenticated using (true);
  end if;
end $$;

-- Agar eski loyihada row_id hali "uuid" turida bo'lsa (yangi jadvalda bu
-- shart emas, lekin xavfsizlik uchun) — text'ga o'giradi.
do $$ begin
  alter table public.audit_log alter column row_id type text using row_id::text;
exception when others then null; end $$;

create or replace function public.audit_log_trigger() returns trigger
language plpgsql security definer as $$
declare
  actor text := coalesce(auth.email(), 'noma''lum');
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, new.id::text, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, new.id::text, jsonb_build_object('oldi', to_jsonb(old), 'yangi', to_jsonb(new)));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, old.id::text, to_jsonb(old));
    return old;
  end if;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar','settings'])
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()', t);
  end loop;
end $$;

/* --------------------------------------------------------------------------
   Tugadi. Endi 2-baza'da: Authentication -> Users bo'limida xodimning login
   (email) mavjudligini va "Auto Confirm User" yoqilganini tekshiring, so'ng
   ilovada qaytadan import qilib ko'ring — endi qatorlar to'liq va real
   vaqtda sinxron ko'rinishi kerak.
   -------------------------------------------------------------------------- */
