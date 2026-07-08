import type { TipoOpcaoMaterial } from "@/types";

export function labelTipoOpcaoMaterial(tipo: TipoOpcaoMaterial): string {
  switch (tipo) {
    case "aco":
      return "Aços";
    case "cabo":
      return "Cabos";
    case "botao":
      return "Botões";
    case "carimbo":
      return "Carimbos";
    case "bainha":
      return "Bainhas";
    default:
      return "Opções";
  }
}

export function labelTipoOpcaoMaterialSingular(tipo: TipoOpcaoMaterial): string {
  switch (tipo) {
    case "aco":
      return "Aço";
    case "cabo":
      return "Cabo";
    case "botao":
      return "Botão";
    case "carimbo":
      return "Carimbo";
    case "bainha":
      return "Bainha";
    default:
      return "Opção";
  }
}

export function tableFieldForTipoOpcaoMaterial(tipo: TipoOpcaoMaterial): {
  table: "materialLamina" | "materialCabo" | "materialBainha";
  field: string;
} {
  switch (tipo) {
    case "aco":
      return { table: "materialLamina", field: "aco" };
    case "carimbo":
      return { table: "materialLamina", field: "carimbo" };
    case "cabo":
      return { table: "materialCabo", field: "tipo" };
    case "botao":
      return { table: "materialBainha", field: "botao" };
    case "bainha":
      return { table: "materialBainha", field: "modelo" };
  }
}
