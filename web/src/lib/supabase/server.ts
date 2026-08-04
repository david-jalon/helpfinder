import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Crea un cliente de Supabase listo para usar en el servidor
 * (server components, route handlers, server actions).
 *
 * Lee la sesión de las cookies del request y puede escribir en ellas
 * cuando la sesión se refresca (por ejemplo al iniciar sesión).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Si `createClient` se llama desde un Server Component,
            // no se pueden setear cookies aquí (lo hace el middleware).
            // Es un error esperado, se ignora.
          }
        },
      },
    }
  );
}

/**
 * Devuelve el usuario actual verificando su sesión contra Supabase,
 * o `null` si no hay sesión válida.
 *
 * Usa `getUser()` (y no `getSession()`) porque verifica la sesión con
 * el servidor de auth: es la fuente fiable de quién eres.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
