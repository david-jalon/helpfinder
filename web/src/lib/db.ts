import type { Profile } from "@/lib/domain/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Capa de acceso a datos (Fase 7).
 *
 * Todas las funciones usan el cliente Supabase del SERVIDOR, que ya
 * inyecta la sesión del usuario. Las tablas tienen RLS activado, así
 * que cada consulta solo ve las filas cuyo user_id coincide con el
 * usuario autenticado: la separación multi-tenant la hace la base.
 *
 * En api-ayudas esto era un Pool de `pg` + auto-creación de tablas.
 * Aquí no hace falta crear tablas en cada arranque: se crean una vez
 * en el SQL editor (ver `supabase/schema.sql`).
 */

// ── mapeos fila (snake_case en BD) → dominio (camelCase) ──

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    userId: String(row.user_id),
    profileType: String(row.profile_type) as Profile["profileType"],
    colectivos: Array.isArray(row.colectivos)
      ? (row.colectivos as Profile["colectivos"])
      : [],
    regiones: Array.isArray(row.regiones)
      ? (row.regiones as Profile["regiones"])
      : [],
    keywords: String(row.keywords ?? ""),
    contextText: String(row.context_text ?? ""),
    geminiApiKey: String(row.gemini_api_key ?? ""),
    notificationEmail: String(row.notification_email ?? ""),
    emailDigestEnabled: Boolean(row.email_digest_enabled),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

// ── profiles ──

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToProfile(data) : null;
}

/**
 * Crea o actualiza el perfil de un usuario. El RLS solo permite tocar
 * la fila del propio usuario (auth.uid()).
 */
export async function upsertProfile(userId: string, input: Partial<Profile>) {
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert({
    user_id: userId,
    ...(input.profileType !== undefined && { profile_type: input.profileType }),
    ...(input.colectivos !== undefined && { colectivos: input.colectivos }),
    ...(input.regiones !== undefined && { regiones: input.regiones }),
    ...(input.keywords !== undefined && { keywords: input.keywords }),
    ...(input.contextText !== undefined && { context_text: input.contextText }),
    ...(input.geminiApiKey !== undefined && { gemini_api_key: input.geminiApiKey }),
    ...(input.notificationEmail !== undefined && {
      notification_email: input.notificationEmail,
    }),
    ...(input.emailDigestEnabled !== undefined && {
      email_digest_enabled: input.emailDigestEnabled,
    }),
    ...(input.lastSeenAt !== undefined && { last_seen_at: input.lastSeenAt }),
  });

  if (error) throw error;
}

// ── grants_seen (caché pública compartida) ──

export async function getGrantSeen(numConvocatoria: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grants_seen")
    .select("*")
    .eq("num_convocatoria", numConvocatoria)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ── user_alerts (multi-tenant por user_id) ──

/**
 * Devuelve las alertas del usuario actual, ordenadas por creación.
 * El RLS filtra por auth.uid(), así que no hace falta pasar el userId.
 */
export async function getAlertsForCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_alerts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
