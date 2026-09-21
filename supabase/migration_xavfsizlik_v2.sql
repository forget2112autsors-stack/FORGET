-- FORGET (BUX2112) — xavfsizlik v2: firma ichidagi rol, o'chirish huquqi,
-- rollar jadvalining maxfiyligi va INN takrorlanishining oldini olish.
--
-- NIMA UCHUN: ilova endi begona xaridorlarga sotiladi. Ilgari o'chirish
-- (DELETE) huquqi faqat GLOBAL "admin"da edi, global admin esa barcha
-- firmalarni ko'radi va istalgan firmaga o'zini qo'sha oladi. Natijada:
--   * xaridor o'z firmasida xato kiritilgan fakturani ham o'chira olmasdi;
--   * uni admin qilib qo'ysangiz — BOSHQA xaridorlarning bazasini ko'rardi.
-- Shu sabab rol ikkiga bo'linadi:
--   * global "admin" (foydalanuvchi_rollari) — ilova EGASI (vendor) uchun;
--   * firma ichidagi "egasi" (firma_foydalanuvchilari.rol) — xaridor uchun,
--     faqat O'Z firmasi doirasida.
--
-- Bu fayl faqat YANGI ustun/funksiya/policy qo'shadi yoki almashtiradi,
-- hech qanday ma'lumotni DROP/TRUNCATE qilmaydi — qayta-qayta ishga
-- tushirilsa ham xato bermaydi (idempotent).
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run".
--
-- DIQQAT: 4-bo'limdagi unique indeksdan OLDIN takrorlangan INN bor-yo'qligini
-- tekshiring, aks holda shu qator xato beradi:
--   select inn, count(*) from public.settings
--   where inn is not null and inn <> '' group by inn having count(*) > 1;

/* ==================== 1) Firma ichidagi rol ==================== */

alter table public.firma_foydalanuvchilari
  add column if not exists rol text not null default 'buxgalter';

do $$ begin
  alter table public.firma_foydalanuvchilari
    add constraint firma_foydalanuvchilari_rol_chk
    check (rol in ('egasi', 'buxgalter', 'kuzatuvchi'));
exception when duplicate_object then null; end $$;

-- Mavjud firmalarda egasi belgilanmagan bo'lsa — eng avval qo'shilgan
-- foydalanuvchini egasi deb belgilaymiz (odatda firmani yaratgan odam).
update public.firma_foydalanuvchilari f
set rol = 'egasi'
where not exists (
        select 1 from public.firma_foydalanuvchilari x
        where x.firma_id = f.firma_id and x.rol = 'egasi')
  and f.created_at = (
        select min(y.created_at) from public.firma_foydalanuvchilari y
        where y.firma_id = f.firma_id);

-- "security definer" — is_admin()/has_firma_access() bilan bir xil naqsh:
-- RLS policy ichidan chaqirilganda ham jadvalga to'g'ridan-to'g'ri kira
-- oladi va cheksiz rekursiyaga tushmaydi.
create or replace function public.is_firma_admin(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.firma_foydalanuvchilari
    where firma_id = fid and email = auth.email() and rol = 'egasi'
  ) or public.is_admin();
$$;

/* ============ 2) O'chirish endi firma egasiga ham ochiq ============ */
-- Eski "firma_delete_admin" policy'si global is_admin() talab qilardi.

do $$
declare t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar','chiqim_tafsil','settings'])
  loop
    execute format('drop policy if exists "firma_delete_admin" on public.%I', t);
    execute format('create policy "firma_delete_admin" on public.%I for delete to authenticated
                    using (public.is_firma_admin(firma_id))', t);
  end loop;
end $$;

/* ======= 3) Rollar jadvali endi barcha emaillarni ko'rsatmaydi ======= */
-- Ilgari "using (true)" edi: har qanday xaridor tizimdagi BARCHA
-- foydalanuvchilarning emailini va kim admin ekanini o'qiy olardi.

drop policy if exists "authenticated_read" on public.foydalanuvchi_rollari;
drop policy if exists "own_or_admin_read" on public.foydalanuvchi_rollari;
create policy "own_or_admin_read" on public.foydalanuvchi_rollari for select to authenticated
  using (email = auth.email() or public.is_admin());

/* ==================== 4) Bir INN — bitta firma ==================== */
-- Ilgari bir xil INN bilan bir nechta firma ochish mumkin edi; bu
-- "bloklangan INN" mexanizmini ham zaiflashtirardi.

create unique index if not exists settings_inn_uniq
  on public.settings (inn) where inn is not null and inn <> '';

/* ====== 5) O'z-o'zidan ro'yxatdan o'tgan foydalanuvchi — egasi ====== */
-- Funksiya tanasi migration_self_signup.sql'dagi bilan bir xil, faqat
-- oxirgi insertga rol qo'shildi va bloklangan INN xabari saqlandi.

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

  -- YANGI: shu INN allaqachon ishlatilgan bo'lsa, ikkinchi firma ochilmaydi
  -- (4-bo'limdagi unique indeks bilan bir xil qoida, lekin tushunarli xabar
  -- bilan).
  if exists (select 1 from public.settings s where s.inn = v_inn) then
    raise exception 'Bu INN (%) bilan firma allaqachon ro''yxatdan o''tgan', v_inn;
  end if;

  if exists (select 1 from public.firma_foydalanuvchilari f where f.email = v_email) then
    raise exception 'Sizning hisobingizga allaqachon firma biriktirilgan';
  end if;

  insert into public.firmalar (nomi) values (v_nomi) returning id into v_firma_id;
  insert into public.settings (firma_id, inn, company_name) values (v_firma_id, v_inn, v_nomi);
  insert into public.firma_foydalanuvchilari (firma_id, email, rol) values (v_firma_id, v_email, 'egasi');

  return v_firma_id;
end;
$$;

grant execute on function public.signup_create_own_firma(text, text) to authenticated;

/* ---------------------------------------------------------------------
   SQL shu yerda tugadi. Keyingi qadamlar:

   1) Vercel -> Settings -> Environment Variables'ga EIMZO_CHALLENGE_SECRET
      qo'shing (masalan "openssl rand -hex 32" natijasi) — E-IMZO orqali
      kirish shusiz ishlamaydi (qarang: api/eimzo-challenge.js).

   2) Mavjud firmalarda egasi to'g'ri belgilanganini tekshiring:

        select f.nomi, u.email, u.rol
        from public.firma_foydalanuvchilari u
        join public.firmalar f on f.id = u.firma_id
        order by f.nomi, u.rol;

      Kerak bo'lsa qo'lda to'g'rilang:

        update public.firma_foydalanuvchilari
        set rol = 'egasi'
        where firma_id = '<firma-id>' and email = 'mijoz@masalan.uz';

   3) O'zingiz (vendor) global admin bo'lib qolganingizni tekshiring:

        select * from public.foydalanuvchi_rollari where role = 'admin';
   --------------------------------------------------------------------- */
