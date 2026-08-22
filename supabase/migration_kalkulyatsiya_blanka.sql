-- BUX2112 — Kalkulyatsiya blankasi (chop etish) uchun rahbar F.I.Sh. maydoni.
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — ikkala production loyihada (1-baza va 2-baza) ham xavfsiz ishga
-- tushiriladi, qayta-qayta ishga tushirilsa ham xato bermaydi.
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

alter table public.settings add column if not exists rahbar text default '';
