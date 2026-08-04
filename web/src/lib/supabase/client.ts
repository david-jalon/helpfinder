import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el navegador.
 *
 * Se usa dentro de componentes con `"use client"` para acciones que
 * requieren interactividad del usuario (iniciar sesión, registrarse...).
 *
 * La key `anon` es pública por diseño: permite operar con auth y leer
 * lo público. La seguridad de los datos privados la pone la BD (RLS,
 * que veremos en la Fase 7), no el hecho de que la key sea secreta.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
