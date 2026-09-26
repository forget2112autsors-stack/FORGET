-- FORGET — mahsulotlar jadvaliga standart_narxi ustunini qo'shish
-- Supabase Dashboard -> SQL Editor orqali ishga tushiring
alter table public.mahsulotlar add column if not exists standart_narxi numeric default 0;
alter table public.mahsulotlar add column if not exists foyda_normasi numeric default 0;
