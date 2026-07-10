"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SmartSelect } from "@/components/ui/smart-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { labelTipoMaterial } from "@/lib/materiais/tipos";
import {
  getFilaReposicaoList,
  getFilaReposicaoDetalhe,
  getOrdensCompra,
  criarOrdemCompraManual,
  criarItemOrdemCompra,
  salvarAlteracoesOC,
  deletarOC,
} from "@/lib/actions/ordens-compra";
import { getOpcoesMaterialPorTipo } from "@/lib/actions/opcoes-materiais";
import { getFornecedoresSemCache } from "@/lib/actions/fornecedores";
import { STATUS_OC, FORMAS_PAGAMENTO_OC, TIPOS_MATERIAL } from "@/types";
import type {
  FilaReposicao,
  FilaReposicaoDetalhe,
  Fornecedor,
  MateriaPrima,
  OpcoesMateriaisPorTipo,
  OrdemCompra,
  OrdemCompraItem,
  StatusOC,
  FormaPagamentoOC,
  TipoMaterial,
} from "@/types";
import { criarBoleto, type ParcelaInput } from "@/lib/actions/boletos";
import { DateInputBR } from "@/components/ui/date-input-br";
import { useErpTabs } from "@/components/layout/erp-tabs";
import { useOrdensCompra, useFilaReposicao, useUsuariosParaRegistroOC } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { getMatériasPrimas as getMateriasPrimas } from "@/lib/actions/materias-primas";
import { getOptimizedImageUrl } from "@/lib/images";
import { FilaReposicaoDetalheModal } from "@/components/ordens-compra/fila-reposicao-detalhe";
import { formatarDocumento } from "@/lib/br/documento";

type Perm = { ver: boolean; criar: boolean; editar: boolean; deletar: boolean };

type FiltroListaOC = "todas" | StatusOC | "pagas";
type ModoExportacaoOc = "producao" | "fornecedor";

type Props = {
  fila: FilaReposicao[];
  ordens: OrdemCompra[];
  perm: Perm;
  /** perfil usuarios_perfis.id do login — pré-selecionado no registro de alterações */
  usuarioLogadoId: string | null;
  /** usuários ativos para o select "Quem registra a alteração" — pré-buscado no server */
  usuariosRegistroInicial?: { id: string; nome: string }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(s: string) {
  if (!s) return "";
  const [y, m, d] = s.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function fmtDataHora(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtQtd(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function normalizarAgrupadorMaterial(valor: string | null | undefined) {
  return (valor ?? "").trim().toLocaleLowerCase("pt-BR");
}

function normalizarTextoBusca(valor: string) {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function getOpcoesSelectOc(
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
    { value, label: `${value} (inativo)`, searchText: value },
    ...options.filter((item) => item.ativo).map((item) => ({ value: item.nome, label: item.nome })),
  ];
}

function obterAgrupadorMaterial(mp: MateriaPrima): string {
  if (mp.tipo_material === "lamina") return mp.lamina?.aco?.trim() || "Sem aço configurado";
  if (mp.tipo_material === "bloco") return mp.bloco?.tipo?.trim() || "Sem tipo configurado";
  if (mp.tipo_material === "bainha") return mp.bainha?.modelo?.trim() || "Sem modelo configurado";
  return "Materiais de latão";
}

function obterRotuloAgrupador(tipoMaterial: TipoMaterial | ""): string {
  if (tipoMaterial === "lamina") return "Aço";
  if (tipoMaterial === "bloco") return "Tipo";
  if (tipoMaterial === "bainha") return "Modelo";
  return "Lista";
}

function fornecedorCompativelComTipo(
  fornecedor: Pick<Fornecedor, "tipos_materiais"> | null | undefined,
  tipoMaterial: TipoMaterial | "",
) {
  if (!tipoMaterial) return true;
  const tipos = fornecedor?.tipos_materiais ?? [];
  return tipos.length === 0 || tipos.includes(tipoMaterial);
}

type ColunaEspecificaMaterial = {
  key: string;
  label: string;
  value: (mp: OrdemCompraItem["materia_prima"] | MateriaPrima | null | undefined) => string;
};

function getColunasEspecificasMaterial(
  tipoMaterial: TipoMaterial | "" | null,
): ColunaEspecificaMaterial[] {
  switch (tipoMaterial) {
    case "lamina":
      return [{ key: "aco", label: "Aço", value: (mp) => mp?.lamina?.aco?.trim() || "—" }];
    case "bloco":
      return [
        { key: "tipo", label: "Tipo", value: (mp) => mp?.bloco?.tipo?.trim() || "—" },
        { key: "cor", label: "Cor", value: (mp) => mp?.bloco?.cor?.trim() || "—" },
      ];
    case "bainha":
      return [
        {
          key: "polegadas",
          label: "Polegadas",
          value: (mp) => mp?.bainha?.polegadas?.trim() || "—",
        },
        { key: "modelo", label: "Modelo", value: (mp) => mp?.bainha?.modelo?.trim() || "—" },
      ];
    default:
      return [];
  }
}

function formatResumoMaterialOpcao(mp: OrdemCompraItem["materia_prima"] | MateriaPrima): string {
  if (!mp) return "—";
  const base = [`SKU: ${mp.sku || "—"}`];
  const colunas = getColunasEspecificasMaterial(mp.tipo_material);
  for (const coluna of colunas) {
    const valor = coluna.value(mp);
    if (valor !== "—") {
      base.push(`${coluna.label}: ${valor}`);
    }
  }
  return base.join(" · ");
}

function getResumoFornecedorItem(
  item: Pick<OrdemCompraItem, "carimbo_fornecedor" | "botao_fornecedor">,
) {
  const partes = [
    item.carimbo_fornecedor ? `Carimbo: ${item.carimbo_fornecedor}` : null,
    item.botao_fornecedor ? `Botão: ${item.botao_fornecedor}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

function subtotalOC(itens: OrdemCompraItem[]) {
  return itens.reduce((s, i) => s + (i.preco_unitario ?? 0) * i.quantidade, 0);
}

function clampPercentualDesconto(percentual: number) {
  if (!Number.isFinite(percentual)) return 0;
  return Math.max(0, Math.min(100, percentual));
}

function calcularDescontoPercentual(subtotal: number, percentual: number) {
  const percentualNormalizado = clampPercentualDesconto(percentual);
  if (subtotal <= 0 || percentualNormalizado <= 0) return 0;
  return Math.min(subtotal, Math.round(subtotal * percentualNormalizado * 100) / 10000);
}

function calcularTotalFinalOC(subtotal: number, descontoTotal: number) {
  return Math.max(0, subtotal - descontoTotal);
}

function percentualPorDesconto(subtotal: number, descontoTotal: number) {
  if (subtotal <= 0 || descontoTotal <= 0) return 0;
  return clampPercentualDesconto((descontoTotal / subtotal) * 100);
}

function fmtPercentual(percentual: number) {
  return percentual.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

async function carregarLogoLetreiroDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch("/images/letreiro.png");
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function labelFormaPagamentoOc(formaPagamento: FormaPagamentoOC | null | undefined) {
  if (!formaPagamento) return "Não informado";
  return FORMAS_PAGAMENTO_OC[formaPagamento]?.label ?? formaPagamento;
}

function htmlDocumentoOc(titulo: string, conteudo: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(titulo)}</title>
  <style>
    :root {
      --ink: #111827;
      --muted: #6b7280;
      --line: #d1d5db;
      --line-strong: #9ca3af;
      --surface: #ffffff;
      --surface-soft: #f9fafb;
      --accent: #0f172a;
      --accent-soft: #e5e7eb;
      --success: #166534;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: var(--ink); }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .oc-page {
      width: 100%;
      padding: 26px 28px 20px;
      page-break-after: always;
    }
    .oc-page:last-child { page-break-after: auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 18px;
      margin-bottom: 18px;
      padding-bottom: 18px;
      border-bottom: 2px solid var(--accent);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      flex: 1;
    }
    .brand img {
      height: 48px;
      width: auto;
      object-fit: contain;
      flex: 0 0 auto;
    }
    .brand-copy { min-width: 0; }
    .brand-name {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    h1 {
      font-size: 26px;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin-bottom: 2px;
    }
    .subtitle {
      color: var(--muted);
      font-size: 11px;
    }
    .document-card {
      width: 220px;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px;
      flex: 0 0 auto;
    }
    .document-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .document-id {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.1;
      margin-bottom: 10px;
    }
    .document-date {
      font-size: 11px;
      color: var(--muted);
    }
    .info-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 14px;
      margin-bottom: 16px;
    }
    .info-card,
    .section,
    .notes-box,
    .totals-box {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      overflow: hidden;
      break-inside: avoid;
    }
    .info-card {
      padding: 14px 16px;
    }
    .info-card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 12px;
      font-weight: 700;
    }
    .meta-list {
      display: grid;
      gap: 8px;
    }
    .meta-row {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      font-size: 11px;
    }
    .meta-term {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .meta-value {
      color: var(--ink);
      word-break: break-word;
    }
    .supplier-name {
      font-size: 18px;
      line-height: 1.2;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .section {
      margin-bottom: 16px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: var(--surface-soft);
      border-bottom: 1px solid var(--line);
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .section-mode {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .table-wrap { padding: 4px 0 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      padding: 10px 14px;
      vertical-align: top;
      border-bottom: 1px solid var(--line);
    }
    th {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      background: #f8fafc;
      text-align: left;
    }
    th.numeric, td.numeric { text-align: right; }
    tbody tr:nth-child(even) td { background: #fcfcfd; }
    .col-code { width: 100px; }
    .col-item { width: auto; }
    .col-qty { width: 72px; }
    .col-unit { width: 118px; }
    .col-subtotal { width: 132px; }
    .item-name {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 2px;
      word-break: break-word;
    }
    .item-meta {
      font-size: 11px;
      color: var(--muted);
    }
    .item-empty {
      color: var(--muted);
      font-style: italic;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.9fr);
      gap: 14px;
      align-items: stretch;
      margin-bottom: 16px;
    }
    .notes-box,
    .totals-box {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 14px 16px;
    }
    .notes-box { min-height: 96px; }
    .box-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 10px;
      font-weight: 700;
    }
    .notes-content {
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--ink);
      flex: 1;
    }
    .notes-empty {
      color: var(--muted);
      font-style: italic;
      flex: 1;
    }
    .totals-box {
      background: var(--surface-soft);
    }
    .totals-row,
    .totals-total {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .totals-row {
      padding: 7px 0;
      color: var(--ink);
    }
    .totals-row + .totals-row {
      border-top: 1px solid rgba(196, 202, 212, 0.75);
    }
    .totals-row.discount {
      color: #b45309;
    }
    .totals-total {
      margin-top: 10px;
      padding-top: 12px;
      border-top: 2px solid var(--line-strong);
      font-weight: 700;
      font-size: 16px;
    }
    .totals-total .amount {
      color: var(--success);
      font-size: 18px;
    }
    .document-footer {
      margin-top: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 10px;
      color: var(--muted);
    }
    @page { margin: 12mm; }
    @media print {
      body { padding: 0; }
      .oc-page { padding: 0; }
    }
  </style>
</head>
<body>
  ${conteudo}
  <script>window.onload = () => { window.print() }</script>
</body>
</html>`;
}

function labelModoExportacaoOc(modo: ModoExportacaoOc) {
  return modo === "producao" ? "Produção" : "Fornecedor";
}

function formatarTelefoneOc(telefone: string | null | undefined) {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.length === 11)
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10)
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return telefone?.trim() ?? "";
}

function formatarCidadeUfOc(cidade: string | null | undefined, uf: string | null | undefined) {
  const cidadeLimpa = cidade?.trim() ?? "";
  const ufLimpa = uf?.trim() ?? "";
  if (cidadeLimpa && ufLimpa) return `${cidadeLimpa}/${ufLimpa}`;
  return cidadeLimpa || ufLimpa;
}

function identificacaoPrincipalOc(oc: OrdemCompra) {
  return oc.sequencial_fornecedor != null ? `#${oc.sequencial_fornecedor}` : oc.codigo;
}

function ocBodyHtml(
  oc: OrdemCompra,
  logoDataUrl: string | null | undefined,
  modo: ModoExportacaoOc,
) {
  const itens = oc.itens ?? [];
  const subtotal = subtotalOC(itens);
  const desconto = oc.desconto_total ?? 0;
  const total = calcularTotalFinalOC(subtotal, desconto);
  const descontoPercentual = percentualPorDesconto(subtotal, desconto);
  const exibirValores = modo === "fornecedor";
  const geradoEm = new Date().toLocaleString("pt-BR");
  const identificacao = identificacaoPrincipalOc(oc);
  const fornecedorNome = oc.fornecedor?.nome?.trim() ?? "";
  const observacao = oc.observacao?.trim() ?? "";
  const fornecedorDocumento = oc.fornecedor?.documento
    ? formatarDocumento(
        oc.fornecedor.tipo_documento === "cpf" ? "cpf" : "cnpj",
        oc.fornecedor.documento,
      )
    : "";
  const fornecedorCidadeUf = formatarCidadeUfOc(oc.fornecedor?.cidade, oc.fornecedor?.uf);
  const fornecedorTelefone = formatarTelefoneOc(oc.fornecedor?.telefone);
  const linhasItens =
    itens.length > 0
      ? itens
          .map((item) => {
            const sub = (item.preco_unitario ?? 0) * item.quantidade;
            const tipoMaterial = item.materia_prima?.tipo_material
              ? labelTipoMaterial(item.materia_prima.tipo_material)
              : "Matéria-prima";
            const resumoFornecedor = getResumoFornecedorItem(item);
            return `
        <tr>
          <td>${escapeHtml(item.materia_prima?.sku ?? "—")}</td>
          <td>
            <div class="item-name">${escapeHtml(item.materia_prima?.nome ?? "Item sem nome")}</div>
            <div class="item-meta">${escapeHtml(tipoMaterial)}</div>
            ${
              resumoFornecedor ? `<div class="item-meta">${escapeHtml(resumoFornecedor)}</div>` : ""
            }
          </td>
          <td class="numeric">${escapeHtml(fmtQtd(item.quantidade))}</td>
          ${
            exibirValores
              ? `<td class="numeric">${item.preco_unitario != null ? escapeHtml(fmt(item.preco_unitario)) : "—"}</td>
          <td class="numeric">${item.preco_unitario != null ? escapeHtml(fmt(sub)) : "—"}</td>`
              : ""
          }
        </tr>`;
          })
          .join("")
      : `
        <tr>
          <td colspan="${exibirValores ? 5 : 3}" class="item-empty">Nenhum item registrado nesta ordem de compra.</td>
        </tr>`;

  const linhasInfoOrdem = [
    { label: "Emissão", value: fmtData(oc.data_geracao) },
    { label: "Fornecedor", value: fornecedorNome || "Não informado" },
    {
      label: "Pedido origem",
      value: oc.pedido_codigo
        ? `${oc.pedido_sequencial != null ? `#${oc.pedido_sequencial} · ` : ""}${oc.pedido_codigo}`
        : "—",
    },
    { label: "Cliente", value: oc.cliente_nome?.trim() || "—" },
    {
      label: "Pagamento",
      value: oc.forma_pagamento ? labelFormaPagamentoOc(oc.forma_pagamento) : "—",
    },
  ]
    .map(
      (linha) => `
        <div class="meta-row">
          <div class="meta-term">${escapeHtml(linha.label)}</div>
          <div class="meta-value">${escapeHtml(linha.value)}</div>
        </div>`,
    )
    .join("");

  const linhasFornecedor = [
    oc.fornecedor?.razao_social?.trim()
      ? { label: "Razão social", value: oc.fornecedor.razao_social.trim() }
      : null,
    fornecedorDocumento ? { label: "Documento", value: fornecedorDocumento } : null,
    fornecedorCidadeUf ? { label: "Cidade / UF", value: fornecedorCidadeUf } : null,
    fornecedorTelefone ? { label: "Telefone", value: fornecedorTelefone } : null,
  ]
    .filter(
      (
        linha,
      ): linha is {
        label: string;
        value: string;
      } => Boolean(linha?.value),
    )
    .map(
      (linha) => `
        <div class="meta-row">
          <div class="meta-term">${escapeHtml(linha.label)}</div>
          <div class="meta-value">${escapeHtml(linha.value)}</div>
        </div>`,
    )
    .join("");

  const resumoFinanceiro = exibirValores
    ? `
    <div class="totals-box">
      <div class="box-title">Totais</div>
      <div class="totals-row">
        <span>Subtotal</span>
        <strong>${escapeHtml(fmt(subtotal))}</strong>
      </div>
      ${
        desconto > 0
          ? `<div class="totals-row discount">
        <span>Desconto${descontoPercentual > 0 ? ` (${escapeHtml(fmtPercentual(descontoPercentual))}%)` : ""}</span>
        <strong>- ${escapeHtml(fmt(desconto))}</strong>
      </div>`
          : ""
      }
      <div class="totals-total">
        <span>Total</span>
        <span class="amount">${escapeHtml(fmt(total))}</span>
      </div>
    </div>`
    : "";

  const exibirObservacoes = exibirValores || Boolean(observacao);
  const observacoesHtml = exibirObservacoes
    ? `
    <div class="notes-box">
      <div class="box-title">Observações</div>
      ${
        observacao
          ? `<div class="notes-content">${escapeHtml(observacao)}</div>`
          : `<div class="notes-empty">Sem observações registradas para esta ordem de compra.</div>`
      }
    </div>`
    : "";

  const resumoRodape = [observacoesHtml, resumoFinanceiro].filter(Boolean).join("");

  return `
  <section class="oc-page">
    <header class="header">
      <div class="brand">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Alma Campeira" />` : ""}
        <div class="brand-copy">
          <div class="brand-name">Alma Campeira</div>
          <h1>Ordem de Compra</h1>
          <div class="subtitle">Documento comercial para conferência e envio ao fornecedor</div>
        </div>
      </div>
      <aside class="document-card">
        <div class="document-label">Pedido</div>
        <div class="document-id">${escapeHtml(identificacao)}</div>
        <div class="document-date">Emitido em ${escapeHtml(fmtData(oc.data_geracao))}</div>
      </aside>
    </header>

    <section class="info-grid">
      <div class="info-card">
        <div class="info-card-title">Informações da ordem</div>
        <div class="meta-list">
          ${linhasInfoOrdem}
        </div>
      </div>
      <div class="info-card">
        <div class="info-card-title">Fornecedor</div>
        <div class="supplier-name">${escapeHtml(fornecedorNome || "Fornecedor não informado")}</div>
        <div class="meta-list">
          ${linhasFornecedor || `<div class="notes-empty">Sem dados adicionais do fornecedor.</div>`}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <div class="section-title">Itens da compra</div>
        <div class="section-mode">${escapeHtml(labelModoExportacaoOc(modo))}</div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-code">SKU</th>
              <th class="col-item">Item</th>
              <th class="col-qty numeric">Qtd</th>
              ${
                exibirValores
                  ? `<th class="col-unit numeric">Preço unit.</th>
              <th class="col-subtotal numeric">Subtotal</th>`
                  : ""
              }
            </tr>
          </thead>
          <tbody>
            ${linhasItens}
          </tbody>
        </table>
      </div>
    </section>

    ${resumoRodape ? `<section class="summary-grid">${resumoRodape}</section>` : ""}

    <footer class="document-footer">
      <span>Alma Campeira</span>
      <span>Emitido em ${escapeHtml(geradoEm)}</span>
    </footer>
  </section>`;
}

async function exportarPDF(oc: OrdemCompra, modo: ModoExportacaoOc) {
  const logoDataUrl = await carregarLogoLetreiroDataUrl();
  const html = htmlDocumentoOc(
    `${oc.codigo} - ${labelModoExportacaoOc(modo)}`,
    ocBodyHtml(oc, logoDataUrl, modo),
  );

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

async function exportarPDFMultiplas(ocs: OrdemCompra[], modo: ModoExportacaoOc) {
  if (ocs.length === 0) return;
  const logoDataUrl = await carregarLogoLetreiroDataUrl();
  const paginas = ocs.map((oc) => ocBodyHtml(oc, logoDataUrl, modo)).join("");
  const html = htmlDocumentoOc(
    `Ordens de Compra (${ocs.length}) - ${labelModoExportacaoOc(modo)}`,
    paginas,
  );

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

function ModalEscolhaExportacaoOc({
  open,
  quantidade,
  onClose,
  onSelect,
}: {
  open: boolean;
  quantidade: number;
  onClose: () => void;
  onSelect: (modo: ModoExportacaoOc) => void;
}) {
  const plural = quantidade === 1 ? "ordem de compra" : "ordens de compra";
  const opcoes: Array<{
    modo: ModoExportacaoOc;
    titulo: string;
    descricao: string;
    detalhe: string;
    destaque: string;
  }> = [
    {
      modo: "producao",
      titulo: "Produção",
      descricao: "Sem preços, ideal para chão de fábrica e conferência.",
      detalhe: "Remove preço unitário, subtotais, descontos e total final.",
      destaque: "#475467",
    },
    {
      modo: "fornecedor",
      titulo: "Fornecedor",
      descricao: "Com preços, ideal para envio comercial ao fornecedor.",
      detalhe: "Mantém a versão completa com tabela financeira e resumo de totais.",
      destaque: "var(--ac-accent)",
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Escolher tipo de PDF" width="760px">
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-medium" style={{ color: "var(--ac-text)" }}>
            Selecione o tipo de documento para exportar {quantidade}{" "}
            {quantidade === 1 ? "OC" : "OCs"}.
          </p>
          <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
            A escolha altera apenas o conteúdo exibido no PDF. O layout permanece profissional e
            adequado para impressão.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {opcoes.map((opcao) => (
            <button
              key={opcao.modo}
              type="button"
              onClick={() => onSelect(opcao.modo)}
              className="rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5"
              style={{
                borderColor: "var(--ac-border)",
                background: "var(--ac-card)",
                boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
              }}
            >
              <div
                className="mb-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{
                  color: opcao.destaque,
                  background:
                    opcao.modo === "producao" ? "rgba(71,84,103,0.10)" : "rgba(202,138,4,0.12)",
                }}
              >
                {opcao.titulo}
              </div>
              <div className="mb-2 text-base font-semibold" style={{ color: "var(--ac-text)" }}>
                PDF para {opcao.titulo.toLowerCase()}
              </div>
              <p className="mb-2 text-sm" style={{ color: "var(--ac-text)" }}>
                {opcao.descricao}
              </p>
              <p className="mb-4 text-xs leading-5" style={{ color: "var(--ac-muted)" }}>
                {opcao.detalhe}
              </p>
              <div className="text-xs font-medium" style={{ color: "var(--ac-muted)" }}>
                Aplicar em {quantidade} {plural}
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─── Badge de Status OC ──────────────────────────────────────────────────────

const PAGO_BADGE = { label: "Pago", color: "#6d28d9", bg: "#ede9fe", border: "#ddd6fe" } as const;

function BadgeStatus({ status, pago }: { status: StatusOC; pago?: boolean }) {
  const cfg = STATUS_OC[status];
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
        style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
      >
        {cfg.label}
      </span>
      {pago ? (
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
          style={{
            color: PAGO_BADGE.color,
            background: PAGO_BADGE.bg,
            border: `1px solid ${PAGO_BADGE.border}`,
          }}
        >
          {PAGO_BADGE.label}
        </span>
      ) : null}
    </span>
  );
}

// ─── Badge Status Fila ────────────────────────────────────────────────────────

function BadgeStatusFila({ status }: { status: FilaReposicao["status"] }) {
  const cfg = {
    pendente: { label: "Pendente", color: "#b45309", bg: "#fef3c7", border: "#fde68a" },
    convertida: { label: "Convertida", color: "#15803d", bg: "#dcfce7", border: "#bbf7d0" },
    dispensada: { label: "Dispensada", color: "#6b7280", bg: "#f3f4f6", border: "#d1d5db" },
  }[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Modal de Detalhes da OC ─────────────────────────────────────────────────

function OcDetalheModal({
  oc,
  perm,
  usuarioLogadoId,
  usuariosRegistroInicial,
  onClose,
  onRefresh,
  onRequestExcluir,
  onRequestExportarPdf,
}: {
  oc: OrdemCompra;
  perm: Perm;
  usuarioLogadoId: string | null;
  usuariosRegistroInicial?: { id: string; nome: string }[];
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onRequestExcluir?: () => void;
  onRequestExportarPdf: (ocs: OrdemCompra[]) => void;
}) {
  /** Drafts editáveis — só são persistidos no Salvar. */
  const [editandoQtdTotal, setEditandoQtdTotal] = useState<Record<string, string>>({});
  const [editandoCamposFornecedor, setEditandoCamposFornecedor] = useState<
    Record<string, { carimbo_fornecedor: string; botao_fornecedor: string }>
  >({});
  const [obs, setObs] = useState(oc.observacao ?? "");
  const [descontoPercentualDraft, setDescontoPercentualDraft] = useState("0");
  const [pagoDraft, setPagoDraft] = useState(oc.pago);
  const [formaPagamentoDraft, setFormaPagamentoDraft] = useState<FormaPagamentoOC | "">(
    oc.forma_pagamento ?? "",
  );
  const [statusDraft, setStatusDraft] = useState<StatusOC>(oc.status);
  const [qtdParcelas, setQtdParcelas] = useState(1);
  const [boletoParcelas, setBoletoParcelas] = useState<
    { numero: number; vencimento: string; valor: string; pago: boolean; pago_em: string }[]
  >(() => [{ numero: 1, vencimento: "", valor: "", pago: false, pago_em: "" }]);
  const [salvandoTudo, setSalvandoTudo] = useState(false);
  const [erro, setErro] = useState("");
  const [materiaPrimaParaAdicionar, setMateriaPrimaParaAdicionar] = useState("");
  const [adicionalParaAdicionar, setAdicionalParaAdicionar] = useState("");
  const [carimboParaAdicionar, setCarimboParaAdicionar] = useState("");
  const [botaoParaAdicionar, setBotaoParaAdicionar] = useState("");
  const [adicionandoItem, setAdicionandoItem] = useState(false);
  const [usuarioRegistroId, setUsuarioRegistroId] = useState(() => usuarioLogadoId ?? "");

  const { data: usuariosRegistro = [], isPending: carregandoUsuariosRegistro } =
    useUsuariosParaRegistroOC({
      enabled: perm.editar,
      initialData: usuariosRegistroInicial,
    });

  const mpSectionRef = useRef<HTMLDivElement>(null);
  const [mpSectionVisible, setMpSectionVisible] = useState(false);

  useLayoutEffect(() => {
    if (!perm.editar || oc.status !== "pendente") {
      setMpSectionVisible(false);
      return;
    }
    const el = mpSectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setMpSectionVisible(true);
      },
      { rootMargin: "120px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [perm.editar, oc.status, oc.id]);

  const { data: materiasPrimas = [], isPending: carregandoMateriasPrimas } = useQuery({
    queryKey: qk.materiasPrimas.list(),
    queryFn: () => getMateriasPrimas(),
    enabled: perm.editar && oc.status === "pendente" && mpSectionVisible,
    staleTime: 120_000,
  });
  const { data: opcoesMateriaisOc } = useQuery({
    queryKey: ["oc-opcoes-materiais"],
    queryFn: () => getOpcoesMaterialPorTipo(false),
    enabled: perm.editar && oc.status === "pendente",
    staleTime: 120_000,
  });

  function parseNumero(raw: string): number {
    const v = raw.trim().replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  const itens = useMemo(() => oc.itens ?? [], [oc.itens]);
  const idsMateriaJaNoPedido = useMemo(
    () => new Set(itens.map((i) => i.materia_prima_id)),
    [itens],
  );
  const tiposOc = useMemo(
    () =>
      Array.from(
        new Set(
          itens
            .map((item) => item.materia_prima?.tipo_material ?? "")
            .filter((tipoMaterial): tipoMaterial is TipoMaterial => Boolean(tipoMaterial)),
        ),
      ),
    [itens],
  );
  const tipoMaterialOcAtivo = tiposOc.length === 1 ? tiposOc[0] : null;
  const colunasEspecificasOc = useMemo(
    () => getColunasEspecificasMaterial(tipoMaterialOcAtivo),
    [tipoMaterialOcAtivo],
  );
  const opcoesCarimboOc = useMemo(
    () => getOpcoesSelectOc(opcoesMateriaisOc?.carimbo ?? [], ""),
    [opcoesMateriaisOc],
  );
  const opcoesBotaoOc = useMemo(
    () => getOpcoesSelectOc(opcoesMateriaisOc?.botao ?? [], ""),
    [opcoesMateriaisOc],
  );

  const opcoesMateriaPrima = useMemo(
    () =>
      materiasPrimas
        .filter((mp) => !idsMateriaJaNoPedido.has(mp.id))
        .filter((mp) => (tipoMaterialOcAtivo ? mp.tipo_material === tipoMaterialOcAtivo : true))
        .map((mp) => {
          const imageUrl =
            getOptimizedImageUrl(mp.foto_url, {
              width: 80,
              height: 80,
              quality: 72,
              resize: "cover",
              fallbackUrl: "",
            }) || null;
          return {
            value: mp.id,
            label: mp.nome,
            secondaryLabel: formatResumoMaterialOpcao(mp),
            searchText: `${mp.nome} ${formatResumoMaterialOpcao(mp)} ${labelTipoMaterial(mp.tipo_material)}`,
            imageUrl,
          };
        }),
    [materiasPrimas, idsMateriaJaNoPedido, tipoMaterialOcAtivo],
  );

  const opcoesUsuarioRegistro = useMemo(
    () => usuariosRegistro.map((u) => ({ value: u.id, label: u.nome })),
    [usuariosRegistro],
  );
  const opcoesStatusOc = useMemo(
    () =>
      (["pendente", "enviada", "recebida"] as StatusOC[]).map((status) => ({
        value: status,
        label: STATUS_OC[status].label,
      })),
    [],
  );
  const opcoesFormaPagamentoOc = useMemo(
    () =>
      (Object.entries(FORMAS_PAGAMENTO_OC) as [FormaPagamentoOC, { label: string }][]).map(
        ([value, meta]) => ({
          value,
          label: meta.label,
        }),
      ),
    [],
  );

  useEffect(() => {
    setObs(oc.observacao ?? "");
    setDescontoPercentualDraft(
      String(percentualPorDesconto(subtotalOC(oc.itens ?? []), oc.desconto_total ?? 0)).replace(
        ".",
        ",",
      ),
    );
    setPagoDraft(oc.pago);
    setFormaPagamentoDraft(oc.forma_pagamento ?? "");
    setStatusDraft(oc.status);
    setEditandoQtdTotal({});
    setEditandoCamposFornecedor({});
    setCarimboParaAdicionar("");
    setBotaoParaAdicionar("");
  }, [oc.id, oc.observacao, oc.pago, oc.forma_pagamento, oc.status, oc.desconto_total, oc.itens]);

  useEffect(() => {
    setUsuarioRegistroId(usuarioLogadoId ?? "");
  }, [oc.id, usuarioLogadoId]);

  const subtotal = subtotalOC(
    itens.map((i) => {
      const vendido = Number(i.quantidade_vendida ?? i.quantidade);
      const adicionalBase = Number(i.quantidade_adicional ?? 0);
      const salvoTotal = vendido + adicionalBase;
      const rawTotal = editandoQtdTotal[i.id];
      const parsedTotal = rawTotal !== undefined ? parseNumero(rawTotal) : NaN;
      const qtd = rawTotal !== undefined && Number.isFinite(parsedTotal) ? parsedTotal : salvoTotal;
      return { ...i, quantidade: qtd };
    }),
  );
  const descontoPercentual = parseNumero(descontoPercentualDraft);
  const descontoPercentualAtual = Number.isFinite(descontoPercentual) ? descontoPercentual : 0;
  const descontoTotalAtual = calcularDescontoPercentual(subtotal, descontoPercentualAtual);
  const total = calcularTotalFinalOC(subtotal, descontoTotalAtual);
  const percentualOriginal = percentualPorDesconto(subtotalOC(itens), oc.desconto_total ?? 0);

  /** Itens com qtd_total alterada (e validada) — usados para diff e save. */
  const itensQtdDiff = useMemo(() => {
    const out: { item_id: string; quantidade_adicional: number }[] = [];
    for (const item of itens) {
      const raw = editandoQtdTotal[item.id];
      if (raw === undefined) continue;
      const vendido = Number(item.quantidade_vendida ?? item.quantidade ?? 0);
      const adicionalBase = Number(item.quantidade_adicional ?? 0);
      const salvoTotal = vendido + adicionalBase;
      const totalQty = parseNumero(raw);
      if (!Number.isFinite(totalQty)) continue;
      if (Math.abs(totalQty - salvoTotal) < 1e-9) continue;
      out.push({ item_id: item.id, quantidade_adicional: totalQty - vendido });
    }
    return out;
  }, [itens, editandoQtdTotal]);
  const itensFornecedorDiff = useMemo(() => {
    const out: {
      item_id: string;
      carimbo_fornecedor?: string | null;
      botao_fornecedor?: string | null;
    }[] = [];

    for (const item of itens) {
      const draft = editandoCamposFornecedor[item.id];
      if (!draft) continue;
      const carimboFornecedor = draft.carimbo_fornecedor.trim() || null;
      const botaoFornecedor = draft.botao_fornecedor.trim() || null;
      if (
        carimboFornecedor === (item.carimbo_fornecedor ?? null) &&
        botaoFornecedor === (item.botao_fornecedor ?? null)
      ) {
        continue;
      }
      out.push({
        item_id: item.id,
        carimbo_fornecedor: carimboFornecedor,
        botao_fornecedor: botaoFornecedor,
      });
    }
    return out;
  }, [itens, editandoCamposFornecedor]);

  const obsAlterada = (obs ?? "") !== (oc.observacao ?? "");
  const descontoAlterado = Math.abs(descontoPercentualAtual - percentualOriginal) > 1e-9;
  const pagoAlterado = pagoDraft !== oc.pago;
  const formaAlterada = (formaPagamentoDraft || null) !== (oc.forma_pagamento ?? null);
  const statusAlterado = statusDraft !== oc.status;
  const temAlteracoes =
    obsAlterada ||
    descontoAlterado ||
    pagoAlterado ||
    formaAlterada ||
    statusAlterado ||
    itensQtdDiff.length > 0 ||
    itensFornecedorDiff.length > 0;

  async function salvarTudo() {
    setErro("");

    // Validação local dos drafts de qtd.
    for (const item of itens) {
      const raw = editandoQtdTotal[item.id];
      if (raw === undefined) continue;
      const vendido = Number(item.quantidade_vendida ?? item.quantidade ?? 0);
      const totalQty = parseNumero(raw);
      if (!Number.isFinite(totalQty)) {
        setErro(
          `Quantidade total inválida em ${item.materia_prima?.sku ?? item.materia_prima?.nome ?? "um item"}.`,
        );
        return;
      }
      const minTotal = vendido > 0 ? vendido : 1;
      if (totalQty < minTotal) {
        setErro(
          `A quantidade total de ${item.materia_prima?.sku ?? item.materia_prima?.nome ?? "um item"} não pode ser menor que ${fmtQtd(minTotal)}.`,
        );
        return;
      }
    }

    if (
      !Number.isFinite(descontoPercentual) ||
      descontoPercentual < 0 ||
      descontoPercentual > 100
    ) {
      setErro("Percentual de desconto inválido (use 0 a 100%).");
      return;
    }

    if (statusAlterado) {
      if (statusDraft === "recebida") {
        if (
          !window.confirm(
            "Confirmar recebimento dará entrada no estoque das matérias-primas. Confirmar?",
          )
        )
          return;
      } else if (oc.status === "recebida") {
        if (
          !window.confirm(
            "Voltar de Recebida irá estornar a entrada de estoque (criando movimentações de ajuste). Confirmar?",
          )
        )
          return;
      }
    }

    // Se a forma escolhida é boleto e ainda não havia boleto (forma mudou),
    // exige ao menos uma parcela válida para gerar o boleto de saída.
    const vaiCriarBoleto = formaPagamentoDraft === "boleto" && formaAlterada;
    if (vaiCriarBoleto) {
      const temParcela = boletoParcelas.some(
        (p) => p.vencimento && Number(p.valor.replace(",", ".")) > 0,
      );
      if (!temParcela) {
        setErro("Preencha ao menos uma parcela do boleto.");
        return;
      }
    }

    setSalvandoTudo(true);
    try {
      const formaParaSalvar = formaAlterada ? formaPagamentoDraft || null : undefined;
      await salvarAlteracoesOC({
        id: oc.id,
        observacao: obsAlterada ? obs : undefined,
        desconto_percentual:
          descontoAlterado || itensQtdDiff.length > 0 ? descontoPercentualAtual : undefined,
        pago: pagoAlterado ? pagoDraft : undefined,
        forma_pagamento: formaParaSalvar,
        status: statusAlterado ? statusDraft : undefined,
        itensQtd: itensQtdDiff.length > 0 ? itensQtdDiff : undefined,
        itensFornecedor: itensFornecedorDiff.length > 0 ? itensFornecedorDiff : undefined,
        usuarioRegistroId: usuarioRegistroId || null,
      });

      if (vaiCriarBoleto) {
        const fornecedorNome = oc.fornecedor?.nome ?? "";
        const fornecedorId = oc.fornecedor_id ?? undefined;
        const valorBoleto = boletoParcelas.reduce(
          (s, p) => s + (Number(p.valor.replace(",", ".")) || 0),
          0,
        );
        const parcelasInput: ParcelaInput[] = boletoParcelas
          .filter((p) => p.vencimento && Number(p.valor.replace(",", ".")) > 0)
          .map((p) => ({
            numero: p.numero,
            vencimento: p.vencimento,
            valor: Number(p.valor.replace(",", ".")) || 0,
            pago_em: p.pago && p.pago_em ? p.pago_em : null,
            valor_pago: p.pago ? Number(p.valor.replace(",", ".")) || 0 : null,
          }));
        await criarBoleto({
          tipo: "saida",
          contraparte_nome: fornecedorNome,
          fornecedor_id: fornecedorId ?? null,
          valor_total: valorBoleto,
          emitido_em: new Date().toISOString().slice(0, 10),
          observacao: `Boleto gerado da OC ${oc.codigo}`,
          ordem_compra_id: oc.id,
          parcelas: parcelasInput,
        });
      }

      setEditandoQtdTotal({});
      await Promise.resolve(onRefresh());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar alterações.");
    } finally {
      setSalvandoTudo(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${oc.sequencial_fornecedor != null ? `#${oc.sequencial_fornecedor} · ` : ""}${oc.codigo} — ${oc.fornecedor?.nome ?? "Sem fornecedor"}`}
      width="760px"
    >
      <div className="space-y-5">
        {/* Resumo */}
        <div
          className="flex items-center gap-6 text-sm flex-wrap"
          style={{ color: "var(--ac-muted)" }}
        >
          <span>
            Data: <strong style={{ color: "var(--ac-text)" }}>{fmtData(oc.data_geracao)}</strong>
          </span>
          <span className="inline-flex items-center gap-2 flex-wrap">
            Status: <BadgeStatus status={oc.status} />
          </span>
          <span className="ml-auto font-semibold text-base" style={{ color: "var(--ac-text)" }}>
            {fmt(total)}
          </span>
        </div>

        {/* Pedido de origem */}
        {oc.pedido_codigo && (
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm flex-wrap"
            style={{
              background: "color-mix(in srgb, var(--ac-accent) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--ac-accent) 30%, transparent)",
            }}
          >
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              Pedido de origem
            </span>
            <span className="font-mono font-bold" style={{ color: "var(--ac-accent)" }}>
              {oc.pedido_codigo}
            </span>
            <span style={{ color: "var(--ac-text)" }}>· {oc.cliente_nome ?? "—"}</span>
          </div>
        )}

        {oc.ultima_alteracao_em && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{
              background: "color-mix(in srgb, var(--ac-border) 35%, transparent)",
              color: "var(--ac-muted)",
            }}
          >
            íšltima alteração:{" "}
            <strong style={{ color: "var(--ac-text)" }}>
              {oc.ultima_alteracao_usuario?.nome ?? "—"}
            </strong>
            <span> · {fmtDataHora(oc.ultima_alteracao_em)}</span>
          </div>
        )}

        {/* Tabela de itens */}
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--ac-border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "color-mix(in srgb, var(--ac-border) 40%, transparent)" }}>
                {["SKU", "Matéria-Prima"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    {h}
                  </th>
                ))}
                {colunasEspecificasOc.map((coluna) => (
                  <th
                    key={coluna.key}
                    className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    {coluna.label}
                  </th>
                ))}
                {["Vendido", "Qtd Total", "Preço Unit.", "Subtotal"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => {
                const isEditing = editandoQtdTotal[item.id] !== undefined;
                const vendido = Number(item.quantidade_vendida ?? item.quantidade);
                const adicionalBase = Number(item.quantidade_adicional ?? 0);
                const salvoTotal = vendido + adicionalBase;
                const draftFornecedor = editandoCamposFornecedor[item.id] ?? {
                  carimbo_fornecedor: item.carimbo_fornecedor ?? "",
                  botao_fornecedor: item.botao_fornecedor ?? "",
                };
                const rawTotal = editandoQtdTotal[item.id];
                const parsedTotal = rawTotal !== undefined ? parseNumero(rawTotal) : NaN;
                const totalQty =
                  rawTotal !== undefined && Number.isFinite(parsedTotal) ? parsedTotal : salvoTotal;
                const sub = (item.preco_unitario ?? 0) * totalQty;
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderTop: idx > 0 ? "1px solid var(--ac-border)" : undefined,
                      background: isEditing
                        ? "color-mix(in srgb, var(--ac-accent) 5%, transparent)"
                        : undefined,
                    }}
                  >
                    <td
                      className="px-3 py-2.5 font-mono text-xs"
                      style={{ color: "var(--ac-muted)" }}
                    >
                      {item.materia_prima?.sku ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--ac-text)" }}>
                      <div className="space-y-2">
                        <div>{item.materia_prima?.nome ?? "—"}</div>
                        {item.materia_prima?.tipo_material === "lamina" &&
                        perm.editar &&
                        oc.status === "pendente" ? (
                          <SmartSelect
                            value={draftFornecedor.carimbo_fornecedor}
                            onChange={(value) =>
                              setEditandoCamposFornecedor((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...draftFornecedor,
                                  carimbo_fornecedor: value,
                                },
                              }))
                            }
                            options={opcoesCarimboOc}
                            placeholder="Selecione o carimbo"
                            showThumbnails={false}
                          />
                        ) : null}
                        {item.materia_prima?.tipo_material === "bainha" &&
                        perm.editar &&
                        oc.status === "pendente" ? (
                          <SmartSelect
                            value={draftFornecedor.botao_fornecedor}
                            onChange={(value) =>
                              setEditandoCamposFornecedor((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...draftFornecedor,
                                  botao_fornecedor: value,
                                },
                              }))
                            }
                            options={opcoesBotaoOc}
                            placeholder="Selecione o botão"
                            showThumbnails={false}
                          />
                        ) : null}
                        {getResumoFornecedorItem({
                          carimbo_fornecedor: draftFornecedor.carimbo_fornecedor || null,
                          botao_fornecedor: draftFornecedor.botao_fornecedor || null,
                        }) ? (
                          <div className="text-xs font-normal" style={{ color: "var(--ac-muted)" }}>
                            {getResumoFornecedorItem({
                              carimbo_fornecedor: draftFornecedor.carimbo_fornecedor || null,
                              botao_fornecedor: draftFornecedor.botao_fornecedor || null,
                            })}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    {colunasEspecificasOc.map((coluna) => (
                      <td
                        key={coluna.key}
                        className="px-3 py-2.5 text-xs"
                        style={{ color: "var(--ac-muted)" }}
                      >
                        {coluna.value(item.materia_prima)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right" style={{ color: "var(--ac-muted)" }}>
                      {fmtQtd(vendido)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {perm.editar && oc.status === "pendente" ? (
                        <input
                          type="number"
                          min={vendido > 0 ? vendido : 1}
                          step="any"
                          value={isEditing ? editandoQtdTotal[item.id] : String(salvoTotal)}
                          onChange={(e) =>
                            setEditandoQtdTotal((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          onFocus={() => {
                            if (!isEditing) {
                              setEditandoQtdTotal((prev) => ({
                                ...prev,
                                [item.id]: String(salvoTotal),
                              }));
                            }
                          }}
                          className="w-24 px-2 py-1 rounded text-sm text-right font-semibold"
                          style={{
                            border: "1px solid var(--ac-border)",
                            background: "var(--ac-bg)",
                            color: "var(--ac-accent)",
                          }}
                        />
                      ) : (
                        <span className="font-semibold" style={{ color: "var(--ac-accent)" }}>
                          {fmtQtd(salvoTotal)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right" style={{ color: "var(--ac-muted)" }}>
                      {item.preco_unitario != null ? fmt(item.preco_unitario) : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-medium"
                      style={{ color: "var(--ac-text)" }}
                    >
                      {item.preco_unitario != null ? fmt(sub) : "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Total */}
              <tr
                style={{
                  borderTop: "2px solid var(--ac-border)",
                  background: "color-mix(in srgb, var(--ac-border) 20%, transparent)",
                }}
              >
                <td
                  colSpan={5 + colunasEspecificasOc.length}
                  className="px-3 py-2.5 text-right font-semibold text-sm"
                  style={{ color: "var(--ac-muted)" }}
                >
                  SUBTOTAL
                </td>
                <td
                  className="px-3 py-2.5 text-right font-bold text-base"
                  style={{ color: "var(--ac-text)" }}
                >
                  {fmt(subtotal)}
                </td>
              </tr>
              {descontoTotalAtual > 0 && (
                <tr>
                  <td
                    colSpan={5 + colunasEspecificasOc.length}
                    className="px-3 py-2.5 text-right font-semibold text-sm"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    DESCONTO ({fmtPercentual(descontoPercentualAtual)}%)
                  </td>
                  <td
                    className="px-3 py-2.5 text-right font-medium"
                    style={{ color: "var(--ac-text)" }}
                  >
                    -{fmt(descontoTotalAtual)}
                  </td>
                </tr>
              )}
              <tr>
                <td
                  colSpan={5 + colunasEspecificasOc.length}
                  className="px-3 py-2.5 text-right font-semibold text-sm"
                  style={{ color: "var(--ac-muted)" }}
                >
                  TOTAL FINAL
                </td>
                <td
                  className="px-3 py-2.5 text-right font-bold text-base"
                  style={{ color: "var(--ac-text)" }}
                >
                  {fmt(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Adicionar matéria-prima */}
        {perm.editar && oc.status === "pendente" && (
          <div ref={mpSectionRef} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                  Adicionar matéria-prima
                </p>
                {tipoMaterialOcAtivo && (
                  <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                    Tipo desta OC:{" "}
                    <strong style={{ color: "var(--ac-text)" }}>
                      {labelTipoMaterial(tipoMaterialOcAtivo)}
                    </strong>
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[min(100%,240px)] sm:min-w-[240px]">
                <label
                  htmlFor="oc-mp-search"
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--ac-muted)" }}
                >
                  Matéria-prima
                </label>
                <SearchableSelect
                  id="oc-mp-search"
                  value={materiaPrimaParaAdicionar}
                  onChange={setMateriaPrimaParaAdicionar}
                  options={opcoesMateriaPrima}
                  placeholder="Pesquisar por nome ou SKU…"
                  loading={carregandoMateriasPrimas}
                  emptyMessage={
                    tipoMaterialOcAtivo
                      ? `Nenhuma matéria-prima disponível para o tipo ${labelTipoMaterial(tipoMaterialOcAtivo)}`
                      : "Nenhuma matéria-prima disponível para esta OC"
                  }
                />
              </div>

              {tipoMaterialOcAtivo === "lamina" ? (
                <div className="w-[240px]">
                  <label
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Carimbo
                  </label>
                  <div className="mt-1">
                    <SmartSelect
                      value={carimboParaAdicionar}
                      onChange={setCarimboParaAdicionar}
                      options={opcoesCarimboOc}
                      placeholder="Selecione o carimbo"
                      showThumbnails={false}
                    />
                  </div>
                </div>
              ) : null}

              {tipoMaterialOcAtivo === "bainha" ? (
                <div className="w-[240px]">
                  <label
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Botão
                  </label>
                  <div className="mt-1">
                    <SmartSelect
                      value={botaoParaAdicionar}
                      onChange={setBotaoParaAdicionar}
                      options={opcoesBotaoOc}
                      placeholder="Selecione o botão"
                      showThumbnails={false}
                    />
                  </div>
                </div>
              ) : null}

              <div className="w-[220px]">
                <label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--ac-muted)" }}
                >
                  Unidades adicionais
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adicionalParaAdicionar}
                  onChange={(e) => setAdicionalParaAdicionar(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-right"
                  style={{
                    background: "var(--ac-bg)",
                    border: "1px solid var(--ac-border)",
                    color: "var(--ac-text)",
                  }}
                />
              </div>

              <Button
                variant="primary"
                loading={adicionandoItem}
                disabled={!materiaPrimaParaAdicionar || adicionandoItem}
                onClick={async () => {
                  setAdicionandoItem(true);
                  setErro("");
                  try {
                    const adicional = parseNumero(adicionalParaAdicionar);
                    if (!Number.isFinite(adicional) || adicional <= 0) {
                      setErro("Unidades adicionais devem ser maiores que zero.");
                      return;
                    }
                    await criarItemOrdemCompra(
                      oc.id,
                      materiaPrimaParaAdicionar,
                      adicional,
                      {
                        carimbo_fornecedor: carimboParaAdicionar || null,
                        botao_fornecedor: botaoParaAdicionar || null,
                      },
                      usuarioRegistroId || null,
                    );
                    setMateriaPrimaParaAdicionar("");
                    setAdicionalParaAdicionar("");
                    setCarimboParaAdicionar("");
                    setBotaoParaAdicionar("");
                    onRefresh();
                  } catch (e: unknown) {
                    setErro(e instanceof Error ? e.message : "Erro ao adicionar matéria-prima.");
                  } finally {
                    setAdicionandoItem(false);
                  }
                }}
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}

        {/* Observações */}
        {perm.editar && (
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              Observações
            </label>
            <textarea
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Notas para o fornecedor..."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-text)",
              }}
            />
          </div>
        )}
        {!perm.editar && oc.observacao && (
          <div
            className="text-sm p-3 rounded-lg"
            style={{
              background: "color-mix(in srgb, var(--ac-border) 30%, transparent)",
              color: "var(--ac-text)",
            }}
          >
            {oc.observacao}
          </div>
        )}

        {perm.editar && (
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              % Desconto
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={descontoPercentualDraft}
              onChange={(e) => setDescontoPercentualDraft(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 rounded-lg text-sm text-right"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-text)",
              }}
            />
            <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
              Subtotal: {fmt(subtotal)} · Desconto: {fmt(descontoTotalAtual)} · Total final:{" "}
              {fmt(total)}
            </p>
          </div>
        )}

        {/* Erro */}
        {erro && (
          <p
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#fee2e2", color: "#dc2626" }}
          >
            {erro}
          </p>
        )}

        {/* Rodapé: campos de alteração + ações */}
        <div
          className="flex flex-col gap-3 pt-3"
          style={{ borderTop: "1px solid var(--ac-border)" }}
        >
          {perm.editar ? (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
                <div
                  className="flex flex-col gap-1 min-w-0"
                  title="Por padrão vem o usuário logado. Troque se outra pessoa efetivou a mudança."
                >
                  <label
                    htmlFor="oc-registro-usuario"
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Quem registra a alteração
                  </label>
                  <SearchableSelect
                    id="oc-registro-usuario"
                    value={usuarioRegistroId}
                    onChange={setUsuarioRegistroId}
                    options={opcoesUsuarioRegistro}
                    placeholder="Selecione o usuário…"
                    loading={carregandoUsuariosRegistro}
                    emptyMessage="Nenhum usuário ativo encontrado"
                    className="w-full"
                    showThumbnails={false}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="oc-status-select"
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Status
                  </label>
                  <SmartSelect
                    id="oc-status-select"
                    value={statusDraft}
                    disabled={salvandoTudo}
                    onChange={(value) => setStatusDraft(value as StatusOC)}
                    options={opcoesStatusOc}
                    showThumbnails={false}
                    className="min-w-[180px]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Pagamento
                  </span>
                  <label
                    className="inline-flex items-center gap-2 cursor-pointer select-none text-sm rounded px-2.5 h-[34px]"
                    style={{ border: "1px solid var(--ac-border)", background: "var(--ac-card)" }}
                  >
                    <input
                      type="checkbox"
                      checked={pagoDraft}
                      disabled={salvandoTudo}
                      onChange={(e) => setPagoDraft(e.target.checked)}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--ac-accent)" }}
                    />
                    <span style={{ color: "var(--ac-text)" }}>Pago</span>
                  </label>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="oc-forma-pagamento"
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    Forma de pagamento
                  </label>
                  <SmartSelect
                    id="oc-forma-pagamento"
                    value={formaPagamentoDraft}
                    disabled={salvandoTudo}
                    onChange={(value) => setFormaPagamentoDraft(value as FormaPagamentoOC | "")}
                    options={opcoesFormaPagamentoOc}
                    placeholder="— Selecione —"
                    showThumbnails={false}
                    className="min-w-[180px]"
                  />
                </div>
              </div>

              {/* Inline boleto form — aparece assim que a forma "boleto" é escolhida */}
              {formaPagamentoDraft === "boleto" && !oc.pago && (
                <div
                  className="flex flex-col gap-3 rounded-lg p-4"
                  style={{ background: "var(--ac-bg)", border: "1px solid var(--ac-border)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                      Parcelas do boleto
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setQtdParcelas(n);
                            const base = new Date().toISOString().slice(0, 10);
                            const vCada = total > 0 ? Number((total / n).toFixed(2)) : 0;
                            let acumulado = 0;
                            setBoletoParcelas(
                              Array.from({ length: n }, (_, i) => {
                                const ult = i === n - 1;
                                const v = ult
                                  ? Math.max(0, Number((total - acumulado).toFixed(2)))
                                  : vCada;
                                acumulado += v;
                                const d = new Date(base);
                                d.setMonth(d.getMonth() + i + 1);
                                return {
                                  numero: i + 1,
                                  vencimento: d.toISOString().slice(0, 10),
                                  valor: v > 0 ? v.toFixed(2) : "",
                                  pago: false,
                                  pago_em: "",
                                };
                              }),
                            );
                          }}
                          className="px-2.5 py-1 rounded text-xs font-medium"
                          style={{
                            background: qtdParcelas === n ? "var(--ac-accent)" : "var(--ac-card)",
                            color: qtdParcelas === n ? "white" : "var(--ac-text)",
                            border: "1px solid var(--ac-border)",
                          }}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg" style={{ border: "1px solid var(--ac-border)" }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "var(--ac-bg)" }}>
                          <th
                            className="px-3 py-2 text-left text-xs uppercase font-semibold"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            #
                          </th>
                          <th
                            className="px-3 py-2 text-left text-xs uppercase font-semibold"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            Vencimento
                          </th>
                          <th
                            className="px-3 py-2 text-right text-xs uppercase font-semibold"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            Valor
                          </th>
                          <th
                            className="px-3 py-2 text-center text-xs uppercase font-semibold"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            Pago
                          </th>
                          <th
                            className="px-3 py-2 text-left text-xs uppercase font-semibold"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            Data pago
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {boletoParcelas.map((p, i) => (
                          <tr
                            key={i}
                            style={{ borderTop: i > 0 ? "1px solid var(--ac-border)" : undefined }}
                          >
                            <td
                              className="px-3 py-2 font-mono text-xs"
                              style={{ color: "var(--ac-muted)" }}
                            >
                              {p.numero}
                            </td>
                            <td className="px-3 py-2">
                              <DateInputBR
                                value={p.vencimento}
                                onChange={(iso) =>
                                  setBoletoParcelas((prev) =>
                                    prev.map((l, j) => (j === i ? { ...l, vencimento: iso } : l)),
                                  )
                                }
                                className="rounded px-2 py-1 text-sm outline-none w-full"
                                style={{
                                  background: "var(--ac-card)",
                                  border: "1px solid var(--ac-border)",
                                  color: "var(--ac-text)",
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={p.valor}
                                onChange={(e) =>
                                  setBoletoParcelas((prev) =>
                                    prev.map((l, j) =>
                                      j === i ? { ...l, valor: e.target.value } : l,
                                    ),
                                  )
                                }
                                className="rounded px-2 py-1 text-sm outline-none w-full text-right"
                                style={{
                                  background: "var(--ac-card)",
                                  border: "1px solid var(--ac-border)",
                                  color: "var(--ac-text)",
                                }}
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={p.pago}
                                onChange={(e) =>
                                  setBoletoParcelas((prev) =>
                                    prev.map((l, j) =>
                                      j === i
                                        ? {
                                            ...l,
                                            pago: e.target.checked,
                                            pago_em:
                                              e.target.checked && !l.pago_em
                                                ? new Date().toISOString().slice(0, 10)
                                                : l.pago_em,
                                          }
                                        : l,
                                    ),
                                  )
                                }
                                className="w-4 h-4 rounded"
                                style={{ accentColor: "var(--ac-accent)" }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              {p.pago && (
                                <DateInputBR
                                  value={p.pago_em}
                                  onChange={(iso) =>
                                    setBoletoParcelas((prev) =>
                                      prev.map((l, j) => (j === i ? { ...l, pago_em: iso } : l)),
                                    )
                                  }
                                  className="rounded px-2 py-1 text-sm outline-none w-full"
                                  style={{
                                    background: "var(--ac-card)",
                                    border: "1px solid var(--ac-border)",
                                    color: "var(--ac-text)",
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              className="text-sm flex flex-wrap gap-x-4 gap-y-1"
              style={{ color: "var(--ac-muted)" }}
            >
              <span>
                Pagamento:{" "}
                <strong style={{ color: "var(--ac-text)" }}>{oc.pago ? "sim" : "não"}</strong>
              </span>
              {oc.forma_pagamento && (
                <span>
                  Forma:{" "}
                  <strong style={{ color: "var(--ac-text)" }}>
                    {FORMAS_PAGAMENTO_OC[oc.forma_pagamento]?.label ?? oc.forma_pagamento}
                  </strong>
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => onRequestExportarPdf([oc])}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="size-4"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Exportar PDF
            </Button>

            {perm.deletar && oc.status === "pendente" && onRequestExcluir && (
              <Button variant="danger" onClick={onRequestExcluir}>
                Excluir OC
              </Button>
            )}

            <div className="flex-1 min-w-[0.5rem]" />

            {perm.editar && (
              <Button
                variant="primary"
                onClick={salvarTudo}
                loading={salvandoTudo}
                disabled={!temAlteracoes || salvandoTudo}
              >
                Salvar alterações
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: Nova OC manual ───────────────────────────────────────────────────

type LinhaCriarOc = {
  key: string;
  materia_prima_id: string;
  quantidade: string;
  preco_unitario: string;
  carimbo_fornecedor: string;
  botao_fornecedor: string;
};

function OcCriarModal({
  open,
  onClose,
  onCriada,
}: {
  open: boolean;
  onClose: () => void;
  onCriada: (codigo: string) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [tipoMaterial, setTipoMaterial] = useState<TipoMaterial | "">("");
  const [agrupador, setAgrupador] = useState("");
  const [buscaMateria, setBuscaMateria] = useState("");
  const [descontoPercentual, setDescontoPercentual] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [linhas, setLinhas] = useState<LinhaCriarOc[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [materiasPrimas, setMateriasPrimas] = useState<MateriaPrima[]>([]);
  const [opcoesMateriais, setOpcoesMateriais] = useState<OpcoesMateriaisPorTipo>({
    aco: [],
    bloco: [],
    botao: [],
    carimbo: [],
    bainha: [],
  });
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [materiaPrimaDestacadaId, setMateriaPrimaDestacadaId] = useState("");
  const destaqueTimeoutRef = useRef<number | null>(null);

  const mpById = useMemo(() => new Map(materiasPrimas.map((m) => [m.id, m])), [materiasPrimas]);
  const materiasPrimasDoTipo = useMemo(
    () => (tipoMaterial ? materiasPrimas.filter((mp) => mp.tipo_material === tipoMaterial) : []),
    [materiasPrimas, tipoMaterial],
  );
  const agrupadoresDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          materiasPrimasDoTipo
            .map((mp) => obterAgrupadorMaterial(mp))
            .filter((nome) => nome.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [materiasPrimasDoTipo],
  );
  const materiasPrimasFiltradas = useMemo(
    () =>
      materiasPrimasDoTipo.filter((mp) =>
        agrupador
          ? normalizarAgrupadorMaterial(obterAgrupadorMaterial(mp)) ===
            normalizarAgrupadorMaterial(agrupador)
          : true,
      ),
    [agrupador, materiasPrimasDoTipo],
  );
  const possuiItensSelecionados = linhas.length > 0;
  const colunasEspecificasCriacao = useMemo(
    () => getColunasEspecificasMaterial(tipoMaterial),
    [tipoMaterial],
  );
  const linhasByMateriaId = useMemo(
    () => new Map(linhas.map((linha) => [linha.materia_prima_id, linha])),
    [linhas],
  );
  const materiasPrimasCatalogo = useMemo(() => {
    const buscaNormalizada = normalizarTextoBusca(buscaMateria.trim());
    return materiasPrimasFiltradas.filter((mp) => {
      if (!buscaNormalizada) return true;
      const searchText = `${mp.sku ?? ""} ${mp.nome} ${formatResumoMaterialOpcao(mp)} ${obterAgrupadorMaterial(mp)} ${labelTipoMaterial(mp.tipo_material)}`;
      return normalizarTextoBusca(searchText).includes(buscaNormalizada);
    });
  }, [buscaMateria, materiasPrimasFiltradas]);
  const resumoContextoCatalogo = useMemo(
    () =>
      [tipoMaterial ? labelTipoMaterial(tipoMaterial) : "", agrupador]
        .filter((valor) => Boolean(valor))
        .join(" · "),
    [agrupador, tipoMaterial],
  );
  const opcoesTipoOc = useMemo(
    () =>
      TIPOS_MATERIAL.map((tipo) => ({
        value: tipo.value,
        label: tipo.label,
      })),
    [],
  );
  const opcoesAgrupadorOc = useMemo(
    () =>
      agrupadoresDisponiveis.map((nomeAgrupador) => ({
        value: nomeAgrupador,
        label: nomeAgrupador,
      })),
    [agrupadoresDisponiveis],
  );
  const fornecedoresCompativeis = useMemo(
    () =>
      fornecedores.filter((fornecedor) => fornecedorCompativelComTipo(fornecedor, tipoMaterial)),
    [fornecedores, tipoMaterial],
  );
  const opcoesFornecedorOc = useMemo(
    () =>
      fornecedoresCompativeis.map((fornecedor) => ({
        value: fornecedor.id,
        label: fornecedor.nome,
        searchText: `${fornecedor.nome} ${fornecedor.cidade ?? ""} ${fornecedor.uf ?? ""}`,
      })),
    [fornecedoresCompativeis],
  );
  const placeholderFornecedorOc = tipoMaterial
    ? opcoesFornecedorOc.length > 0
      ? "Selecione o fornecedor"
      : "Sem fornecedor compatível"
    : "Sem fornecedor";
  const emptyMessageFornecedorOc = tipoMaterial
    ? "Nenhum fornecedor vinculado a este tipo de material"
    : "Nenhum fornecedor encontrado";

  useEffect(() => {
    if (!open) return;
    setErro("");
    setFornecedorId("");
    setTipoMaterial("");
    setAgrupador("");
    setBuscaMateria("");
    setDescontoPercentual("0");
    setObservacao("");
    setLinhas([]);
    setMateriaPrimaDestacadaId("");

    let cancelled = false;
    async function load() {
      setCarregando(true);
      try {
        const [f, m, opcoes] = await Promise.all([
          getFornecedoresSemCache(1000),
          getMateriasPrimas(),
          getOpcoesMaterialPorTipo(false),
        ]);
        if (!cancelled) {
          setFornecedores(f);
          setMateriasPrimas(m);
          setOpcoesMateriais(opcoes);
        }
      } catch (e: unknown) {
        if (!cancelled) setErro(e instanceof Error ? e.message : "Erro ao carregar dados.");
      } finally {
        if (!cancelled) setCarregando(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (destaqueTimeoutRef.current !== null) {
        window.clearTimeout(destaqueTimeoutRef.current);
      }
    };
  }, []);

  function parseNumero(raw: string): number {
    const v = raw.trim().replace(",", ".");
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function removeLinha(key: string) {
    setLinhas((prev) => prev.filter((l) => l.key !== key));
  }

  function updateTipoMaterial(nextTipo: string) {
    if (nextTipo === tipoMaterial) return;
    if (possuiItensSelecionados) {
      setErro("Remova os itens atuais antes de trocar o tipo de material da ordem de compra.");
      return;
    }
    setErro("");
    const tipoNormalizado = (nextTipo as TipoMaterial) || "";
    setTipoMaterial(tipoNormalizado);
    setFornecedorId((current) => {
      if (!current) return current;
      const fornecedorAtual = fornecedores.find((fornecedor) => fornecedor.id === current);
      return fornecedorCompativelComTipo(fornecedorAtual, tipoNormalizado) ? current : "";
    });
    setAgrupador("");
    setBuscaMateria("");
  }

  function updateAgrupador(nextAgrupador: string) {
    if (nextAgrupador === agrupador) return;
    setErro("");
    setAgrupador(nextAgrupador);
  }

  function destacarMateriaPrima(materiaPrimaId: string) {
    setMateriaPrimaDestacadaId(materiaPrimaId);
    if (destaqueTimeoutRef.current !== null) {
      window.clearTimeout(destaqueTimeoutRef.current);
    }
    destaqueTimeoutRef.current = window.setTimeout(() => {
      setMateriaPrimaDestacadaId((current) => (current === materiaPrimaId ? "" : current));
      destaqueTimeoutRef.current = null;
    }, 1400);
  }

  function adicionarMateriaPrima(materiaPrimaId: string) {
    const mp = mpById.get(materiaPrimaId);
    if (!mp) return;
    setErro("");
    setLinhas((prev) => {
      const existente = prev.find((linha) => linha.materia_prima_id === materiaPrimaId);
      if (existente) {
        const quantidadeAtual = parseNumero(existente.quantidade);
        const novaQuantidade =
          Number.isFinite(quantidadeAtual) && quantidadeAtual > 0 ? quantidadeAtual + 1 : 2;
        return prev.map((linha) =>
          linha.materia_prima_id === materiaPrimaId
            ? { ...linha, quantidade: String(novaQuantidade) }
            : linha,
        );
      }
      return [
        ...prev,
        {
          key: `${Date.now()}-${prev.length}`,
          materia_prima_id: materiaPrimaId,
          quantidade: "1",
          preco_unitario: String(mp.preco_custo ?? ""),
          carimbo_fornecedor: "",
          botao_fornecedor: "",
        },
      ];
    });
    destacarMateriaPrima(materiaPrimaId);
  }

  function updateLinha(key: string, patch: Partial<LinhaCriarOc>) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.materia_prima_id !== undefined && patch.materia_prima_id) {
          const mp = mpById.get(patch.materia_prima_id);
          if (mp) next.preco_unitario = String(mp.preco_custo ?? "");
        }
        return next;
      }),
    );
  }

  async function salvar() {
    if (!tipoMaterial) {
      setErro("Selecione o tipo de material da ordem de compra.");
      return;
    }
    if (linhas.length === 0) {
      setErro("Selecione ao menos uma matéria-prima.");
      return;
    }
    const payload: {
      materia_prima_id: string;
      quantidade: number;
      preco_unitario?: number | null;
      carimbo_fornecedor?: string | null;
      botao_fornecedor?: string | null;
    }[] = [];
    for (const l of linhas) {
      const q = parseNumero(l.quantidade);
      if (!Number.isFinite(q) || q <= 0) {
        setErro("Todas as quantidades devem ser maiores que zero.");
        return;
      }
      const precoRaw = l.preco_unitario.trim();
      let preco_unitario: number | null = null;
      if (precoRaw !== "") {
        const p = parseNumero(precoRaw);
        if (!Number.isFinite(p) || p < 0) {
          setErro("Preço unitário inválido em um dos itens.");
          return;
        }
        preco_unitario = p;
      }
      payload.push({ materia_prima_id: l.materia_prima_id, quantidade: q, preco_unitario });
      if (l.carimbo_fornecedor.trim()) {
        payload[payload.length - 1].carimbo_fornecedor = l.carimbo_fornecedor.trim();
      }
      if (l.botao_fornecedor.trim()) {
        payload[payload.length - 1].botao_fornecedor = l.botao_fornecedor.trim();
      }
    }

    const desconto = parseNumero(descontoPercentual);
    if (!Number.isFinite(desconto) || desconto < 0 || desconto > 100) {
      setErro("Percentual de desconto inválido (use 0 a 100%).");
      return;
    }

    setErro("");
    setSalvando(true);
    try {
      const codigo = await criarOrdemCompraManual({
        fornecedor_id: fornecedorId || null,
        tipo_material: tipoMaterial,
        desconto_percentual: desconto,
        observacao: observacao.trim() || null,
        itens: payload,
      });
      onCriada(codigo);
      onClose();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao criar ordem de compra.");
    } finally {
      setSalvando(false);
    }
  }

  const subtotalEstimado = useMemo(() => {
    let s = 0;
    for (const l of linhas) {
      if (!l.materia_prima_id) continue;
      const q = parseNumero(l.quantidade);
      if (!Number.isFinite(q) || q <= 0) continue;
      let unit: number;
      const precoRaw = l.preco_unitario.trim();
      if (precoRaw !== "") {
        const p = parseNumero(precoRaw);
        unit = Number.isFinite(p) ? p : NaN;
      } else {
        unit = mpById.get(l.materia_prima_id)?.preco_custo ?? 0;
      }
      if (Number.isFinite(unit)) s += q * unit;
    }
    return s;
  }, [linhas, mpById]);
  const descontoPercentualAtual = parseNumero(descontoPercentual);
  const descontoTotalEstimado = calcularDescontoPercentual(
    subtotalEstimado,
    Number.isFinite(descontoPercentualAtual) ? descontoPercentualAtual : 0,
  );
  const totalEstimado = calcularTotalFinalOC(subtotalEstimado, descontoTotalEstimado);

  return (
    <Modal open={open} onClose={onClose} title="Nova ordem de compra" width="1100px">
      <div className="flex flex-col gap-4">
        {erro && (
          <p
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#fee2e2", color: "#dc2626" }}
          >
            {erro}
          </p>
        )}

        <div className="space-y-1.5 shrink-0">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--ac-muted)" }}
          >
            Tipo de material
          </label>
          <SmartSelect
            value={tipoMaterial}
            onChange={updateTipoMaterial}
            disabled={carregando}
            options={opcoesTipoOc}
            placeholder="Selecione o tipo"
            showThumbnails={false}
          />
        </div>

        <div className="space-y-1.5 shrink-0">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--ac-muted)" }}
          >
            {obterRotuloAgrupador(tipoMaterial)}
          </label>
          <SmartSelect
            value={agrupador}
            onChange={updateAgrupador}
            disabled={carregando || !tipoMaterial}
            options={opcoesAgrupadorOc}
            placeholder={
              tipoMaterial
                ? `Todos os ${obterRotuloAgrupador(tipoMaterial).toLowerCase()}s do tipo`
                : "Selecione o tipo"
            }
            showThumbnails={false}
          />
        </div>

        <div className="space-y-1.5 shrink-0">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--ac-muted)" }}
          >
            Fornecedor
          </label>
          <SmartSelect
            value={fornecedorId}
            onChange={setFornecedorId}
            disabled={carregando}
            options={opcoesFornecedorOc}
            placeholder={placeholderFornecedorOc}
            emptyMessage={emptyMessageFornecedorOc}
            showThumbnails={false}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="space-y-1">
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--ac-muted)" }}
              >
                Itens
                {resumoContextoCatalogo ? ` · ${resumoContextoCatalogo}` : ""}
              </span>
              <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                Busque no catálogo e adicione os materiais antes de ajustar quantidade e preço.
              </p>
            </div>
            <span className="text-xs font-medium" style={{ color: "var(--ac-muted)" }}>
              {tipoMaterial
                ? `${materiasPrimasCatalogo.length} resultado${materiasPrimasCatalogo.length === 1 ? "" : "s"}`
                : "Escolha o tipo para habilitar o catálogo"}
            </span>
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
            <div
              className="min-h-0 rounded-lg"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-card)",
              }}
            >
              <div
                className="flex flex-col gap-3 border-b px-4 py-3"
                style={{ borderColor: "var(--ac-border)" }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                      Catálogo de matérias-primas
                    </p>
                    <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                      {resumoContextoCatalogo || "Defina o contexto para buscar os itens"}
                    </p>
                  </div>
                  <span className="text-xs font-medium" style={{ color: "var(--ac-muted)" }}>
                    {materiasPrimasCatalogo.length}{" "}
                    {materiasPrimasCatalogo.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                <input
                  type="text"
                  value={buscaMateria}
                  onChange={(e) => setBuscaMateria(e.target.value)}
                  disabled={carregando || !tipoMaterial}
                  placeholder={
                    tipoMaterial
                      ? "Buscar por SKU, nome ou detalhe do material"
                      : "Escolha o tipo primeiro"
                  }
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    border: "1px solid var(--ac-border)",
                    background: "var(--ac-bg)",
                    color: "var(--ac-text)",
                  }}
                />
              </div>

              <div className="max-h-[min(42vh,420px)] overflow-auto p-3">
                {!tipoMaterial ? (
                  <div
                    className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm"
                    style={{ borderColor: "var(--ac-border)", color: "var(--ac-muted)" }}
                  >
                    Selecione o tipo de material para habilitar o catálogo.
                  </div>
                ) : materiasPrimasCatalogo.length === 0 ? (
                  <div
                    className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm"
                    style={{ borderColor: "var(--ac-border)", color: "var(--ac-muted)" }}
                  >
                    {agrupador
                      ? `Nenhuma matéria-prima encontrada para ${agrupador}.`
                      : `Nenhuma matéria-prima encontrada para ${labelTipoMaterial(tipoMaterial)}.`}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {materiasPrimasCatalogo.map((mp) => {
                      const linhaSelecionada = linhasByMateriaId.get(mp.id);
                      const quantidadeSelecionada = linhaSelecionada
                        ? parseNumero(linhaSelecionada.quantidade)
                        : NaN;
                      const jaSelecionada = Boolean(linhaSelecionada);
                      return (
                        <div
                          key={mp.id}
                          className="rounded-xl border p-3 transition-colors"
                          style={{
                            borderColor:
                              materiaPrimaDestacadaId === mp.id
                                ? "var(--ac-accent)"
                                : "var(--ac-border)",
                            background:
                              materiaPrimaDestacadaId === mp.id
                                ? "color-mix(in srgb, var(--ac-accent) 12%, var(--ac-card))"
                                : "var(--ac-card)",
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                  <p
                                    className="text-[11px] font-semibold uppercase tracking-wide"
                                    style={{ color: "var(--ac-muted)" }}
                                  >
                                    SKU
                                  </p>
                                  <p
                                    className="text-sm font-semibold"
                                    style={{ color: "var(--ac-text)" }}
                                  >
                                    {mp.sku || "—"}
                                  </p>
                                </div>
                                <span
                                  className="rounded-full px-2 py-1 text-[11px] font-medium"
                                  style={{
                                    background:
                                      "color-mix(in srgb, var(--ac-border) 40%, transparent)",
                                    color: "var(--ac-muted)",
                                  }}
                                >
                                  {obterAgrupadorMaterial(mp)}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <p
                                  className="text-sm font-medium"
                                  style={{ color: "var(--ac-text)" }}
                                >
                                  {mp.nome}
                                </p>
                                <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                                  {colunasEspecificasCriacao.length > 0
                                    ? colunasEspecificasCriacao
                                        .map((coluna) => `${coluna.label}: ${coluna.value(mp)}`)
                                        .join(" · ")
                                    : "Material genérico"}
                                </p>
                              </div>

                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                                  Custo atual:{" "}
                                  <span style={{ color: "var(--ac-text)" }}>
                                    {fmt(mp.preco_custo ?? 0)}
                                  </span>
                                </p>
                                {jaSelecionada ? (
                                  <p
                                    className="text-xs font-medium"
                                    style={{ color: "var(--ac-accent)" }}
                                  >
                                    Na ordem:{" "}
                                    {fmtQtd(
                                      Number.isFinite(quantidadeSelecionada)
                                        ? quantidadeSelecionada
                                        : 0,
                                    )}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant={jaSelecionada ? "secondary" : "primary"}
                              onClick={() => adicionarMateriaPrima(mp.id)}
                              disabled={carregando}
                              className="shrink-0"
                            >
                              {jaSelecionada ? "Adicionar +1" : "Adicionar"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              className="min-h-0 rounded-lg"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-card)",
              }}
            >
              <div
                className="flex items-center justify-between gap-2 border-b px-4 py-3"
                style={{ borderColor: "var(--ac-border)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--ac-text)" }}>
                    Itens da ordem
                  </p>
                  <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                    Ajuste quantidade e preço dos itens adicionados.
                  </p>
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--ac-muted)" }}>
                  {linhas.length} {linhas.length === 1 ? "item" : "itens"}
                </span>
              </div>

              <div className="max-h-[min(42vh,420px)] overflow-auto p-3">
                {linhas.length === 0 ? (
                  <div
                    className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm"
                    style={{ borderColor: "var(--ac-border)", color: "var(--ac-muted)" }}
                  >
                    Nenhum item adicionado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {linhas.map((l) => {
                      const mpSelecionada = mpById.get(l.materia_prima_id) ?? null;
                      const quantidade = parseNumero(l.quantidade);
                      const precoRaw = l.preco_unitario.trim();
                      const precoUnitario =
                        precoRaw !== "" ? parseNumero(precoRaw) : (mpSelecionada?.preco_custo ?? 0);
                      const opcoesCarimboFornecedor = getOpcoesSelectOc(
                        opcoesMateriais.carimbo,
                        l.carimbo_fornecedor,
                      );
                      const opcoesBotaoFornecedor = getOpcoesSelectOc(
                        opcoesMateriais.botao,
                        l.botao_fornecedor,
                      );
                      const subtotalItem =
                        Number.isFinite(quantidade) &&
                        quantidade > 0 &&
                        Number.isFinite(precoUnitario)
                          ? quantidade * precoUnitario
                          : NaN;
                      return (
                        <div
                          key={l.key}
                          className="rounded-xl border p-3 transition-colors"
                          style={{
                            borderColor:
                              materiaPrimaDestacadaId === l.materia_prima_id
                                ? "var(--ac-accent)"
                                : "var(--ac-border)",
                            background:
                              materiaPrimaDestacadaId === l.materia_prima_id
                                ? "color-mix(in srgb, var(--ac-accent) 12%, var(--ac-card))"
                                : "var(--ac-card)",
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <p
                                  className="text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ color: "var(--ac-muted)" }}
                                >
                                  SKU {mpSelecionada?.sku ?? "—"}
                                </p>
                                <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                                  Subtotal:{" "}
                                  <span style={{ color: "var(--ac-text)" }}>
                                    {Number.isFinite(subtotalItem) ? fmt(subtotalItem) : "—"}
                                  </span>
                                </p>
                              </div>
                              <p
                                className="text-sm font-medium"
                                style={{ color: "var(--ac-text)" }}
                              >
                                {mpSelecionada?.nome ?? "Item sem nome"}
                              </p>
                              <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                                {colunasEspecificasCriacao.length > 0
                                  ? colunasEspecificasCriacao
                                      .map(
                                        (coluna) =>
                                          `${coluna.label}: ${coluna.value(mpSelecionada)}`,
                                      )
                                      .join(" · ")
                                  : "Material genérico"}
                              </p>
                              {l.carimbo_fornecedor || l.botao_fornecedor ? (
                                <p className="text-xs" style={{ color: "var(--ac-muted)" }}>
                                  {getResumoFornecedorItem({
                                    carimbo_fornecedor: l.carimbo_fornecedor || null,
                                    botao_fornecedor: l.botao_fornecedor || null,
                                  })}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              title="Remover item"
                              onClick={() => removeLinha(l.key)}
                              className="p-1.5 rounded-lg"
                              style={{ color: "#dc2626" }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                className="size-4"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14H6L5 6" />
                              </svg>
                            </button>
                          </div>

                          <div
                            className="mt-3 grid gap-3"
                            style={{
                              gridTemplateColumns:
                                tipoMaterial === "lamina" || tipoMaterial === "bainha"
                                  ? "repeat(3, minmax(0, 1fr))"
                                  : "repeat(2, minmax(0, 1fr))",
                            }}
                          >
                            <div className="space-y-1.5">
                              <label
                                className="text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: "var(--ac-muted)" }}
                              >
                                Quantidade
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={l.quantidade}
                                onChange={(e) => updateLinha(l.key, { quantidade: e.target.value })}
                                className="w-full rounded-lg px-3 py-2 text-sm text-right"
                                style={{
                                  border: "1px solid var(--ac-border)",
                                  background: "var(--ac-bg)",
                                  color: "var(--ac-text)",
                                }}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label
                                className="text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: "var(--ac-muted)" }}
                              >
                                Preço unit.
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={l.preco_unitario}
                                onChange={(e) =>
                                  updateLinha(l.key, { preco_unitario: e.target.value })
                                }
                                placeholder="Custo MP"
                                className="w-full rounded-lg px-3 py-2 text-sm text-right"
                                style={{
                                  border: "1px solid var(--ac-border)",
                                  background: "var(--ac-bg)",
                                  color: "var(--ac-text)",
                                }}
                              />
                            </div>

                            {tipoMaterial === "lamina" ? (
                              <div className="space-y-1.5">
                                <label
                                  className="text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ color: "var(--ac-muted)" }}
                                >
                                  Carimbo
                                </label>
                                <SmartSelect
                                  value={l.carimbo_fornecedor}
                                  onChange={(value) =>
                                    updateLinha(l.key, { carimbo_fornecedor: value })
                                  }
                                  options={opcoesCarimboFornecedor}
                                  placeholder="Selecione o carimbo"
                                  showThumbnails={false}
                                />
                              </div>
                            ) : null}

                            {tipoMaterial === "bainha" ? (
                              <div className="space-y-1.5">
                                <label
                                  className="text-[11px] font-semibold uppercase tracking-wide"
                                  style={{ color: "var(--ac-muted)" }}
                                >
                                  Botão
                                </label>
                                <SmartSelect
                                  value={l.botao_fornecedor}
                                  onChange={(value) =>
                                    updateLinha(l.key, { botao_fornecedor: value })
                                  }
                                  options={opcoesBotaoFornecedor}
                                  placeholder="Selecione o botão"
                                  showThumbnails={false}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 shrink-0">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              Observações (opcional)
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm resize-y min-h-[3rem]"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-text)",
              }}
              placeholder="Notas internas sobre esta OC…"
            />
          </div>

          <div className="space-y-1.5 shrink-0">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              % Desconto
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={descontoPercentual}
              onChange={(e) => setDescontoPercentual(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg px-3 py-2 text-sm text-right"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-text)",
              }}
            />
          </div>

          <div className="space-y-1 text-sm text-right">
            <p style={{ color: "var(--ac-muted)" }}>
              Subtotal: <span style={{ color: "var(--ac-text)" }}>{fmt(subtotalEstimado)}</span>
            </p>
            <p style={{ color: "var(--ac-muted)" }}>
              Desconto:{" "}
              <span style={{ color: "var(--ac-text)" }}>
                {fmtPercentual(
                  Number.isFinite(descontoPercentualAtual) ? descontoPercentualAtual : 0,
                )}
                % · {fmt(descontoTotalEstimado)}
              </span>
            </p>
            <p className="font-medium" style={{ color: "var(--ac-text)" }}>
              Total estimado:{" "}
              <span style={{ color: "var(--ac-accent)" }}>{fmt(totalEstimado)}</span>
            </p>
          </div>
        </div>

        <div
          className="sticky bottom-0 z-10 -mx-6 mt-2 flex flex-wrap gap-2 justify-end px-6 pt-3 pb-1 shrink-0"
          style={{
            borderTop: "1px solid var(--ac-border)",
            background:
              "linear-gradient(to top, var(--ac-card) 82%, color-mix(in srgb, var(--ac-card) 84%, transparent))",
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={salvando} onClick={salvar} disabled={carregando}>
            Criar ordem
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function OcClient({ fila, ordens, perm, usuarioLogadoId, usuariosRegistroInicial }: Props) {
  const { refreshActiveTab } = useErpTabs();
  const queryClient = useQueryClient();
  const [aba, setAba] = useState<"fila" | "historico">("fila");
  const { data: ordensLista = ordens } = useOrdensCompra({ initialData: ordens });
  const { data: filaLista = fila } = useFilaReposicao({ initialData: fila });
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  useEffect(() => {
    queryClient.setQueryData(qk.ordensCompra.list(), ordens);
  }, [ordens, queryClient]);

  useEffect(() => {
    queryClient.setQueryData(qk.ordensCompra.fila(), fila);
  }, [fila, queryClient]);

  const [ocAberta, setOcAberta] = useState<OrdemCompra | null>(null);

  useEffect(() => {
    setOcAberta((prev) => {
      if (!prev) return prev;
      const atual = ordensLista.find((o) => o.id === prev.id);
      return atual ?? prev;
    });
  }, [ordensLista]);

  const [filaAberta, setFilaAberta] = useState<FilaReposicao | null>(null);
  const [deletando, setDeletando] = useState<OrdemCompra | null>(null);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [erroDelete, setErroDelete] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroListaOC>("todas");
  const [ocCriarOpen, setOcCriarOpen] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const gerarTodasInFlightRef = useRef(false);

  // Cache + in-flight de detalhes de fila para abrir o modal sem espera.
  // Disparamos a busca no mouseEnter (e no focus, p/ teclado). Quando o clique
  // chega, na maioria das vezes a resposta já chegou ou está perto de chegar.
  const filaDetalheCacheRef = useRef<Map<string, FilaReposicaoDetalhe>>(new Map());
  const filaDetalheInFlightRef = useRef<Map<string, Promise<FilaReposicaoDetalhe>>>(new Map());
  function prefetchFilaDetalhe(fila_id: string) {
    if (filaDetalheCacheRef.current.has(fila_id)) return;
    if (filaDetalheInFlightRef.current.has(fila_id)) return;
    const p = getFilaReposicaoDetalhe(fila_id)
      .then((d) => {
        filaDetalheCacheRef.current.set(fila_id, d);
        return d;
      })
      .catch((e) => {
        throw e;
      })
      .finally(() => {
        filaDetalheInFlightRef.current.delete(fila_id);
      });
    filaDetalheInFlightRef.current.set(fila_id, p);
  }

  useEffect(() => {
    if (aba !== "historico" || ordensLista.length > 0 || loadingHistorico) return;

    let cancelled = false;
    async function carregarHistorico() {
      setLoadingHistorico(true);
      try {
        const data = await getOrdensCompra();
        if (!cancelled) queryClient.setQueryData(qk.ordensCompra.list(), data);
      } catch (e: unknown) {
        if (!cancelled) setErro(e instanceof Error ? e.message : "Erro ao carregar histórico.");
      } finally {
        if (!cancelled) setLoadingHistorico(false);
      }
    }

    carregarHistorico();
    return () => {
      cancelled = true;
    };
  }, [aba, ordensLista.length, loadingHistorico, queryClient]);

  async function refresh() {
    setLoadingHistorico(true);
    try {
      const [filaAtualizada, ordensAtualizadas] = await Promise.all([
        getFilaReposicaoList(),
        getOrdensCompra(),
      ]);
      queryClient.setQueryData(qk.ordensCompra.fila(), filaAtualizada);
      queryClient.setQueryData(qk.ordensCompra.list(), ordensAtualizadas);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setLoadingHistorico(false);
    }
    refreshActiveTab();
  }

  function flash(msg: string) {
    setSucesso(msg);
    setTimeout(() => setSucesso(""), 3500);
  }

  async function handleDeleteOC() {
    if (!deletando) return;
    setLoadingDelete(true);
    setErroDelete("");
    try {
      await deletarOC(deletando.id);
      setDeletando(null);
      refresh();
    } catch (e: unknown) {
      setErroDelete(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setLoadingDelete(false);
    }
  }

  const [agruparPorPedido, setAgruparPorPedido] = useState(true);
  const [periodoIni, setPeriodoIni] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [filaPeriodoIni, setFilaPeriodoIni] = useState("");
  const [filaPeriodoFim, setFilaPeriodoFim] = useState("");
  const [selecionadasIds, setSelecionadasIds] = useState<Set<string>>(new Set());
  const [exportacaoPendente, setExportacaoPendente] = useState<OrdemCompra[] | null>(null);

  const filaFiltrada = useMemo(() => {
    if (!filaPeriodoIni && !filaPeriodoFim) return filaLista;
    return filaLista.filter((item) => {
      const d = (item.created_at || "").slice(0, 10);
      if (filaPeriodoIni && d < filaPeriodoIni) return false;
      if (filaPeriodoFim && d > filaPeriodoFim) return false;
      return true;
    });
  }, [filaLista, filaPeriodoIni, filaPeriodoFim]);

  const ordensFiltradas = useMemo(() => {
    let lista =
      filtroStatus === "todas"
        ? ordensLista
        : filtroStatus === "pagas"
          ? ordensLista.filter((o) => o.pago)
          : ordensLista.filter((o) => o.status === filtroStatus);
    if (periodoIni || periodoFim) {
      lista = lista.filter((o) => {
        const d = (o.data_geracao || "").slice(0, 10);
        if (periodoIni && d < periodoIni) return false;
        if (periodoFim && d > periodoFim) return false;
        return true;
      });
    }
    return lista;
  }, [ordensLista, filtroStatus, periodoIni, periodoFim]);

  // Limpa seleções que saíram do filtro para evitar imprimir OCs invisíveis.
  useEffect(() => {
    setSelecionadasIds((prev) => {
      const visiveis = new Set(ordensFiltradas.map((o) => o.id));
      let mudou = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visiveis.has(id)) next.add(id);
        else mudou = true;
      }
      return mudou ? next : prev;
    });
  }, [ordensFiltradas]);

  function toggleSelecionada(id: string) {
    setSelecionadasIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelecionarTudo() {
    setSelecionadasIds((prev) => {
      const todasIds = ordensFiltradas.map((o) => o.id);
      const todasMarcadas = todasIds.length > 0 && todasIds.every((id) => prev.has(id));
      return todasMarcadas ? new Set() : new Set(todasIds);
    });
  }

  function solicitarExportacao(ocs: OrdemCompra[]) {
    if (ocs.length === 0) return;
    setExportacaoPendente(ocs);
  }

  async function confirmarExportacao(modo: ModoExportacaoOc) {
    if (!exportacaoPendente || exportacaoPendente.length === 0) return;
    const ocs = exportacaoPendente;
    setExportacaoPendente(null);
    if (ocs.length === 1) {
      await exportarPDF(ocs[0], modo);
      return;
    }
    await exportarPDFMultiplas(ocs, modo);
  }

  function imprimirSelecionadas() {
    const mapa = new Map(ordensFiltradas.map((o) => [o.id, o]));
    const ocs = Array.from(selecionadasIds)
      .map((id) => mapa.get(id))
      .filter((o): o is OrdemCompra => !!o);
    solicitarExportacao(ocs);
  }

  // Agrupa OCs pelo pedido de origem. OCs manuais (sem pedido_id) ficam num
  // grupo "Sem pedido (manuais)". Mantém a ordem decrescente de created_at ao
  // posicionar cada grupo pelo created_at mais recente entre seus filhos.
  const gruposPorPedido = useMemo(() => {
    if (!agruparPorPedido) return null;
    type Grupo = {
      key: string;
      pedido_codigo: string | null;
      pedido_sequencial: number | null;
      cliente_nome: string | null;
      ocs: OrdemCompra[];
      maisRecente: string;
    };
    const map = new Map<string, Grupo>();
    for (const oc of ordensFiltradas) {
      const key = oc.pedido_id ?? "__manuais__";
      const existente = map.get(key);
      if (existente) {
        existente.ocs.push(oc);
        if (oc.created_at > existente.maisRecente) existente.maisRecente = oc.created_at;
      } else {
        map.set(key, {
          key,
          pedido_codigo: oc.pedido_codigo ?? null,
          pedido_sequencial: oc.pedido_sequencial ?? null,
          cliente_nome: oc.cliente_nome ?? null,
          ocs: [oc],
          maisRecente: oc.created_at,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.maisRecente.localeCompare(a.maisRecente));
  }, [ordensFiltradas, agruparPorPedido]);

  const statusTabs: { value: FiltroListaOC; label: string }[] = [
    { value: "todas", label: "Todas" },
    { value: "pendente", label: "Pendentes" },
    { value: "enviada", label: "Enviadas" },
    { value: "pagas", label: "Pagas" },
    { value: "recebida", label: "Recebidas" },
  ];

  void gerarTodasInFlightRef;

  return (
    <>
      {/* Header */}
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-8 py-6"
        style={{ borderBottom: "1px solid var(--ac-border)" }}
      >
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--ac-text)" }}>
            Ordens de Compra
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--ac-muted)" }}>
            {filaLista.length > 0
              ? `${filaLista.length} ${filaLista.length === 1 ? "pedido" : "pedidos"} aguardando reposição`
              : "Fila de reposição vazia"}
          </p>
        </div>
        {perm.criar && (
          <Button variant="primary" onClick={() => setOcCriarOpen(true)}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-4"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nova ordem de compra
          </Button>
        )}
      </div>

      {/* Alertas */}
      {erro && (
        <div
          className="mx-4 sm:mx-8 mt-4 px-4 py-3 rounded-lg text-sm"
          style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5" }}
        >
          {erro}
        </div>
      )}
      {sucesso && (
        <div
          className="mx-4 sm:mx-8 mt-4 px-4 py-3 rounded-lg text-sm"
          style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }}
        >
          {sucesso}
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 sm:px-8 pt-5">
        <div
          className="flex gap-1 p-1 rounded-lg w-fit"
          style={{ background: "color-mix(in srgb, var(--ac-border) 40%, transparent)" }}
        >
          {[
            { key: "fila" as const, label: "Fila de Reposição", count: filaLista.length },
            { key: "historico" as const, label: "Ordens de Compra", count: ordensLista.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAba(tab.key)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all"
              style={{
                background: aba === tab.key ? "var(--ac-card)" : "transparent",
                color: aba === tab.key ? "var(--ac-text)" : "var(--ac-muted)",
                boxShadow: aba === tab.key ? "0 1px 3px rgba(0,0,0,.08)" : undefined,
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{
                    background: aba === tab.key ? "var(--ac-accent)" : "var(--ac-border)",
                    color: aba === tab.key ? "#111827" : "var(--ac-muted)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Aba: Fila de Reposição ── */}
      {aba === "fila" && (
        <div className="px-4 sm:px-8 py-6">
          {filaLista.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--ac-muted)" }}
              >
                Período:
              </span>
              <input
                type="date"
                value={filaPeriodoIni}
                onChange={(e) => setFilaPeriodoIni(e.target.value)}
                max={filaPeriodoFim || undefined}
                className="px-2 py-1 rounded text-sm"
                style={{
                  border: "1px solid var(--ac-border)",
                  background: "var(--ac-bg)",
                  color: "var(--ac-text)",
                }}
              />
              <span className="text-sm" style={{ color: "var(--ac-muted)" }}>
                até
              </span>
              <input
                type="date"
                value={filaPeriodoFim}
                onChange={(e) => setFilaPeriodoFim(e.target.value)}
                min={filaPeriodoIni || undefined}
                className="px-2 py-1 rounded text-sm"
                style={{
                  border: "1px solid var(--ac-border)",
                  background: "var(--ac-bg)",
                  color: "var(--ac-text)",
                }}
              />
              {(filaPeriodoIni || filaPeriodoFim) && (
                <button
                  onClick={() => {
                    setFilaPeriodoIni("");
                    setFilaPeriodoFim("");
                  }}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    background: "color-mix(in srgb, var(--ac-border) 40%, transparent)",
                    color: "var(--ac-muted)",
                  }}
                  title="Limpar período"
                >
                  Limpar
                </button>
              )}
              <span className="ml-auto text-xs" style={{ color: "var(--ac-muted)" }}>
                {filaFiltrada.length} de {filaLista.length}
              </span>
            </div>
          )}

          {filaLista.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-20 rounded-xl text-center"
              style={{ border: "2px dashed var(--ac-border)" }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="size-12 mb-3"
                style={{ color: "var(--ac-border)" }}
              >
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
              </svg>
              <p className="font-semibold mb-1" style={{ color: "var(--ac-text)" }}>
                Fila vazia
              </p>
              <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
                Quando vendas forem entregues e houver estoques abaixo do mínimo, os pedidos
                aparecerão aqui.
              </p>
            </div>
          ) : filaFiltrada.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 rounded-xl text-center"
              style={{ border: "2px dashed var(--ac-border)" }}
            >
              <p className="font-semibold mb-1" style={{ color: "var(--ac-text)" }}>
                Nenhum pedido neste período
              </p>
              <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
                Ajuste as datas ou clique em Limpar.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--ac-border)", background: "var(--ac-card)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--ac-border)",
                      background: "color-mix(in srgb, var(--ac-border) 30%, transparent)",
                    }}
                  >
                    {["Pedido", "Cliente", "Detectado em", "MPs para repor", "Status", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left"
                          style={{ color: "var(--ac-muted)" }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filaFiltrada.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: idx > 0 ? "1px solid var(--ac-border)" : undefined }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "color-mix(in srgb, var(--ac-border) 20%, transparent)";
                        prefetchFilaDetalhe(item.id);
                      }}
                      onFocus={() => prefetchFilaDetalhe(item.id)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      onClick={() => setFilaAberta(item)}
                    >
                      <td
                        className="px-4 py-3 font-mono font-semibold text-xs"
                        style={{ color: "var(--ac-accent)" }}
                      >
                        {item.pedido_sequencial != null && (
                          <>
                            #{item.pedido_sequencial}
                            <span className="mx-1 opacity-60">·</span>
                          </>
                        )}
                        {item.pedido_codigo}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--ac-text)" }}>
                        {item.cliente_nome}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--ac-muted)" }}>
                        {fmtData(item.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: "color-mix(in srgb, var(--ac-accent) 15%, transparent)",
                            color: "var(--ac-accent)",
                          }}
                        >
                          {item.itens_count} {item.itens_count === 1 ? "item" : "itens"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <BadgeStatusFila status={item.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: "var(--ac-accent)", color: "#111827" }}
                          onMouseEnter={() => prefetchFilaDetalhe(item.id)}
                          onFocus={() => prefetchFilaDetalhe(item.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilaAberta(item);
                          }}
                        >
                          Revisar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Histórico ── */}
      {aba === "historico" && (
        <div className="px-4 sm:px-8 py-6">
          {/* Filtro de status + agrupamento */}
          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <div className="flex gap-2 flex-wrap">
              {statusTabs.map((tab) => {
                const count =
                  tab.value === "todas"
                    ? ordensLista.length
                    : tab.value === "pagas"
                      ? ordensLista.filter((o) => o.pago).length
                      : ordensLista.filter((o) => o.status === tab.value).length;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setFiltroStatus(tab.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background:
                        filtroStatus === tab.value
                          ? "var(--ac-accent)"
                          : "color-mix(in srgb, var(--ac-border) 40%, transparent)",
                      color: filtroStatus === tab.value ? "#111827" : "var(--ac-muted)",
                    }}
                  >
                    {tab.label} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>
            <label
              className="ml-auto flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: "var(--ac-muted)" }}
            >
              <input
                type="checkbox"
                checked={agruparPorPedido}
                onChange={(e) => setAgruparPorPedido(e.target.checked)}
                className="w-4 h-4 cursor-pointer rounded"
                style={{ accentColor: "var(--ac-accent)" }}
              />
              Agrupar por pedido
            </label>
          </div>

          {/* Filtro de período + ação de impressão em massa */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ac-muted)" }}
            >
              Período:
            </span>
            <input
              type="date"
              value={periodoIni}
              onChange={(e) => setPeriodoIni(e.target.value)}
              max={periodoFim || undefined}
              className="px-2 py-1 rounded text-sm"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-text)",
              }}
            />
            <span className="text-sm" style={{ color: "var(--ac-muted)" }}>
              até
            </span>
            <input
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              min={periodoIni || undefined}
              className="px-2 py-1 rounded text-sm"
              style={{
                border: "1px solid var(--ac-border)",
                background: "var(--ac-bg)",
                color: "var(--ac-text)",
              }}
            />
            {(periodoIni || periodoFim) && (
              <button
                onClick={() => {
                  setPeriodoIni("");
                  setPeriodoFim("");
                }}
                className="px-2 py-1 rounded text-xs font-medium"
                style={{
                  background: "color-mix(in srgb, var(--ac-border) 40%, transparent)",
                  color: "var(--ac-muted)",
                }}
                title="Limpar período"
              >
                Limpar
              </button>
            )}
            {selecionadasIds.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm" style={{ color: "var(--ac-muted)" }}>
                  {selecionadasIds.size}{" "}
                  {selecionadasIds.size === 1 ? "selecionada" : "selecionadas"}
                </span>
                <Button variant="secondary" onClick={() => setSelecionadasIds(new Set())}>
                  Limpar
                </Button>
                <Button variant="primary" onClick={imprimirSelecionadas}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="size-4"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  Imprimir {selecionadasIds.size} {selecionadasIds.size === 1 ? "OC" : "OCs"}
                </Button>
              </div>
            )}
          </div>

          {loadingHistorico && (
            <div className="py-8 text-sm" style={{ color: "var(--ac-muted)" }}>
              Carregando histórico de ordens...
            </div>
          )}

          {!loadingHistorico && ordensFiltradas.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 rounded-xl text-center"
              style={{ border: "2px dashed var(--ac-border)" }}
            >
              <p className="font-semibold mb-1" style={{ color: "var(--ac-text)" }}>
                {filtroStatus === "todas"
                  ? "Nenhuma OC gerada ainda"
                  : filtroStatus === "pagas"
                    ? "Nenhuma OC marcada como paga"
                    : `Nenhuma OC ${STATUS_OC[filtroStatus].label.toLowerCase()}`}
              </p>
              <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
                {filtroStatus === "todas"
                  ? 'Use "Nova ordem de compra" no topo ou gere OCs pela aba "Fila de Reposição".'
                  : "Altere o filtro para ver outras."}
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid var(--ac-border)", background: "var(--ac-card)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--ac-border)",
                      background: "color-mix(in srgb, var(--ac-border) 30%, transparent)",
                    }}
                  >
                    <th className="px-3 py-3 w-10 text-left">
                      <input
                        type="checkbox"
                        title="Selecionar todas (filtradas)"
                        checked={
                          ordensFiltradas.length > 0 &&
                          ordensFiltradas.every((o) => selecionadasIds.has(o.id))
                        }
                        ref={(el) => {
                          if (el) {
                            const algumas = ordensFiltradas.some((o) => selecionadasIds.has(o.id));
                            const todas =
                              ordensFiltradas.length > 0 &&
                              ordensFiltradas.every((o) => selecionadasIds.has(o.id));
                            el.indeterminate = algumas && !todas;
                          }
                        }}
                        onChange={toggleSelecionarTudo}
                        className="w-4 h-4 cursor-pointer rounded"
                        style={{ accentColor: "var(--ac-accent)" }}
                      />
                    </th>
                    {[
                      "Código",
                      "Pedido",
                      "Fornecedor",
                      "Data",
                      "Qtd Final",
                      "Total Final",
                      "Status",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-left ${h === "" ? "w-20" : ""}`}
                        style={{ color: "var(--ac-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const renderRow = (oc: OrdemCompra, idx: number) => {
                      const itens = oc.itens ?? [];
                      const quantidadeFinal = itens.reduce(
                        (acc, item) => acc + Number(item.quantidade ?? 0),
                        0,
                      );
                      const total = calcularTotalFinalOC(subtotalOC(itens), oc.desconto_total ?? 0);
                      return (
                        <tr
                          key={oc.id}
                          className="cursor-pointer transition-colors"
                          style={{ borderTop: idx > 0 ? "1px solid var(--ac-border)" : undefined }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "color-mix(in srgb, var(--ac-border) 20%, transparent)")
                          }
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => setOcAberta(oc)}
                        >
                          <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selecionadasIds.has(oc.id)}
                              onChange={() => toggleSelecionada(oc.id)}
                              className="w-4 h-4 cursor-pointer rounded"
                              style={{ accentColor: "var(--ac-accent)" }}
                            />
                          </td>
                          <td
                            className="px-4 py-3 font-mono font-semibold text-xs"
                            style={{ color: "var(--ac-accent)" }}
                          >
                            {oc.sequencial_fornecedor != null && (
                              <>
                                #{oc.sequencial_fornecedor}
                                <span className="mx-1 opacity-60">·</span>
                              </>
                            )}
                            {oc.codigo}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {oc.pedido_codigo ? (
                              <div>
                                <div
                                  className="font-mono font-semibold"
                                  style={{ color: "var(--ac-text)" }}
                                >
                                  {oc.pedido_sequencial != null && (
                                    <span style={{ color: "var(--ac-accent)" }}>
                                      #{oc.pedido_sequencial} ·{" "}
                                    </span>
                                  )}
                                  {oc.pedido_codigo}
                                </div>
                                <div style={{ color: "var(--ac-muted)" }}>
                                  {oc.cliente_nome ?? "—"}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "var(--ac-muted)" }}>Manual</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium" style={{ color: "var(--ac-text)" }}>
                            {oc.fornecedor?.nome ?? "—"}
                          </td>
                          <td className="px-4 py-3" style={{ color: "var(--ac-muted)" }}>
                            {fmtData(oc.data_geracao)}
                          </td>
                          <td className="px-4 py-3" style={{ color: "var(--ac-muted)" }}>
                            {fmtQtd(quantidadeFinal)}
                          </td>
                          <td className="px-4 py-3 font-medium" style={{ color: "var(--ac-text)" }}>
                            {fmt(total)}
                          </td>
                          <td className="px-4 py-3">
                            <BadgeStatus status={oc.status} pago={oc.pago} />
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <button
                                title="Exportar PDF"
                                onClick={() => solicitarExportacao([oc])}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color: "var(--ac-muted)" }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.background = "var(--ac-border)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.background = "transparent")
                                }
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  className="size-4"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                </svg>
                              </button>
                              {perm.deletar && oc.status === "pendente" && (
                                <button
                                  title="Excluir"
                                  onClick={() => {
                                    setDeletando(oc);
                                    setErroDelete("");
                                  }}
                                  className="p-1.5 rounded-lg transition-colors"
                                  style={{ color: "#dc2626" }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.background = "#fee2e2")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.background = "transparent")
                                  }
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    className="size-4"
                                  >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    };

                    if (gruposPorPedido) {
                      let globalIdx = 0;
                      return gruposPorPedido.flatMap((grupo, grupoIdx) => {
                        const totalGrupo = grupo.ocs.reduce(
                          (s, oc) =>
                            s +
                            calcularTotalFinalOC(
                              subtotalOC(oc.itens ?? []),
                              oc.desconto_total ?? 0,
                            ),
                          0,
                        );
                        const idsGrupo = grupo.ocs.map((oc) => oc.id);
                        const todasGrupoMarcadas = idsGrupo.every((id) => selecionadasIds.has(id));
                        const algumasGrupoMarcadas = idsGrupo.some((id) => selecionadasIds.has(id));
                        const header = (
                          <tr
                            key={`header-${grupo.key}`}
                            style={{
                              background: "color-mix(in srgb, var(--ac-accent) 8%, transparent)",
                              borderTop: grupoIdx > 0 ? "2px solid var(--ac-border)" : undefined,
                            }}
                          >
                            <td className="px-3 py-2 w-10">
                              <input
                                type="checkbox"
                                title="Selecionar todas deste pedido"
                                checked={todasGrupoMarcadas}
                                ref={(el) => {
                                  if (el)
                                    el.indeterminate = algumasGrupoMarcadas && !todasGrupoMarcadas;
                                }}
                                onChange={() => {
                                  setSelecionadasIds((prev) => {
                                    const next = new Set(prev);
                                    if (todasGrupoMarcadas)
                                      idsGrupo.forEach((id) => next.delete(id));
                                    else idsGrupo.forEach((id) => next.add(id));
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 cursor-pointer rounded"
                                style={{ accentColor: "var(--ac-accent)" }}
                              />
                            </td>
                            <td colSpan={8} className="px-4 py-2">
                              <div className="flex items-center gap-2 flex-wrap text-sm">
                                {grupo.pedido_codigo ? (
                                  <>
                                    {grupo.pedido_sequencial != null && (
                                      <span
                                        className="font-mono font-bold"
                                        style={{ color: "var(--ac-accent)" }}
                                      >
                                        #{grupo.pedido_sequencial}
                                      </span>
                                    )}
                                    <span
                                      className="font-mono font-bold"
                                      style={{ color: "var(--ac-accent)" }}
                                    >
                                      {grupo.pedido_sequencial != null
                                        ? `· ${grupo.pedido_codigo}`
                                        : grupo.pedido_codigo}
                                    </span>
                                    <span style={{ color: "var(--ac-text)" }}>
                                      · {grupo.cliente_nome ?? "—"}
                                    </span>
                                  </>
                                ) : (
                                  <span
                                    className="font-semibold"
                                    style={{ color: "var(--ac-muted)" }}
                                  >
                                    Ordens manuais (sem pedido)
                                  </span>
                                )}
                                <span className="text-xs" style={{ color: "var(--ac-muted)" }}>
                                  · {grupo.ocs.length} {grupo.ocs.length === 1 ? "OC" : "OCs"}
                                </span>
                                <span
                                  className="ml-auto text-xs font-medium"
                                  style={{ color: "var(--ac-muted)" }}
                                >
                                  Total:{" "}
                                  <span style={{ color: "var(--ac-text)" }}>{fmt(totalGrupo)}</span>
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                        const linhas = grupo.ocs.map((oc) => renderRow(oc, globalIdx++));
                        return [header, ...linhas];
                      });
                    }

                    return ordensFiltradas.map((oc, idx) => renderRow(oc, idx));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal detalhe Fila de Reposição */}
      {filaAberta && (
        <FilaReposicaoDetalheModal
          fila={filaAberta}
          perm={perm}
          initialDetalhe={filaDetalheCacheRef.current.get(filaAberta.id)}
          initialDetalhePromise={filaDetalheInFlightRef.current.get(filaAberta.id)}
          onClose={() => setFilaAberta(null)}
          onRefresh={() => {
            setFilaAberta(null);
            flash("Operação realizada com sucesso.");
            refresh();
            setAba("historico");
          }}
        />
      )}

      {/* Modal detalhe OC */}
      {ocAberta && (
        <OcDetalheModal
          oc={ocAberta}
          perm={perm}
          usuarioLogadoId={usuarioLogadoId}
          usuariosRegistroInicial={usuariosRegistroInicial}
          onClose={() => setOcAberta(null)}
          onRefresh={refresh}
          onRequestExportarPdf={solicitarExportacao}
          onRequestExcluir={() => {
            setDeletando(ocAberta);
            setOcAberta(null);
            setErroDelete("");
          }}
        />
      )}

      <ModalEscolhaExportacaoOc
        open={!!exportacaoPendente}
        quantidade={exportacaoPendente?.length ?? 0}
        onClose={() => setExportacaoPendente(null)}
        onSelect={confirmarExportacao}
      />

      <OcCriarModal
        open={ocCriarOpen}
        onClose={() => setOcCriarOpen(false)}
        onCriada={(codigo) => {
          flash(`OC ${codigo} criada com sucesso.`);
          refresh();
          setAba("historico");
        }}
      />

      {/* Modal confirmar delete */}
      <Modal open={!!deletando} onClose={() => setDeletando(null)} title="Excluir Ordem de Compra">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--ac-muted)" }}>
            Tem certeza que deseja excluir a OC{" "}
            <strong style={{ color: "var(--ac-text)" }}>
              {deletando?.sequencial_fornecedor != null
                ? `#${deletando.sequencial_fornecedor} · `
                : ""}
              {deletando?.codigo}
            </strong>
            ? Esta ação não pode ser desfeita.
          </p>
          {erroDelete && (
            <p
              className="text-sm px-3 py-2 rounded-lg"
              style={{ background: "#fee2e2", color: "#dc2626" }}
            >
              {erroDelete}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setDeletando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={loadingDelete} onClick={handleDeleteOC}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
