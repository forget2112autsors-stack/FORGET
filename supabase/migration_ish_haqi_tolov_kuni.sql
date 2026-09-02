-- FORGET — Ish haqi to'lov kunini sozlash (diqqat qo'ng'irog'idagi eslatma uchun).
-- Standart qiymat NULL — mavjud firmalar uchun hech narsa o'zgarmaydi, faqat
-- "Sozlamalar" > "Ish haqi" bo'limida qiymat kiritilsa, diqqat qo'ng'irog'ida
-- "Ish haqi to'lov muddati yaqinlashmoqda" eslatmasi ishga tushadi.
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — mavjud production bazada xavfsiz ishga tushiriladi.
-- Butun fayl QAYTA-QAYTA ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

alter table public.settings add column if not exists ish_haqi_tolov_kuni smallint;
