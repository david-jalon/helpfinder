import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { followGrantForUser } from "@/lib/db";
import { fetchGrantDetailByNumConv } from "@/lib/bdns/detail";
import { resolveFollowGrant, validateFollowGrant } from "@/lib/dashboard/follow";

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

    // Validar el id contra BDNS y quedarnos con SUS datos. Si BDNS no
    // responde, seguimos con los del cliente, pero la URL se regenera
    // siempre desde el id (nunca se guarda una URL arbitraria).
    let authoritative = null;
    try {
      const detail = await fetchGrantDetailByNumConv(parsed.grant.id);
      if (detail.ok) authoritative = detail.data;
    } catch {
      // Sin detalle: se usan los datos del cliente.
    }

    const grant = resolveFollowGrant(parsed.grant, authoritative);
    await followGrantForUser(user.id, grant);

    return NextResponse.json({ ok: true, grantId: grant.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
