import type { TipoOpcaoMaterial } from "@/types";

export function labelTipoOpcaoMaterial(tipo: TipoOpcaoMaterial): string {
  switch (tipo) {
    case "aco":
      return "Aços";
    case "bloco":
      return "Blocos";
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
    case "bloco":
      return "Bloco";
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
  table: "materialLamina" | "materialBloco" | "materialBainha";
  field: string;
} {
  switch (tipo) {
    case "aco":
      return { table: "materialLamina", field: "aco" };
    case "carimbo":
      return { table: "materialLamina", field: "carimbo" };
    case "bloco":
      return { table: "materialBloco", field: "tipo" };
    case "botao":
      return { table: "materialBainha", field: "botao" };
    case "bainha":
      return { table: "materialBainha", field: "modelo" };
  }
}
