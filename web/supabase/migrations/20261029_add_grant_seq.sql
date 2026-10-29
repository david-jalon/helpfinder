-- ============================================================
-- Fase 2 — Cursor secuencial para la marca de agua
-- ============================================================
-- Problema: todas las ayudas de un mismo cron comparten first_seen_at.
-- Con una marca por fecha, las que quedan por encima del límite se pierden.
-- Solución: un `seq` único y creciente, y un cursor `last_seen_seq`.
--
-- Migración aditiva: no borra ni modifica datos existentes.
-- Ejecutar una sola vez en Supabase → SQL Editor.

alter table public.grants_seen
  add column if not exists seq bigint generated always as identity;

create unique index if not exists idx_grants_seen_seq
  on public.grants_seen (seq);

alter table public.profiles
  add column if not exists last_seen_seq bigint;

-- Backfill de los perfiles existentes:
--   - Se toma el último seq ANTERIOR a su last_seen_at.
--   - Así se vuelven a procesar las ayudas que comparten exactamente el
--     timestamp de la marca antigua (las que el bug podía haber perdido).
--   - Los perfiles con last_seen_at null quedan con last_seen_seq null:
--     su primera visita sigue sin backfill.
update public.profiles p
set last_seen_seq = coalesce(
  (
    select max(g.seq)
    from public.grants_seen g
    where g.first_seen_at < p.last_seen_at
  ),
  0
)
where p.last_seen_seq is null
  and p.last_seen_at is not null;

-- Comprobación rápida (opcional):
-- select count(*) as sin_seq from public.grants_seen where seq is null;
-- select user_id, last_seen_at, last_seen_seq from public.profiles;
