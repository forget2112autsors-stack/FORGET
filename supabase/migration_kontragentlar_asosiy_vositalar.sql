-- BUX2112 — Kontragentlar spravochnigi va Asosiy vositalar moduli uchun qo'shimcha migratsiya.
-- DIQQAT: bu fayl faqat YANGI jadval QO'SHADI, hech narsani DROP/TRUNCATE qilmaydi —
-- ikkala production loyihada (1-baza va 2-baza) ham xavfsiz ishga tushiriladi.
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.
-- (Ikkala loyihada ham alohida-alohida ishga tushirish kerak.)

create table public.kontragentlar (
  id uuid primary key default gen_random_uuid(),
  nomi text,
  inn text,
  manzil text,
  telefon text,
  bank_hisob text,
  bank_mfo text,
  bank_nomi text,
  turi text,
  izoh text
);

create table public.asosiy_vositalar (
  id uuid primary key default gen_random_uuid(),
  nomi text,
  inventar_raqami text,
  ishga_tushirish_sanasi date,
  boshlangich_qiymati numeric,
  amortizatsiya_stavkasi numeric,
  holati text default 'Ishlatilmoqda',
  izoh text
);

/* ------------------------------ Xavfsizlik (RLS) ------------------------------ */

do $$
declare
  t text;
begin
  for t in select unnest(array['kontragentlar','asosiy_vositalar'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

/* ------------------------------- Realtime ------------------------------- */

alter publication supabase_realtime add table public.kontragentlar, public.asosiy_vositalar;
