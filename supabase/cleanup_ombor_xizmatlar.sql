-- Omborda faqat mahsulot turadi. Filtr kuchaytirilishidan oldin import qilinib
-- "ombor" jadvaliga tushib qolgan xizmat qatorlarini (birligi "услуга (сум)",
-- "xizmat (so'm)" va h.k.) o'chiradi. Shart app.js'dagi isServiceOmborItem()
-- bilan bir xil.
--
-- Supabase → SQL Editor'da BOSQICHMA-BOSQICH ishga tushiring:
--   1-qadam: zaxira nusxa + ro'yxat (hech narsa o'chirilmaydi)
--   2-qadam: ro'yxatni ko'rib chiqqach, o'chirish

-- ============ 1-QADAM: zaxira nusxa va ko'rib chiqish ============
create table if not exists ombor_xizmat_backup_20260930 as
select * from ombor
where
  regexp_replace(replace(lower(trim(coalesce(birlik, ''))), 'ё', 'е'), '\s+', ' ', 'g')
    ~ '^(service|services|xizmat(lar|lari|i)?|хизмат(лар|лари|и)?|услуг(а|и)?|работ(а|ы)?|усл\.?\s*ед\.?)(\s*\(.*\))?$'
  or replace(lower(trim(coalesce(nomi, ''))), 'ё', 'е')
    ~ '(^|[\s(])(xizmat(lar|lari|i)?|хизмат(лар|лари|и)?|услуг(а|и)?|работ(а|ы)?|services?|комиссионн\S*)($|[\s),.:;/-])';

select sana, hujjat_raqami, nomi, birlik, miqdor, yetkazib_berish_narxi, turi
from ombor_xizmat_backup_20260930
order by sana desc;

-- ============ 2-QADAM: o'chirish (ro'yxat to'g'ri bo'lsa) ============
-- delete from ombor where id in (select id from ombor_xizmat_backup_20260930);

-- Qaytarish kerak bo'lsa:
-- insert into ombor select * from ombor_xizmat_backup_20260930;
