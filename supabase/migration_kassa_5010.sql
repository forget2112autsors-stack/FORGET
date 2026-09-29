-- FORGET — Kassa operatsiyalari (5010) moduli migratsiyasi.
-- O'zbekiston Respublikasi BHMS 21 va Kassa operatsiyalari qoidalariga muvofiq:
--   - 5010 (Milliy valyutadagi kassa)
--   - KO-1 (Kassa kirim orderi va kvitansiyasi)
--   - KO-2 (Kassa chiqim orderi)
--   - KO-4 (Kassa kitobi va kunlik qoldiqlar)
--
-- DIQQAT: bu fayl faqat YANGI jadval va ustun QO'SHADI — hech narsani DROP/TRUNCATE qilmaydi.
-- Mavjud production bazada 100% xavfsiz va qayta-qayta ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga nusxalab "Run" bosing.

/* ============================ 1) Kassa jadvali ============================ */

create table if not exists public.kassa (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id),
  sana date,
  hujjat_raqami text,
  turi text, -- 'kirim' (KO-1) yoki 'chiqim' (KO-2)
  kontragent text,
  kontragent_inn text,
  schyot text, -- korrespondent schyot: 5110, 4010, 6010, 6710, 4210, 4610, 9390, 9420
  summa numeric default 0,
  tavsif text, -- to'lov asosi / maqsadi
  kimdan_kimga text, -- kimdan qabul qilindi / kimga to'landi
  hujjat_asosi text, -- ilova qilingan hujjatlar (shartnoma, chek, ariza)
  pasport text, -- KO-2 uchun shaxsni tasdiqlovchi hujjat ma'lumotlari
  fayl_id uuid,
  created_at timestamptz default now()
);

-- Indekslar
create index if not exists idx_kassa_firma_sana on public.kassa(firma_id, sana);
create index if not exists idx_kassa_kontragent_inn on public.kassa(firma_id, kontragent_inn);

/* ============================ 2) Xavfsizlik (RLS) ============================ */

alter table public.kassa enable row level security;

-- Boshqa firma jadvallari bilan bir xil naqsh (schema_multi_firma.sql, migration_xavfsizlik_v2.sql):
-- o'qish/qo'shish/tahrirlash — firma a'zolariga, o'chirish — faqat firma egasiga (is_firma_admin).
-- Avvalgi versiyadagi "kassa_firma_access" (for all — o'chirishni ham har kimga ochardi) olib tashlanadi.
do $$
declare
  del_check text := case
    when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_firma_admin')
    then 'public.is_firma_admin(firma_id)'
    else 'public.is_admin()'
  end;
begin
  drop policy if exists "kassa_firma_access" on public.kassa;
  drop policy if exists "firma_select" on public.kassa;
  drop policy if exists "firma_insert" on public.kassa;
  drop policy if exists "firma_update" on public.kassa;
  drop policy if exists "firma_delete_admin" on public.kassa;
  create policy "firma_select" on public.kassa for select to authenticated
    using (public.has_firma_access(firma_id));
  create policy "firma_insert" on public.kassa for insert to authenticated
    with check (public.has_firma_access(firma_id));
  create policy "firma_update" on public.kassa for update to authenticated
    using (public.has_firma_access(firma_id)) with check (public.has_firma_access(firma_id));
  execute format('create policy "firma_delete_admin" on public.kassa for delete to authenticated using (%s)', del_check);
end $$;

/* ============================ 3) Audit log trigger ============================ */

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'audit_log_kassa'
  ) then
    create trigger audit_log_kassa
      after insert or update or delete on public.kassa
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

/* ============================ 4) Realtime sinxronizatsiya ============================ */

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kassa'
    ) then
      alter publication supabase_realtime add table public.kassa;
    end if;
  end if;
end $$;

/* ============================ 5) Sozlamalar: Kassa boshlang'ich qoldig'i ============================ */

alter table public.settings add column if not exists kassa_opening_balance numeric default 0;
