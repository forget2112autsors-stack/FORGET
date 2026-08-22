-- BUX2112 — foydalanuvchi rollari va "o'chirish" amalini faqat adminlarga cheklash.
-- HOZIRGI HOLAT: "authenticated_full_access" policy tufayli LOGIN QILGAN HAR QANDAY
-- xodim boshqa xodim kiritgan yozuvni ham, jumladan "Sozlamalar -> Hammasini
-- tozalash" tugmasi orqali BUTUN BAZANI ham o'chira oladi. Bu fayl faqat DELETE
-- (o'chirish) amalini "admin" rolidagi foydalanuvchilarga cheklaydi — SELECT/
-- INSERT/UPDATE hammaga (hamkorlikda kiritish uchun) ochiq qoladi.
-- DIQQAT: bu fayl faqat YANGI jadval/policy QO'SHADI va DELETE policy'sini
-- ALMASHTIRADI — mavjud ma'lumotni DROP/TRUNCATE qilmaydi. Ikkala production
-- loyihada (1-baza va 2-baza) ham alohida-alohida ishga tushiring.
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

/* ============================ 1) Rollar jadvali ============================ */

create table if not exists public.foydalanuvchi_rollari (
  email text primary key,
  role text not null default 'xodim' check (role in ('admin', 'xodim')),
  created_at timestamptz not null default now()
);

alter table public.foydalanuvchi_rollari enable row level security;

-- Har bir login qilgan xodim ro'yxatni o'qiy oladi (masalan, kim admin ekanini
-- ko'rish uchun) — lekin faqat admin o'ziga yoki boshqasiga rol yoza/o'zgartira
-- oladi (pastdagi WITH CHECK/USING shuni ta'minlaydi).
drop policy if exists "authenticated_read" on public.foydalanuvchi_rollari;
create policy "authenticated_read" on public.foydalanuvchi_rollari for select to authenticated using (true);

-- Yordamchi funksiya: joriy login qilgan foydalanuvchi admin ekanini tekshiradi.
-- "security definer" — RLS policy ichida chaqirilganda ham rollar jadvaliga
-- to'g'ridan-to'g'ri kirish huquqiga ega bo'ladi (cheksiz rekursiyaga tushmaydi).
create or replace function public.is_admin() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.foydalanuvchi_rollari
    where email = auth.email() and role = 'admin'
  );
$$;

drop policy if exists "admin_write_rollar" on public.foydalanuvchi_rollari;
create policy "admin_write_rollar" on public.foydalanuvchi_rollari for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/* ===================== 2) DELETE'ni faqat adminga cheklash ===================== */
-- Eslatma: "authenticated_full_access" policy FOR ALL bo'lganligi uchun avval
-- uni olib tashlab, o'rniga SELECT/INSERT/UPDATE uchun ochiq, DELETE uchun esa
-- faqat admin uchun policy qo'shamiz.

do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar'])
  loop
    execute format('drop policy if exists "authenticated_full_access" on public.%I', t);
    execute format('drop policy if exists "authenticated_read_write" on public.%I', t);
    execute format('drop policy if exists "authenticated_insert" on public.%I', t);
    execute format('drop policy if exists "authenticated_update" on public.%I', t);
    execute format('drop policy if exists "authenticated_delete_admin" on public.%I', t);
    execute format('create policy "authenticated_read_write" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "authenticated_insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "authenticated_update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "authenticated_delete_admin" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

/* --------------------------------------------------------------------------
 SQL shu yerda tugadi. MUHIM KEYINGI QADAM — o'zingizni (va kerakli xodimlarni)
 admin sifatida belgilang, aks holda HECH KIM (siz ham) hech qanday qatorni
 o'chira olmaysiz. Bu skript IKKALA bazada (1-baza va 2-baza) alohida
 ishga tushirilgani uchun, quyidagi INSERT'ni ham HAR BIR bazada O'SHA
 baza uchun to'g'ri admin email bilan bajaring — ikkalasi bir xil emas:

   -- 1-baza (asosiy) uchun:
   insert into public.foydalanuvchi_rollari (email, role)
   values ('buxgalter@bux2112.app', 'admin')
   on conflict (email) do update set role = 'admin';

   -- 2-baza (ikkinchi) uchun:
   insert into public.foydalanuvchi_rollari (email, role)
   values ('bux_2112@baza.app', 'admin')
   on conflict (email) do update set role = 'admin';

 Boshqa xodimlar ro'yxatga kiritilmagan bo'lsa avtomatik "xodim" (o'chira
 olmaydi) hisoblanadi — ular uchun ham xohlasangiz shu jadvalga
 ('email', 'xodim') deb aniq qator qo'shishingiz shart emas, standart shunday.
 -------------------------------------------------------------------------- */
