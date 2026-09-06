-- FORGET (BUX2112) — o'z-o'zidan ro'yxatdan o'tish (self-signup) + INN bo'yicha
-- bloklash mexanizmi.
--
-- Nima uchun: ilova endi begona xaridorlarga sotiladi. Xaridor login sahifasidan
-- o'zi (email + parol + kompaniya nomi + INN) ro'yxatdan o'tib, darhol o'ziga
-- tegishli BO'SH firma bilan ishlashni boshlaydi — administratorning har bir
-- yangi xaridor uchun qo'lda Auth foydalanuvchi yaratishi shart emas.
--
-- Bloklash: agar xaridor to'lovni to'xtatsa, administrator uning firmasini
-- "bloklaydi" — bu (a) o'sha firmaning barcha xodimlari kirish huquqini bekor
-- qiladi va (b) o'sha kompaniyaning INN'ini "bloklangan_innlar" ro'yxatiga
-- qo'shadi. Shu INN bilan endi QAYSI EMAILDAN bo'lmasin, qayta ro'yxatdan
-- o'tib bo'lmaydi (signup_create_own_firma buni tekshiradi).
-- DIQQAT: bu Supabase Auth foydalanuvchisining o'zini o'chirmaydi (buning uchun
-- service-role kalit kerak, u mijoz kodida yo'q) va xaridorning eski
-- buxgalteriya ma'lumotlarini (kirim/chiqim/bank va h.k.) o'chirmaydi — ular
-- bazada qoladi, shunchaki RLS orqali kira olmay qoladi. Bu KUTILGAN xatti-harakat.
--
-- Bu fayl faqat YANGI jadval/funksiya QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — qayta-qayta ishga tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.

/* ==================== 1) Bloklangan INN'lar ro'yxati ==================== */

create table if not exists public.bloklangan_innlar (
  inn text primary key,
  sabab text,
  created_at timestamptz not null default now()
);

alter table public.bloklangan_innlar enable row level security;
drop policy if exists "admin_all" on public.bloklangan_innlar;
create policy "admin_all" on public.bloklangan_innlar for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/* ================ 2) O'z-o'zidan ro'yxatdan o'tib firma yaratish ================ */
-- security definer: yangi ro'yxatdan o'tgan foydalanuvchi hali "firmalar",
-- "settings", "firma_foydalanuvchilari" jadvallariga to'g'ridan-to'g'ri yozish
-- huquqiga ega emas (bu jadvallar admin-only RLS bilan himoyalangan) — shu
-- funksiya orqali, nazorat ostidagi bitta yo'l bilan, o'ziga BO'SH firma
-- yaratadi. is_admin()/has_firma_access() bilan bir xil naqsh (security definer
-- orqali RLS'ni chetlab o'tib to'g'ridan-to'g'ri jadvalga yozish).
create or replace function public.signup_create_own_firma(p_nomi text, p_inn text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := auth.email();
  v_nomi text := trim(coalesce(p_nomi, ''));
  v_inn text := trim(coalesce(p_inn, ''));
  v_firma_id uuid;
begin
  if v_email is null or v_email = '' then
    raise exception 'Faqat tizimga kirgan foydalanuvchi firma yarata oladi';
  end if;

  if v_nomi = '' then
    raise exception 'Kompaniya nomini kiriting';
  end if;

  if v_inn !~ '^[0-9]{9}$' then
    raise exception 'INN 9 ta raqamdan iborat bo''lishi kerak';
  end if;

  if exists (select 1 from public.bloklangan_innlar b where b.inn = v_inn) then
    raise exception 'Bu INN (%) bloklangan — ro''yxatdan o''tish rad etildi. Savol bo''yicha administratorga murojaat qiling.', v_inn;
  end if;

  if exists (select 1 from public.firma_foydalanuvchilari f where f.email = v_email) then
    raise exception 'Sizning hisobingizga allaqachon firma biriktirilgan';
  end if;

  insert into public.firmalar (nomi) values (v_nomi) returning id into v_firma_id;
  insert into public.settings (firma_id, inn, company_name) values (v_firma_id, v_inn, v_nomi);
  insert into public.firma_foydalanuvchilari (firma_id, email) values (v_firma_id, v_email);

  return v_firma_id;
end;
$$;

grant execute on function public.signup_create_own_firma(text, text) to authenticated;

/* --------------------------------------------------------------------------
   SQL shu yerda tugadi. Keyingi qadam — Supabase Dashboard -> Authentication
   -> Providers -> Email -> "Confirm email" sozlamasini tekshiring. O'CHIRISH
   tavsiya etiladi: bu ommaviy iste'molchi mahsuloti emas, xaridor ro'yxatdan
   o'tishi bilanoq darhol ishni boshlashi qulayroq. Kodning ikkala holatda ham
   (yoqilgan/o'chirilgan) to'g'ri ishlashi ta'minlangan — firma yaratish har
   doim "birinchi muvaffaqiyatli kirish"da amalga oshadi (qarang app.js
   bootAfterAuth), bu email tasdiqlashdan oldin yoki keyin bo'lishidan qat'i
   nazar farq qilmaydi.
   -------------------------------------------------------------------------- */
