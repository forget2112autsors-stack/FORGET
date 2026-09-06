-- FORGET (BUX2112) — mahsulot uchun "foyda normasi" (1 birlik uchun belgilangan
-- foyda, so'm) ustuni. Mahsulot kartasi/kalkulyatsiyasida narx tavsiya qilish
-- uchun ishlatiladi: Xomashyo tannarxi (tarkib bo'yicha) + Foyda normasi =
-- tavsiya etilgan sotish narxi (QQSsiz), + QQS = QQS bilan.
--
-- Bu fayl faqat YANGI ustun QO'SHADI, hech narsani DROP/TRUNCATE qilmaydi —
-- qayta-qayta ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

alter table public.mahsulotlar add column if not exists foyda_normasi numeric default 0;

-- Har bir "Ishlab chiqarish" yozuvida o'sha payt qo'yilgan foyda normasi
-- (1 birlik uchun, so'm) — mahsulotdagi standart qiymatdan farqli bo'lishi
-- mumkin (masalan bitta partiya uchun alohida kelishilgan foyda). Shu qiymat
-- "Ishlab chiqarish dalolatnomasi" chop etishda ishlatiladi (qarang app.js
-- printIshlabChiqarishDalolatnoma).
alter table public.ishlab_chiqarish add column if not exists foyda_normasi numeric default 0;

-- "Bank harakati" qatorini "xizmat xarajati" deb belgilash uchun (masalan
-- oylik interaktiv xizmat to'lovi kabi ishlab chiqarishga bevosita
-- bog'lanmagan, lekin davriy xarajat). Shu belgi qo'yilgan chiqim summalari
-- o'sha YILDA sotilgan (kalkulyatsiya bilan bog'langan) mahsulot miqdoriga
-- bo'linib, HAR BIR sotuvning tannarxiga ulush sifatida qo'shiladi (oy emas,
-- yil bo'yicha — aks holda sotuvsiz oydagi xarajat hisobdan tushib qolardi)
-- — qarang app.js: bankXizmatXarajatiYil, yillikSotilganMiqdorJami, computeChiqimKalkulyatsiyaFoyda.
alter table public.bank add column if not exists xizmat boolean default false;
