"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { criarMateriasPrimasEmLote } from "@/lib/actions/materias-primas";
import { salvarMPComFoto } from "@/lib/actions/materias-primas-upload";
import { getOptimizedImageUrl } from "@/lib/images";
import { buildMateriaPrimaUniqueKey } from "@/lib/materiais/unicidade";
import { labelTipoMaterial } from "@/lib/materiais/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SmartSelect } from "@/components/ui/smart-select";
import type { Fornecedor, MateriaPrima, OpcoesMateriaisPorTipo, TipoMaterial } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
  fornecedores: Fornecedor[];
  opcoesMateriais: OpcoesMateriaisPorTipo;
  loadingReferencias?: boolean;
  editando?: MateriaPrima | null;
  tipoMaterialContext?: TipoMaterial | null;
  onSaved?: () => void;
};

type Form = {
  sku: string;
  nome: string;
  tipo_material: TipoMaterial;
  fornecedor_id: string;
  preco_custo: string;
  estoque_atual: string;
  estoque_minimo: string;
  lamina_aco: string;
  lamina_carimbo: string;
  bloco_tipo: string;
  bloco_cor: string;
  bainha_polegadas: string;
  bainha_modelo: string;
  bainha_botao: string;
};

type SupplierFormRow = {
  id: string;
  fornecedor_id: string;
  preco_custo: string;
  observacao: string;
};

type BulkMode = "single" | "bulk";

type BulkRow = {
  id: string;
  sku: string;
  nome: string;
  fornecedor: string;
  preco_custo: string;
  estoque_atual: string;
  estoque_minimo: string;
  lamina_aco: string;
  lamina_carimbo: string;
  bloco_tipo: string;
  bloco_cor: string;
  bainha_polegadas: string;
  bainha_modelo: string;
  bainha_botao: string;
};

type BulkField = Exclude<keyof BulkRow, "id">;

type BulkColumn = {
  field: BulkField;
  label: string;
  placeholder: string;
  kind: "input" | "select";
  inputMode?: "decimal";
  listId?: string;
  optionType?: "aco" | "carimbo" | "bloco" | "bainha" | "botao";
  minWidth?: number;
};

function ManageResourceLink({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-1 text-xs font-medium transition-colors"
      style={{ color: "var(--ac-muted)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ac-accent)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ac-muted)")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="size-3.5 shrink-0"
        aria-hidden
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      {label}
    </Link>
  );
}

const BULK_CONTEXT_COLUMNS: BulkColumn[] = [
  {
    field: "fornecedor",
    label: "Fornecedor",
    placeholder: "Fornecedor",
    kind: "input",
    listId: "mp-bulk-fornecedores",
    minWidth: 170,
  },
];

const BULK_IDENTITY_COLUMNS: BulkColumn[] = [
  { field: "sku", label: "SKU *", placeholder: "SKU", kind: "input", minWidth: 132 },
  {
    field: "nome",
    label: "Nome *",
    placeholder: "Nome da matéria-prima",
    kind: "input",
    minWidth: 220,
  },
];

const BULK_COMMERCIAL_COLUMNS: BulkColumn[] = [
  {
    field: "preco_custo",
    label: "Preço de Custo *",
    placeholder: "0",
    kind: "input",
    inputMode: "decimal",
    minWidth: 148,
  },
  {
    field: "estoque_atual",
    label: "Estoque Atual",
    placeholder: "0",
    kind: "input",
    inputMode: "decimal",
    minWidth: 140,
  },
  {
    field: "estoque_minimo",
    label: "Estoque Mínimo",
    placeholder: "0",
    kind: "input",
    inputMode: "decimal",
    minWidth: 148,
  },
];

const BULK_LAMINA_COLUMNS: BulkColumn[] = [
  {
    field: "lamina_aco",
    label: "Aço",
    placeholder: "Selecione um aço",
    kind: "select",
    optionType: "aco",
    minWidth: 170,
  },
];

const BULK_CABO_COLUMNS: BulkColumn[] = [
  {
    field: "bloco_tipo",
    label: "Tipo",
    placeholder: "Selecione um tipo",
    kind: "select",
    optionType: "bloco",
    minWidth: 170,
  },
  {
    field: "bloco_cor",
    label: "Cor",
    placeholder: "Cor",
    kind: "input",
    minWidth: 150,
  },
];

const BULK_BAINHA_COLUMNS: BulkColumn[] = [
  {
    field: "bainha_polegadas",
    label: "Polegadas",
    placeholder: 'Ex: 8"',
    kind: "input",
    minWidth: 120,
  },
  {
    field: "bainha_modelo",
    label: "Modelo",
    placeholder: "Selecione um modelo",
    kind: "select",
    optionType: "bainha",
    minWidth: 180,
  },
];

const BULK_ROWS_STEP = 5;

const formVazio: Form = {
  sku: "",
  nome: "",
  tipo_material: "lamina",
  fornecedor_id: "",
  preco_custo: "",
  estoque_atual: "0",
  estoque_minimo: "0",
  lamina_aco: "",
  lamina_carimbo: "",
  bloco_tipo: "",
  bloco_cor: "",
  bainha_polegadas: "",
  bainha_modelo: "",
  bainha_botao: "",
};

function getInitialForm(
  editando: MateriaPrima | null | undefined,
  tipoMaterialContext?: TipoMaterial | null,
): Form {
  if (editando) {
    return {
      sku: editando.sku,
      nome: editando.nome,
      tipo_material: editando.tipo_material,
      fornecedor_id: editando.fornecedor_id ?? "",
      preco_custo: String(editando.preco_custo),
      estoque_atual: String(editando.estoque_atual),
      estoque_minimo: String(editando.estoque_minimo),
      lamina_aco: editando.lamina?.aco ?? "",
      lamina_carimbo: editando.lamina?.carimbo ?? "",
      bloco_tipo: editando.bloco?.tipo ?? "",
      bloco_cor: editando.bloco?.cor ?? "",
      bainha_polegadas: editando.bainha?.polegadas ?? "",
      bainha_modelo: editando.bainha?.modelo ?? "",
      bainha_botao: editando.bainha?.botao ?? "",
    };
  }

  return {
    ...formVazio,
    tipo_material: tipoMaterialContext ?? "lamina",
  };
}

function fornecedorAtendeTipo(fornecedor: Fornecedor, tipoMaterial: TipoMaterial): boolean {
  const tipos = fornecedor.tipos_materiais ?? [];
  return tipos.length === 0 || tipos.includes(tipoMaterial);
}

function getTipoMaterialMeta(tipoMaterial: TipoMaterial) {
  switch (tipoMaterial) {
    case "lamina":
      return {
        singular: "Lâmina",
        descricao: "Cadastre aço e demais dados específicos da lâmina.",
      };
    case "bloco":
      return {
        singular: "Bloco",
        descricao: "Cadastre tipo, cor e demais dados específicos do bloco.",
      };
    case "bainha":
      return {
        singular: "Bainha",
        descricao: "Cadastre polegadas e modelo para materiais de bainha.",
      };
    case "latao":
      return {
        singular: "Latão",
        descricao: "Cadastre os dados base do material de latão sem campos contextuais adicionais.",
      };
    default:
      return {
        singular: "Material",
        descricao:
          "Cadastre os dados base do material. Campos específicos aparecem conforme o tipo.",
      };
  }
}

function getOpcoesSelect(
  options: OpcoesMateriaisPorTipo[keyof OpcoesMateriaisPorTipo],
  currentValue: string,
) {
  const value = currentValue.trim();
  if (!value) {
    return options
      .filter((item) => item.ativo)
      .map((item) => ({ value: item.nome, label: item.nome }));
  }

  const currentOption = options.find((item) => item.nome === value);
  if (currentOption) {
    return options
      .filter((item) => item.ativo || item.nome === value)
      .map((item) => ({
        value: item.nome,
        label: `${item.nome}${!item.ativo ? " (inativo)" : ""}`,
        searchText: item.nome,
      }));
  }

  return [
    {
      value,
      label: `${value} (inativo)`,
      searchText: value,
    },
    ...options.filter((item) => item.ativo).map((item) => ({ value: item.nome, label: item.nome })),
  ];
}

function createBulkRow(): BulkRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sku: "",
    nome: "",
    fornecedor: "",
    preco_custo: "",
    estoque_atual: "",
    estoque_minimo: "",
    lamina_aco: "",
    lamina_carimbo: "",
    bloco_tipo: "",
    bloco_cor: "",
    bainha_polegadas: "",
    bainha_modelo: "",
    bainha_botao: "",
  };
}

function createSupplierRow(): SupplierFormRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fornecedor_id: "",
    preco_custo: "",
    observacao: "",
  };
}

function getInitialSupplierRows(editando: MateriaPrima | null | undefined): SupplierFormRow[] {
  if (!editando?.fornecedores_vinculados?.length) return [];
  return editando.fornecedores_vinculados
    .filter((item) => !item.preferencial)
    .map((item) => ({
      id: item.id,
      fornecedor_id: item.fornecedor_id,
      preco_custo: String(item.preco_custo),
      observacao: item.observacao ?? "",
    }));
}

function createBulkRows(count = BULK_ROWS_STEP): BulkRow[] {
  return Array.from({ length: count }, () => createBulkRow());
}

function parseDecimal(value: string): number {
  const normalized = sanitizeNumericValue(value).replace(",", ".");
  return normalized ? Number(normalized) : NaN;
}

function isNumericBulkField(
  field: BulkField,
): field is "preco_custo" | "estoque_atual" | "estoque_minimo" {
  return field === "preco_custo" || field === "estoque_atual" || field === "estoque_minimo";
}

function sanitizeNumericValue(value: string): string {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return "";

  const signal = cleaned.startsWith("-") ? "-" : "";
  const unsigned = cleaned.replace(/-/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  if (decimalIndex === -1) {
    const digits = unsigned.replace(/[^\d]/g, "");
    return digits ? `${signal}${digits}` : "";
  }

  const integerPart = unsigned.slice(0, decimalIndex).replace(/[^\d]/g, "");
  const decimalPart = unsigned.slice(decimalIndex + 1).replace(/[^\d]/g, "");
  if (!integerPart && !decimalPart) return "";
  if (!decimalPart) return `${signal}${integerPart}`;
  return `${signal}${integerPart || "0"},${decimalPart}`;
}

function normalizeBulkCellValue(field: BulkField, value: string): string {
  return isNumericBulkField(field) ? sanitizeNumericValue(value) : value.trim();
}

function isSpreadsheetPaste(text: string): boolean {
  return text.includes("\t") || text.includes("\n");
}

function isBulkRowEmpty(row: BulkRow): boolean {
  return [
    row.nome,
    row.fornecedor,
    row.preco_custo,
    row.estoque_atual,
    row.estoque_minimo,
    row.sku,
    row.lamina_aco,
    row.lamina_carimbo,
    row.bloco_tipo,
    row.bloco_cor,
    row.bainha_polegadas,
    row.bainha_modelo,
    row.bainha_botao,
  ].every((value) => !value.trim());
}

function extractBulkErrorLineNumbers(message: string): number[] {
  const matches = message.matchAll(/Linha\s+(\d+)\s*:/gi);
  return [...new Set(Array.from(matches, (match) => Number(match[1])).filter(Number.isFinite))];
}

function getBulkColumns(tipoMaterial: TipoMaterial): BulkColumn[] {
  if (tipoMaterial === "lamina") {
    return [
      ...BULK_CONTEXT_COLUMNS,
      ...BULK_LAMINA_COLUMNS,
      ...BULK_IDENTITY_COLUMNS,
      ...BULK_COMMERCIAL_COLUMNS,
    ];
  }
  if (tipoMaterial === "bloco") {
    return [
      ...BULK_CONTEXT_COLUMNS,
      ...BULK_CABO_COLUMNS,
      ...BULK_IDENTITY_COLUMNS,
      ...BULK_COMMERCIAL_COLUMNS,
    ];
  }
  if (tipoMaterial === "bainha") {
    return [
      ...BULK_CONTEXT_COLUMNS,
      ...BULK_BAINHA_COLUMNS,
      ...BULK_IDENTITY_COLUMNS,
      ...BULK_COMMERCIAL_COLUMNS,
    ];
  }
  return [...BULK_CONTEXT_COLUMNS, ...BULK_IDENTITY_COLUMNS, ...BULK_COMMERCIAL_COLUMNS];
}

export function MPModal({
  open,
  onClose,
  fornecedores,
  opcoesMateriais,
  loadingReferencias = false,
  editando,
  tipoMaterialContext,
  onSaved,
}: Props) {
  const [form, setForm] = useState<Form>(() => getInitialForm(editando, tipoMaterialContext));
  const [fornecedoresExtras, setFornecedoresExtras] = useState<SupplierFormRow[]>(() =>
    getInitialSupplierRows(editando),
  );
  const [modo, setModo] = useState<BulkMode>("single");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() => createBulkRows());
  const [erro, setErro] = useState("");
  const [bulkErrorLineNumbers, setBulkErrorLineNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>("");
  const [fotoDragActive, setFotoDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fotoLightboxOpen, setFotoLightboxOpen] = useState(false);
  const [fotoLightboxSrc, setFotoLightboxSrc] = useState<string>("");

  const fotoPreviewAtual = editando?.foto_url
    ? getOptimizedImageUrl(editando.foto_url, {
        width: 120,
        height: 120,
        quality: 70,
        resize: "cover",
        fallbackUrl: "",
      })
    : "";

  useEffect(() => {
    return () => {
      if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    };
  }, [fotoPreview]);

  useEffect(() => {
    if (!open) return;
    setForm(getInitialForm(editando, tipoMaterialContext));
    setFornecedoresExtras(getInitialSupplierRows(editando));
    setModo("single");
    setBulkRows(createBulkRows());
    setErro("");
    setBulkErrorLineNumbers([]);
    setFotoFile(null);
    setFotoPreview("");
    setFotoDragActive(false);
  }, [open, editando, tipoMaterialContext]);

  function setFotoFromFile(file: File | null) {
    setFotoFile(file);
    if (file) setFotoPreview(URL.createObjectURL(file));
    else setFotoPreview("");
  }

  function openFotoLightbox(src: string) {
    setFotoLightboxSrc(src);
    setFotoLightboxOpen(true);
  }

  function closeFotoLightbox() {
    setFotoLightboxOpen(false);
    setFotoLightboxSrc("");
  }

  function set(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setTipoMaterial(value: TipoMaterial) {
    setForm((current) => {
      const fornecedorSelecionado = current.fornecedor_id
        ? fornecedores.find((fornecedor) => fornecedor.id === current.fornecedor_id)
        : null;

      return {
        ...current,
        tipo_material: value,
        fornecedor_id:
          fornecedorSelecionado && !fornecedorAtendeTipo(fornecedorSelecionado, value)
            ? ""
            : current.fornecedor_id,
      };
    });
    setFornecedoresExtras((current) =>
      current.filter((row) => {
        const fornecedor = fornecedores.find((item) => item.id === row.fornecedor_id);
        return !fornecedor || fornecedorAtendeTipo(fornecedor, value);
      }),
    );
  }

  function setFornecedorExtra(
    rowId: string,
    field: keyof Omit<SupplierFormRow, "id">,
    value: string,
  ) {
    setFornecedoresExtras((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  }

  function addFornecedorExtra() {
    setFornecedoresExtras((current) => [...current, createSupplierRow()]);
  }

  function removeFornecedorExtra(rowId: string) {
    setFornecedoresExtras((current) => current.filter((row) => row.id !== rowId));
  }

  function setBulkCell(rowId: string, field: BulkField, value: string) {
    const normalizedValue = normalizeBulkCellValue(field, value);
    setErro("");
    setBulkErrorLineNumbers([]);
    setBulkRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [field]: normalizedValue } : row)),
    );
  }

  function addBulkRows(count = BULK_ROWS_STEP) {
    setErro("");
    setBulkErrorLineNumbers([]);
    setBulkRows((rows) => [...rows, ...createBulkRows(count)]);
  }

  function applyBulkPaste(startRowIndex: number, startColumnIndex: number, text: string): boolean {
    if (!isSpreadsheetPaste(text)) return false;
    const activeColumns = getBulkColumns(tipoMaterialContext ?? form.tipo_material);

    const rowsFromClipboard = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((row, index, list) => !(index === list.length - 1 && row === ""));

    if (rowsFromClipboard.length === 0) return false;

    setErro("");
    setBulkErrorLineNumbers([]);
    setBulkRows((currentRows) => {
      const nextRows = [...currentRows];
      while (nextRows.length < startRowIndex + rowsFromClipboard.length) {
        nextRows.push(createBulkRow());
      }

      rowsFromClipboard.forEach((rowText, rowOffset) => {
        const values = rowText.split("\t");
        values.forEach((value, colOffset) => {
          const column = activeColumns[startColumnIndex + colOffset];
          if (!column) return;
          const rowIndex = startRowIndex + rowOffset;
          nextRows[rowIndex] = {
            ...nextRows[rowIndex],
            [column.field]: normalizeBulkCellValue(column.field, value),
          };
        });
      });

      return nextRows;
    });

    return true;
  }

  function validateBulkRows() {
    const errors: string[] = [];
    const fornecedoresPorNome = new Map(
      fornecedores.map((fornecedor) => [fornecedor.nome.trim().toLowerCase(), fornecedor.id]),
    );
    const tipoMaterialAtual = tipoMaterialContext ?? form.tipo_material;

    const items = bulkRows.flatMap((row, index) => {
      if (isBulkRowEmpty(row)) return [];

      const linha = index + 1;
      const sku = row.sku.trim();
      const nome = row.nome.trim();
      const fornecedor = row.fornecedor.trim();
      const precoText = row.preco_custo.trim();
      const estoqueAtualText = row.estoque_atual.trim();
      const estoqueMinimoText = row.estoque_minimo.trim();
      const laminaAco = row.lamina_aco.trim();
      const blocoTipo = row.bloco_tipo.trim();
      const blocoCor = row.bloco_cor.trim();
      const bainhaPolegadas = row.bainha_polegadas.trim();
      const bainhaModelo = row.bainha_modelo.trim();

      const missing: string[] = [];
      if (!sku) missing.push("sku");
      if (!nome) missing.push("nome");
      if (!precoText) missing.push("preço de custo");
      if (missing.length > 0) {
        errors.push(`Linha ${linha}: preencha ${missing.join(", ")}.`);
        return [];
      }

      const preco = parseDecimal(precoText);
      if (!Number.isFinite(preco)) {
        errors.push(`Linha ${linha}: preço de custo inválido.`);
        return [];
      }

      const estoqueAtual = estoqueAtualText ? parseDecimal(estoqueAtualText) : 0;
      if (estoqueAtualText && !Number.isFinite(estoqueAtual)) {
        errors.push(`Linha ${linha}: estoque atual inválido.`);
        return [];
      }

      const estoqueMinimo = estoqueMinimoText ? parseDecimal(estoqueMinimoText) : 0;
      if (estoqueMinimoText && !Number.isFinite(estoqueMinimo)) {
        errors.push(`Linha ${linha}: estoque mínimo inválido.`);
        return [];
      }

      const fornecedorId = fornecedor
        ? (fornecedoresPorNome.get(fornecedor.toLowerCase()) ?? null)
        : null;

      if (fornecedor && !fornecedorId) {
        errors.push(`Linha ${linha}: informe um fornecedor válido.`);
        return [];
      }

      return [
        {
          nome,
          sku,
          tipo_material: tipoMaterialAtual,
          fornecedor_id: fornecedorId,
          preco_custo: preco,
          estoque_atual: estoqueAtual,
          estoque_minimo: estoqueMinimo,
          lamina:
            tipoMaterialAtual === "lamina"
              ? {
                  aco: laminaAco || null,
                }
              : null,
          bloco:
            tipoMaterialAtual === "bloco"
              ? {
                  tipo: blocoTipo || null,
                  cor: blocoCor || null,
                }
              : null,
          bainha:
            tipoMaterialAtual === "bainha"
              ? {
                  polegadas: bainhaPolegadas || null,
                  modelo: bainhaModelo || null,
                }
              : null,
        },
      ];
    });

    if (items.length === 0 && errors.length === 0) {
      errors.push("Preencha ao menos uma linha válida para criar em massa.");
    }

    const uniqueKeys = items.map((item) => buildMateriaPrimaUniqueKey(item));
    if (new Set(uniqueKeys).size !== uniqueKeys.length) {
      errors.push(
        "Existem linhas duplicadas na planilha para a mesma regra de unicidade do material.",
      );
    }

    return { items, errors };
  }

  function setBulkErrorState(message: string) {
    setErro(message);
    setBulkErrorLineNumbers(extractBulkErrorLineNumbers(message));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setBulkErrorLineNumbers([]);
    const tipoMaterialAtual = tipoMaterialContext ?? form.tipo_material;

    if (editando || modo === "single") {
      if (!form.nome.trim()) {
        setErro("Nome é obrigatório.");
        return;
      }
      if (!form.sku.trim()) {
        setErro("SKU é obrigatório.");
        return;
      }
      if (!form.preco_custo || Number.isNaN(Number(form.preco_custo))) {
        setErro("Preço de custo inválido.");
        return;
      }
      const fornecedoresPayload = [
        ...(form.fornecedor_id
          ? [
              {
                fornecedor_id: form.fornecedor_id,
                preco_custo: Number(form.preco_custo),
                observacao: null,
                preferencial: true,
                ativo: true,
              },
            ]
          : []),
        ...fornecedoresExtras
          .map((row) => ({
            fornecedor_id: row.fornecedor_id.trim(),
            preco_custo: Number(row.preco_custo),
            observacao: row.observacao.trim() || null,
            preferencial: false,
            ativo: true,
          }))
          .filter((row) => row.fornecedor_id || row.preco_custo || row.observacao),
      ];
      const idsFornecedores = new Set<string>();
      for (const fornecedor of fornecedoresPayload) {
        if (!fornecedor.fornecedor_id) {
          setErro("Selecione um fornecedor válido em todos os vínculos extras.");
          return;
        }
        if (!Number.isFinite(fornecedor.preco_custo) || fornecedor.preco_custo < 0) {
          setErro("Preço de custo inválido em um dos fornecedores vinculados.");
          return;
        }
        const key = fornecedor.fornecedor_id.toLowerCase();
        if (idsFornecedores.has(key)) {
          setErro("Não repita o mesmo fornecedor na matéria-prima.");
          return;
        }
        idsFornecedores.add(key);
      }

      setLoading(true);
      try {
        const fd = new FormData();
        if (editando?.id) fd.append("id", editando.id);
        fd.append("sku", form.sku);
        fd.append("nome", form.nome);
        fd.append("tipo_material", tipoMaterialAtual);
        fd.append("fornecedor_id", form.fornecedor_id);
        fd.append("preco_custo", String(parseFloat(form.preco_custo)));
        fd.append("fornecedores_json", JSON.stringify(fornecedoresPayload));
        fd.append("estoque_atual", String(parseFloat(form.estoque_atual) || 0));
        fd.append("estoque_minimo", String(parseFloat(form.estoque_minimo) || 0));
        fd.append("lamina_aco", form.lamina_aco);
        fd.append("lamina_carimbo", form.lamina_carimbo);
        fd.append("bloco_tipo", form.bloco_tipo);
        fd.append("bloco_cor", form.bloco_cor);
        fd.append("bainha_polegadas", form.bainha_polegadas);
        fd.append("bainha_modelo", form.bainha_modelo);
        fd.append("bainha_botao", form.bainha_botao);
        if (fotoFile) fd.append("foto", fotoFile, fotoFile.name);

        await salvarMPComFoto(fd);
        onClose();
        onSaved?.();
      } catch (submitError: unknown) {
        setErro(submitError instanceof Error ? submitError.message : "Erro ao salvar.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const { items, errors } = validateBulkRows();
    if (errors.length > 0) {
      setBulkErrorState(errors.join("\n"));
      return;
    }

    setLoading(true);
    try {
      await criarMateriasPrimasEmLote(items);
      onClose();
      onSaved?.();
    } catch (submitError: unknown) {
      setBulkErrorState(
        submitError instanceof Error ? submitError.message : "Erro ao criar em massa.",
      );
    } finally {
      setLoading(false);
    }
  }

  const cellInputStyle = {
    width: "100%",
    minWidth: 120,
    borderRadius: 10,
    border: "1px solid var(--ac-border)",
    background: "var(--ac-card)",
    color: "var(--ac-text)",
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
  } as const;
  const cellSelectStyle = {
    ...cellInputStyle,
    appearance: "none" as const,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%236b7280' stroke-width='2' d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    backgroundSize: "16px",
    paddingRight: "36px",
  } as const;

  const tipoMaterialAtual = tipoMaterialContext ?? form.tipo_material;
  const tipoMaterialMeta = getTipoMaterialMeta(tipoMaterialAtual);
  const fornecedoresCompativeis = fornecedores.filter((fornecedor) =>
    fornecedorAtendeTipo(fornecedor, tipoMaterialAtual),
  );
  const opcoesAco = getOpcoesSelect(opcoesMateriais.aco, form.lamina_aco);
  const opcoesBloco = getOpcoesSelect(opcoesMateriais.bloco, form.bloco_tipo);
  const opcoesBainha = getOpcoesSelect(opcoesMateriais.bainha, form.bainha_modelo);
  const opcoesFornecedor = fornecedoresCompativeis.map((fornecedor) => ({
    value: fornecedor.id,
    label: fornecedor.nome,
    searchText: `${fornecedor.nome} ${fornecedor.cidade ?? ""} ${fornecedor.uf ?? ""}`,
  }));
  const tipoFixo = !!tipoMaterialContext;
  const bulkColumns = getBulkColumns(tipoMaterialAtual);
  const opcoesFornecedorExtra = fornecedoresCompativeis
    .filter((fornecedor) => fornecedor.id !== form.fornecedor_id)
    .map((fornecedor) => ({
      value: fornecedor.id,
      label: fornecedor.nome,
      searchText: `${fornecedor.nome} ${fornecedor.cidade ?? ""} ${fornecedor.uf ?? ""}`,
    }));
  const bulkTableMinWidth =
    60 + bulkColumns.reduce((total, column) => total + (column.minWidth ?? 140), 0);
  const modalTitle = editando
    ? `Editar ${tipoMaterialMeta.singular.toLowerCase()} — ${editando.codigo}`
    : `Novo ${tipoMaterialMeta.singular.toLowerCase()}`;

  function getBulkSelectOptions(
    row: BulkRow,
    column: BulkColumn,
  ): ReturnType<typeof getOpcoesSelect> {
    switch (column.optionType) {
      case "aco":
        return getOpcoesSelect(opcoesMateriais.aco, row.lamina_aco);
      case "carimbo":
        return getOpcoesSelect(opcoesMateriais.carimbo, row.lamina_carimbo);
      case "bloco":
        return getOpcoesSelect(opcoesMateriais.bloco, row.bloco_tipo);
      case "bainha":
        return getOpcoesSelect(opcoesMateriais.bainha, row.bainha_modelo);
      case "botao":
        return getOpcoesSelect(opcoesMateriais.botao, row.bainha_botao);
      default:
        return [];
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={modalTitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {loadingReferencias && (
          <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
            Carregando fornecedores e listas configuráveis…
          </p>
        )}

        {!editando && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>
              Tipo de adição
            </span>
            <div
              className="inline-flex w-fit gap-1 rounded-xl p-1"
              style={{
                background: "var(--ac-bg)",
                border: "1px solid var(--ac-border)",
              }}
            >
              {[
                { key: "single" as const, label: "Adição única" },
                { key: "bulk" as const, label: "Adição em massa" },
              ].map((option) => {
                const active = modo === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setModo(option.key);
                      setErro("");
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-medium transition-all"
                    style={{
                      background: active ? "var(--ac-card)" : "transparent",
                      color: active ? "var(--ac-text)" : "var(--ac-muted)",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,.08)" : undefined,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {modo === "bulk" && (
              <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                O lote será criado no contexto de{" "}
                {labelTipoMaterial(tipoMaterialAtual).toLowerCase()}.
              </p>
            )}
          </div>
        )}

        {(editando || modo === "single") && (
          <>
            <div
              className="rounded-xl px-4 py-3"
              style={{ border: "1px solid var(--ac-border)", background: "var(--ac-bg)" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--ac-muted)" }}
              >
                Contexto do material
              </p>
              <h3 className="mt-1 text-base font-semibold" style={{ color: "var(--ac-text)" }}>
                {labelTipoMaterial(tipoMaterialAtual)}
              </h3>
              <p className="mt-1 text-sm" style={{ color: "var(--ac-muted)" }}>
                {tipoMaterialMeta.descricao}
              </p>
            </div>

            {!tipoFixo && !editando && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="tipo_material"
                  className="text-sm font-medium"
                  style={{ color: "var(--ac-text)" }}
                >
                  Tipo de material *
                </label>
                <SmartSelect
                  id="tipo_material"
                  value={form.tipo_material}
                  onChange={(value) => setTipoMaterial(value as TipoMaterial)}
                  options={[
                    { value: "lamina", label: "Lâminas" },
                    { value: "bloco", label: "Blocos" },
                    { value: "bainha", label: "Bainhas" },
                    { value: "latao", label: "Latão" },
                  ]}
                />
              </div>
            )}

            {tipoMaterialAtual === "lamina" && (
              <div
                className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
                style={{ border: "1px solid var(--ac-border)", background: "var(--ac-bg)" }}
              >
                <div className="sm:col-span-2 flex items-center justify-between gap-3">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Dados da lâmina
                  </p>
                  <ManageResourceLink
                    href="/configuracoes#opcoes-material-aco"
                    label="Gerenciar dados da lâmina"
                    onNavigate={onClose}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <SmartSelect
                    id="lamina_aco"
                    label="Aço"
                    value={form.lamina_aco}
                    onChange={(value) => set("lamina_aco", value)}
                    options={opcoesAco}
                    placeholder="Selecione um aço"
                    showThumbnails={false}
                  />
                  {opcoesAco.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                      Cadastre opções em{" "}
                      <Link href="/configuracoes#opcoes-material-aco" onClick={onClose}>
                        Configurações &gt; Aços
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
            )}

            {tipoMaterialAtual === "bloco" && (
              <div
                className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
                style={{ border: "1px solid var(--ac-border)", background: "var(--ac-bg)" }}
              >
                <div className="sm:col-span-2 flex items-center justify-between gap-3">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Dados do bloco
                  </p>
                  <ManageResourceLink
                    href="/configuracoes#opcoes-material-bloco"
                    label="Gerenciar dados do bloco"
                    onNavigate={onClose}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <SmartSelect
                    id="bloco_tipo"
                    label="Tipo"
                    value={form.bloco_tipo}
                    onChange={(value) => set("bloco_tipo", value)}
                    options={opcoesBloco}
                    placeholder="Selecione um tipo de bloco"
                    showThumbnails={false}
                  />
                  {opcoesBloco.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                      Cadastre opções em{" "}
                      <Link href="/configuracoes#opcoes-material-bloco" onClick={onClose}>
                        Configurações &gt; Blocos
                      </Link>
                      .
                    </p>
                  )}
                </div>
                <Input
                  id="bloco_cor"
                  label="Cor"
                  placeholder="Ex: Imbuia escuro"
                  value={form.bloco_cor}
                  onChange={(e) => set("bloco_cor", e.target.value)}
                />
              </div>
            )}

            {tipoMaterialAtual === "bainha" && (
              <div
                className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
                style={{ border: "1px solid var(--ac-border)", background: "var(--ac-bg)" }}
              >
                <div className="sm:col-span-3 flex items-center justify-between gap-3">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Dados da bainha
                  </p>
                  <ManageResourceLink
                    href="/configuracoes#opcoes-material-bainha"
                    label="Gerenciar dados da bainha"
                    onNavigate={onClose}
                  />
                </div>
                <Input
                  id="bainha_polegadas"
                  label="Polegadas"
                  placeholder='Ex: 8"'
                  value={form.bainha_polegadas}
                  onChange={(e) => set("bainha_polegadas", e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <SmartSelect
                    id="bainha_modelo"
                    label="Modelo"
                    value={form.bainha_modelo}
                    onChange={(value) => set("bainha_modelo", value)}
                    options={opcoesBainha}
                    placeholder="Selecione um modelo de bainha"
                    showThumbnails={false}
                  />
                  {opcoesBainha.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                      Cadastre opções em{" "}
                      <Link href="/configuracoes#opcoes-material-bainha" onClick={onClose}>
                        Configurações &gt; Bainhas
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="fornecedor"
                  className="text-sm font-medium"
                  style={{ color: "var(--ac-text)" }}
                >
                  Fornecedor preferencial
                </label>
                <ManageResourceLink
                  href="/fornecedores"
                  label="Gerenciar fornecedores"
                  onNavigate={onClose}
                />
              </div>
              <SmartSelect
                id="fornecedor"
                value={form.fornecedor_id}
                onChange={(value) => set("fornecedor_id", value)}
                options={opcoesFornecedor}
                placeholder="— Sem fornecedor —"
                showThumbnails={false}
              />
              <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                Esse fornecedor define o custo padrão usado pela matéria-prima.
              </p>
            </div>

            <Input
              id="sku"
              label="SKU *"
              disabled={loadingReferencias}
              placeholder="Ex: MP-0001"
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
            />
            <Input
              id="nome"
              label="Nome *"
              disabled={loadingReferencias}
              placeholder="Ex: Lâmina Aço Inox 420"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
            />

            <div className="grid grid-cols-3 gap-3">
              <Input
                id="preco_custo"
                label="Preço do preferencial (R$) *"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.preco_custo}
                onChange={(e) => set("preco_custo", e.target.value)}
              />
              <Input
                id="estoque_atual"
                label="Estoque Atual"
                type="number"
                min="0"
                step="0.001"
                value={form.estoque_atual}
                onChange={(e) => set("estoque_atual", e.target.value)}
              />
              <Input
                id="estoque_minimo"
                label="Estoque Mínimo"
                type="number"
                min="0"
                step="0.001"
                value={form.estoque_minimo}
                onChange={(e) => set("estoque_minimo", e.target.value)}
              />
            </div>

            <div
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ border: "1px solid var(--ac-border)", background: "var(--ac-bg)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Fornecedores adicionais
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--ac-muted)" }}>
                    Use a mesma SKU da matéria-prima e vincule outros fornecedores sem duplicar o
                    cadastro.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={addFornecedorExtra}>
                  Adicionar fornecedor
                </Button>
              </div>

              {fornecedoresExtras.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
                  Nenhum fornecedor adicional vinculado.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {fornecedoresExtras.map((row, index) => (
                    <div
                      key={row.id}
                      className="rounded-xl p-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_160px_minmax(0,1fr)_auto] gap-3 items-end"
                      style={{
                        border: "1px solid var(--ac-border)",
                        background: "var(--ac-card)",
                      }}
                    >
                      <SmartSelect
                        value={row.fornecedor_id}
                        onChange={(value) => setFornecedorExtra(row.id, "fornecedor_id", value)}
                        options={opcoesFornecedorExtra.filter(
                          (option) =>
                            option.value === row.fornecedor_id ||
                            !fornecedoresExtras.some(
                              (item) =>
                                item.id !== row.id && item.fornecedor_id === option.value,
                            ),
                        )}
                        placeholder={`Fornecedor adicional ${index + 1}`}
                        showThumbnails={false}
                      />
                      <Input
                        id={`fornecedor-extra-preco-${row.id}`}
                        label="Preço custo"
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.preco_custo}
                        onChange={(e) => setFornecedorExtra(row.id, "preco_custo", e.target.value)}
                      />
                      <Input
                        id={`fornecedor-extra-obs-${row.id}`}
                        label="Observação"
                        placeholder="Opcional"
                        value={row.observacao}
                        onChange={(e) => setFornecedorExtra(row.id, "observacao", e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeFornecedorExtra(row.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-start gap-3">
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  border: "1px solid var(--ac-border)",
                  background:
                    fotoPreview || fotoPreviewAtual
                      ? "transparent"
                      : "linear-gradient(135deg, rgba(250, 204, 21, 0.18), rgba(250, 204, 21, 0.06))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {(() => {
                  const src = fotoPreview || fotoPreviewAtual;
                  if (src) {
                    return (
                      <button
                        type="button"
                        onClick={() => openFotoLightbox(src)}
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                          padding: 0,
                          borderRadius: 12,
                          background: "transparent",
                          cursor: "zoom-in",
                        }}
                        aria-label="Expandir foto da matéria-prima"
                      >
                        <img
                          src={src}
                          alt="Foto da matéria-prima"
                          width={64}
                          height={64}
                          style={{ objectFit: "cover", borderRadius: 12 }}
                        />
                      </button>
                    );
                  }

                  return (
                    <img
                      src="/images/favicon-yellow.png"
                      alt="Sem foto"
                      width={28}
                      height={28}
                      style={{ objectFit: "contain" }}
                    />
                  );
                })()}
              </div>

              <div className="flex flex-col gap-1.5" style={{ flex: 1 }}>
                <label className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>
                  Foto (opcional)
                </label>

                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Arraste e solte uma imagem ou clique para selecionar"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFotoDragActive(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFotoDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFotoDragActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFotoDragActive(false);
                    const file = e.dataTransfer.files?.[0] ?? null;
                    setFotoFromFile(file);
                  }}
                  style={{
                    borderRadius: 14,
                    border: `2px dashed ${fotoDragActive ? "var(--ac-accent)" : "var(--ac-border)"}`,
                    background: fotoDragActive
                      ? "color-mix(in srgb, var(--ac-accent) 14%, transparent)"
                      : "var(--ac-card)",
                    padding: "14px 12px",
                    cursor: "pointer",
                    transition:
                      "transform 150ms ease, border-color 150ms ease, background 150ms ease, box-shadow 150ms ease",
                    transform: fotoDragActive ? "scale(1.01)" : "scale(1)",
                    boxShadow: fotoDragActive
                      ? "0 0 0 3px color-mix(in srgb, var(--ac-accent) 18%, transparent)"
                      : "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    gap: 8,
                    userSelect: "none",
                  }}
                  className="hover:scale-[1.01]"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setFotoFromFile(file);
                    }}
                  />

                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    className="size-5"
                    style={{ color: fotoDragActive ? "var(--ac-accent)" : "var(--ac-muted)" }}
                  >
                    <path d="M12 16V4" strokeLinecap="round" />
                    <path d="M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 16v4H4v-4" strokeLinecap="round" />
                  </svg>

                  <div className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    {fotoDragActive
                      ? "Solte a imagem aqui"
                      : "Arraste uma imagem aqui ou clique para selecionar"}
                  </div>

                  <div className="text-xs" style={{ color: "var(--ac-muted)" }}>
                    PNG, JPG ou WEBP. A imagem substitui a anterior.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {!editando && modo === "bulk" && (
          <>
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-muted)",
              }}
            >
              Preencha ou cole várias linhas no formato planilha. Linhas totalmente vazias serão
              ignoradas. Linhas incompletas, com SKU duplicado ou com fornecedor inválido serão
              bloqueadas antes de criar. Todas as linhas serão criadas como{" "}
              {labelTipoMaterial(tipoMaterialAtual).toLowerCase()}.
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs" style={{ color: "var(--ac-muted)" }}>
                Use o SKU desejado e, no fornecedor, o nome já cadastrado.
              </div>
              <Button type="button" variant="secondary" onClick={() => addBulkRows()}>
                Adicionar mais {BULK_ROWS_STEP} linhas
              </Button>
            </div>

            <div
              className="overflow-auto rounded-xl"
              style={{ border: "1px solid var(--ac-border)" }}
            >
              <table className="w-full text-sm" style={{ minWidth: bulkTableMinWidth }}>
                <thead>
                  <tr
                    style={{
                      background: "var(--ac-bg)",
                      borderBottom: "1px solid var(--ac-border)",
                    }}
                  >
                    <th
                      className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--ac-muted)", width: 60 }}
                    >
                      #
                    </th>
                    {bulkColumns.map((column) => (
                      <th
                        key={column.field}
                        className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--ac-muted)", minWidth: column.minWidth }}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, rowIndex) => {
                    const rowHasError = bulkErrorLineNumbers.includes(rowIndex + 1);
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderTop: rowIndex > 0 ? "1px solid var(--ac-border)" : undefined,
                          background: rowHasError ? "#fef2f2" : "var(--ac-card)",
                        }}
                      >
                        <td
                          className="px-3 py-2 text-center text-xs font-medium"
                          style={{ color: rowHasError ? "#dc2626" : "var(--ac-muted)" }}
                        >
                          {rowIndex + 1}
                        </td>
                        {bulkColumns.map((column, colIndex) => (
                          <td key={column.field} className="px-2 py-2 align-top">
                            {column.kind === "select" ? (
                              <select
                                value={row[column.field]}
                                onChange={(e) => setBulkCell(row.id, column.field, e.target.value)}
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData("text");
                                  if (applyBulkPaste(rowIndex, colIndex, text)) e.preventDefault();
                                }}
                                style={{
                                  ...cellSelectStyle,
                                  borderColor: rowHasError ? "#dc2626" : "var(--ac-border)",
                                  background: rowHasError ? "#fff7f7" : cellSelectStyle.background,
                                }}
                              >
                                <option value="">{column.placeholder}</option>
                                {getBulkSelectOptions(row, column).map((opcao) => (
                                  <option key={opcao.value} value={opcao.value}>
                                    {opcao.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={row[column.field]}
                                list={column.listId}
                                placeholder={column.placeholder}
                                inputMode={column.inputMode}
                                onChange={(e) => setBulkCell(row.id, column.field, e.target.value)}
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData("text");
                                  if (applyBulkPaste(rowIndex, colIndex, text)) e.preventDefault();
                                }}
                                style={{
                                  ...cellInputStyle,
                                  borderColor: rowHasError ? "#dc2626" : "var(--ac-border)",
                                  background: rowHasError ? "#fff7f7" : cellInputStyle.background,
                                }}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="mp-bulk-fornecedores">
              {fornecedoresCompativeis.map((fornecedor) => (
                <option key={fornecedor.id} value={fornecedor.nome} />
              ))}
            </datalist>
          </>
        )}

        {erro && (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{ color: "#dc2626", background: "#fee2e2", whiteSpace: "pre-line" }}
          >
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            {editando
              ? "Salvar alterações"
              : modo === "bulk"
                ? `Criar ${labelTipoMaterial(tipoMaterialAtual).toLowerCase()}`
                : `Criar ${tipoMaterialMeta.singular.toLowerCase()}`}
          </Button>
        </div>
      </form>

      <Modal
        open={fotoLightboxOpen}
        onClose={closeFotoLightbox}
        title="Foto da matéria-prima"
        width="520px"
      >
        <div className="flex flex-col gap-3">
          <div
            style={{
              width: "100%",
              border: "1px solid var(--ac-border)",
              borderRadius: 14,
              overflow: "hidden",
              background: "var(--ac-card)",
            }}
          >
            {fotoLightboxSrc ? (
              <img
                src={fotoLightboxSrc}
                alt="Foto da matéria-prima"
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            ) : null}
          </div>
          <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
            Clique fora ou use &quot;Fechar&quot; para voltar.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={closeFotoLightbox}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
