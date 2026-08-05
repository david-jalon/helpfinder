import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, upsertProfile } from "@/lib/db";
import type { ProfileInput } from "@/lib/domain/profile";

/**
 * API Profile
 *
 * GET  /api/profile  → devuelve el perfil del usuario autenticado
 * PUT  /api/profile  → crea o actualiza el perfil
 *
 * Todas las operaciones usan el user_id de la sesión (multi-tenant).
 * La key de Gemini NUNCA se envía al navegador en la respuesta GET
 * (se omite por seguridad).
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
      // Usuario sin perfil: necesita completar el onboarding
      return NextResponse.json({ ok: true, data: null });
    }

    // Ocultar la key de Gemini en la respuesta al navegador
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { geminiApiKey, ...safeProfile } = profile;

    return NextResponse.json({ ok: true, data: safeProfile });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    // Validación de entrada
    const allowedFields: Record<string, unknown> = {};

    if (typeof body.profileType === "string") {
      const validTypes = ["persona", "autonomo", "sociedad", "asociacion", "fundacion", "otros"];
      if (!validTypes.includes(body.profileType)) {
        return NextResponse.json(
          { ok: false, error: "Tipo de perfil no válido" },
          { status: 400 }
        );
      }
      allowedFields.profileType = body.profileType;
    }

    if (Array.isArray(body.colectivos)) {
      allowedFields.colectivos = body.colectivos;
    }

    if (Array.isArray(body.regiones)) {
      allowedFields.regiones = body.regiones;
    }

    if (typeof body.keywords === "string") {
      allowedFields.keywords = body.keywords.trim();
    }

    if (typeof body.contextText === "string") {
      allowedFields.contextText = body.contextText.trim();
    }

    if (typeof body.geminiApiKey === "string") {
      allowedFields.geminiApiKey = body.geminiApiKey.trim();
    }

    if (typeof body.notificationEmail === "string") {
      allowedFields.notificationEmail = body.notificationEmail.trim();
    }

    if (typeof body.emailDigestEnabled === "boolean") {
      allowedFields.emailDigestEnabled = body.emailDigestEnabled;
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay campos para actualizar" },
        { status: 400 }
      );
    }

    await upsertProfile(user.id, allowedFields as Partial<ProfileInput>);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
