const fs = require('fs');
const path = require('path');
const prods = require('../kg1_mahsulotlar.json');

let sql = '-- Seed script for firm 312804494 (Polietilen trubalar kalkulyatsiyasi - KG 1)\n';
sql += 'DO $$\nDECLARE\n  f_id UUID;\nBEGIN\n';
sql += '  -- Firmani qidiramiz yoki yaratamiz\n';
sql += '  SELECT id INTO f_id FROM public.firmalar WHERE id IN (SELECT firma_id FROM public.settings WHERE inn = \'312804494\') LIMIT 1;\n';
sql += '  IF f_id IS NULL THEN\n';
sql += '    INSERT INTO public.firmalar (nomi) VALUES (\'312804494 - Polietilen Trubalar Ishlab Chiqarish\') RETURNING id INTO f_id;\n';
sql += '    INSERT INTO public.settings (firma_id, company_name, inn, period, qqs_stavka, foyda_stavka)\n';
sql += '    VALUES (f_id, \'312804494 - Polietilen Trubalar Ishlab Chiqarish\', \'312804494\', \'2026\', 12, 15)\n';
sql += '    ON CONFLICT (firma_id) DO UPDATE SET inn = \'312804494\';\n';
sql += '  END IF;\n\n';

sql += '  -- Mahsulotlar va ularning kalkulyatsiya tarkibini kiritamiz\n';
prods.forEach(p => {
  const nomi = p.nomi.replace(/'/g, "''");
  const birlik = p.birlik;
  const standartNarxi = p.standartNarxi || 0;
  const foydaNormasi = p.foydaNormasi || 15;
  const tarkibJson = JSON.stringify(p.tarkib).replace(/'/g, "''");
  sql += '  INSERT INTO public.mahsulotlar (firma_id, nomi, birlik, standart_narxi, foyda_normasi, tarkib)\n';
  sql += '  SELECT f_id, \'' + nomi + '\', \'' + birlik + '\', ' + standartNarxi + ', ' + foydaNormasi + ', \'' + tarkibJson + '\'::jsonb\n';
  sql += '  WHERE NOT EXISTS (SELECT 1 FROM public.mahsulotlar WHERE firma_id = f_id AND nomi = \'' + nomi + '\');\n';
});

sql += 'END $$;\n';

fs.writeFileSync(path.join(__dirname, '../supabase/seed_kalkulyatsiya_312804494.sql'), sql, 'utf8');
console.log('Written supabase/seed_kalkulyatsiya_312804494.sql, lines:', prods.length);
