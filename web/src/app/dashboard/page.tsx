import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { logout } from "@/lib/supabase/actions";
import styles from "./dashboard.module.css";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  // El middleware ya protege esta ruta, pero lo comprobamos también
  // aquí por si se accede desde otra vía.
  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.dash}>
      <div className={styles.card}>
        <p className={styles.badge}>Expediente</p>
        <h1 className={styles.title}>Bienvenido, {user.user_metadata.name || "usuario"}</h1>
        <p className={styles.sub}>{user.email}</p>
        <p className={styles.note}>
          Tu sesión funciona. El dashboard con tus alertas llega en la Fase 11.
        </p>
        <form action={logout}>
          <button className={styles.submit} type="submit">
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}