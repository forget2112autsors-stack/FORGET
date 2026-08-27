-- FORGET — Ish haqi xarajatini F2 (Moliyaviy natija) hisobotiga ixtiyoriy
-- ravishda avtomatik qo'shish uchun qo'shimcha migratsiya.
-- Standart qiymat FALSE — mavjud firmalarning F2 raqamlari o'zgarmasdan
-- qoladi, faqat "Sozlamalar" bo'limida ochiq yoqilgandagina ishga tushadi.
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — mavjud production bazada xavfsiz ishga tushiriladi.
-- Butun fayl QAYTA-QAYTA ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

alter table public.settings add column if not exists ish_haqi_avto_xarajat boolean not null default false;
