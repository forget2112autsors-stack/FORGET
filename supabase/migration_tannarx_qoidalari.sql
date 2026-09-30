-- FORGET — Kalkulyatsiya (tannarx) qoidalari.
--
-- NIMA QO'SHADI:
--   settings.min_marja_foiz          — minimal marja, % sotuv narxidan (standart 15):
--                                      Tannarx ≤ Sotuv narxi × (1 − min_marja_foiz/100).
--                                      Buzilsa mahsulot kartasi, kalkulyatsiya va chiqim
--                                      faktura kalkulyatsiyasida qizil ogohlantirish.
--   settings.kirimsiz_sarf_bloklash  — true: kirim qilinmagan yoki qoldig'i 0 xomashyoni
--                                      Ishlab chiqarish / Ombor chiqimida qo'lda sarflash
--                                      bloklanadi ("Kirim qilinishi shart").
--   settings.kritik_qoldiqlar        — {"xomashyo nomi": minimal qoldiq} (asosiy birlikda);
--                                      qoldiq shu normagacha tushsa — bildirishnoma.
--   mahsulotlar.xarajat_normalari    — 1 birlik mahsulot uchun xomashyodan tashqari
--                                      xarajat normalari (so'm):
--                                      {"ishHaqi","elektr","amortizatsiya","logistika","boshqa"}
--
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI — hech narsani DROP/TRUNCATE qilmaydi,
-- mavjud production bazada xavfsiz. Qayta-qayta ishga tushirilsa ham xato bermaydi
-- (idempotent). Supabase Dashboard -> loyihangiz -> SQL Editor'ga nusxalab "Run" bosing.
-- Migratsiya ishga tushirilmaguncha ilova ishlayveradi, lekin bu sozlamalar bazaga
-- saqlanmaydi (faqat shu brauzer keshida qoladi).

alter table public.settings    add column if not exists min_marja_foiz numeric default 15;
alter table public.settings    add column if not exists kirimsiz_sarf_bloklash boolean default true;
alter table public.settings    add column if not exists kritik_qoldiqlar jsonb default '{}'::jsonb;
alter table public.mahsulotlar add column if not exists xarajat_normalari jsonb default '{}'::jsonb;
