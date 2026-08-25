-- FORGET — "Faktura kirim" bo'limini yaxshilash uchun qo'shimcha migratsiya:
--   1) ombor.kirim_id — "Faktura kirim" import qilinganda mahsulot qatorlari
--      endi qaysi kirim-hujjatga tegishli ekanini bilib turishi uchun (ilgari
--      Ombor faqat matn bo'yicha, hech qanday bog'lanishsiz to'ldirilardi).
--   2) kirim.tolandi_override / chiqim.tolandi_override — "To'landi" holati
--      endi avtomatik (bank bilan solishtirib) hisoblanadi, lekin foydalanuvchi
--      buni qo'lda ustidan yozib qo'yishi (override) mumkin bo'lishi uchun.
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — mavjud production bazada xavfsiz ishga tushiriladi.
-- Butun fayl QAYTA-QAYTA ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

alter table public.ombor add column if not exists kirim_id uuid references public.kirim(id) on delete set null;

alter table public.kirim add column if not exists tolandi_override boolean not null default false;
alter table public.chiqim add column if not exists tolandi_override boolean not null default false;
