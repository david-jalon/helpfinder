/**
 * Tipos de dominio para el perfil de usuario de Helpfinder.
 * Cada usuario crea un perfil en español llano que describe quién es
 * y qué tipo de ayudas le interesan.
 *
 * Capa de dominio pura: sin dependencias de Next.js, fetch ni BD.
 */

/**
 * Tipos de perfil disponibles.
 * El usuario elige el que más se parezca a su situación real.
 */
export type ProfileType =
  | "persona"
  | "autonomo"
  | "sociedad"
  | "asociacion"
  | "fundacion"
  | "otros";

/**
 * Colectivos especiales (solo para perfil "persona").
 * Español llano: lo que un particular seleccionaría en un formulario.
 */
export type Colectivo =
  | "jovenes"
  | "estudiantes"
  | "desempleados"
  | "mujeres"
  | "personas_con_discapacidad"
  | "mayores"
  | "inmigrantes"
  | "otros";

/**
 * Comunidades autónomas de España.
 */
export type Region =
  | "andaluza"
  | "aragonesa"
  | "asturiana"
  | "balear"
  | "canaria"
  | "cantabrica"
  | "castellano_manchega"
  | "castellano_leonesa"
  | "catalana"
  | "extremena"
  | "gallega"
  | "madrileña"
  | "murciana"
  | "navarra"
  | "vasca"
  | "valenciana"
  | "ceuta"
  | "melilla";

/**
 * Perfil completo del usuario en Helpfinder.
 * Se guarda en la tabla `profiles` de Supabase (una fila por usuario).
 */
export type Profile = {
  userId: string;
  profileType: ProfileType;
  colectivos: Colectivo[];
  regiones: Region[];
  keywords: string;
  contextText: string;
  geminiApiKey: string;
  notificationEmail: string;
  emailDigestEnabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

/**
 * Datos mínimos para crear o actualizar un perfil.
 * Se usa en el formulario de onboarding y settings.
 */
export type ProfileInput = {
  profileType: ProfileType;
  colectivos?: Colectivo[];
  regiones?: Region[];
  keywords?: string;
  contextText?: string;
  geminiApiKey?: string;
  notificationEmail?: string;
  emailDigestEnabled?: boolean;
};
