import type { TipoMaterial } from "@/types";

const TIPOS_VALIDOS: TipoMaterial[] = ["lamina", "bloco", "bainha", "latao"];

export function isTipoMaterial(value: string | null | undefined): value is TipoMaterial {
  return TIPOS_VALIDOS.includes((value ?? "").trim().toLowerCase() as TipoMaterial);
}

export function normalizarTipoMaterial(value: string | null | undefined): TipoMaterial | null {
  if (isTipoMaterial(value)) return value.trim().toLowerCase() as TipoMaterial;
  return null;
}

export function obterTipoMaterialPadrao(
  tipoMaterial: string | null | undefined,
  _categoria?: string | null | undefined,
): TipoMaterial {
  return normalizarTipoMaterial(tipoMaterial) ?? "lamina";
}

export function labelTipoMaterial(tipoMaterial: TipoMaterial): string {
  switch (tipoMaterial) {
    case "lamina":
      return "Lâminas";
    case "bloco":
      return "Blocos";
    case "bainha":
      return "Bainhas";
    case "latao":
      return "Latão";
  }
}
