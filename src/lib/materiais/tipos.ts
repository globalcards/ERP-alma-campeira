import type { TipoMaterial } from "@/types";

const TIPOS_VALIDOS: TipoMaterial[] = ["lamina", "cabo", "bainha", "outro"];

function normalizarTexto(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isTipoMaterial(value: string | null | undefined): value is TipoMaterial {
  return TIPOS_VALIDOS.includes((value ?? "").trim().toLowerCase() as TipoMaterial);
}

export function normalizarTipoMaterial(value: string | null | undefined): TipoMaterial {
  if (isTipoMaterial(value)) return value.trim().toLowerCase() as TipoMaterial;
  return "outro";
}

export function inferirTipoMaterialPorCategoria(categoria: string | null | undefined): TipoMaterial {
  const normalized = normalizarTexto(categoria);
  if (!normalized) return "outro";
  if (normalized.includes("lamina")) return "lamina";
  if (normalized.includes("cabo")) return "cabo";
  if (normalized.includes("bainha")) return "bainha";
  if (normalized.includes("botao")) return "bainha";
  return "outro";
}

export function obterTipoMaterialPadrao(
  tipoMaterial: string | null | undefined,
  categoria: string | null | undefined,
): TipoMaterial {
  if (isTipoMaterial(tipoMaterial)) return normalizarTipoMaterial(tipoMaterial);
  return inferirTipoMaterialPorCategoria(categoria);
}

export function labelTipoMaterial(tipoMaterial: TipoMaterial): string {
  switch (tipoMaterial) {
    case "lamina":
      return "Lâminas";
    case "cabo":
      return "Cabos";
    case "bainha":
      return "Bainhas";
    default:
      return "Outros";
  }
}
