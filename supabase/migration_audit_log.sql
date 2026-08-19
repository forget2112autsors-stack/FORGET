-- BUX2112 — O'zgarishlar tarixi (audit log) migratsiyasi.
-- DIQQAT: bu fayl faqat YANGI jadval/trigger QO'SHADI, hech narsani DROP/TRUNCATE
-- qilmaydi — ikkala production loyihada (1-baza va 2-baza) ham xavfsiz ishga tushiriladi.
-- Supabase Dashboard -> loyihangiz -> SQL Editor'ga to'liq nusxalab, "Run" bosing.
-- (Ikkala loyihada ham alohida-alohida ishga tushirish kerak.)

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_email text,
  jadval text,
  amal text,          -- INSERT / UPDATE / DELETE
  row_id uuid,
  malumot jsonb        -- INSERT: yangi qator; DELETE: eski qator;
                        -- UPDATE: {"oldi": {...}, "yangi": {...}}
);

alter table public.audit_log enable row level security;

-- Faqat O'QISH uchun ruxsat — yozish faqat pastdagi trigger orqali (security
-- definer), foydalanuvchi to'g'ridan-to'g'ri qalbaki audit yozuvi kirita olmaydi.
create policy "authenticated_read" on public.audit_log for select to authenticated using (true);

create or replace function public.audit_log_trigger() returns trigger
language plpgsql security definer as $$
declare
  actor text := coalesce(auth.email(), 'noma''lum');
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, new.id, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, new.id, jsonb_build_object('oldi', to_jsonb(old), 'yangi', to_jsonb(new)));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, old.id, to_jsonb(old));
    return old;
  end if;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array['kirim','chiqim','bank','ish_haqi','ombor','mahsulotlar',
    'ishlab_chiqarish','fayllar','kontragentlar','asosiy_vositalar','settings'])
  loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()', t);
  end loop;
end $$;

/* --------------------------------------------------------------------------
   SQL shu yerda tugadi. Keyingi qadam — Supabase Dashboard'da har bir xodim
   uchun ALOHIDA login yaratish (endi umumiy parol o'rniga):
   Authentication -> Users -> "Add user" -> xodimning shaxsiy email va
   parolini kiriting. "Auto Confirm User" belgisini albatta yoqing.
   -------------------------------------------------------------------------- */
