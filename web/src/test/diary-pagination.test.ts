import { describe, expect, it } from "vitest";
import {
  DIARY_DEFAULT_LIMIT,
  DIARY_MAX_LIMIT,
  parseDiaryPagination,
} from "@/lib/dashboard/pagination";

describe("parseDiaryPagination", () => {
  it("sin parámetros usa la página 1 y el límite por defecto", () => {
    expect(parseDiaryPagination(null, null)).toEqual({
      page: 1,
      limit: DIARY_DEFAULT_LIMIT,
      offset: 0,
    });
  });

  it("calcula el offset a partir de la página", () => {
    expect(parseDiaryPagination("3", "50")).toEqual({
      page: 3,
      limit: 50,
      offset: 100,
    });
  });

  it("ignora valores inválidos y usa el defecto", () => {
    expect(parseDiaryPagination("0", "abc")).toEqual({
      page: 1,
      limit: DIARY_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(parseDiaryPagination("-5", "0").page).toBe(1);
  });

  it("limita el tamaño máximo por petición", () => {
    expect(parseDiaryPagination("1", "9999").limit).toBe(DIARY_MAX_LIMIT);
  });
});
