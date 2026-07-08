"use server";

import { revalidateTag } from "next/cache";
import { assertPermissao, requireAuthenticatedUserId } from "@/lib/auth";
import { fetchFornecedoresFullList } from "@/lib/cache/list-data";
import { prisma } from "@/lib/prisma";
import type {
  Fornecedor,
  OrdemCompraHistoricoResumo,
  StatusOC,
  TipoDocumento,
  TipoMaterial,
} from "@/types";
import { apenasDigitos } from "@/lib/br/documento";
import { validarCamposObrigatoriosFornecedor } from "@/lib/br/validar-cadastro-parceiro";

async function revalidateFornecedoresList() {
  try {
    const userId = await requireAuthenticatedUserId();
    revalidateTag(`list-fornecedores-${userId}`, "max");
    revalidateTag(`list-fornecedores-select-${userId}`, "max");
  } catch {}
}

function normalizarTiposMaterial(input: TipoMaterial[] | undefined): TipoMaterial[] {
  const permitidos: TipoMaterial[] = ["lamina", "cabo", "bainha", "latao"];
  const unicos = new Set((input ?? []).filter((item): item is TipoMaterial => permitidos.includes(item)));
  return Array.from(unicos);
}

function fornecedorAtendeTipo(fornecedor: Fornecedor, tipoMaterial?: TipoMaterial | null): boolean {
  if (!tipoMaterial) return true;
  const tipos = fornecedor.tipos_materiais ?? [];
  return tipos.length === 0 || tipos.includes(tipoMaterial);
}

export async function getFornecedores(limit = 50, tipoMaterial?: TipoMaterial): Promise<Fornecedor[]> {
  const userId = await requireAuthenticatedUserId();
  // Lista compartilhada por boletos, consumíveis e OCs; não deve herdar permissão administrativa.
  const rows = await fetchFornecedoresFullList(userId);
  return rows.filter((fornecedor) => fornecedorAtendeTipo(fornecedor, tipoMaterial)).slice(0, limit);
}

/** Mantido para compatibilidade — agora idêntico a `getFornecedores`. */
export async function getFornecedoresSemCache(limit = 50, tipoMaterial?: TipoMaterial): Promise<Fornecedor[]> {
  return getFornecedores(limit, tipoMaterial);
}

const STATUS_OC_VALIDOS: readonly StatusOC[] = ["pendente", "enviada", "recebida"];

function normalizarStatusOCHistorico(row: { status?: unknown; pago?: unknown }): {
  status: StatusOC;
  pago: boolean;
} {
  let status = String(row.status ?? "pendente");
  let pago = Boolean(row.pago);
  if (status === "pago") {
    status = "enviada";
    pago = true;
  }
  if (!STATUS_OC_VALIDOS.includes(status as StatusOC)) status = "pendente";
  return { status: status as StatusOC, pago };
}

function mapFornecedorRow(row: {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  tipoDocumento: TipoDocumento;
  documento: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  razaoSocial: string | null;
  ie: string | null;
  codigoMunicipioIbge: string | null;
  createdAt: Date;
  tiposMaterial?: { tipoMaterial: TipoMaterial }[];
}): Fornecedor {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    email: row.email,
    tipo_documento: row.tipoDocumento,
    documento: row.documento,
    cep: row.cep,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    razao_social: row.razaoSocial,
    ie: row.ie,
    codigo_municipio_ibge: row.codigoMunicipioIbge,
    tipos_materiais: row.tiposMaterial?.map((item) => item.tipoMaterial) ?? [],
    created_at: row.createdAt.toISOString(),
  };
}

function numberFrom(value: { toNumber(): number } | number | null | undefined): number {
  if (typeof value === "number") return value;
  return value?.toNumber() ?? 0;
}

/** Ordens de compra do fornecedor — usado no modal de detalhe. */
export async function getOrdensCompraPorFornecedor(
  fornecedorId: string,
  limit = 200,
): Promise<OrdemCompraHistoricoResumo[]> {
  await assertPermissao("ordens_compra", "ver");
  const data = await prisma.ordemCompra.findMany({
    where: { fornecedorId },
    orderBy: [{ dataGeracao: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      itens: {
        select: {
          quantidade: true,
          precoUnitario: true,
        },
      },
      filaReposicao: {
        include: {
          pedido: {
            include: {
              cliente: {
                select: { nome: true },
              },
            },
          },
        },
      },
    },
  });

  return data.map((row) => {
    const subtotal = row.itens.reduce(
      (s, it) => s + numberFrom(it.quantidade) * numberFrom(it.precoUnitario),
      0,
    );
    const valor_total = Math.max(0, subtotal - numberFrom(row.descontoTotal));
    const pedido = row.filaReposicao?.pedido ?? null;
    const cliente = pedido?.cliente ?? null;
    const { status, pago } = normalizarStatusOCHistorico(row);
    return {
      id: row.id,
      codigo: row.codigo,
      sequencial_fornecedor: row.sequencialFornecedor ?? null,
      data_geracao: row.dataGeracao.toISOString().slice(0, 10),
      status,
      pago,
      valor_total,
      pedido_codigo: pedido?.codigo ?? null,
      pedido_sequencial: pedido?.sequencial ? Number(pedido.sequencial) : null,
      cliente_nome: cliente?.nome ?? null,
    };
  });
}

type FornecedorInput = {
  nome: string;
  telefone: string;
  email: string;
  tipo_documento: TipoDocumento;
  documento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  razao_social?: string;
  ie?: string;
  codigo_municipio_ibge?: string;
  tipos_materiais?: TipoMaterial[];
};

function normalizarFornecedorPayload(input: FornecedorInput) {
  validarCamposObrigatoriosFornecedor(input);

  const doc = apenasDigitos(input.documento);
  const cep = apenasDigitos(input.cep);
  const uf = input.uf.trim().toUpperCase();
  const ibge = apenasDigitos(input.codigo_municipio_ibge ?? "");

  return {
    nome: input.nome.trim(),
    telefone: input.telefone.trim(),
    email: input.email.trim() || null,
    tipo_documento: input.tipo_documento,
    documento: doc,
    cep,
    logradouro: input.logradouro.trim(),
    numero: input.numero.trim(),
    complemento: input.complemento.trim() || null,
    bairro: input.bairro.trim(),
    cidade: input.cidade.trim(),
    uf,
    razao_social: (input.razao_social ?? "").trim() || null,
    ie: (input.ie ?? "").trim() || null,
    codigo_municipio_ibge: ibge,
    tipos_materiais: normalizarTiposMaterial(input.tipos_materiais),
  };
}

export async function criarFornecedor(input: FornecedorInput) {
  await assertPermissao("fornecedores", "criar");
  const row = normalizarFornecedorPayload(input);
  await prisma.fornecedor.create({
    data: {
      nome: row.nome,
      telefone: row.telefone,
      email: row.email,
      tipoDocumento: row.tipo_documento,
      documento: row.documento,
      cep: row.cep,
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento,
      bairro: row.bairro,
      cidade: row.cidade,
      uf: row.uf,
      razaoSocial: row.razao_social,
      ie: row.ie,
      codigoMunicipioIbge: row.codigo_municipio_ibge,
      tiposMaterial: row.tipos_materiais.length
        ? {
            createMany: {
              data: row.tipos_materiais.map((tipoMaterial) => ({ tipoMaterial })),
            },
          }
        : undefined,
    },
  });
  await revalidateFornecedoresList();
}

export async function atualizarFornecedor(id: string, input: FornecedorInput) {
  await assertPermissao("fornecedores", "editar");
  const row = normalizarFornecedorPayload(input);
  await prisma.fornecedor.update({
    where: { id },
    data: {
      nome: row.nome,
      telefone: row.telefone,
      email: row.email,
      tipoDocumento: row.tipo_documento,
      documento: row.documento,
      cep: row.cep,
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento,
      bairro: row.bairro,
      cidade: row.cidade,
      uf: row.uf,
      razaoSocial: row.razao_social,
      ie: row.ie,
      codigoMunicipioIbge: row.codigo_municipio_ibge,
      tiposMaterial: {
        deleteMany: {},
        ...(row.tipos_materiais.length
          ? {
              createMany: {
                data: row.tipos_materiais.map((tipoMaterial) => ({ tipoMaterial })),
              },
            }
          : {}),
      },
    },
  });
  await revalidateFornecedoresList();
}

export async function deletarFornecedor(id: string) {
  await assertPermissao("fornecedores", "deletar");
  const uso = await prisma.materiaPrima.findFirst({
    where: { fornecedorId: id },
    select: { id: true },
  });

  if (uso) {
    throw new Error("Este fornecedor possui matérias-primas vinculadas e não pode ser excluído.");
  }

  await prisma.fornecedor.delete({ where: { id } });
  await revalidateFornecedoresList();
}
