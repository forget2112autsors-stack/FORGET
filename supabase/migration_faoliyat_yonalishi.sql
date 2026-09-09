-- FORGET — Faoliyat yo'nalishi ("Funksionallik", 1C uslubida).
--
-- NIMA QO'SHADI (settings jadvaliga):
--   yonalish                — "" | ishlabchiqarish | xizmat | savdo | vositachilik | qurilish
--   modul_ombor             — Ombor bo'limi ko'rinadimi (null/true = ha, false = yashirin)
--   modul_ishlab_chiqarish  — "Ishlab chiqarish" bo'limi ko'rinadimi
--   modul_asosiy_vositalar  — "Asosiy vositalar" bo'limi ko'rinadimi
--
-- Yo'nalish tanlanganda shu 3 bayroq standart holatga o'rnatiladi (belgilanadi),
-- lekin foydalanuvchi keyin har birini alohida yoqib/o'chira oladi. Modul
-- o'chirilsa faqat sidebar'dagi bo'lim yashiriladi — ma'lumot va hisob-kitob
-- o'chmaydi. NULL qiymat = "ko'rinadi" (mavjud firmalarda hech narsa o'zgarmaydi).
--
-- DIQQAT: faqat YANGI ustun QO'SHADI. Idempotent, production'da xavfsiz.
-- Supabase Dashboard -> SQL Editor -> nusxalab "Run".

alter table public.settings add column if not exists yonalish text default '';
alter table public.settings add column if not exists modul_ombor boolean;
alter table public.settings add column if not exists modul_ishlab_chiqarish boolean;
alter table public.settings add column if not exists modul_asosiy_vositalar boolean;
