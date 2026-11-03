import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  getProfile,
  getAlertsForCurrentUser,
  countAlertsForCurrentUser,
  countAlertsNeedingAi,
  updateAlertBuckets,
  deleteAlerts,
} from "@/lib/db";
import { getGrantsSeenByIds } from "@/lib/grants/feed";
import { hasAiConfigured } from "@/lib/ai/grant-scorer";
import { internalErrorResponse } from "@/lib/http/server-errors";
import { parseDiaryPagination } from "@/lib/dashboard/pagination";
import {
  runAlerts,
  rebucketPersisted,
  mergeAlertLists,
  type PersistedAlertRow,
  type RunAlertsResult,
} from "@/lib/dashboard/run-alerts";
import type { Profile } from "@/lib/domain/profile";

export const runtime = "nodejs";
/** El POST puede incluir varias llamadas a Gemini; evita el corte por defecto. */
export const maxDuration = 300;

/**
 * API Dashboard — diario de decisiones
 *
 *   POST /api/dashboard            → abre el panel: genera/actualiza lo de hoy
 *                                    (Gemini incluido) y devuelve la página 1.
 *   GET  /api/dashboard?page=1&…   → SOLO LECTURA: página del diario ya guardado.
 *                                    Sin IA, sin escrituras.
 *
 * Separar los dos verbos cumple la regla de que un GET no debe tener efectos
 * secundarios: antes bastaba con abrir la URL para puntuar con IA y escribir
 * buckets/borrados. Ahora eso ocurre únicamente en el POST que dispara la
 * apertura real del panel, y «Cargar más» usa GET.
 *
 * Respuestas (ambos verbos):
 *   - 200 { ok, data }        → página de alertas + estado IA + hasMore
 *   - 200 { ok, data:null, needsProfile:true } → falta el perfil
 *   - 401 { ok:false }        → sin sesión
 */

type BuildArgs = {
  request: NextRequest;
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  profile: Profile;
  /** Resultado de `runAlerts` en el POST; null en el GET. */
  fresh: RunAlertsResult | null;
  /** true en POST: persiste el re-bucketeo. En GET nunca se escribe. */
  persistRebucket: boolean;
};

async function buildDiaryPage({
  request,
  user,
  profile,
  fresh,
  persistRebucket,
}: BuildArgs) {
  const { page, limit, offset } = parseDiaryPagination(
    request.nextUrl.searchParams.get("page"),
    request.nextUrl.searchParams.get("limit")
  );

  // Una página de alertas persistidas (más reciente primero),
  // re-clasificadas con el matcher ACTUAL (sin tocar triaje ni score).
  const persistedRows = (await getAlertsForCurrentUser(
    limit,
    offset
  )) as PersistedAlertRow[];
  const total = await countAlertsForCurrentUser();

  const grantIds = persistedRows.map((row) => row.grant_id);
  const grants = await getGrantsSeenByIds(grantIds);
  const grantById = new Map(grants.map((g) => [g.numConvocatoria, g]));

  const rebucketed = rebucketPersisted(profile, persistedRows, grantById);

  // Solo el POST escribe: el GET calcula el re-bucketeo en memoria.
  if (persistRebucket) {
    await updateAlertBuckets(user.id, rebucketed.updates);
    await deleteAlerts(user.id, rebucketed.deletes);
  }

  // Estado IA real: lo fresco (POST) + lo persistido en fallback/pending.
  const aiPendingCount = await countAlertsNeedingAi();
  const aiConfigured = fresh?.aiConfigured ?? hasAiConfigured(profile);
  const aiStatus =
    fresh?.aiStatus ?? (aiPendingCount > 0 ? ("fallback" as const) : null);
  const aiMessage =
    fresh?.aiMessage ??
    (aiPendingCount > 0
      ? `Hay ${aiPendingCount} ayudas pendientes de puntuar con IA.`
      : null);
  const aiKind =
    fresh?.aiKind ??
    (aiPendingCount > 0
      ? aiConfigured
        ? ("transient" as const)
        : ("no-key" as const)
      : null);

  const alerts = fresh
    ? mergeAlertLists(fresh.alerts, rebucketed.alerts)
    : rebucketed.alerts;
  const hasMore = offset + persistedRows.length < total;

  return NextResponse.json({
    ok: true,
    data: {
      alerts,
      aiStatus,
      aiMessage,
      aiConfigured,
      aiKind,
      aiPendingCount,
      page,
      hasMore,
      total,
    },
  });
}

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
      return NextResponse.json({ ok: true, data: null, needsProfile: true });
    }

    return buildDiaryPage({
      request,
      user,
      profile,
      fresh: null,
      persistRebucket: false,
    });
  } catch (error) {
    return internalErrorResponse("dashboard_get_error", error);
  }
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ ok: true, data: null, needsProfile: true });
    }

    // Aquí sí: nuevas ayudas, matcher, Gemini y persistencia.
    const fresh = await runAlerts(profile);

    return buildDiaryPage({
      request,
      user,
      profile,
      fresh,
      persistRebucket: true,
    });
  } catch (error) {
    return internalErrorResponse("dashboard_post_error", error);
  }
}
