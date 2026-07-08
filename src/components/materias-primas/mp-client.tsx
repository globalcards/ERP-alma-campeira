"use client";

import { useCallback, useMemo, useState } from "react";
import { labelTipoMaterial } from "@/lib/materiais/tipos";
import { BadgeEstoque } from "@/components/ui/badge-estoque";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MPModal } from "./mp-modal";
import {
  deletarMateriaPrima,
  getMPEditModalData,
  type MPEditModalData,
} from "@/lib/actions/materias-primas";
import type { MateriaPrima, StatusEstoque, TipoMaterial } from "@/types";
import { statusEstoque } from "@/types";
import { useErpTabs } from "@/components/layout/erp-tabs";
import { useMateriasPrimas } from "@/lib/query/hooks";
import { getOptimizedImageUrl } from "@/lib/images";

type Perm = { ver: boolean; criar: boolean; editar: boolean; deletar: boolean };

type Props = {
  materiasPrimas: MateriaPrima[];
  perm: Perm;
};

type ViewMode = "categorias" | "todos";
type SortField = "sku" | "nome" | "fornecedor" | "preco_custo" | "status";
type SortDirection = "asc" | "desc";
type SortAlign = "left" | "center" | "right";
type GrupoResumo = { nome: string; quantidade: number };
type TipoResumo = { tipo: TipoMaterial; quantidade: number };

const STATUS_SORT_ORDER: Record<StatusEstoque, number> = {
  critico: 0,
  atencao: 1,
  ok: 2,
};

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

function compareMateriaPrima(a: MateriaPrima, b: MateriaPrima, field: SortField): number {
  switch (field) {
    case "sku":
      return compareText(a.sku, b.sku);
    case "nome":
      return compareText(a.nome, b.nome);
    case "fornecedor":
      return compareText(a.fornecedor?.nome ?? "", b.fornecedor?.nome ?? "");
    case "preco_custo":
      return a.preco_custo - b.preco_custo;
    case "status":
      return STATUS_SORT_ORDER[statusEstoque(a)] - STATUS_SORT_ORDER[statusEstoque(b)];
    default:
      return 0;
  }
}

function getSortIndicator(active: boolean, direction: SortDirection): string {
  if (!active) return "↕";
  return direction === "asc" ? "↑" : "↓";
}

function getTipoSingular(tipoMaterial: TipoMaterial): string {
  switch (tipoMaterial) {
    case "lamina":
      return "Lâmina";
    case "cabo":
      return "Cabo";
    case "bainha":
      return "Bainha";
    case "latao":
      return "Latão";
    default:
      return "Material";
  }
}

function getTipoDescricao(tipoMaterial: TipoMaterial): string {
  switch (tipoMaterial) {
    case "lamina":
      return "Aço, carimbo e insumos usados nas lâminas.";
    case "cabo":
      return "Materiais de cabo com tipo, cor e acabamento.";
    case "bainha":
      return "Materiais usados em bainhas, com modelo e botão.";
    case "latao":
      return "Itens de latão usando o fluxo genérico de materiais.";
    default:
      return "Materiais gerais sem bloco específico.";
  }
}

function getAgrupamentoMeta(tipoMaterial: TipoMaterial): {
  labelSingular: string;
  labelPlural: string;
  fallback: string;
} {
  switch (tipoMaterial) {
    case "lamina":
      return {
        labelSingular: "Aço",
        labelPlural: "Aços",
        fallback: "Sem aço configurado",
      };
    case "cabo":
      return {
        labelSingular: "Tipo",
        labelPlural: "Tipos",
        fallback: "Sem tipo configurado",
      };
    case "bainha":
      return {
        labelSingular: "Modelo",
        labelPlural: "Modelos",
        fallback: "Sem modelo configurado",
      };
    default:
      return {
        labelSingular: "Item",
        labelPlural: "Lista",
        fallback: "Materiais de latão",
      };
  }
}

function getGrupoMateriaPrima(mp: MateriaPrima): string {
  if (mp.tipo_material === "lamina") {
    return mp.lamina?.aco?.trim() || "Sem aço configurado";
  }
  if (mp.tipo_material === "cabo") {
    return mp.cabo?.tipo?.trim() || "Sem tipo configurado";
  }
  if (mp.tipo_material === "bainha") {
    return mp.bainha?.modelo?.trim() || "Sem modelo configurado";
  }
  return "Materiais de latão";
}

function formatDetalhesTipo(mp: MateriaPrima): string {
  if (mp.tipo_material === "lamina") {
    return [mp.lamina?.aco, mp.lamina?.carimbo].filter(Boolean).join(" · ") || "—";
  }
  if (mp.tipo_material === "cabo") {
    return [mp.cabo?.tipo, mp.cabo?.cor].filter(Boolean).join(" · ") || "—";
  }
  if (mp.tipo_material === "bainha") {
    return (
      [mp.bainha?.polegadas, mp.bainha?.modelo, mp.bainha?.botao].filter(Boolean).join(" · ") || "—"
    );
  }
  return "—";
}

function getColunasEspecificas(tipoMaterial: TipoMaterial): Array<{
  key: string;
  label: string;
  value: (mp: MateriaPrima) => string;
}> {
  switch (tipoMaterial) {
    case "lamina":
      return [
        {
          key: "aco",
          label: "Aço",
          value: (mp) => mp.lamina?.aco?.trim() || "—",
        },
        {
          key: "carimbo",
          label: "Carimbo",
          value: (mp) => mp.lamina?.carimbo?.trim() || "—",
        },
      ];
    case "cabo":
      return [
        {
          key: "tipo",
          label: "Tipo",
          value: (mp) => mp.cabo?.tipo?.trim() || "—",
        },
        {
          key: "cor",
          label: "Cor",
          value: (mp) => mp.cabo?.cor?.trim() || "—",
        },
      ];
    case "bainha":
      return [
        {
          key: "polegadas",
          label: "Polegadas",
          value: (mp) => mp.bainha?.polegadas?.trim() || "—",
        },
        {
          key: "modelo",
          label: "Modelo",
          value: (mp) => mp.bainha?.modelo?.trim() || "—",
        },
        {
          key: "botao",
          label: "Botão",
          value: (mp) => mp.bainha?.botao?.trim() || "—",
        },
      ];
    default:
      return [];
  }
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onToggle,
  align = "left",
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggle: (field: SortField) => void;
  align?: SortAlign;
}) {
  const active = sortField === field;
  const justifyClass =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : "justify-start text-left";

  return (
    <th
      className={`px-4 py-3 font-semibold text-xs uppercase tracking-wide ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"}`}
      style={{ color: "var(--ac-muted)" }}
    >
      <button
        type="button"
        onClick={() => onToggle(field)}
        className={`inline-flex w-full items-center gap-1 transition-colors ${justifyClass}`}
        style={{ color: active ? "var(--ac-text)" : "inherit" }}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-[11px] leading-none">
          {getSortIndicator(active, sortDirection)}
        </span>
      </button>
    </th>
  );
}

function MPTabela({
  itens,
  busca,
  emptyMessage,
  tipoMaterialAtivo,
  perm,
  fotoUrlByMPId,
  sortField,
  sortDirection,
  onToggleSort,
  onOpenTab,
  onOpenEdit,
  onRequestDelete,
  onOpenPhoto,
}: {
  itens: MateriaPrima[];
  busca: string;
  emptyMessage: string;
  tipoMaterialAtivo: TipoMaterial;
  perm: Perm;
  fotoUrlByMPId: Map<string, string>;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggleSort: (field: SortField) => void;
  onOpenTab: (id: string) => void;
  onOpenEdit: (mp: MateriaPrima) => void;
  onRequestDelete: (mp: MateriaPrima) => void;
  onOpenPhoto: (mp: MateriaPrima, thumbFallback: string) => void;
}) {
  const colunasEspecificas = getColunasEspecificas(tipoMaterialAtivo);
  const totalColunas = 9 + colunasEspecificas.length;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--ac-border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--ac-bg)", borderBottom: "1px solid var(--ac-border)" }}>
            <th
              className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
              style={{ color: "var(--ac-muted)", width: 80 }}
            >
              Foto
            </th>
            <SortableHeader
              label="SKU"
              field="sku"
              sortField={sortField}
              sortDirection={sortDirection}
              onToggle={onToggleSort}
            />
            <SortableHeader
              label="Nome"
              field="nome"
              sortField={sortField}
              sortDirection={sortDirection}
              onToggle={onToggleSort}
            />
            <th
              className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              Detalhes
            </th>
            {colunasEspecificas.map((coluna) => (
              <th
                key={coluna.key}
                className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide"
                style={{ color: "var(--ac-muted)" }}
              >
                {coluna.label}
              </th>
            ))}
            <SortableHeader
              label="Fornecedor"
              field="fornecedor"
              sortField={sortField}
              sortDirection={sortDirection}
              onToggle={onToggleSort}
            />
            <SortableHeader
              label="Preço Custo"
              field="preco_custo"
              sortField={sortField}
              sortDirection={sortDirection}
              onToggle={onToggleSort}
              align="right"
            />
            <th
              className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              Estoque / Mín.
            </th>
            <SortableHeader
              label="Status"
              field="status"
              sortField={sortField}
              sortDirection={sortDirection}
              onToggle={onToggleSort}
              align="center"
            />
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && (
            <tr>
              <td
                colSpan={totalColunas}
                className="text-center py-12 text-sm"
                style={{ color: "var(--ac-muted)" }}
              >
                {busca ? "Nenhum resultado para essa busca." : emptyMessage}
              </td>
            </tr>
          )}
          {itens.map((mp, i) => {
            const status = statusEstoque(mp);
            const thumbUrl = fotoUrlByMPId.get(mp.id);

            return (
              <tr
                key={mp.id}
                style={{
                  borderTop: i > 0 ? "1px solid var(--ac-border)" : undefined,
                  background: "var(--ac-card)",
                  cursor: "pointer",
                }}
                onClick={() => onOpenTab(mp.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ac-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--ac-card)")}
              >
                <td className="px-4 py-3">
                  {thumbUrl ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPhoto(mp, thumbUrl);
                      }}
                      aria-label={`Expandir foto de ${mp.nome}`}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "zoom-in",
                        display: "block",
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={thumbUrl}
                        alt={mp.nome}
                        width={64}
                        height={64}
                        loading="lazy"
                        style={{
                          objectFit: "cover",
                          borderRadius: 8,
                          display: "block",
                          border: "1px solid var(--ac-border)",
                        }}
                      />
                    </button>
                  ) : (
                    <div
                      aria-label={`Sem foto para ${mp.nome}`}
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 8,
                        border: "1px solid var(--ac-border)",
                        background:
                          "linear-gradient(135deg, rgba(250, 204, 21, 0.18), rgba(250, 204, 21, 0.06))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <img
                        src="/images/favicon-yellow.png"
                        alt="Sem foto"
                        width={28}
                        height={28}
                        style={{ objectFit: "contain" }}
                      />
                    </div>
                  )}
                </td>
                <td
                  className="px-4 py-3 font-mono text-xs font-medium"
                  style={{ color: "var(--ac-muted)" }}
                >
                  <div>{mp.sku}</div>
                </td>
                <td className="px-4 py-3 font-medium" style={{ color: "var(--ac-text)" }}>
                  {mp.nome}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--ac-muted)" }}>
                  {formatDetalhesTipo(mp)}
                </td>
                {colunasEspecificas.map((coluna) => (
                  <td
                    key={coluna.key}
                    className="px-4 py-3 text-xs"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    {coluna.value(mp)}
                  </td>
                ))}
                <td className="px-4 py-3" style={{ color: "var(--ac-muted)" }}>
                  {mp.fornecedor?.nome ?? "—"}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  style={{ color: "var(--ac-text)" }}
                >
                  {mp.preco_custo.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </td>
                <td
                  className="px-4 py-3 text-right tabular-nums"
                  style={{ color: "var(--ac-text)" }}
                >
                  <span className="font-semibold">
                    {Number(mp.estoque_atual).toLocaleString("pt-BR")}
                  </span>
                  <span className="mx-1 font-normal" style={{ color: "var(--ac-border)" }}>
                    /
                  </span>
                  <span style={{ color: "var(--ac-muted)" }}>
                    {Number(mp.estoque_minimo).toLocaleString("pt-BR")}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <BadgeEstoque status={status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {perm.editar && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEdit(mp);
                        }}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--ac-muted)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--ac-border)";
                          e.currentTarget.style.color = "var(--ac-text)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--ac-muted)";
                        }}
                        title="Editar"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          className="size-4"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                    {perm.deletar && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestDelete(mp);
                        }}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--ac-muted)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#fee2e2";
                          e.currentTarget.style.color = "#dc2626";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--ac-muted)";
                        }}
                        title="Excluir"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          className="size-4"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MPClient({ materiasPrimas: initialMP, perm }: Props) {
  const { refreshActiveTab, openTab } = useErpTabs();
  const { data: materiasPrimas = initialMP } = useMateriasPrimas({ initialData: initialMP });
  const [modalData, setModalData] = useState<Partial<Record<TipoMaterial, MPEditModalData>>>({});
  const [loadingModalData, setLoadingModalData] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<MateriaPrima | null>(null);
  const [deletando, setDeletando] = useState<MateriaPrima | null>(null);
  const [erroDelete, setErroDelete] = useState("");
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [busca, setBusca] = useState("");
  const [fotoLightboxSrc, setFotoLightboxSrc] = useState<string>("");
  const [fotoLightboxAlt, setFotoLightboxAlt] = useState<string>("");
  const [selectedTipoMaterial, setSelectedTipoMaterial] = useState<TipoMaterial>(() => {
    return (
      (["lamina", "cabo", "bainha", "latao"] as const).find((tipo) =>
        initialMP.some((mp) => mp.tipo_material === tipo),
      ) ?? "lamina"
    );
  });
  const [viewMode, setViewMode] = useState<ViewMode>("categorias");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("sku");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const tipos = useMemo<TipoResumo[]>(() => {
    const ordem: TipoMaterial[] = ["lamina", "cabo", "bainha", "latao"];
    const counts = new Map<TipoMaterial, number>();
    for (const tipo of ordem) counts.set(tipo, 0);
    for (const mp of materiasPrimas) {
      counts.set(mp.tipo_material, (counts.get(mp.tipo_material) ?? 0) + 1);
    }
    return ordem.map((tipo) => ({ tipo, quantidade: counts.get(tipo) ?? 0 }));
  }, [materiasPrimas]);

  const tipoMaterialAtivo = tipos.some((tipo) => tipo.tipo === selectedTipoMaterial)
    ? selectedTipoMaterial
    : (tipos[0]?.tipo ?? "lamina");

  const materiaisDoTipo = useMemo(
    () => materiasPrimas.filter((mp) => mp.tipo_material === tipoMaterialAtivo),
    [materiasPrimas, tipoMaterialAtivo],
  );

  const agrupamentoMeta = useMemo(() => getAgrupamentoMeta(tipoMaterialAtivo), [tipoMaterialAtivo]);
  const agrupaPorContexto = tipoMaterialAtivo !== "latao";

  const grupos = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mp of materiaisDoTipo) {
      const grupo = getGrupoMateriaPrima(mp);
      counts.set(grupo, (counts.get(grupo) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => compareText(a.nome, b.nome));
  }, [materiaisDoTipo]);

  const fotoUrlByMPId = useMemo(() => {
    const map = new Map<string, string>();
    for (const mp of materiaisDoTipo) {
      if (!mp.foto_url) continue;
      map.set(
        mp.id,
        getOptimizedImageUrl(mp.foto_url, {
          width: 64,
          height: 64,
          quality: 65,
        }),
      );
    }
    return map;
  }, [materiaisDoTipo]);

  const activeSelectedGroup =
    agrupaPorContexto &&
    selectedGroup &&
    materiaisDoTipo.some((mp) => getGrupoMateriaPrima(mp) === selectedGroup)
      ? selectedGroup
      : null;

  const buscaHabilitada =
    !agrupaPorContexto || viewMode === "todos" || activeSelectedGroup !== null;

  const itensVisiveis = useMemo(() => {
    const base =
      agrupaPorContexto && viewMode === "categorias" && activeSelectedGroup
        ? materiaisDoTipo.filter((mp) => getGrupoMateriaPrima(mp) === activeSelectedGroup)
        : materiaisDoTipo;

    if (!busca.trim()) return base;

    const q = busca.toLowerCase();
    return base.filter(
      (mp) =>
        mp.nome.toLowerCase().includes(q) ||
        mp.sku.toLowerCase().includes(q) ||
        mp.fornecedor?.nome?.toLowerCase().includes(q) ||
        formatDetalhesTipo(mp).toLowerCase().includes(q),
    );
  }, [materiaisDoTipo, busca, activeSelectedGroup, viewMode, agrupaPorContexto]);

  const itensOrdenados = useMemo(() => {
    const sorted = [...itensVisiveis].sort((a, b) => {
      const primary = compareMateriaPrima(a, b, sortField);
      if (primary !== 0) return sortDirection === "asc" ? primary : -primary;
      return compareText(a.sku, b.sku);
    });

    return sorted;
  }, [itensVisiveis, sortDirection, sortField]);

  const grupoSelecionadoResumo = useMemo<GrupoResumo | null>(() => {
    if (!activeSelectedGroup) return null;
    return grupos.find((grupo) => grupo.nome === activeSelectedGroup) ?? null;
  }, [grupos, activeSelectedGroup]);

  const carregarDadosModal = useCallback(
    async (tipoMaterial: TipoMaterial) => {
      const cached = modalData[tipoMaterial];
      if (cached) return cached;
      setLoadingModalData(true);
      try {
        const data = await getMPEditModalData(tipoMaterial);
        setModalData((current) => ({ ...current, [tipoMaterial]: data }));
        return data;
      } finally {
        setLoadingModalData(false);
      }
    },
    [modalData],
  );

  const abrirNovo = useCallback(async () => {
    setEditando(null);
    setModalAberto(true);
    void carregarDadosModal(tipoMaterialAtivo);
  }, [carregarDadosModal, tipoMaterialAtivo]);

  const abrirEditar = useCallback(
    async (mp: MateriaPrima) => {
      setEditando(mp);
      setModalAberto(true);
      void carregarDadosModal(mp.tipo_material);
    },
    [carregarDadosModal],
  );

  const abrirFotoLightbox = useCallback((mp: MateriaPrima, thumbFallback: string) => {
    if (!mp.foto_url) return;
    const srcGrande = getOptimizedImageUrl(mp.foto_url, {
      width: 520,
      height: 520,
      quality: 80,
      resize: "contain",
    });
    setFotoLightboxSrc(srcGrande || thumbFallback);
    setFotoLightboxAlt(mp.nome);
  }, []);

  const selecionarModo = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSelectedGroup(null);
  }, []);

  const selecionarTipoMaterial = useCallback((tipoMaterial: TipoMaterial) => {
    setSelectedTipoMaterial(tipoMaterial);
    setViewMode(tipoMaterial === "latao" ? "todos" : "categorias");
    setSelectedGroup(null);
    setBusca("");
    setEditando(null);
  }, []);

  const selecionarGrupo = useCallback((grupo: string) => {
    setViewMode("categorias");
    setSelectedGroup(grupo);
  }, []);

  const voltarParaCategorias = useCallback(() => {
    setSelectedGroup(null);
  }, []);

  const alternarOrdenacao = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((currentDirection) => (currentDirection === "asc" ? "desc" : "asc"));
        return;
      }

      setSortField(field);
      setSortDirection("asc");
    },
    [sortField],
  );

  async function confirmarDelete() {
    if (!deletando) return;
    setErroDelete("");
    setLoadingDelete(true);
    try {
      await deletarMateriaPrima(deletando.id);
      setDeletando(null);
      refreshActiveTab();
    } catch (e: unknown) {
      setErroDelete(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setLoadingDelete(false);
    }
  }

  const emptyMessage =
    viewMode === "categorias" && activeSelectedGroup
      ? `Nenhum item encontrado em ${activeSelectedGroup}.`
      : `Nenhum item cadastrado em ${labelTipoMaterial(tipoMaterialAtivo)}.`;

  const tipoSelecionadoResumo =
    tipos.find((tipo) => tipo.tipo === tipoMaterialAtivo) ??
    ({ tipo: tipoMaterialAtivo, quantidade: materiaisDoTipo.length } as TipoResumo);
  const tipoModalAtual = editando?.tipo_material ?? tipoMaterialAtivo;
  const modalDataAtual = modalData[tipoModalAtual];
  const tipoSingular = getTipoSingular(tipoMaterialAtivo);

  return (
    <>
      <div
        className="flex items-center justify-between px-8 py-6"
        style={{ borderBottom: "1px solid var(--ac-border)" }}
      >
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--ac-text)" }}>
            {labelTipoMaterial(tipoMaterialAtivo)}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--ac-muted)" }}>
            {tipoSelecionadoResumo.quantidade}{" "}
            {tipoSelecionadoResumo.quantidade === 1 ? "item cadastrado" : "itens cadastrados"} neste
            contexto
          </p>
        </div>
        {perm.criar && (
          <Button onClick={abrirNovo}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="size-4"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Novo {tipoSingular.toLowerCase()}
          </Button>
        )}
      </div>

      <div className="px-8 py-4 flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tipos.map((tipo) => {
            const ativo = tipo.tipo === tipoMaterialAtivo;
            return (
              <button
                key={tipo.tipo}
                type="button"
                onClick={() => selecionarTipoMaterial(tipo.tipo)}
                className="rounded-2xl px-5 py-4 text-left transition-all cursor-pointer"
                style={{
                  background: ativo ? "var(--ac-bg)" : "var(--ac-card)",
                  border: `1px solid ${ativo ? "var(--ac-accent)" : "var(--ac-border)"}`,
                  boxShadow: ativo
                    ? "0 0 0 2px color-mix(in srgb, var(--ac-accent) 18%, transparent)"
                    : "none",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--ac-muted)" }}
                    >
                      Tipo de material
                    </p>
                    <h3 className="mt-1 text-lg font-semibold" style={{ color: "var(--ac-text)" }}>
                      {labelTipoMaterial(tipo.tipo)}
                    </h3>
                  </div>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{
                      background: "var(--ac-card)",
                      color: "var(--ac-text)",
                      border: "1px solid var(--ac-border)",
                    }}
                  >
                    {tipo.quantidade}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none"
              style={{ color: "var(--ac-muted)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={
                buscaHabilitada
                  ? `Buscar em ${labelTipoMaterial(tipoMaterialAtivo).toLowerCase()} por nome, código, SKU ou fornecedor...`
                  : `Selecione um ${agrupamentoMeta.labelSingular.toLowerCase()} ou use Todos para buscar...`
              }
              value={busca}
              disabled={!buscaHabilitada}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all disabled:cursor-not-allowed"
              style={{
                background: "var(--ac-card)",
                border: "1px solid var(--ac-border)",
                color: "var(--ac-text)",
                opacity: buscaHabilitada ? 1 : 0.65,
              }}
              onFocus={(e) => {
                if (!buscaHabilitada) return;
                e.currentTarget.style.borderColor = "var(--ac-accent)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px color-mix(in srgb, var(--ac-accent) 20%, transparent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--ac-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {agrupaPorContexto ? (
            <div
              className="inline-flex rounded-xl p-1"
              style={{ background: "var(--ac-bg)", border: "1px solid var(--ac-border)" }}
            >
              {(["categorias", "todos"] as const).map((mode) => {
                const active = viewMode === mode;
                const label = mode === "categorias" ? agrupamentoMeta.labelPlural : "Todos";
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => selecionarModo(mode)}
                    className="px-4 py-2 cursor-pointer rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: active ? "var(--ac-card)" : "transparent",
                      color: active ? "var(--ac-text)" : "var(--ac-muted)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {agrupaPorContexto && viewMode === "categorias" && activeSelectedGroup && (
          <div
            className="flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            style={{ background: "var(--ac-bg)", border: "1px solid var(--ac-border)" }}
          >
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ac-muted)" }}>
              <span>{labelTipoMaterial(tipoMaterialAtivo)}</span>
              <span>/</span>
              <button
                type="button"
                onClick={voltarParaCategorias}
                className="font-medium transition-colors cursor-pointer"
                style={{ color: "var(--ac-muted)" }}
              >
                {agrupamentoMeta.labelPlural}
              </button>
              <span>/</span>
              <span className="font-semibold" style={{ color: "var(--ac-text)" }}>
                {activeSelectedGroup}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: "var(--ac-muted)" }}>
                {grupoSelecionadoResumo?.quantidade ?? itensOrdenados.length} item
                {(grupoSelecionadoResumo?.quantidade ?? itensOrdenados.length) === 1 ? "" : "s"}
              </span>
              <Button variant="secondary" onClick={voltarParaCategorias}>
                Voltar para {agrupamentoMeta.labelPlural.toLowerCase()}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="px-8 pb-8">
        {agrupaPorContexto && viewMode === "categorias" && !activeSelectedGroup ? (
          grupos.length === 0 ? (
            <div
              className="rounded-xl px-6 py-12 text-center text-sm"
              style={{ border: "1px solid var(--ac-border)", color: "var(--ac-muted)" }}
            >
              Nenhum {agrupamentoMeta.labelPlural.toLowerCase()} disponível em{" "}
              {labelTipoMaterial(tipoMaterialAtivo).toLowerCase()}.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {grupos.map((grupo) => (
                <button
                  key={grupo.nome}
                  type="button"
                  onClick={() => selecionarGrupo(grupo.nome)}
                  className="rounded-2xl px-5 py-4 text-left transition-all cursor-pointer"
                  style={{
                    background: "var(--ac-card)",
                    border: "1px solid var(--ac-border)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--ac-accent)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--ac-border)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--ac-muted)" }}
                      >
                        {agrupamentoMeta.labelSingular}
                      </p>
                      <h3
                        className="mt-1 text-lg font-semibold"
                        style={{ color: "var(--ac-text)" }}
                      >
                        {grupo.nome}
                      </h3>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{
                        background: "var(--ac-bg)",
                        color: "var(--ac-text)",
                        border: "1px solid var(--ac-border)",
                      }}
                    >
                      {grupo.quantidade}
                    </span>
                  </div>
                  <p className="mt-4 text-sm" style={{ color: "var(--ac-muted)" }}>
                    Abrir {labelTipoMaterial(tipoMaterialAtivo).toLowerCase()} deste{" "}
                    {agrupamentoMeta.labelSingular.toLowerCase()}
                  </p>
                </button>
              ))}
            </div>
          )
        ) : (
          <MPTabela
            itens={itensOrdenados}
            busca={busca}
            emptyMessage={emptyMessage}
            tipoMaterialAtivo={tipoMaterialAtivo}
            perm={perm}
            fotoUrlByMPId={fotoUrlByMPId}
            sortField={sortField}
            sortDirection={sortDirection}
            onToggleSort={alternarOrdenacao}
            onOpenTab={(id) => openTab(`/materias-primas/${id}`)}
            onOpenEdit={abrirEditar}
            onRequestDelete={(mp) => {
              setDeletando(mp);
              setErroDelete("");
            }}
            onOpenPhoto={abrirFotoLightbox}
          />
        )}
      </div>

      {/* Modal CRUD — referências carregam sob demanda */}
      <MPModal
        key={`${tipoModalAtual}-${editando?.id ?? (modalAberto ? "novo" : "fechado")}`}
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        fornecedores={modalDataAtual?.fornecedores ?? []}
        opcoesMateriais={
          modalDataAtual?.opcoesMateriais ?? {
            aco: [],
            cabo: [],
            botao: [],
            carimbo: [],
            bainha: [],
          }
        }
        loadingReferencias={loadingModalData && !modalDataAtual}
        editando={editando}
        tipoMaterialContext={tipoModalAtual}
        onSaved={refreshActiveTab}
      />

      {/* Modal de confirmação de delete */}
      <Modal open={!!deletando} onClose={() => setDeletando(null)} title="Excluir matéria-prima">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--ac-text)" }}>
            Tem certeza que deseja excluir <strong>{deletando?.nome}</strong>? Esta ação não pode
            ser desfeita.
          </p>
          {erroDelete && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ color: "#dc2626", background: "#fee2e2" }}
            >
              {erroDelete}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeletando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={loadingDelete} onClick={confirmarDelete}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lightbox de foto */}
      <Modal
        open={!!fotoLightboxSrc}
        onClose={() => {
          setFotoLightboxSrc("");
          setFotoLightboxAlt("");
        }}
        title={`Foto — ${fotoLightboxAlt}`}
        width="520px"
      >
        <div
          style={{
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--ac-border)",
            background: "var(--ac-card)",
          }}
        >
          <img
            src={fotoLightboxSrc}
            alt={`Foto de ${fotoLightboxAlt}`}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      </Modal>
    </>
  );
}
