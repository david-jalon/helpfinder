import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Rutas API documentadas en FASES.md → segmentos bajo src/app/api.
 * Mantener sincronizado con las rutas creadas en Fase 4.
 */
const DOCUMENTED_ROUTE_SEGMENTS: string[][] = [
  ["grants", "search"],
  ["grants", "[id]"],
  ["catalogs", "regions"],
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "../app/api");

function routeFilePath(segments: string[]): string {
  return join(API_ROOT, ...segments, "route.ts");
}

describe("Rutas API alineadas con la documentación", () => {
  for (const segments of DOCUMENTED_ROUTE_SEGMENTS) {
    const pathLabel = `/api/${segments.join("/")}`;
    it(`existe route.ts para ${pathLabel}`, () => {
      const filePath = routeFilePath(segments);
      expect(
        existsSync(filePath),
        `Falta el handler: ${filePath} (sincroniza con FASES.md o restaura el archivo)`
      ).toBe(true);
    });
  }
});
