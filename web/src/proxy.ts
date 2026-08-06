import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy de Helpfinder (antes "middleware"): se ejecuta en cada request
 * ANTES de que llegue a la página o ruta API.
 *
 * Hace dos cosas:
 *  1. Refresca la sesión de Supabase si hace falta (reescribe la cookie
 *     de sesión en la respuesta cuando se renueva el token).
 *  2. Protege rutas privadas: sin sesión → /login.
 *     Y si ya estás dentro, no te deja ver /login ni /register.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() verifica la sesión contra el servidor de auth (fiable).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/guia") ||
    pathname.startsWith("/api/profile") ||
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/alerts");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  // Sin sesión en una ruta privada → a /login
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Con sesión, ya no necesitas ver /login ni /register → al dashboard
  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/settings/:path*",
    "/guia/:path*",
    "/api/profile/:path*",
    "/api/dashboard/:path*",
    "/api/alerts/:path*",
    "/login",
    "/register",
  ],
};
