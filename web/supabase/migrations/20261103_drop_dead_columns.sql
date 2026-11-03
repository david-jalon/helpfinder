-- ============================================================
-- Fase 10 — Limpieza: columnas muertas de grants_seen
-- ============================================================
-- `detail_json` era una caché de detalle que nunca llegó a usarse (0 filas
-- con dato). `seen` solo existía en schema.sql y no en la base real.
-- Se eliminan para que esquema y código cuenten la misma historia.

alter table public.grants_seen drop column if exists detail_json;
alter table public.grants_seen drop column if exists seen;
