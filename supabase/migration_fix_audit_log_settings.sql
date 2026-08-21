-- BUX2112 — audit_log tuzatishi: "settings" jadvalini saqlashda xatolik.
-- SABAB: audit_log.row_id "uuid" turida edi, lekin "settings" jadvalining
-- id'si (=1) integer, uuid emas. Shu sabab settings'ga har qanday
-- o'zgarish (Sozlamalar sahifasidagi "Saqlash") audit trigger ichida
-- turdagi xatolik bilan yiqilib, butun UPDATE bekor bo'lardi
-- ("Sozlamani saqlashda xatolik" xabari shundan chiqqan).
-- BU FAYL FAQAT TUZATISH — hech narsani DROP/TRUNCATE qilmaydi, mavjud
-- audit_log yozuvlari saqlanib qoladi. Ikkala production loyihada
-- (1-baza va 2-baza) ham Supabase Dashboard -> SQL Editor'ga nusxalab,
-- "Run" bosing.

alter table public.audit_log alter column row_id type text using row_id::text;

create or replace function public.audit_log_trigger() returns trigger
language plpgsql security definer as $$
declare
  actor text := coalesce(auth.email(), 'noma''lum');
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, new.id::text, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, new.id::text, jsonb_build_object('oldi', to_jsonb(old), 'yangi', to_jsonb(new)));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.audit_log(actor_email, jadval, amal, row_id, malumot)
    values (actor, tg_table_name, tg_op, old.id::text, to_jsonb(old));
    return old;
  end if;
end;
$$;
