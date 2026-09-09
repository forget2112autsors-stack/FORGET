-- FORGET — FIFO (partiyalar bo'yicha) tannarx hisobi + "yumshoq tasdiq" tayyorgarligi.
--
-- NIMA QO'SHADI:
--   settings.tannarx_usuli          — 'fifo' (standart) yoki 'ortacha' (eski o'rtacha
--                                     xarid narxi usuli). Mavjud firma FIFO'ga o'tganda
--                                     F2/Foyda solig'i raqamlari aniqlashadi (siljishi
--                                     mumkin) — buxgalter xohlasa 'ortacha'ga qaytaradi.
--   settings.default_foyda_normasi  — kalkulyatsiya bilan bog'lanmagan sotuv qatori
--                                     uchun taxminiy tannarx = summa * (1 - normasi).
--                                     Standart 0.2 (ya'ni taxminiy tannarx = 80%).
--   chiqim.tovarsiz                 — xizmat/vositachilik kabi tovarsiz sotuv; kelgusi
--                                     "yumshoq tasdiq" bosqichida kalkulyatsiya talab
--                                     qilinmaydi (hozircha faqat ustun qo'shiladi).
--   ombor.created_at               — bir kun ichidagi kirim/chiqim harakatlarini
--                                     deterministik tartiblash uchun (FIFO navbati).
--
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI — hech narsani DROP/TRUNCATE qilmaydi,
-- mavjud production bazada xavfsiz. Qayta-qayta ishga tushirilsa ham xato bermaydi
-- (idempotent). Supabase Dashboard -> loyihangiz -> SQL Editor'ga nusxalab "Run" bosing.

alter table public.settings add column if not exists tannarx_usuli text default 'fifo';
alter table public.settings add column if not exists default_foyda_normasi numeric default 0.2;
alter table public.chiqim   add column if not exists tovarsiz boolean default false;
alter table public.ombor    add column if not exists created_at timestamptz default now();
