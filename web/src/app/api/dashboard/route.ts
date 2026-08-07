import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, getAlertsForCurrentUser, updateAlertBuckets } from "@/lib/db";
import { getGrantsSeenByIds } from "@/lib/grants/feed";
import {
  runAlerts,
  rebucketPersisted,
  mergeAlertLists,
  type PersistedAlertRow,
} from "@/lib/dashboard/run-alerts";

/**
 * API Dashboard — diario de decisiones
 *
 * GET /api/dashboard  → el diario completo de alertas del usuario.
 *
 * Carga perezosa (lazy): la IA corre AQUÍ, cuando el usuario abre su
 * panel (nunca en el cron). Una sola llamada batch con su key.
 *
 * La respuesta es el DIARIO, no solo lo de hoy:
 *   1. `runAlerts` genera y puntúa las ayudas NUEVAS desde la última visita.
 *   2. Se leen todas las alertas persistidas en `user_alerts`.
 *   3. Se fusionan: lo fresco arriba; el resto conserva su triaje
 *      (`decision`), de modo que recargar la página no pierde nada.
 *
 * Respuestas:
 *   - 200 { ok, data }        → alertas + estado IA
 *   - 200 { ok, data:null, needsProfile:true } → falta el perfil
 *   - 401 { ok:false }        → sin sesión
 */

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      return NextResponse.json({
        ok: true,
        data: null,
        needsProfile: true,
      });
    }

    // 1) Lo fresco de hoy (nuevas + puntuación IA o fallback)
    const fresh = await runAlerts(profile);

    // 2) Todas las alertas persistidas del usuario (más reciente primero),
    //    re-clasificadas con el matcher ACTUAL para propagar cambios de
    //    lógica o de perfil a lo ya guardado (sin tocar triaje ni score).
    const persistedRows = (await getAlertsForCurrentUser()) as PersistedAlertRow[];
    const grantIds = persistedRows.map((row) => row.grant_id);
    const grants = await getGrantsSeenByIds(grantIds);
    const grantById = new Map(grants.map((g) => [g.numConvocatoria, g]));

    const rebucketed = rebucketPersisted(profile, persistedRows, grantById);
    await updateAlertBuckets(user.id, rebucketed.updates);

    // 3) Fusión del diario
    const alerts = mergeAlertLists(fresh.alerts, rebucketed.alerts);

    return NextResponse.json({
      ok: true,
      data: {
        alerts,
        aiStatus: fresh.aiStatus,
        aiMessage: fresh.aiMessage,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
