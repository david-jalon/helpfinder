import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  defaultNextForType,
  parseConfirmParams,
  sanitizeNextPathOr,
} from "@/lib/domain/recovery";

/**
 * GET /auth/confirm — verifica el enlace de un correo de Supabase.
 *
 * Es la "puerta" a la que apuntan los emails (recuperar contraseña y
 * confirmación de alta). Al verificar, Supabase deja al usuario con sesión
 * iniciada; después se le manda a `next` (saneado).
 *
 * Dos formatos de enlace:
 *  - `?token_hash=...&type=recovery` → `verifyOtp` (recomendado).
 *  - `?code=...` → `exchangeCodeForSession` (plantilla por defecto, PKCE).
 *
 * No lleva sesión en el request: por eso NO está en el `matcher` del proxy.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const parsed = parseConfirmParams(searchParams);

  if (parsed.mode === "invalid") {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing`);
  }

  const fallback = defaultNextForType(parsed.type);
  const next = sanitizeNextPathOr(searchParams.get("next"), fallback);

  const supabase = await createClient();

  const { error } =
    parsed.mode === "otp"
      ? await supabase.auth.verifyOtp({
          type: parsed.type as EmailOtpType,
          token_hash: parsed.tokenHash,
        })
      : await supabase.auth.exchangeCodeForSession(parsed.code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
