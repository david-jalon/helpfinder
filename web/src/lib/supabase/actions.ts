"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";

/**
 * Server action para cerrar sesión.
 *
 * Se ejecuta en el servidor: ahí es donde viven las cookies de sesión,
 * así que es el único sitio donde se pueden borrar de forma fiable.
 * Después redirige a la portada.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
