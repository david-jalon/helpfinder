import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { followGrantForUser } from "@/lib/db";
import { validateFollowGrant } from "@/lib/dashboard/follow";

/**
 * API Follow — seguir desde la landing (Fase 14)
 *
 * POST /api/follow → añade una convocatoria al diario del usuario
 * con el triaje «En seguimiento».
 * Cuerpo: { id, title, organization?, sourceUrl? } (datos públicos BDNS).
 *
 * La ruta vive en /api/follow (y NO en /api/alerts/*) a propósito: el
 * matcher del proxy protege /api/alerts/:path*, así que aquí, sin
 * sesión, devuelve un 401 JSON limpio (no un redirect a /login, que un
 * POST no debe seguir).
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
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

    const parsed = validateFollowGrant(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error },
        { status: 400 }
      );
    }

    await followGrantForUser(user.id, parsed.grant);

    return NextResponse.json({ ok: true, grantId: parsed.grant.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
