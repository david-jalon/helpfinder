-- ============================================================
-- Helpfinder — Esquema de base de datos (Fase 7)
-- Se ejecuta UNA sola vez en Supabase → SQL Editor
-- ============================================================
--
-- Multi-tenant: cada usuario ve solo sus filas.
-- auth.users ya existe (lo crea Supabase Auth en la Fase 6).
-- Nuestras tablas se enlazan a él mediante user_id.

-- ────────────────────────────────────────────────────────────
-- 1) profiles — perfil de cada usuario
--    Una fila por usuario. La PK es el propio user_id: así es
--    imposible tener dos perfiles del mismo usuario.
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile_type text,                 -- persona | autonomo | sociedad | ...
  colectivos text[],                 -- SOLO persona (jóvenes, estudiantes...)
  regiones text[],                   -- comunidades autónomas
  keywords text,                     -- palabras clave en lenguaje natural
  context_text text,                 -- descripción libre
  gemini_api_key text,               -- key del propio usuario (nunca se comparte)
  notification_email text,           -- futuro email diario
  email_digest_enabled boolean default false,
  last_seen_at timestamptz,          -- base de las alertas "nuevas desde tu visita"
  created_at timestamptz default now()
);

-- RLS: la tabla está cerrada por defecto.
alter table public.profiles enable row level security;

-- Políticas: solo el dueño puede ver y modificar SU fila.
create policy "perfil: lectura del dueño"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "perfil: inserción del dueño"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "perfil: actualización del dueño"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 2) grants_seen — ayudas BDNS ya detectadas (dato público)
--    Esta tabla NO es multi-tenant: es una caché compartida.
--    Cualquier usuario puede LEERLA (dato público BDNS). Solo
--    el cron (Fase 9) la escribe, con la key del servidor.
-- ────────────────────────────────────────────────────────────
create table if not exists public.grants_seen (
  num_convocatoria text primary key, -- el ID que manda BDNS
  title text,
  organization text,
  source_url text,
  publication_date text,             -- fecha de publicación (DD/MM/YYYY) para inferir plazos referenciales
  first_seen_at timestamptz default now(),
  eligibility_json jsonb,            -- elegibilidad BDNS (gratis, sin IA)
  detail_json jsonb,                 -- detalle enriquecido (cache)
  enriched_at timestamptz
);

alter table public.grants_seen enable row level security;

-- Lectura pública (autenticados y anónimos): los datos BDNS son públicos.
create policy "grants_seen: lectura pública"
  on public.grants_seen for select
  using (true);

-- Escritura: dato público BDNS, la escribe el cron (Fase 9). Sin estas
-- políticas, el cron (cliente anónimo del servidor) no podría escribir
-- porque RLS bloquea todo lo que no tiene política. Añadidas en Fase 11
-- al destaparse el bug en las pruebas del dashboard.
create policy "grants_seen: inserción pública (dato público)"
  on public.grants_seen for insert
  with check (true);

create policy "grants_seen: actualización pública (dato público)"
  on public.grants_seen for update
  using (true);

-- ────────────────────────────────────────────────────────────
-- 3) user_alerts — alertas de cada usuario sobre una ayuda
--    Multi-tenant por user_id + una alerta por (usuario, ayuda).
-- ────────────────────────────────────────────────────────────
create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  grant_id text not null references public.grants_seen (num_convocatoria),
  score numeric,                     -- puntuación IA (0-100 aprox.)
  ai_reason text,                    -- motivo que da Gemini
  match_reasons text[],              -- reglas del matcher que pasó
  ai_status text default 'pending',  -- 'ok' | 'fallback' | 'pending'
  bucket text default 'excluded',    -- 'matched' | 'maybe' | 'excluded' (Fase 12)
  decision text,                     -- triaje: 'seguir' | 'posible' | 'denegada' | NULL = pendiente (Fase 12)
  seen boolean default false,        -- (legacy Fase 11) sin uso en el UI actual
  created_at timestamptz default now(),
  unique (user_id, grant_id),        -- una alerta por usuario y ayuda
  constraint user_alerts_bucket_check check (bucket in ('matched', 'maybe', 'excluded')),
  constraint user_alerts_decision_check check (decision is null or decision in ('seguir', 'posible', 'denegada'))
);

alter table public.user_alerts enable row level security;

create policy "alertas: lectura del dueño"
  on public.user_alerts for select
  using (auth.uid() = user_id);

create policy "alertas: inserción del dueño"
  on public.user_alerts for insert
  with check (auth.uid() = user_id);

create policy "alertas: actualización del dueño"
  on public.user_alerts for update
  using (auth.uid() = user_id);

create policy "alertas: borrado del dueño"
  on public.user_alerts for delete
  using (auth.uid() = user_id);
