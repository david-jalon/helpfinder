import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { getProfile, upsertProfile } from "@/lib/db";
import type { ProfileInput } from "@/lib/domain/profile";
import {
  LIMITS,
  isProfileType,
  isValidEmail,
  isValidGeminiKey,
  sanitizeColectivos,
  sanitizeRegiones,
} from "@/lib/domain/profile-input";

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

    // Ocultar la key de Gemini en la respuesta al navegador, pero decir
    // SI existe (booleano) para que Ajustes pueda ofrecer reemplazarla o
    // borrarla sin conocer nunca el valor.
    const { geminiApiKey, ...safeProfile } = profile;

    return NextResponse.json({
      ok: true,
      data: {
        ...safeProfile,
        hasGeminiApiKey: geminiApiKey.trim().length > 0,
      },
    });
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

    if (body.profileType !== undefined) {
      if (!isProfileType(body.profileType)) {
        return NextResponse.json(
          { ok: false, error: "Tipo de perfil no válido" },
          { status: 400 }
        );
      }
      allowedFields.profileType = body.profileType;
    }

    if (body.colectivos !== undefined) {
      if (!Array.isArray(body.colectivos)) {
        return NextResponse.json(
          { ok: false, error: "Colectivos inválidos" },
          { status: 400 }
        );
      }
      // Se filtran los valores desconocidos y los duplicados.
      allowedFields.colectivos = sanitizeColectivos(body.colectivos);
    }

    if (body.regiones !== undefined) {
      if (!Array.isArray(body.regiones)) {
        return NextResponse.json(
          { ok: false, error: "Regiones inválidas" },
          { status: 400 }
        );
      }
      allowedFields.regiones = sanitizeRegiones(body.regiones);
    }

    if (typeof body.keywords === "string") {
      const keywords = body.keywords.trim();
      if (keywords.length > LIMITS.keywords) {
        return NextResponse.json(
          { ok: false, error: `Las palabras clave no pueden superar ${LIMITS.keywords} caracteres` },
          { status: 400 }
        );
      }
      allowedFields.keywords = keywords;
    }

    if (typeof body.contextText === "string") {
      const contextText = body.contextText.trim();
      if (contextText.length > LIMITS.contextText) {
        return NextResponse.json(
          { ok: false, error: `La descripción no puede superar ${LIMITS.contextText} caracteres` },
          { status: 400 }
        );
      }
      allowedFields.contextText = contextText;
    }

    if (typeof body.geminiApiKey === "string") {
      const geminiApiKey = body.geminiApiKey.trim();
      if (!isValidGeminiKey(geminiApiKey)) {
        return NextResponse.json(
          { ok: false, error: "La API key de Gemini no tiene el formato esperado" },
          { status: 400 }
        );
      }
      allowedFields.geminiApiKey = geminiApiKey;
    }

    if (typeof body.notificationEmail === "string") {
      const notificationEmail = body.notificationEmail.trim();
      if (
        !isValidEmail(notificationEmail) ||
        notificationEmail.length > LIMITS.notificationEmail
      ) {
        return NextResponse.json(
          { ok: false, error: "El correo electrónico no es válido" },
          { status: 400 }
        );
      }
      allowedFields.notificationEmail = notificationEmail;
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
