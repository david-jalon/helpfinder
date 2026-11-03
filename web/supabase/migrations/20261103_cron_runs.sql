-- ============================================================
-- Fase 9 — Historial de ejecuciones del cron
-- ============================================================
-- Los logs de Vercel son efímeros. El cron guarda aquí un resumen por
-- ejecución para que /api/health pueda responder: ¿cuándo corrió?,
-- ¿cuánto tardó?, ¿quedó backlog?
--
-- Solo la escribe/lee el servidor con service role. RLS activada y sin
-- políticas: anon/authenticated no tienen acceso.

create table if not exists public.cron_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null,
  stop_reason text not null,
  pages_fetched integer not null default 0,
  new_grants integer not null default 0,
  enriched integer not null default 0,
  enriched_failed integer not null default 0,
  pending_backlog integer not null default 0,
  retry_skipped boolean not null default false
);

create index if not exists cron_runs_finished_at_idx
  on public.cron_runs (finished_at desc);

alter table public.cron_runs enable row level security;

revoke all on public.cron_runs from anon, authenticated;
