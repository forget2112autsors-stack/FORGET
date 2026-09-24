-- migration_tabel_t13.sql
-- Xodimlar davomati va elektron Tabel (T-13 shakli) jadvali
-- O'zbekiston Respublikasi Mehnat Kodeksi va buxgalteriya hisobi talablari asosida

CREATE TABLE IF NOT EXISTS tabel (
  id TEXT PRIMARY KEY,
  firma_id UUID NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  yil INT NOT NULL,
  oy INT NOT NULL,
  xodim_id TEXT,
  fio TEXT NOT NULL,
  lavozimi TEXT,
  pinfl TEXT,
  oklad NUMERIC(15,2) DEFAULT 0,
  stavka NUMERIC(5,2) DEFAULT 1.0,
  grafik TEXT DEFAULT '5_kunlik',
  kunlar JSONB DEFAULT '{}'::jsonb,
  ishlangan_kun NUMERIC(6,2) DEFAULT 0,
  ishlangan_soat NUMERIC(7,2) DEFAULT 0,
  tatil_kun INT DEFAULT 0,
  tatil_summa NUMERIC(15,2) DEFAULT 0,
  kasallik_kun INT DEFAULT 0,
  kasallik_summa NUMERIC(15,2) DEFAULT 0,
  mukofot NUMERIC(15,2) DEFAULT 0,
  faktik_oylik NUMERIC(15,2) DEFAULT 0,
  jami_hisoblandi NUMERIC(15,2) DEFAULT 0,
  izoh TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indekslar
CREATE INDEX IF NOT EXISTS idx_tabel_firma_yil_oy ON tabel(firma_id, yil, oy);
CREATE INDEX IF NOT EXISTS idx_tabel_pinfl ON tabel(pinfl);

-- RLS
ALTER TABLE tabel ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tabel' AND policyname = 'Foydalanuvchi o''z firmasidagi tabelni ko''radi'
  ) THEN
    CREATE POLICY "Foydalanuvchi o'z firmasidagi tabelni ko'radi" ON tabel
      FOR ALL USING (firma_id IN (SELECT firma_id FROM user_firmalar WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tabel'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tabel;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Publication mavjud bo'lmasa xato bermaslik
END $$;
