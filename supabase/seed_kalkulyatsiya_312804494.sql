-- Seed script for firm 312804494 (Polietilen trubalar kalkulyatsiyasi - KG 1)
DO $$
DECLARE
  f_id UUID;
BEGIN
  -- Firmani qidiramiz yoki yaratamiz
  SELECT id INTO f_id FROM public.firmalar WHERE id IN (SELECT firma_id FROM public.settings WHERE inn = '312804494') LIMIT 1;
  IF f_id IS NULL THEN
    INSERT INTO public.firmalar (nomi) VALUES ('312804494 - Polietilen Trubalar Ishlab Chiqarish') RETURNING id INTO f_id;
    INSERT INTO public.settings (firma_id, company_name, inn, period, qqs_stavka, foyda_stavka)
    VALUES (f_id, '312804494 - Polietilen Trubalar Ishlab Chiqarish', '312804494', '2026', 12, 15)
    ON CONFLICT (firma_id) DO UPDATE SET inn = '312804494';
  END IF;

  -- Mahsulotlar va ularning kalkulyatsiya tarkibini kiritamiz
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.20 (12.5 bar, qalinligi 2,0+0,3mm)', 'metr', 1740, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.116}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.20 (12.5 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.20 (16 bar, qalinligi 2,0+0,3mm)', 'metr', 1856, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.116}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.20 (16 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.20 (16 bar, qalinligi 2,3+0,4mm)', 'metr', 1980, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.132}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.20 (16 bar, qalinligi 2,3+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.20 (20 bar, qalinligi 2,3+0,4mm)', 'metr', 2112, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.132}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.20 (20 bar, qalinligi 2,3+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.25 (10 bar, qalinligi 2,0+0,3mm)', 'metr', 2220, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.148}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.25 (10 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.25 (12.5 bar, qalinligi 2,0+0,3mm)', 'metr', 2368, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.148}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.25 (12.5 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.25 (12.5 bar, qalinligi 2,3+0,4mm)', 'metr', 2535, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.169}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.25 (12.5 bar, qalinligi 2,3+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.25 (16 bar, qalinligi 2,3+0,4mm)', 'metr', 2704, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.169}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.25 (16 bar, qalinligi 2,3+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.25 (16 bar, qalinligi 2,8+0,4mm)', 'metr', 2970, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.198}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.25 (16 bar, qalinligi 2,8+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.25 (20 bar, qalinligi 2,8+0,4mm)', 'metr', 3168, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.198}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.25 (20 bar, qalinligi 2,8+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.32 (8 bar, qalinligi 2,0+0,3mm)', 'metr', 2895, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.193}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.32 (8 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.32 (10 bar, qalinligi 2,0+0,3mm)', 'metr', 3088, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.193}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.32 (10 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.32 (10 bar, qalinligi 2,4+0,4mm)', 'metr', 3435, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.229}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.32 (10 bar, qalinligi 2,4+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.32 (12.5 bar, qalinligi 2,4+0,4mm)', 'metr', 3664, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.229}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.32 (12.5 bar, qalinligi 2,4+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.32 (12.5 bar, qalinligi 3,0+0,4mm)', 'metr', 4155, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.277}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.32 (12.5 bar, qalinligi 3,0+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.32 (16 bar, qalinligi 3,0+0,4mm)', 'metr', 4432, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.277}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.32 (16 bar, qalinligi 3,0+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.32 (16 bar, qalinligi 3,6+0,5mm)', 'metr', 4875, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.325}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.32 (16 bar, qalinligi 3,6+0,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.32 (20 bar, qalinligi 3,6+0,5mm)', 'metr', 5200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.325}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.32 (20 bar, qalinligi 3,6+0,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.40 (6.3 bar, qalinligi 2,0+0,3mm)', 'metr', 3660, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.244}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.40 (6.3 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.40 (8 bar, qalinligi 2,0+0,3mm)', 'metr', 3904, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.244}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.40 (8 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.40 (7.5 bar, qalinligi 2,3+0,4mm)', 'metr', 4215, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.281}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.40 (7.5 bar, qalinligi 2,3+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.40 (9.5 bar, qalinligi 2,3+0,4mm)', 'metr', 4496, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.281}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.40 (9.5 bar, qalinligi 2,3+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.40 (8 bar, qalinligi 2,4+0,4mm)', 'metr', 4380, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.292}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.40 (8 bar, qalinligi 2,4+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.40 (10 bar, qalinligi 2,4+0,4mm)', 'metr', 4672, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.292}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.40 (10 bar, qalinligi 2,4+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.40 (10 bar, qalinligi 3,0+0,4mm)', 'metr', 5295, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.353}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.40 (10 bar, qalinligi 3,0+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.40 (12.5 bar, qalinligi 3,0+0,4mm)', 'metr', 5648, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.353}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.40 (12.5 bar, qalinligi 3,0+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.40 (12.5 bar, qalinligi 3,7+0,5mm)', 'metr', 6405, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.427}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.40 (12.5 bar, qalinligi 3,7+0,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.40 (16 bar, qalinligi 3,7+0,5mm)', 'metr', 6832, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.427}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.40 (16 bar, qalinligi 3,7+0,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.40 (16 bar, qalinligi 4,5+0,6mm)', 'metr', 7605, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.507}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.40 (16 bar, qalinligi 4,5+0,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.40 (20 bar, qalinligi 4,5+0,6mm)', 'metr', 8112, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.507}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.40 (20 bar, qalinligi 4,5+0,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.50 (5 bar, qalinligi 2,0+0,3mm)', 'metr', 4620, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.308}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.50 (5 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.50 (6.3 bar, qalinligi 2,0+0,3mm)', 'metr', 4928, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.308}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.50 (6.3 bar, qalinligi 2,0+0,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.50 (6.3 bar, qalinligi 2,4+0,4mm)', 'metr', 5535, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.369}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.50 (6.3 bar, qalinligi 2,4+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.50 (8 bar, qalinligi 2,4+0,4mm)', 'metr', 5904, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.369}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.50 (8 bar, qalinligi 2,4+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.50 (7.5 bar, qalinligi 2,9+0,4mm)', 'metr', 6540, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.436}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.50 (7.5 bar, qalinligi 2,9+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.50 (9.5 bar, qalinligi 2,9+0,4mm)', 'metr', 6976, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.436}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.50 (9.5 bar, qalinligi 2,9+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.50 (8 bar, qalinligi 3,0+0,4mm)', 'metr', 6735, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.449}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.50 (8 bar, qalinligi 3,0+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.50 (10 bar, qalinligi 3,0+0,4mm)', 'metr', 7184, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.449}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.50 (10 bar, qalinligi 3,0+0,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.50 (10 bar, qalinligi 3,7+0,5mm)', 'metr', 8175, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.545}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.50 (10 bar, qalinligi 3,7+0,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.50 (12.5 bar, qalinligi 3,7+0,5mm)', 'metr', 8720, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.545}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.50 (12.5 bar, qalinligi 3,7+0,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.50 (12.5 bar, qalinligi 4,6+0,6mm)', 'metr', 9945, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.663}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.50 (12.5 bar, qalinligi 4,6+0,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.50 (16 bar, qalinligi 4,6+0,6mm)', 'metr', 10608, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.663}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.50 (16 bar, qalinligi 4,6+0,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.50 (16 bar, qalinligi 5,6+0,7mm)', 'metr', 11790, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.786}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.50 (16 bar, qalinligi 5,6+0,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.50 (20 bar, qalinligi 5,6+0,7mm)', 'metr', 12576, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.786}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.50 (20 bar, qalinligi 5,6+0,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.63 (5 bar, qalinligi 2,5mm)', 'metr', 7703.5, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.497}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.63 (5 bar, qalinligi 2,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.63 (6.3 bar, qalinligi 2,5mm)', 'metr', 40000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.488}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.63 (6.3 bar, qalinligi 2,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.63 (6.3 bar, qalinligi 3mm)', 'metr', 9021, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.582}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.63 (6.3 bar, qalinligi 3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.63 (8 bar, qalinligi 3mm)', 'metr', 48000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.573}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.63 (8 bar, qalinligi 3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.63 (8 bar, qalinligi 3,6mm)', 'metr', 10710.5, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.691}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.63 (8 bar, qalinligi 3,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.63 (9.5 bar, qalinligi 3,6mm)', 'metr', 57600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.682}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.63 (9.5 bar, qalinligi 3,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.63 (8 bar, qalinligi 3,8mm)', 'metr', 11222, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.724}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.63 (8 bar, qalinligi 3,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.63 (10 bar, qalinligi 3,8mm)', 'metr', 60800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.715}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.63 (10 bar, qalinligi 3,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.63 (10 bar, qalinligi 4,7mm)', 'metr', 13717.5, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.885}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.63 (10 bar, qalinligi 4,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.63 (12.5 bar, qalinligi 4,7mm)', 'metr', 75200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.869}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.63 (12.5 bar, qalinligi 4,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.63 (12.5 bar, qalinligi 5,8mm)', 'metr', 16430, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.06}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.63 (12.5 bar, qalinligi 5,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.63 (16 bar, qalinligi 5,8mm)', 'metr', 92800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.05}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.63 (16 bar, qalinligi 5,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.63 (16 bar, qalinligi 7,1mm)', 'metr', 19685, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.27}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.63 (16 bar, qalinligi 7,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.63 (20 bar, qalinligi 7,1mm)', 'metr', 113600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.25}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.63 (20 bar, qalinligi 7,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.75 (5 bar, qalinligi 2,9mm)', 'metr', 10509, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.678}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.75 (5 bar, qalinligi 2,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.63 (25 bar, qalinligi 8,6mm)', 'metr', 137600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.47}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.63 (25 bar, qalinligi 8,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.75 (6.3 bar, qalinligi 3,6mm)', 'metr', 12880.5, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.831}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.75 (6.3 bar, qalinligi 3,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.75 (6.3 bar, qalinligi 2,9mm)', 'metr', 46400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.668}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.75 (6.3 bar, qalinligi 2,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.75 (8 bar, qalinligi 4,3mm)', 'metr', 15205.5, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.981}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.75 (8 bar, qalinligi 4,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.75 (8 bar, qalinligi 3,6mm)', 'metr', 57600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.821}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.75 (8 bar, qalinligi 3,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.75 (8 bar, qalinligi 4,5mm)', 'metr', 15810, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.02}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.75 (8 bar, qalinligi 4,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.75 (9.5 bar, qalinligi 4,3mm)', 'metr', 68800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.97}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.75 (9.5 bar, qalinligi 4,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.75 (10 bar, qalinligi 5,6mm)', 'metr', 19375, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.25}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.75 (10 bar, qalinligi 5,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.75 (10 bar, qalinligi 4,5mm)', 'metr', 72000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.01}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.75 (10 bar, qalinligi 4,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.75 (12 bar, qalinligi 6,8mm)', 'metr', 23095, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.49}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.75 (12 bar, qalinligi 6,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.75 (12.5 bar, qalinligi 5,6mm)', 'metr', 89600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.23}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.75 (12.5 bar, qalinligi 5,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.75 (16 bar, qalinligi 8,4mm)', 'metr', 27745, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.79}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.75 (16 bar, qalinligi 8,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.75 (16 bar, qalinligi 6,8mm)', 'metr', 108800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.46}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.75 (16 bar, qalinligi 6,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.90 (5 bar, qalinligi 3,5mm)', 'metr', 15221, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":0.982}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.90 (5 bar, qalinligi 3,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.75 (20 bar, qalinligi 8,4mm)', 'metr', 134400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.76}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.75 (20 bar, qalinligi 8,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.90 (6.3 bar, qalinligi 4,3mm)', 'metr', 18445, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.19}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.90 (6.3 bar, qalinligi 4,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.75 (25 bar, qalinligi 10,3mm)', 'metr', 164800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.09}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.75 (25 bar, qalinligi 10,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.90 (8 bar, qalinligi 5,2mm)', 'metr', 22010, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.42}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.90 (8 bar, qalinligi 5,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.90 (6.3 bar, qalinligi 3,5mm)', 'metr', 56000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":0.969}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.90 (6.3 bar, qalinligi 3,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.90 (8 bar, qalinligi 5,4mm)', 'metr', 22940, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.48}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.90 (8 bar, qalinligi 5,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.90 (8 bar, qalinligi 4,3mm)', 'metr', 68800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.18}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.90 (8 bar, qalinligi 4,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.90 (10 bar, qalinligi 6,7mm)', 'metr', 27900, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.90 (10 bar, qalinligi 6,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.90 (9.5 bar, qalinligi 5,1mm)', 'metr', 81600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.90 (9.5 bar, qalinligi 5,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.90 (12.5 bar, qalinligi 8,2mm)', 'metr', 33325, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.15}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.90 (12.5 bar, qalinligi 8,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.90 (10 bar, qalinligi 5,4mm)', 'metr', 86400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.45}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.90 (10 bar, qalinligi 5,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.90 (16 bar, qalinligi 10,1mm)', 'metr', 40145, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.59}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.90 (16 bar, qalinligi 10,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.90 (12.5 bar, qalinligi 6,7mm)', 'metr', 107200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.76}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.90 (12.5 bar, qalinligi 6,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.110 (4 bar, qalinligi 3,4mm)', 'metr', 18135, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.17}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.110 (4 bar, qalinligi 3,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.90 (16 bar, qalinligi 8,2mm)', 'metr', 131200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.12}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.90 (16 bar, qalinligi 8,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.110 (5 bar, qalinligi 4,2mm)', 'metr', 22320, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.44}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.110 (5 bar, qalinligi 4,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.90 (20 bar, qalinligi 10,1mm)', 'metr', 161600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.54}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.90 (20 bar, qalinligi 10,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.110 (6.3 bar, qalinligi 5,3mm)', 'metr', 27590, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.78}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.110 (6.3 bar, qalinligi 5,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.90 (25 bar, qalinligi 12,3mm)', 'metr', 196800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.90 (25 bar, qalinligi 12,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.110 (8 bar, qalinligi 6,3mm)', 'metr', 32395, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.09}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.110 (8 bar, qalinligi 6,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.110 (6.3 bar, qalinligi 4,2mm)', 'metr', 67200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.42}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.110 (6.3 bar, qalinligi 4,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.110 (8 bar, qalinligi 6,6mm)', 'metr', 33945, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.19}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.110 (8 bar, qalinligi 6,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.110 (8 bar, qalinligi 5,3mm)', 'metr', 84800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.77}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.110 (8 bar, qalinligi 5,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.110 (10 bar, qalinligi 8,1mm)', 'metr', 41230, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.66}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.110 (10 bar, qalinligi 8,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.110 (9.5 bar, qalinligi 6,3mm)', 'metr', 100800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.07}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.110 (9.5 bar, qalinligi 6,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.110 (12.5 bar, qalinligi 10mm)', 'metr', 49600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.110 (12.5 bar, qalinligi 10mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.110 (10 bar, qalinligi 6,6mm)', 'metr', 105600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.16}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.110 (10 bar, qalinligi 6,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.110 (16 bar, qalinligi 12,3mm)', 'metr', 59520, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.84}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.110 (16 bar, qalinligi 12,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.110 (12.5 bar, qalinligi 8,1mm)', 'metr', 129600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.61}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.110 (12.5 bar, qalinligi 8,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.125 (5 bar, qalinligi 4,8mm)', 'metr', 28985, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":1.87}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.125 (5 bar, qalinligi 4,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.110 (16 bar, qalinligi 10mm)', 'metr', 160000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.14}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.110 (16 bar, qalinligi 10mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.125 (6.3 bar, qalinligi 6mm)', 'metr', 35495, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.125 (6.3 bar, qalinligi 6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.110 (20 bar, qalinligi 12,3mm)', 'metr', 196800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.78}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.110 (20 bar, qalinligi 12,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.125 (8 bar, qalinligi 7,1mm)', 'metr', 41695, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.69}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.125 (8 bar, qalinligi 7,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.110 (25 bar, qalinligi 15,1mm)', 'metr', 241600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.49}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.110 (25 bar, qalinligi 15,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.125 (8 bar, qalinligi 7,4mm)', 'metr', 43555, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.81}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.125 (8 bar, qalinligi 7,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.125 (6.3 bar, qalinligi 4,8mm)', 'metr', 76800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":1.83}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.125 (6.3 bar, qalinligi 4,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.125 (10 bar, qalinligi 9,2mm)', 'metr', 53010, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.42}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.125 (10 bar, qalinligi 9,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.125 (8 bar, qalinligi 6mm)', 'metr', 96000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.26}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.125 (8 bar, qalinligi 6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.125 (12.5 bar, qalinligi 11,4mm)', 'metr', 64480, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.16}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.125 (12.5 bar, qalinligi 11,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.125 (9.5 bar, qalinligi 7,1mm)', 'metr', 113600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.66}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.125 (9.5 bar, qalinligi 7,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.125 (16 bar, qalinligi 14mm)', 'metr', 76880, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.96}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.125 (16 bar, qalinligi 14mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.125 (10 bar, qalinligi 7,4mm)', 'metr', 118400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.75}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.125 (10 bar, qalinligi 7,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.140 (5 bar, qalinligi 5,4mm)', 'metr', 36425, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.35}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.140 (5 bar, qalinligi 5,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.125 (12.5 bar, qalinligi 9,2mm)', 'metr', 147200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.37}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.125 (12.5 bar, qalinligi 9,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.140 (6.3 bar, qalinligi 6,7mm)', 'metr', 44795, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.89}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.140 (6.3 bar, qalinligi 6,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.125 (16 bar, qalinligi 11,4mm)', 'metr', 182400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.08}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.125 (16 bar, qalinligi 11,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.140 (8 bar, qalinligi 8mm)', 'metr', 52545, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.39}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.140 (8 bar, qalinligi 8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.125 (20 bar, qalinligi 14mm)', 'metr', 224000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.87}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.125 (20 bar, qalinligi 14mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.140 (8 bar, qalinligi 8,3mm)', 'metr', 54560, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.52}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.140 (8 bar, qalinligi 8,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.140 (6.3 bar, qalinligi 5,4mm)', 'metr', 86400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.31}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.140 (6.3 bar, qalinligi 5,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.140 (10 bar, qalinligi 10,3mm)', 'metr', 66495, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.140 (10 bar, qalinligi 10,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.140 (8 bar, qalinligi 6,7mm)', 'metr', 107200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":2.83}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.140 (8 bar, qalinligi 6,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.140 (12.5 bar, qalinligi 12,7mm)', 'metr', 80445, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":5.19}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.140 (12.5 bar, qalinligi 12,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.140 (9.5 bar, qalinligi 8mm)', 'metr', 128000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.35}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.140 (9.5 bar, qalinligi 8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.140 (16 bar, qalinligi 15,7mm)', 'metr', 96720, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":6.24}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.140 (16 bar, qalinligi 15,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.140 (10 bar, qalinligi 8,3mm)', 'metr', 132800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.46}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.140 (10 bar, qalinligi 8,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 5 d.160 (40 bar, qalinligi 5mm)', 'metr', 38750, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":2.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 5 d.160 (40 bar, qalinligi 5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.140 (12.5 bar, qalinligi 10,3mm)', 'metr', 164800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.22}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.140 (12.5 bar, qalinligi 10,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.160 (5 bar, qalinligi 6,2mm)', 'metr', 47740, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.08}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.160 (5 bar, qalinligi 6,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.140 (16 bar, qalinligi 12,7mm)', 'metr', 203200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.08}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.140 (16 bar, qalinligi 12,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.160 (6.3 bar, qalinligi 7,7mm)', 'metr', 58435, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.77}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.160 (6.3 bar, qalinligi 7,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.140 (20 bar, qalinligi 15,7mm)', 'metr', 251200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":6.12}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.140 (20 bar, qalinligi 15,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.160 (8 bar, qalinligi 9,1mm)', 'metr', 68355, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.41}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.160 (8 bar, qalinligi 9,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.140 (25 bar, qalinligi 19,2mm)', 'metr', 307200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":7.27}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.140 (25 bar, qalinligi 19,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.160 (8 bar, qalinligi 9,5mm)', 'metr', 71300, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.160 (8 bar, qalinligi 9,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.160 (6.3 bar, qalinligi 6,2mm)', 'metr', 99200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.03}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.160 (6.3 bar, qalinligi 6,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.160 (10 bar, qalinligi 11,8mm)', 'metr', 86955, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":5.61}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.160 (10 bar, qalinligi 11,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.160 (8 bar, qalinligi 7,7mm)', 'metr', 123200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.71}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.160 (8 bar, qalinligi 7,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.160 (12.5 bar, qalinligi 14,6mm)', 'metr', 105245, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":6.79}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.160 (12.5 bar, qalinligi 14,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.160 (9.5 bar, qalinligi 9,1mm)', 'metr', 145600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.35}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.160 (9.5 bar, qalinligi 9,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.160 (16 bar, qalinligi 17,9mm)', 'metr', 126015, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":8.13}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.160 (16 bar, qalinligi 17,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.160 (10 bar, qalinligi 9,5mm)', 'metr', 152000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.51}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.160 (10 bar, qalinligi 9,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.180 (5 bar, qalinligi 6,9mm)', 'metr', 59675, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":3.85}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.180 (5 bar, qalinligi 6,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.160 (12.5 bar, qalinligi 11,8mm)', 'metr', 188800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.160 (12.5 bar, qalinligi 11,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.180 (6.3 bar, qalinligi 8,6mm)', 'metr', 73315, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.73}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.180 (6.3 bar, qalinligi 8,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.160 (16 bar, qalinligi 14,6mm)', 'metr', 233600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":6.67}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.160 (16 bar, qalinligi 14,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.180 (8 bar, qalinligi 10,2mm)', 'metr', 86335, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":5.57}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.180 (8 bar, qalinligi 10,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.160 (20 bar, qalinligi 17,9mm)', 'metr', 286400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":7.97}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.160 (20 bar, qalinligi 17,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.180 (8 bar, qalinligi 10,7mm)', 'metr', 90365, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":5.83}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.180 (8 bar, qalinligi 10,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.160 (25 bar, qalinligi 21,9mm)', 'metr', 350400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":9.46}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.160 (25 bar, qalinligi 21,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.180 (10 bar, qalinligi 13,3mm)', 'metr', 110050, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":7.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.180 (10 bar, qalinligi 13,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.180 (6.3 bar, qalinligi 6,9mm)', 'metr', 110400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":3.78}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.180 (6.3 bar, qalinligi 6,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.180 (12 bar, qalinligi 16,4mm)', 'metr', 133145, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":8.59}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.180 (12 bar, qalinligi 16,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.180 (8 bar, qalinligi 8,6mm)', 'metr', 137600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.66}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.180 (8 bar, qalinligi 8,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.180 (16 bar, qalinligi 20,1mm)', 'metr', 159650, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":10.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.180 (16 bar, qalinligi 20,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.180 (9.5 bar, qalinligi 10,2mm)', 'metr', 163200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.47}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.180 (9.5 bar, qalinligi 10,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.200 (4 bar, qalinligi 6,2mm)', 'metr', 62000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.200 (4 bar, qalinligi 6,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.180 (10 bar, qalinligi 10,7mm)', 'metr', 171200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.71}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.180 (10 bar, qalinligi 10,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.200 (5 bar, qalinligi 7,7mm)', 'metr', 73935, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.77}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.200 (5 bar, qalinligi 7,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.180 (12.5 bar, qalinligi 13,3mm)', 'metr', 212800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":6.98}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.180 (12.5 bar, qalinligi 13,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.200 (6.3 bar, qalinligi 9,6mm)', 'metr', 91140, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":5.88}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.200 (6.3 bar, qalinligi 9,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.180 (16 bar, qalinligi 6,4mm)', 'metr', 102400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":8.43}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.180 (16 bar, qalinligi 6,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.200 (8 bar, qalinligi 11,4mm)', 'metr', 107260, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":6.92}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.200 (8 bar, qalinligi 11,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.180 (20 bar, qalinligi 20,1mm)', 'metr', 321600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":10.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.180 (20 bar, qalinligi 20,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.200 (8 bar, qalinligi 11,9mm)', 'metr', 110825, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":7.15}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.200 (8 bar, qalinligi 11,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.180 (25 bar, qalinligi 24,6mm)', 'metr', 393600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":12}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.180 (25 bar, qalinligi 24,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.200 (10 bar, qalinligi 14,7mm)', 'metr', 135625, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":8.75}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.200 (10 bar, qalinligi 14,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.200 (6.3 bar, qalinligi 7,7mm)', 'metr', 123200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":4.68}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.200 (6.3 bar, qalinligi 7,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.200 (12.5 bar, qalinligi 18,2mm)', 'metr', 164300, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":10.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.200 (12.5 bar, qalinligi 18,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.200 (8 bar, qalinligi 9,6mm)', 'metr', 153600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.77}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.200 (8 bar, qalinligi 9,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.200 (16 bar, qalinligi 22,4mm)', 'metr', 196850, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":12.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.200 (16 bar, qalinligi 22,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.200 (9.5 bar, qalinligi 11,4mm)', 'metr', 182400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":6.78}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.200 (9.5 bar, qalinligi 11,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.225 (4 bar, qalinligi 7mm)', 'metr', 75950, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":4.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.225 (4 bar, qalinligi 7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.200 (10 bar, qalinligi 11,9mm)', 'metr', 190400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":7.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.200 (10 bar, qalinligi 11,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.225 (5 bar, qalinligi 8,6mm)', 'metr', 92690, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":5.98}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.225 (5 bar, qalinligi 8,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.200 (12.5 bar, qalinligi 14,7mm)', 'metr', 235200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":8.56}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.200 (12.5 bar, qalinligi 14,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.225 (6.3 bar, qalinligi 10,8mm)', 'metr', 115475, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":7.45}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.225 (6.3 bar, qalinligi 10,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.200 (16 bar, qalinligi 18,2mm)', 'metr', 291200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":10.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.200 (16 bar, qalinligi 18,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.225 (8 bar, qalinligi 12,8mm)', 'metr', 135470, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":8.74}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.225 (8 bar, qalinligi 12,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.200 (20 bar, qalinligi 22,4mm)', 'metr', 358400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":12.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.200 (20 bar, qalinligi 22,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.225 (8 bar, qalinligi 13,4mm)', 'metr', 141360, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":9.12}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.225 (8 bar, qalinligi 13,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.200 (25 bar, qalinligi 27,4mm)', 'metr', 438400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":14.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.200 (25 bar, qalinligi 27,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.225 (10 bar, qalinligi 16,6mm)', 'metr', 172050, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":11.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.225 (10 bar, qalinligi 16,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.225 (6.3 bar, qalinligi 8,6mm)', 'metr', 137600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.88}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.225 (6.3 bar, qalinligi 8,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.225 (12.5 bar, qalinligi 20,5mm)', 'metr', 207700, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":13.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.225 (12.5 bar, qalinligi 20,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.225 (8 bar, qalinligi 10,8mm)', 'metr', 172800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":7.29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.225 (8 bar, qalinligi 10,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.225 (16 bar, qalinligi 25,2mm)', 'metr', 249550, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":16.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.225 (16 bar, qalinligi 25,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.225 (9.5 bar, qalinligi 12,8mm)', 'metr', 204800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":8.55}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.225 (9.5 bar, qalinligi 12,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.250 (4 bar, qalinligi 8mm)', 'metr', 99200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":6.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.250 (4 bar, qalinligi 8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.225 (10 bar, qalinligi 13,4mm)', 'metr', 214400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":8.94}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.225 (10 bar, qalinligi 13,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.250 (5 bar, qalinligi 9,6mm)', 'metr', 115165, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":7.43}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.250 (5 bar, qalinligi 9,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.225 (12.5 bar, qalinligi 16,6mm)', 'metr', 265600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":10.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.225 (12.5 bar, qalinligi 16,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.250 (6.3 bar, qalinligi 11,9mm)', 'metr', 141050, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":9.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.250 (6.3 bar, qalinligi 11,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.225 (16 bar, qalinligi 20,5mm)', 'metr', 328000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":13.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.225 (16 bar, qalinligi 20,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.250 (6.3 bar, qalinligi 12,8mm)', 'metr', 153450, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":9.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.250 (6.3 bar, qalinligi 12,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.225 (20 bar, qalinligi 25,2mm)', 'metr', 403200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":15.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.225 (20 bar, qalinligi 25,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.250 (8 bar, qalinligi 14,2mm)', 'metr', 167400, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":10.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.250 (8 bar, qalinligi 14,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.225 (25 bar, qalinligi 30,8mm)', 'metr', 492800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":18.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.225 (25 bar, qalinligi 30,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.250 (8 bar, qalinligi 14,8mm)', 'metr', 173600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":11.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.250 (8 bar, qalinligi 14,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.250 (6.3 bar, qalinligi 9,6mm)', 'metr', 153600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":7.29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.250 (6.3 bar, qalinligi 9,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.250 (10 bar, qalinligi 18,4mm)', 'metr', 212350, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":13.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.250 (10 bar, qalinligi 18,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.250 (8 bar, qalinligi 11,9mm)', 'metr', 190400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":8.92}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.250 (8 bar, qalinligi 11,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.250 (12.5 bar, qalinligi 22,7mm)', 'metr', 255750, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":16.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.250 (12.5 bar, qalinligi 22,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.250 (9.5 bar, qalinligi 14,2mm)', 'metr', 227200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":10.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.250 (9.5 bar, qalinligi 14,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.250 (16 bar, qalinligi 27,9mm)', 'metr', 306900, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":19.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.250 (16 bar, qalinligi 27,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.250 (10 bar, qalinligi 14,8mm)', 'metr', 236800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":11}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.250 (10 bar, qalinligi 14,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.280 (4 bar, qalinligi 8,6mm)', 'metr', 124000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.280 (4 bar, qalinligi 8,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.250 (12.5 bar, qalinligi 18,4mm)', 'metr', 294400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":13.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.250 (12.5 bar, qalinligi 18,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.280 (5 bar, qalinligi 10,7mm)', 'metr', 143995, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":9.29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.280 (5 bar, qalinligi 10,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.250 (16 bar, qalinligi 22,7mm)', 'metr', 363200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":16.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.250 (16 bar, qalinligi 22,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.280 (6.3 bar, qalinligi 13,4mm)', 'metr', 178250, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":11.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.280 (6.3 bar, qalinligi 13,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.250 (20 bar, qalinligi 22,9mm)', 'metr', 366400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":19.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.250 (20 bar, qalinligi 22,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.280 (8 bar, qalinligi 15,9mm)', 'metr', 209250, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":13.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.280 (8 bar, qalinligi 15,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.250 (25 bar, qalinligi 34,2mm)', 'metr', 547200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":23.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.250 (25 bar, qalinligi 34,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.280 (8 bar, qalinligi 16,6mm)', 'metr', 217000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":14}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.280 (8 bar, qalinligi 16,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.280 (6.3 bar, qalinligi 10,7mm)', 'metr', 171200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":9.09}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.280 (6.3 bar, qalinligi 10,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.280 (10 bar, qalinligi 20,6mm)', 'metr', 265050, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":17.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.280 (10 bar, qalinligi 20,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.280 (8 bar, qalinligi 13,4mm)', 'metr', 214400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":11.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.280 (8 bar, qalinligi 13,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.280 (12.5 bar, qalinligi 25,4mm)', 'metr', 320850, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":20.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.280 (12.5 bar, qalinligi 25,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.280 (9.5 bar, qalinligi 15,9mm)', 'metr', 254400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":13.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.280 (9.5 bar, qalinligi 15,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.280 (16 bar, qalinligi 31,3mm)', 'metr', 385950, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":24.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.280 (16 bar, qalinligi 31,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.280 (10 bar, qalinligi 16,6mm)', 'metr', 265600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":13.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.280 (10 bar, qalinligi 16,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.315 (5 bar, qalinligi 12,1mm)', 'metr', 182900, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":11.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.315 (5 bar, qalinligi 12,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.280 (12.5 bar, qalinligi 20,6mm)', 'metr', 329600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":16.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.280 (12.5 bar, qalinligi 20,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.315 (6.3 bar, qalinligi 15mm)', 'metr', 224750, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":14.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.315 (6.3 bar, qalinligi 15mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.280 (16 bar, qalinligi 25,4mm)', 'metr', 406400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":20.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.280 (16 bar, qalinligi 25,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.315 (8 bar, qalinligi 17,9mm)', 'metr', 265050, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":17.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.315 (8 bar, qalinligi 17,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.280 (20 bar, qalinligi 31,3mm)', 'metr', 500800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":24.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.280 (20 bar, qalinligi 31,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.315 (8 bar, qalinligi 18,7mm)', 'metr', 275900, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":17.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.315 (8 bar, qalinligi 18,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.280 (25 bar, qalinligi 38,3mm)', 'metr', 612800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":28.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.280 (25 bar, qalinligi 38,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.315 (10 bar, qalinligi 23,2mm)', 'metr', 336350, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":21.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.315 (10 bar, qalinligi 23,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.315 (6.3 bar, qalinligi 12,1mm)', 'metr', 193600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":11.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.315 (6.3 bar, qalinligi 12,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.315 (12.5 bar, qalinligi 28,6mm)', 'metr', 406100, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":26.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.315 (12.5 bar, qalinligi 28,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.315 (8 bar, qalinligi 15mm)', 'metr', 240000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":14.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.315 (8 bar, qalinligi 15mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.315 (16 bar, qalinligi 35,2mm)', 'metr', 488250, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":31.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.315 (16 bar, qalinligi 35,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.315 (9.5 bar, qalinligi 17,9mm)', 'metr', 286400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":16.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.315 (9.5 bar, qalinligi 17,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.355 (5 bar, qalinligi 13,6mm)', 'metr', 230950, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":14.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.355 (5 bar, qalinligi 13,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.315 (10 bar, qalinligi 18,7mm)', 'metr', 299200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":17.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.315 (10 bar, qalinligi 18,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.355 (6.3 bar, qalinligi 16,9mm)', 'metr', 285200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":18.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.355 (6.3 bar, qalinligi 16,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.315 (12.5 bar, qalinligi 23,2mm)', 'metr', 371200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":21.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.315 (12.5 bar, qalinligi 23,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.355 (8 bar, qalinligi 20,1mm)', 'metr', 334800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":21.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.355 (8 bar, qalinligi 20,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.315 (16 bar, qalinligi 28,6mm)', 'metr', 457600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":25.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.315 (16 bar, qalinligi 28,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.355 (8 bar, qalinligi 21,1mm)', 'metr', 350300, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":22.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.355 (8 bar, qalinligi 21,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.315 (20 bar, qalinligi 35,2mm)', 'metr', 563200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":30.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.315 (20 bar, qalinligi 35,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.355 (10 bar, qalinligi 26,1mm)', 'metr', 426250, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":27.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.355 (10 bar, qalinligi 26,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.315 (25 bar, qalinligi 43,1mm)', 'metr', 689600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":36.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.315 (25 bar, qalinligi 43,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.355 (12.5 bar, qalinligi 32,2mm)', 'metr', 516150, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":33.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.355 (12.5 bar, qalinligi 32,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.355 (6.3 bar, qalinligi 13,6mm)', 'metr', 217600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":14.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.355 (6.3 bar, qalinligi 13,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.355 (16 bar, qalinligi 39,7mm)', 'metr', 620000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":40}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.355 (16 bar, qalinligi 39,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.355 (8 bar, qalinligi 16,9mm)', 'metr', 270400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":18}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.355 (8 bar, qalinligi 16,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.400 (5 bar, qalinligi 15,3mm)', 'metr', 292950, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":18.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.400 (5 bar, qalinligi 15,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.355 (9.5 bar, qalinligi 20,1mm)', 'metr', 321600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":21.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.355 (9.5 bar, qalinligi 20,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.400 (6.3 bar, qalinligi 19,1mm)', 'metr', 362700, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":23.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.400 (6.3 bar, qalinligi 19,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.355 (10 bar, qalinligi 21,1mm)', 'metr', 337600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":22.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.355 (10 bar, qalinligi 21,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.400 (8 bar, qalinligi 27,2mm)', 'metr', 426250, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":27.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.400 (8 bar, qalinligi 27,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.355 (12.5 bar, qalinligi 26,1mm)', 'metr', 417600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":27}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.355 (12.5 bar, qalinligi 26,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.400 (8 bar, qalinligi 23,7mm)', 'metr', 443300, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":28.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.400 (8 bar, qalinligi 23,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.355 (16 bar, qalinligi 32,2mm)', 'metr', 515200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":32.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.355 (16 bar, qalinligi 32,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.400 (10 bar, qalinligi 29,4mm)', 'metr', 540950, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":34.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.400 (10 bar, qalinligi 29,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.355 (20 bar, qalinligi 39,7mm)', 'metr', 635200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":39.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.355 (20 bar, qalinligi 39,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.400 (12.5 bar, qalinligi 36,3mm)', 'metr', 655650, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":42.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.400 (12.5 bar, qalinligi 36,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.355 (25 bar, qalinligi 48,5mm)', 'metr', 776000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":46.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.355 (25 bar, qalinligi 48,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.400 (16 bar, qalinligi 44,7mm)', 'metr', 785850, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":50.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.400 (16 bar, qalinligi 44,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.400 (6.3 bar, qalinligi 15,3mm)', 'metr', 244800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":18.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.400 (6.3 bar, qalinligi 15,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.450 (5 bar, qalinligi 17,2mm)', 'metr', 370450, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":23.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.450 (5 bar, qalinligi 17,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.400 (8 bar, qalinligi 19,1mm)', 'metr', 305600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":22.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.400 (8 bar, qalinligi 19,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.450 (6.3 bar, qalinligi 21,5mm)', 'metr', 458800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":29.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.450 (6.3 bar, qalinligi 21,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.400 (9.5 bar, qalinligi 22,7mm)', 'metr', 363200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":26.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.400 (9.5 bar, qalinligi 22,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.450 (8 bar, qalinligi 25,5mm)', 'metr', 539400, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":34.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.450 (8 bar, qalinligi 25,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.400 (10 bar, qalinligi 23,7mm)', 'metr', 379200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":28}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.400 (10 bar, qalinligi 23,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.450 (8 bar, qalinligi 26,7mm)', 'metr', 562650, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":36.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.450 (8 bar, qalinligi 26,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.400 (12.5 bar, qalinligi 29,4mm)', 'metr', 470400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":34.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.400 (12.5 bar, qalinligi 29,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.450 (10 bar, qalinligi 33,1mm)', 'metr', 685100, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":44.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.450 (10 bar, qalinligi 33,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.400 (16 bar, qalinligi 36,3mm)', 'metr', 580800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":41.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.400 (16 bar, qalinligi 36,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.450 (12.5 bar, qalinligi 40,9mm)', 'metr', 830800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":53.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.450 (12.5 bar, qalinligi 40,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.400 (20 bar, qalinligi 44,7mm)', 'metr', 715200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":49.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.400 (20 bar, qalinligi 44,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.450 (16 bar, qalinligi 50,3mm)', 'metr', 995100, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":64.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.450 (16 bar, qalinligi 50,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.400 (25 bar, qalinligi 54,7mm)', 'metr', 875200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":59}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.400 (25 bar, qalinligi 54,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.500 (5 bar, qalinligi 19,1mm)', 'metr', 457250, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":29.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.500 (5 bar, qalinligi 19,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.450 (6.3 bar, qalinligi 17,2mm)', 'metr', 275200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":23.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.450 (6.3 bar, qalinligi 17,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.500 (6.3 bar, qalinligi 23,9mm)', 'metr', 565750, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":36.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.500 (6.3 bar, qalinligi 23,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.450 (8 bar, qalinligi 21,5mm)', 'metr', 344000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.450 (8 bar, qalinligi 21,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.500 (8 bar, qalinligi 28,3mm)', 'metr', 664950, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":42.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.500 (8 bar, qalinligi 28,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.450 (9.5 bar, qalinligi 25,5mm)', 'metr', 408000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":34}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.450 (9.5 bar, qalinligi 25,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.500 (8 bar, qalinligi 29,7mm)', 'metr', 694400, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":44.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.500 (8 bar, qalinligi 29,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.450 (10 bar, qalinligi 26,7mm)', 'metr', 427200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":35.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.450 (10 bar, qalinligi 26,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.500 (10 bar, qalinligi 36,8mm)', 'metr', 847850, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":54.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.500 (10 bar, qalinligi 36,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.450 (12.5 bar, qalinligi 33,1mm)', 'metr', 529600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":43.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.450 (12.5 bar, qalinligi 33,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.500 (12.5 bar, qalinligi 45,4mm)', 'metr', 1024550, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":66.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.500 (12.5 bar, qalinligi 45,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.450 (16 bar, qalinligi 49,9mm)', 'metr', 798400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":52.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.450 (16 bar, qalinligi 49,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 9 d.500 (16 bar, qalinligi 55,8mm)', 'metr', 1227600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":79.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 9 d.500 (16 bar, qalinligi 55,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.450 (20 bar, qalinligi 50,3mm)', 'metr', 804800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":62.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.450 (20 bar, qalinligi 50,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.560 (5 bar, qalinligi 21,4mm)', 'metr', 593600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":37.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.560 (5 bar, qalinligi 21,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.450 (25 bar, qalinligi 61,5mm)', 'metr', 984000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":74.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.450 (25 bar, qalinligi 61,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.560 (6.3 bar, qalinligi 26,7mm)', 'metr', 732800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":45.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.560 (6.3 bar, qalinligi 26,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.500 (6.3 bar, qalinligi 19,1mm)', 'metr', 305600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":29}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.500 (6.3 bar, qalinligi 19,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.560 (8 bar, qalinligi 31,7mm)', 'metr', 859200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":53.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.560 (8 bar, qalinligi 31,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.500 (8 bar, qalinligi 23,9mm)', 'metr', 382400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":35.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.500 (8 bar, qalinligi 23,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.560 (8 bar, qalinligi 33,2mm)', 'metr', 897600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":56.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.560 (8 bar, qalinligi 33,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.500 (9.5 bar, qalinligi 28,3mm)', 'metr', 452800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":42}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.500 (9.5 bar, qalinligi 28,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.560 (10.6 bar, qalinligi 41,2mm)', 'metr', 1096000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":68.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.560 (10.6 bar, qalinligi 41,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.500 (10 bar, qalinligi 29,7mm)', 'metr', 475200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":43.9}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.500 (10 bar, qalinligi 29,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.560 (12 bar, qalinligi 57,2mm)', 'metr', 1324800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":82.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.560 (12 bar, qalinligi 57,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.500 (12.5 bar, qalinligi 36,8mm)', 'metr', 588800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":53.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.500 (12.5 bar, qalinligi 36,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.630 (5 bar, qalinligi 24,1mm)', 'metr', 752000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":47}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.630 (5 bar, qalinligi 24,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.500 (16 bar, qalinligi 45,4mm)', 'metr', 726400, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":64.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.500 (16 bar, qalinligi 45,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.630 (6.3 bar, qalinligi 30mm)', 'metr', 924800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":57.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.630 (6.3 bar, qalinligi 30mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.500 (20 bar, qalinligi 55,8mm)', 'metr', 892800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":77.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.500 (20 bar, qalinligi 55,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.630 (8 bar, qalinligi 35,7mm)', 'metr', 1089600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":68.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.630 (8 bar, qalinligi 35,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.500 (25 bar, qalinligi 68,3mm)', 'metr', 1092800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":92.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.500 (25 bar, qalinligi 68,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.630 (8 bar, qalinligi 37,4mm)', 'metr', 1139200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":71.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.630 (8 bar, qalinligi 37,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.560 (6.3 bar, qalinligi 21,4mm)', 'metr', 353100, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":36.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.560 (6.3 bar, qalinligi 21,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.630 (10 bar, qalinligi 46,3mm)', 'metr', 1385600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":86.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.630 (10 bar, qalinligi 46,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.560 (8 bar, qalinligi 26,7mm)', 'metr', 440550, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":44.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.560 (8 bar, qalinligi 26,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 11 d.630 (12.5 bar, qalinligi 57,2mm)', 'metr', 1740800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":108.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 11 d.630 (12.5 bar, qalinligi 57,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.560 (9.5 bar, qalinligi 31,7mm)', 'metr', 523050, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":52.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.560 (9.5 bar, qalinligi 31,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.710 (5 bar, qalinligi 27,2mm)', 'metr', 955200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":59.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.710 (5 bar, qalinligi 27,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.560 (10 bar, qalinligi 33,2mm)', 'metr', 547800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":55}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.560 (10 bar, qalinligi 33,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.710 (6.3 bar, qalinligi 33,9mm)', 'metr', 1177600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":73.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.710 (6.3 bar, qalinligi 33,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.560 (12.5 bar, qalinligi 41,2mm)', 'metr', 679800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":67.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.560 (12.5 bar, qalinligi 41,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.710 (8 bar, qalinligi 40,2mm)', 'metr', 1382400, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":86.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.710 (8 bar, qalinligi 40,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.560 (16 bar, qalinligi 50,8mm)', 'metr', 838200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":81}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.560 (16 bar, qalinligi 50,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.710 (8 bar, qalinligi 42,1mm)', 'metr', 1444800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":90.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.710 (8 bar, qalinligi 42,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 9 d.560 (20 bar, qalinligi 62,5mm)', 'metr', 1031250, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":97.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 9 d.560 (20 bar, qalinligi 62,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.710 (10 bar, qalinligi 52,2mm)', 'metr', 1760000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":110}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.710 (10 bar, qalinligi 52,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.630 (6.3 bar, qalinligi 24,1mm)', 'metr', 397650, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":46}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.630 (6.3 bar, qalinligi 24,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 26 d.800 (5 bar, qalinligi 30,6mm)', 'metr', 1209600, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":75.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 26 d.800 (5 bar, qalinligi 30,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.630 (8 bar, qalinligi 30mm)', 'metr', 495000, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":56.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.630 (8 bar, qalinligi 30mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 21 d.800 (6.3 bar, qalinligi 38,1mm)', 'metr', 1492800, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":93.3}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 21 d.800 (6.3 bar, qalinligi 38,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.630 (9.5 bar, qalinligi 35,7mm)', 'metr', 589050, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":66.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.630 (9.5 bar, qalinligi 35,7mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17,6 d.800 (8 bar, qalinligi 45,3mm)', 'metr', 1755200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":109.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17,6 d.800 (8 bar, qalinligi 45,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.630 (10 bar, qalinligi 37,4mm)', 'metr', 617100, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":69.6}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.630 (10 bar, qalinligi 37,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 17 d.800 (8 bar, qalinligi 47,4mm)', 'metr', 1832000, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":114.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 17 d.800 (8 bar, qalinligi 47,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.630 (12.5 bar, qalinligi 46,3mm)', 'metr', 763950, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":84.8}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.630 (12.5 bar, qalinligi 46,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 80 SDR 13,6 d.800 (10 bar, qalinligi 58,8mm)', 'metr', 2235200, 15, '[{"nomi":"Polietilen granulasi PE 80","birlik":"kg","norma":139.7}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 80 SDR 13,6 d.800 (10 bar, qalinligi 58,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.630 (16 bar, qalinligi 57,2mm)', 'metr', 943800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":103}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.630 (16 bar, qalinligi 57,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.710 (6.3 bar, qalinligi 27,2mm)', 'metr', 448800, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":58.5}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.710 (6.3 bar, qalinligi 27,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.710 (8 bar, qalinligi 33,9mm)', 'metr', 559350, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":72.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.710 (8 bar, qalinligi 33,9mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.710 (9.5 bar, qalinligi 40,2mm)', 'metr', 663300, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":84.2}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.710 (9.5 bar, qalinligi 40,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.710 (10 bar, qalinligi 42,1mm)', 'metr', 694650, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":88.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.710 (10 bar, qalinligi 42,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.710 (12.5 bar, qalinligi 52,2mm)', 'metr', 861300, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":108}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.710 (12.5 bar, qalinligi 52,2mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.710 (16 bar, qalinligi 64,5mm)', 'metr', 1064250, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":131}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.710 (16 bar, qalinligi 64,5mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 7,4 d.710 (25 bar, qalinligi 17,1mm)', 'metr', 273600, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":5.78}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 7,4 d.710 (25 bar, qalinligi 17,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 26 d.800 (6.3 bar, qalinligi 30,6mm)', 'metr', 504900, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":74.1}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 26 d.800 (6.3 bar, qalinligi 30,6mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 21 d.800 (8 bar, qalinligi 38,1mm)', 'metr', 628650, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":91.4}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 21 d.800 (8 bar, qalinligi 38,1mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17,6 d.800 (9.5 bar, qalinligi 45,3mm)', 'metr', 747450, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":108}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17,6 d.800 (9.5 bar, qalinligi 45,3mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 17 d.800 (10 bar, qalinligi 47,4mm)', 'metr', 782100, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":112}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 17 d.800 (10 bar, qalinligi 47,4mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 13,6 d.800 (12.5 bar, qalinligi 58,8mm)', 'metr', 970200, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":137}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 13,6 d.800 (12.5 bar, qalinligi 58,8mm)');
  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)
  SELECT f_id, 'Truba PE 100 SDR 11 d.800 (16 bar, qalinligi 72,6mm)', 'metr', 1197900, 15, '[{"nomi":"Polietilen granulasi PE 100","birlik":"kg","norma":169}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = 'Truba PE 100 SDR 11 d.800 (16 bar, qalinligi 72,6mm)');
END $$;
