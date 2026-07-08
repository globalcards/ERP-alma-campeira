"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { labelTipoMaterial } from "@/lib/materiais/tipos";
import type { MateriaPrima, TipoMaterial } from "@/types";

export type BomItemDraft = {
  materia_prima_id: string;
  quantidade: string;
};

type Props = {
  onClose: () => void;
  materiasPrimas: MateriaPrima[];
  existingItems: BomItemDraft[];
  onConfirm: (items: BomItemDraft[]) => void;
};

type SortField = "nome" | "sku" | "estoque" | "preco_custo";
type SortDirection = "asc" | "desc";

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

function getGrupoNome(mp: MateriaPrima): string {
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

function getGrupoRotulo(tipoMaterial: TipoMaterial): string {
  if (tipoMaterial === "lamina") return "Aço";
  if (tipoMaterial === "cabo") return "Tipo";
  if (tipoMaterial === "bainha") return "Modelo";
  return "Lista";
}

export function MPSelectorModal({
  onClose,
  materiasPrimas,
  existingItems,
  onConfirm,
}: Props) {
  const [grupoAtual, setGrupoAtual] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("nome");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selecoesTemporarias, setSelecoesTemporarias] = useState<Record<string, { quantidade: string }>>(
    {},
  );
  const [erro, setErro] = useState("");

  const existentesPorId = useMemo(() => {
    const map = new Map<string, BomItemDraft>();
    for (const item of existingItems) {
      if (!item.materia_prima_id) continue;
      map.set(item.materia_prima_id, item);
    }
    return map;
  }, [existingItems]);

  const materiasPrimasOrdenadas = useMemo(
    () =>
      [...materiasPrimas].sort((a, b) => {
        const grupo = compareText(getGrupoNome(a), getGrupoNome(b));
        if (grupo !== 0) return grupo;
        const sku = compareText(a.sku, b.sku);
        if (sku !== 0) return sku;
        return compareText(a.nome, b.nome);
      }),
    [materiasPrimas],
  );

  const grupos = useMemo(() => {
    type GrupoResumo = {
      key: string;
      tipo: TipoMaterial;
      grupo: string;
      titulo: string;
      quantidade: number;
      novasSelecionadas: number;
      jaAdicionadas: number;
    };

    const counts = new Map<string, GrupoResumo>();

    for (const mp of materiasPrimasOrdenadas) {
      const grupo = getGrupoNome(mp);
      const rotuloGrupo = getGrupoRotulo(mp.tipo_material);
      const key = `${mp.tipo_material}::${grupo}`;
      const atual = counts.get(key) ?? {
        key,
        tipo: mp.tipo_material,
        grupo,
        titulo: `${labelTipoMaterial(mp.tipo_material)} · ${rotuloGrupo}: ${grupo}`,
        quantidade: 0,
        novasSelecionadas: 0,
        jaAdicionadas: 0,
      };
      atual.quantidade += 1;
      if (existentesPorId.has(mp.id)) atual.jaAdicionadas += 1;
      if (selecoesTemporarias[mp.id]) atual.novasSelecionadas += 1;
      counts.set(key, atual);
    }

    return Array.from(counts.values()).sort((a, b) => compareText(a.titulo, b.titulo));
  }, [existentesPorId, materiasPrimasOrdenadas, selecoesTemporarias]);

  const grupoAtualResumo = useMemo(
    () => grupos.find((grupo) => grupo.key === grupoAtual) ?? null,
    [grupos, grupoAtual],
  );

  const itensDoGrupo = useMemo(() => {
    if (!grupoAtualResumo) return [];
    const itens = materiasPrimasOrdenadas.filter(
      (mp) =>
        mp.tipo_material === grupoAtualResumo.tipo &&
        getGrupoNome(mp) === grupoAtualResumo.grupo,
    );
    const sorted = [...itens].sort((a, b) => {
      let primary = 0;
      switch (sortField) {
        case "nome":
          primary = compareText(a.nome, b.nome);
          break;
        case "sku":
          primary = compareText(a.sku, b.sku);
          break;
        case "estoque":
          primary = Number(a.estoque_atual) - Number(b.estoque_atual);
          break;
        case "preco_custo":
          primary = Number(a.preco_custo) - Number(b.preco_custo);
          break;
      }
      if (primary !== 0) return sortDirection === "asc" ? primary : -primary;

      const fallbackNome = compareText(a.nome, b.nome);
      if (fallbackNome !== 0) return fallbackNome;
      return compareText(a.sku, b.sku);
    });
    return sorted;
  }, [grupoAtualResumo, materiasPrimasOrdenadas, sortDirection, sortField]);

  const totalNovosSelecionados = Object.keys(selecoesTemporarias).length;

  function toggleSelecao(mp: MateriaPrima, checked: boolean) {
    if (existentesPorId.has(mp.id)) return;

    setSelecoesTemporarias((prev) => {
      const next = { ...prev };
      if (checked) {
        next[mp.id] = next[mp.id] ?? { quantidade: "1" };
      } else {
        delete next[mp.id];
      }
      return next;
    });
    setErro("");
  }

  function atualizarQuantidade(mpId: string, quantidade: string) {
    setSelecoesTemporarias((prev) => {
      if (!prev[mpId]) return prev;
      return {
        ...prev,
        [mpId]: { quantidade },
      };
    });
    setErro("");
  }

  function handleConfirm() {
    const novosItens = Object.entries(selecoesTemporarias).map(([materia_prima_id, item]) => ({
      materia_prima_id,
      quantidade: item.quantidade,
    }));

    for (const item of novosItens) {
      const quantidade = Number(item.quantidade);
      if (!item.quantidade || !Number.isFinite(quantidade) || quantidade <= 0) {
        setErro("Informe uma quantidade maior que 0 para todas as matérias-primas marcadas.");
        return;
      }
    }

    setErro("");
    onConfirm(novosItens);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  }

  function getSortIndicator(field: SortField): string {
    if (sortField !== field) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  }

  return (
    <Modal open onClose={onClose} title="Adicionar Matérias-Primas" width="980px">
      <div className="flex flex-col gap-4">
        <div
          className="rounded-xl p-3 flex items-center justify-between gap-3"
          style={{ border: "1px solid var(--ac-border)", background: "var(--ac-bg)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
              {grupoAtualResumo ? grupoAtualResumo.titulo : "Escolha um grupo"}
            </p>
            <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
              {totalNovosSelecionados === 0
                ? "Nenhuma nova matéria-prima selecionada."
                : `${totalNovosSelecionados} nova(s) matéria(s)-prima(s) pronta(s) para adicionar.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {grupoAtualResumo ? (
              <Button type="button" variant="secondary" onClick={() => setGrupoAtual(null)}>
                Voltar para grupos
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={totalNovosSelecionados === 0}
            >
              Salvar selecionadas
            </Button>
          </div>
        </div>

        {!grupoAtualResumo ? (
          grupos.length === 0 ? (
            <div
              className="rounded-xl px-4 py-8 text-center text-sm"
              style={{
                color: "var(--ac-muted)",
                border: "1px dashed var(--ac-border)",
                background: "var(--ac-bg)",
              }}
            >
              Nenhuma matéria-prima cadastrada para selecionar.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {grupos.map((grupo) => (
                <button
                  key={grupo.key}
                  type="button"
                  onClick={() => setGrupoAtual(grupo.key)}
                  className="rounded-xl p-4 text-left transition-all"
                  style={{
                    border: "1px solid var(--ac-border)",
                    background: "var(--ac-card)",
                    color: "var(--ac-text)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--ac-accent)";
                    e.currentTarget.style.background =
                      "color-mix(in srgb, var(--ac-accent) 6%, var(--ac-card))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--ac-border)";
                    e.currentTarget.style.background = "var(--ac-card)";
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{grupo.titulo}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--ac-muted)" }}>
                        {grupo.quantidade} item(ns) neste grupo
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold"
                      style={{
                        color: "var(--ac-accent)",
                        background: "color-mix(in srgb, var(--ac-accent) 12%, transparent)",
                      }}
                    >
                      Abrir
                    </span>
                  </div>
                  {(grupo.novasSelecionadas > 0 || grupo.jaAdicionadas > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {grupo.novasSelecionadas > 0 ? (
                        <span
                          className="rounded-full px-2 py-1"
                          style={{
                            color: "#0369a1",
                            background: "#e0f2fe",
                          }}
                        >
                          {grupo.novasSelecionadas} nova(s) marcada(s)
                        </span>
                      ) : null}
                      {grupo.jaAdicionadas > 0 ? (
                        <span
                          className="rounded-full px-2 py-1"
                          style={{
                            color: "var(--ac-muted)",
                            background: "var(--ac-bg)",
                            border: "1px solid var(--ac-border)",
                          }}
                        >
                          {grupo.jaAdicionadas} ja adicionada(s)
                        </span>
                      ) : null}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--ac-border)", background: "var(--ac-card)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--ac-bg)", borderBottom: "1px solid var(--ac-border)" }}>
                  <th className="px-4 py-3 text-left text-xs uppercase" style={{ color: "var(--ac-muted)" }}>
                    Marcar
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase" style={{ color: "var(--ac-muted)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("sku")}
                      className="inline-flex items-center gap-1 transition-colors"
                      style={{ color: sortField === "sku" ? "var(--ac-text)" : "inherit" }}
                    >
                      <span>SKU</span>
                      <span aria-hidden="true" className="text-[11px] leading-none">
                        {getSortIndicator("sku")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs uppercase" style={{ color: "var(--ac-muted)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("nome")}
                      className="inline-flex items-center gap-1 transition-colors"
                      style={{ color: sortField === "nome" ? "var(--ac-text)" : "inherit" }}
                    >
                      <span>Nome</span>
                      <span aria-hidden="true" className="text-[11px] leading-none">
                        {getSortIndicator("nome")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase" style={{ color: "var(--ac-muted)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("estoque")}
                      className="inline-flex items-center justify-end gap-1 transition-colors"
                      style={{ color: sortField === "estoque" ? "var(--ac-text)" : "inherit", width: "100%" }}
                    >
                      <span>Estoque</span>
                      <span aria-hidden="true" className="text-[11px] leading-none">
                        {getSortIndicator("estoque")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase" style={{ color: "var(--ac-muted)" }}>
                    <button
                      type="button"
                      onClick={() => toggleSort("preco_custo")}
                      className="inline-flex items-center justify-end gap-1 transition-colors"
                      style={{
                        color: sortField === "preco_custo" ? "var(--ac-text)" : "inherit",
                        width: "100%",
                      }}
                    >
                      <span>Preco custo</span>
                      <span aria-hidden="true" className="text-[11px] leading-none">
                        {getSortIndicator("preco_custo")}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs uppercase" style={{ color: "var(--ac-muted)" }}>
                    Quantidade
                  </th>
                </tr>
              </thead>
              <tbody>
                {itensDoGrupo.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm"
                      style={{ color: "var(--ac-muted)" }}
                    >
                      Nenhuma matéria-prima encontrada neste grupo.
                    </td>
                  </tr>
                ) : (
                  itensDoGrupo.map((mp, index) => {
                    const itemExistente = existentesPorId.get(mp.id);
                    const itemNovo = selecoesTemporarias[mp.id];
                    const checked = Boolean(itemExistente || itemNovo);
                    const bloqueado = Boolean(itemExistente);
                    const quantidade = itemExistente?.quantidade ?? itemNovo?.quantidade ?? "";

                    return (
                      <tr
                        key={mp.id}
                        style={{
                          borderTop: index > 0 ? "1px solid var(--ac-border)" : undefined,
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={bloqueado}
                              onChange={(e) => toggleSelecao(mp, e.target.checked)}
                            />
                            {bloqueado ? (
                              <span
                                className="rounded-full px-2 py-1 text-[11px]"
                                style={{
                                  color: "var(--ac-muted)",
                                  background: "var(--ac-bg)",
                                  border: "1px solid var(--ac-border)",
                                }}
                              >
                                Ja adicionada
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--ac-muted)" }}>
                          {mp.sku}
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--ac-text)" }}>
                          <div className="font-medium">{mp.nome}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--ac-text)" }}>
                          {Number(mp.estoque_atual).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--ac-text)" }}>
                          {Number(mp.preco_custo).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={quantidade}
                            disabled={!checked || bloqueado}
                            onChange={(e) => atualizarQuantidade(mp.id, e.target.value)}
                            className="w-24 rounded-lg px-2 py-2 text-sm text-right outline-none transition-all"
                            style={{
                              background: !checked || bloqueado ? "var(--ac-bg)" : "var(--ac-card)",
                              border: "1px solid var(--ac-border)",
                              color: !checked || bloqueado ? "var(--ac-muted)" : "var(--ac-text)",
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {erro ? (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ color: "#dc2626", background: "#fee2e2" }}
          >
            {erro}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
