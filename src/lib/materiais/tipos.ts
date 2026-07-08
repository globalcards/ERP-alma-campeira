import type { TipoMaterial } from "@/types";

const TIPOS_VALIDOS: TipoMaterial[] = ["lamina", "cabo", "bainha", "latao", "outro"];

export function isTipoMaterial(value: string | null | undefined): value is TipoMaterial {
  return TIPOS_VALIDOS.includes((value ?? "").trim().toLowerCase() as TipoMaterial);
}

export function normalizarTipoMaterial(value: string | null | undefined): TipoMaterial {
  if (isTipoMaterial(value)) return value.trim().toLowerCase() as TipoMaterial;
  return "outro";
}

export function obterTipoMaterialPadrao(
  tipoMaterial: string | null | undefined,
  _categoria?: string | null | undefined,
): TipoMaterial {
  return normalizarTipoMaterial(tipoMaterial);
}

export function labelTipoMaterial(tipoMaterial: TipoMaterial): string {
  switch (tipoMaterial) {
    case "lamina":
      return "Lâminas";
    case "cabo":
      return "Cabos";
    case "bainha":
      return "Bainhas";
    case "latao":
      return "Latão";
    default:
      return "Outros";
  }
}
