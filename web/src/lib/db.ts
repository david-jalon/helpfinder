import type { Profile } from "@/lib/domain/profile";
import type { FollowGrantInput } from "@/lib/dashboard/follow";
import type { AlertBucket } from "@/lib/dashboard/triage";
import { createClient } from "@/lib/supabase/server";

/**
 * Capa de acceso a datos (Supabase).
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

export type AlertUpsertInput = {
  grantId: string;
  score: number | null;
  aiReason: string | null;
  matchReasons: string[];
  aiStatus: "ok" | "fallback" | "pending";
  bucket: "matched" | "maybe" | "excluded";
};

/**
 * Inserta (o actualiza) las alertas del día en lote.
 * `UNIQUE(user_id, grant_id)` hace el upsert idempotente: si el usuario
 * abre el dashboard dos veces el mismo día, no se duplican alertas.
 * Devuelve las filas finales para conocer sus `id`.
 * Nota: el upsert NO toca la columna `decision`, así que el triaje del
 * usuario se conserva aunque la ayuda vuelva a puntuarse.
 */
export async function upsertAlerts(
  userId: string,
  alerts: AlertUpsertInput[]
): Promise<{ id: string; grant_id: string }[]> {
  if (alerts.length === 0) return [];

  const supabase = await createClient();

  const rows = alerts.map((a) => ({
    user_id: userId,
    grant_id: a.grantId,
    score: a.score,
    ai_reason: a.aiReason,
    match_reasons: a.matchReasons,
    ai_status: a.aiStatus,
    bucket: a.bucket,
  }));

  const { data, error } = await supabase
    .from("user_alerts")
    .upsert(rows, { onConflict: "user_id,grant_id" })
    .select("id, grant_id");

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    grant_id: String(row.grant_id),
  }));
}

/**
 * Re-clasifica alertas persistidas (re-bucketeo) sin tocar triaje ni score.
 * `UNIQUE(user_id, grant_id)` hace el upsert idempotente; solo actualiza
 * `bucket` y `match_reasons`, dejando intactas `decision`, `score`,
 * `ai_reason` y `ai_status`.
 */
export async function updateAlertBuckets(
  userId: string,
  updates: { grantId: string; bucket: AlertBucket; matchReasons: string[] }[]
): Promise<void> {
  if (updates.length === 0) return;

  const supabase = await createClient();

  const rows = updates.map((u) => ({
    user_id: userId,
    grant_id: u.grantId,
    bucket: u.bucket,
    match_reasons: u.matchReasons,
  }));

  const { error } = await supabase
    .from("user_alerts")
    .upsert(rows, { onConflict: "user_id,grant_id" });

  if (error) throw error;
}

/**
 * Guarda la decisión de triaje de una alerta.
 * `decision` puede ser 'seguir' | 'posible' | 'denegada' | null (= deshacer,
 * vuelve a Pendientes). El RLS solo permite tocar filas cuyo user_id
 * coincide con el usuario de la sesión.
 */
export async function setAlertDecision(
  alertId: string,
  decision: "seguir" | "posible" | "denegada" | null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_alerts")
    .update({ decision })
    .eq("id", alertId);

  if (error) throw error;
}

/**
 * «Seguir» una convocatoria desde la landing (Fase 14).
 *
 * Dos escrituras en orden, porque `user_alerts.grant_id` tiene clave
 * foránea hacia `grants_seen(num_convocatoria)`:
 *  1. Guardar la convocatoria en `grants_seen` (dato público BDNS; puede
 *     que el cron aún no la haya detectado).
 *  2. Guardar la alerta del usuario con `decision='seguir'`. El upsert
 *     por (user_id, grant_id) es idempotente: si ya existía como
 *     pendiente o denegada, pasa a En seguimiento (no se duplica).
 */
export async function followGrantForUser(
  userId: string,
  grant: FollowGrantInput
): Promise<void> {
  const supabase = await createClient();

  const { error: grantError } = await supabase
    .from("grants_seen")
    .upsert(
      {
        num_convocatoria: grant.id,
        title: grant.title,
        organization: grant.organization,
        source_url: grant.sourceUrl,
      },
      { onConflict: "num_convocatoria" }
    );

  if (grantError) throw grantError;

  const { error: alertError } = await supabase
    .from("user_alerts")
    .upsert(
      {
        user_id: userId,
        grant_id: grant.id,
        bucket: "matched",
        ai_status: "pending",
        decision: "seguir",
      },
      { onConflict: "user_id,grant_id" }
    );

  if (alertError) throw alertError;
}
