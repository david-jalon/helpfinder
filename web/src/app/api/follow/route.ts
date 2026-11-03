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

    // Exigimos el detalle autoritativo de BDNS. Si no se puede leer, NO
    // guardamos nada: el cliente no es una fuente fiable de título/organismo
    // y podría inyectar datos falsos en la caché compartida.
    const detail = await fetchGrantDetailByNumConv(parsed.grant.id);
    if (!detail.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo verificar la convocatoria en BDNS. Inténtalo de nuevo.",
        },
        { status: 502 }
      );
    }

    const grant = resolveFollowGrant(parsed.grant, detail.data);
    await followGrantForUser(user.id, grant);

    return NextResponse.json({ ok: true, grantId: grant.id });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "follow_error",
        detail: error instanceof Error ? error.message : "unknown",
      })
    );

    return NextResponse.json(
      { ok: false, error: "Error interno. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
