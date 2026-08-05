import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { setAlertDecision } from "@/lib/db";
import { isAlertDecision } from "@/lib/dashboard/run-alerts";

/**
 * API Alerts — Fase 11 · Diario de decisiones — Fase 12
 *
 * PUT /api/alerts/[id]  → guarda el triaje de la alerta.
 * Cuerpo: { decision: "seguir" | "posible" | "denegada" | null }
 *   - "seguir" / "posible" / "denegada" → guardan la decisión.
 *   - null → deshace el triaje y vuelve a Pendientes.
 * La seguridad multi-tenant la da el RLS: solo se puede actualizar
 * una alerta cuyo user_id coincide con el usuario de la sesión.
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await params;
    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Falta el id de la alerta" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Cuerpo inválido" },
        { status: 400 }
      );
    }

    const { decision } = (body ?? {}) as { decision?: unknown };
    if (!isAlertDecision(decision)) {
      return NextResponse.json(
        { ok: false, error: "Decisión inválida" },
        { status: 400 }
      );
    }

    await setAlertDecision(id, decision);

    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
