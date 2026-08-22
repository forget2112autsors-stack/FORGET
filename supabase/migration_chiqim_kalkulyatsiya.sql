-- BUX2112 — Chiqim faktura qatorlarini "Mahsulotlar" kalkulyatsiyasi bilan
-- avtomat bog'lash va ombordan avtomat sarflash uchun qo'shimcha migratsiya.
-- DIQQAT: bu fayl faqat YANGI ustun/jadval QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — ikkala production loyihada (1-baza va 2-baza) ham xavfsiz ishga tushiriladi.
-- MUHIM: bu fayl "migration_roles.sql"dan KEYIN ishga tushirilishi shart —
-- pastdagi DELETE policy "public.is_admin()" funksiyasidan foydalanadi, u
-- hali yaratilmagan bo'lsa xato beradi.
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.
-- (Ikkala loyihada ham alohida-alohida ishga tushirish kerak.)

alter table public.mahsulotlar add column if not exists standart_narxi numeric;

create table public.chiqim_tafsil (
  id uuid primary key default gen_random_uuid(),
  chiqim_id uuid references public.chiqim(id) on delete cascade,
  hujjat_raqami text,
  sana date,
  nomi text,
  birlik text,
  miqdor numeric,
  narx numeric,
  summa numeric,
  mahsulot_id uuid references public.mahsulotlar(id) on delete set null,
  mos_turi text,        -- 'nomi' | 'narx' | 'qolda' | 'none'
  fayl_id uuid references public.fayllar(id) on delete cascade
);

/* ------------------------------ Xavfsizlik (RLS) ------------------------------ */
-- SELECT/INSERT/UPDATE hamkorlikda ishlash uchun ochiq, DELETE esa boshqa
-- jadvallar kabi (migration_roles.sql) faqat adminga cheklangan.

alter table public.chiqim_tafsil enable row level security;
create policy "authenticated_read_write" on public.chiqim_tafsil for select to authenticated using (true);
create policy "authenticated_insert" on public.chiqim_tafsil for insert to authenticated with check (true);
create policy "authenticated_update" on public.chiqim_tafsil for update to authenticated using (true) with check (true);
create policy "authenticated_delete_admin" on public.chiqim_tafsil for delete to authenticated using (public.is_admin());

/* ------------------------------- Realtime ------------------------------- */

alter publication supabase_realtime add table public.chiqim_tafsil;

/* --------------------------------- Audit --------------------------------- */

create trigger trg_audit after insert or update or delete on public.chiqim_tafsil
  for each row execute function public.audit_log_trigger();
