import { NextResponse } from "next/server";
import {
  getAlertsNeedingAi,
  getProfile,
  updateAlertAiResults,
  type AlertAiUpdate,
} from "@/lib/db";
import { getGrantsSeenByIds } from "@/lib/grants/feed";
import { grantItemFromSeen } from "@/lib/dashboard/run-alerts";
import { internalErrorResponse } from "@/lib/http/server-errors";
import {
  hasAiConfigured,
  scoreGrantsForUser,
  type ScorableGrant,
} from "@/lib/ai/grant-scorer";
import type { MatchResult } from "@/lib/matching/matcher";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * POST /api/dashboard/ai-retry
 *
 * Re-puntúa con Gemini las alertas persistidas que quedaron en `fallback`
 * o `pending`. Es el botón «Reintentar» del dashboard: sin esto, la marca
 * de agua ya avanzó y no habría candidatas nuevas que puntuar.
 */

export const runtime = "nodejs";

const MAX_RETRY_ALERTS = 50;

export async function POST() {
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
      return NextResponse.json(
        { ok: false, error: "Falta completar el perfil", needsProfile: true },
        { status: 400 }
      );
    }

    if (!hasAiConfigured(profile)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Configura tu API key de Gemini para puntuar con IA",
          kind: "no-key",
        },
        { status: 400 }
      );
    }

    const rows = await getAlertsNeedingAi(MAX_RETRY_ALERTS);
    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          updated: 0,
          total: 0,
          pending: 0,
          aiStatus: "ok",
          aiMessage: null,
          aiKind: null,
        },
      });
    }

    const grants = await getGrantsSeenByIds(rows.map((row) => row.grant_id));
    const grantById = new Map(grants.map((grant) => [grant.numConvocatoria, grant]));

    const candidates: ScorableGrant[] = [];
    for (const row of rows) {
      if (row.bucket !== "matched" && row.bucket !== "maybe") continue;

      const grant = grantById.get(row.grant_id);
      if (!grant) continue;

      const match: MatchResult = {
        id: row.grant_id,
        status: row.bucket,
        reasons: row.match_reasons ?? [],
        rule: null,
      };

      candidates.push({ grant: grantItemFromSeen(grant), match });
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          updated: 0,
          total: 0,
          pending: 0,
          aiStatus: "ok",
          aiMessage: null,
          aiKind: null,
        },
      });
    }

    const score = await scoreGrantsForUser(profile, candidates);

    const alertIdByGrant = new Map(rows.map((row) => [row.grant_id, row.id]));
    const updates: AlertAiUpdate[] = [];

    for (const result of score.results) {
      const alertId = alertIdByGrant.get(result.grantId);
      if (!alertId) continue;

      updates.push({
        alertId,
        score: result.score,
        reason: result.reason,
        status: score.status === "ok" ? "ok" : "fallback",
      });
    }

    await updateAlertAiResults(user.id, updates);

    return NextResponse.json({
      ok: true,
      data: {
        updated: updates.length,
        total: candidates.length,
        pending: Math.max(0, candidates.length - score.results.length),
        aiStatus: score.status,
        aiMessage: score.status === "fallback" ? score.message : null,
        aiKind: score.status === "fallback" ? score.kind : null,
      },
    });
  } catch (error) {
    return internalErrorResponse("ai_retry_error", error);
  }
}
