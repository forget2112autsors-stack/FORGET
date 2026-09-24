-- FORGET — Didox / E-Faktura to'g'ridan-to'g'ri API integratsiyasi migratsiyasi.
-- Sozlamalar jadvaliga Didox API token, API URL va avto-ombor parametrlarini qo'shadi.
--
-- DIQQAT: bu fayl faqat YANGI ustun QO'SHADI — hech narsani DROP/TRUNCATE qilmaydi.
-- Mavjud production bazada 100% xavfsiz va qayta-qayta ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga nusxalab "Run" bosing.

alter table public.settings add column if not exists didox_token text;
alter table public.settings add column if not exists didox_api_url text default 'https://api.didox.uz/v1';
alter table public.settings add column if not exists didox_auto_ombor boolean default true;
