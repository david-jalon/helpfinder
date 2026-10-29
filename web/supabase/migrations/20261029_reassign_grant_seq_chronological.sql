-- ============================================================
-- Fase 2 (corrección) — Reasignar seq en orden cronológico
-- ============================================================
-- Descubrimiento: al añadir `seq` como identity a una tabla con datos,
-- PostgreSQL asigna los valores en orden físico, no cronológico. Resultado:
-- 334 inversiones de fecha al ordenar por seq y cursores iniciales erróneos.
--
-- Esta migración:
--   1. Guarda una copia de la relación actual en el esquema `backup`.
--   2. Reasigna seq = 1..N en orden (first_seen_at, num_convocatoria).
--   3. Recrea la identidad y el índice único.
--   4. Recalcula last_seen_seq de los perfiles.
--
-- Ejecutar una sola vez, después de `20261029_add_grant_seq.sql`.

create schema if not exists backup;

create table if not exists backup.grants_seen_seq_20261029 as
select num_convocatoria, seq from public.grants_seen;

create table if not exists backup.profiles_last_seen_seq_20261029 as
select user_id, last_seen_at, last_seen_seq from public.profiles;

drop index if exists public.idx_grants_seen_seq;
alter table public.grants_seen alter column seq drop identity if exists;

with ordered as (
  select num_convocatoria,
         row_number() over (
           order by first_seen_at asc nulls last, num_convocatoria asc
         ) as new_seq
  from public.grants_seen
)
update public.grants_seen g
set seq = o.new_seq
from ordered o
where g.num_convocatoria = o.num_convocatoria;

alter table public.grants_seen alter column seq set not null;
alter table public.grants_seen alter column seq add generated always as identity;
create unique index if not exists idx_grants_seen_seq
  on public.grants_seen (seq);

do $$
declare max_seq bigint;
begin
  select coalesce(max(seq), 0) into max_seq from public.grants_seen;
  execute format(
    'alter table public.grants_seen alter column seq restart with %s',
    max_seq + 1
  );
end $$;

update public.profiles p
set last_seen_seq = coalesce(
  (
    select max(g.seq)
    from public.grants_seen g
    where g.first_seen_at < p.last_seen_at
  ),
  0
)
where p.last_seen_at is not null;

-- Comprobaciones:
-- select count(*) from (
--   select seq, first_seen_at,
--          lag(first_seen_at) over (order by seq) as prev
--   from public.grants_seen
-- ) t where prev is not null and first_seen_at < prev;  -- debe dar 0
--
-- select to_char(first_seen_at, 'YYYY-MM') as mes,
--        min(seq), max(seq), count(*)
-- from public.grants_seen group by 1 order by 1;
