import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { assessHealth, getHealthSnapshot } from "@/lib/observability/health";
import { internalErrorResponse } from "@/lib/http/server-errors";

export const runtime = "nodejs";
/** Siempre datos frescos: es un panel de estado, no una página cacheable. */
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Protegido con `Authorization: Bearer <CRON_SECRET>` (nadie más debe ver
 * contadores internos). Devuelve:
 *  - backlog de enriquecimiento (total y con más de 24 h),
 *  - alertas por estado de IA,
 *  - últimas ejecuciones del cron (duración, páginas, pendientes),
 *  - contadores del proceso (429 de BDNS, fallbacks de IA).
 *
 * `status: "degraded"` cuando queda backlog viejo o el cron lleva >36 h sin
 * ejecutarse.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  try {
    const snapshot = await getHealthSnapshot();
    const assessment = assessHealth(snapshot);

    return NextResponse.json(
      { ok: true, ...assessment, data: snapshot },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return internalErrorResponse("health_error", error);
  }
}
