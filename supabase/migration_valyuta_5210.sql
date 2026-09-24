-- FORGET — Ko'p valyutali hisob (5210) va Markaziy Bank (CBU) integratsiyasi migratsiyasi.
-- Bank harakati jadvaliga valyuta, valyuta_summa, kurs va schyot ustunlarini qo'shadi.
-- Faktura kirim va chiqim jadvallariga valyuta, valyuta_summa va kurs ustunlarini qo'shadi.
-- Sozlamalar jadvaliga valyuta boshlang'ich qoldig'i (5210) ustunini qo'shadi.
--
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI — mavjud ma'lumotlarga tegilmaydi.
-- Idempotent (qayta-qayta ishga tushirilsa ham xavfsiz).
-- Supabase Dashboard -> SQL Editor'ga nusxalab "Run" bosing.

alter table public.bank add column if not exists valyuta text default 'UZS';
alter table public.bank add column if not exists valyuta_summa numeric default 0;
alter table public.bank add column if not exists kurs numeric default 1;
alter table public.bank add column if not exists schyot text default '5110';

alter table public.kirim add column if not exists valyuta text default 'UZS';
alter table public.kirim add column if not exists valyuta_summa numeric default 0;
alter table public.kirim add column if not exists kurs numeric default 1;

alter table public.chiqim add column if not exists valyuta text default 'UZS';
alter table public.chiqim add column if not exists valyuta_summa numeric default 0;
alter table public.chiqim add column if not exists kurs numeric default 1;

alter table public.settings add column if not exists valyuta_opening_balance numeric default 0;
