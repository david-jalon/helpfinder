import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  getProfile,
  getAlertsForCurrentUser,
  countAlertsForCurrentUser,
  updateAlertBuckets,
  deleteAlerts,
} from "@/lib/db";
import { getGrantsSeenByIds } from "@/lib/grants/feed";
import { parseDiaryPagination } from "@/lib/dashboard/pagination";
import {
  runAlerts,
  rebucketPersisted,
  mergeAlertLists,
  type PersistedAlertRow,
} from "@/lib/dashboard/run-alerts";

/**
 * API Dashboard — diario de decisiones
 *
 * GET /api/dashboard?page=1&limit=50  → una PÁGINA del diario del usuario.
 *
 * Carga perezosa (lazy): la IA corre AQUÍ, cuando el usuario abre su
 * panel (nunca en el cron). Una sola llamada batch con su key. En las
 * páginas siguientes `runAlerts` ya no tiene nada nuevo que puntuar.
 *
 * El diario se PAGINA: leerlo entero acabaría truncándose (PostgREST
 * devuelve ~1000 filas como máximo). La respuesta trae `hasMore` para que
 * el UI pueda ofrecer «Cargar más».
 *
 * Respuestas:
 *   - 200 { ok, data }        → página de alertas + estado IA + hasMore
 *   - 200 { ok, data:null, needsProfile:true } → falta el perfil
 *   - 401 { ok:false }        → sin sesión
 */

export async function GET(request: NextRequest) {
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

    const { page, limit, offset } = parseDiaryPagination(
      request.nextUrl.searchParams.get("page"),
      request.nextUrl.searchParams.get("limit")
    );

    // 1) Lo fresco (nuevas + puntuación IA o fallback). Tras la primera
    //    carga el agua ya avanzó, así que en páginas siguientes va vacío.
    const fresh = await runAlerts(profile);

    // 2) Una página de alertas persistidas (más reciente primero),
    //    re-clasificadas con el matcher ACTUAL (sin tocar triaje ni score).
    const persistedRows = (await getAlertsForCurrentUser(
      limit,
      offset
    )) as PersistedAlertRow[];
    const total = await countAlertsForCurrentUser();

    const grantIds = persistedRows.map((row) => row.grant_id);
    const grants = await getGrantsSeenByIds(grantIds);
    const grantById = new Map(grants.map((g) => [g.numConvocatoria, g]));

    const rebucketed = rebucketPersisted(profile, persistedRows, grantById);
    await updateAlertBuckets(user.id, rebucketed.updates);

    // 2b) Las reclasificadas como excluded ya no aplican a este perfil.
    await deleteAlerts(user.id, rebucketed.deletes);

    // 3) Fusión del diario (lo fresco primero; el resto de la página)
    const alerts = mergeAlertLists(fresh.alerts, rebucketed.alerts);
    const hasMore = offset + persistedRows.length < total;

    return NextResponse.json({
      ok: true,
      data: {
        alerts,
        aiStatus: fresh.aiStatus,
        aiMessage: fresh.aiMessage,
        page,
        hasMore,
        total,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
