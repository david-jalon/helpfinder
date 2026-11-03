/**
 * Lee una respuesta HTTP como JSON sin romper la interfaz si el servidor
 * devuelve un error de plataforma en texto/HTML (por ejemplo, un timeout de
 * Vercel: "An error occurred...").
 *
 * En ese caso lanza un Error con un mensaje entendible y deja el detalle en
 * el log del navegador, en vez de mostrar "Unexpected token ... is not valid
 * JSON".
 */
export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(
      JSON.stringify({
        event: "non_json_response",
        status: response.status,
        url: response.url,
        preview: text.slice(0, 200),
      })
    );

    throw new Error(
      response.ok
        ? "El servidor devolvió una respuesta inesperada. Vuelve a intentarlo."
        : `El servidor respondió ${response.status}. Vuelve a intentarlo.`
    );
  }
}
