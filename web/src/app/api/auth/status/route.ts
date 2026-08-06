import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * API Auth Status (Fase 14)
 *
 * GET /api/auth/status → ¿hay sesión? { ok: true } o 401.
 *
 * Ruta deliberadamente FUERA del matcher del proxy: así en anónimo
 * devuelve un 401 JSON limpio en vez de un redirect a /login (el proxy
 * redirige a una página 200 y el fetch no distinguía anónimo de
 * conectado). Solo pregunta «¿estoy dentro?», no trae datos.
 */

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "No se pudo verificar la sesión" },
      { status: 500 }
    );
  }
}
