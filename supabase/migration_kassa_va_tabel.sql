-- ============================================================================
-- FORGET — Kassa (5010), Tabel (T-13) va Chiqim Tafsil jadvallari migratsiyasi
-- Multi-firma qo'llab-quvvatlashi va RLS xavfsizlik qoidalari bilan.
-- DIQQAT: Mavjud ma'lumotlarga zarar yetkazmaydi (IF NOT EXISTS).
-- Ko'chirish tartibi: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. KASSA JADVALI (5010 — KO-1 kirim, KO-2 chiqim orderlari)
create table if not exists public.kassa (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id) on delete cascade,
  sana date,
  hujjat_raqami text,
  turi text, -- 'kirim' (KO-1) yoki 'chiqim' (KO-2)
  kontragent text,
  kontragent_inn text,
  schyot text, -- korrespondent schyot: 5110, 4010, 6010, 6710, 4210, va h.k.
  summa numeric default 0,
  tavsif text,
  kimdan_kimga text,
  hujjat_asosi text,
  pasport text,
  fayl_id uuid references public.fayllar(id) on delete cascade,
  created_at timestamptz default now()
);

create index if not exists idx_kassa_firma_id on public.kassa(firma_id);
create index if not exists idx_kassa_firma_sana on public.kassa(firma_id, sana);
create index if not exists idx_kassa_kontragent_inn on public.kassa(firma_id, kontragent_inn);

alter table public.kassa enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'kassa' and policyname = 'kassa_firma_access'
  ) then
    create policy "kassa_firma_access" on public.kassa
      for all to authenticated
      using (public.has_firma_access(firma_id))
      with check (public.has_firma_access(firma_id));
  end if;
end $$;

-- 2. TABEL JADVALI (T-13 xodimlar davomati va oylik hisoblari)
create table if not exists public.tabel (
  id text primary key,
  firma_id uuid not null references public.firmalar(id) on delete cascade,
  yil int not null,
  oy int not null,
  xodim_id text,
  fio text not null,
  lavozimi text,
  pinfl text,
  oklad numeric(15,2) default 0,
  stavka numeric(5,2) default 1.0,
  grafik text default '5_kunlik',
  kunlar jsonb default '{}'::jsonb,
  ishlangan_kun numeric(6,2) default 0,
  ishlangan_soat numeric(7,2) default 0,
  tatil_kun int default 0,
  tatil_summa numeric(15,2) default 0,
  kasallik_kun int default 0,
  kasallik_summa numeric(15,2) default 0,
  mukofot numeric(15,2) default 0,
  faktik_oylik numeric(15,2) default 0,
  jami_hisoblandi numeric(15,2) default 0,
  izoh text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tabel_firma_id on public.tabel(firma_id);
create index if not exists idx_tabel_firma_yil_oy on public.tabel(firma_id, yil, oy);
create index if not exists idx_tabel_pinfl on public.tabel(pinfl);

alter table public.tabel enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'tabel' and policyname = 'tabel_firma_access'
  ) then
    create policy "tabel_firma_access" on public.tabel
      for all to authenticated
      using (public.has_firma_access(firma_id))
      with check (public.has_firma_access(firma_id));
  end if;
end $$;

-- 3. CHIQIM TAFSIL JADVALI (Fakturadagi har bir mahsulot qatori)
create table if not exists public.chiqim_tafsil (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar(id) on delete cascade,
  chiqim_id uuid references public.chiqim(id) on delete cascade,
  hujjat_raqami text,
  sana date,
  nomi text,
  birlik text,
  miqdor numeric default 0,
  narx numeric default 0,
  summa numeric default 0,
  mahsulot_id uuid references public.mahsulotlar(id) on delete set null,
  mos_turi text,
  fayl_id uuid references public.fayllar(id) on delete cascade
);

create index if not exists idx_chiqim_tafsil_firma_id on public.chiqim_tafsil(firma_id);

alter table public.chiqim_tafsil enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'chiqim_tafsil' and policyname = 'chiqim_tafsil_firma_access'
  ) then
    create policy "chiqim_tafsil_firma_access" on public.chiqim_tafsil
      for all to authenticated
      using (public.has_firma_access(firma_id))
      with check (public.has_firma_access(firma_id));
  end if;
end $$;

-- 4. REALTIME PUBLICATION QO'SHISH
do $$
begin
  begin
    alter publication supabase_realtime add table public.kassa;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.tabel;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.chiqim_tafsil;
  exception when others then null;
  end;
end $$;
