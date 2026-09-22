import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con SERVICE ROLE (solo servidor).
 *
 * Salta las políticas RLS, así que se usa SOLO para escribir datos que NO
 * pertenecen a ningún usuario: la caché pública `grants_seen` (la escribe el
 * cron y «Seguir»). Nunca para datos multi-tenant (esos van siempre con el
 * cliente de la sesión, `@/lib/supabase/server`).
 *
 * La key vive en `SUPABASE_SERVICE_ROLE_KEY`, una variable SOLO-SERVIDOR:
 * nunca lleva el prefijo `NEXT_PUBLIC_` ni viaja al navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) en el entorno"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
