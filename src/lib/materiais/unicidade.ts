import type { MateriaPrimaLamina, TipoMaterial } from "@/types";

type MateriaPrimaUniqueInput = {
  tipo_material: TipoMaterial;
  sku: string;
  lamina?: Pick<Partial<MateriaPrimaLamina>, "aco"> | null;
};

function normalizeUniqueToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function buildMateriaPrimaUniqueKey(input: MateriaPrimaUniqueInput): string {
  if (input.tipo_material === "lamina") {
    return [
      "lamina",
      normalizeUniqueToken(input.sku),
      normalizeUniqueToken(input.lamina?.aco),
    ].join("::");
  }

  return [normalizeUniqueToken(input.tipo_material), normalizeUniqueToken(input.sku)].join("::");
}

export function getMateriaPrimaUniqueErrorMessage(input: MateriaPrimaUniqueInput): string {
  if (input.tipo_material === "lamina") {
    return "Já existe uma lâmina com esta combinação de aço e SKU.";
  }

  return "Já existe uma matéria-prima com este SKU neste tipo de material.";
}
