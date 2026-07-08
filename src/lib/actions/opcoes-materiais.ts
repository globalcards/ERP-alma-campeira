'use server'

import { Prisma } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { assertPermissao, requireAuthenticatedUserId } from '@/lib/auth'
import { fetchOpcoesMaterialList } from '@/lib/cache/list-data'
import { prisma } from '@/lib/prisma'
import type { OpcaoMaterial, OpcoesMateriaisPorTipo, TipoOpcaoMaterial } from '@/types'

const TIPOS_OPCAO_MATERIAL: TipoOpcaoMaterial[] = ['aco', 'cabo', 'botao', 'carimbo', 'bainha']

type OpcaoMaterialInput = {
  nome: string
}

async function revalidateOpcoesMateriais(tipo?: TipoOpcaoMaterial) {
  try {
    const userId = await requireAuthenticatedUserId()
    const tipos = tipo ? [tipo] : TIPOS_OPCAO_MATERIAL
    for (const item of tipos) {
      revalidateTag(`list-opcoes-material-${userId}-${item}-active`, 'max')
      revalidateTag(`list-opcoes-material-${userId}-${item}-all`, 'max')
    }
    revalidateTag(`list-materias-primas-${userId}`, 'max')
    revalidateTag(`list-facas-${userId}`, 'max')
  } catch {}
}

function normalizeNome(nome: string): string {
  const normalized = nome.trim()
  if (!normalized) throw new Error('Nome é obrigatório.')
  return normalized
}

function throwFriendlyUniqueError(error: unknown, tipo: TipoOpcaoMaterial): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const label = tipo === 'aco' ? 'aço' : tipo === 'cabo' ? 'cabo' : tipo === 'botao' ? 'botão' : tipo === 'carimbo' ? 'carimbo' : 'bainha'
    throw new Error(`Já existe um ${label} com esse nome.`)
  }
  throw error
}

async function countUsoOpcaoMaterial(
  tx: Prisma.TransactionClient,
  tipo: TipoOpcaoMaterial,
  nome: string,
): Promise<number> {
  if (tipo === 'aco') return tx.materialLamina.count({ where: { aco: nome } })
  if (tipo === 'carimbo') return tx.materialLamina.count({ where: { carimbo: nome } })
  if (tipo === 'cabo') return tx.materialCabo.count({ where: { tipo: nome } })
  if (tipo === 'botao') return tx.materialBainha.count({ where: { botao: nome } })
  return tx.materialBainha.count({ where: { modelo: nome } })
}

async function cascadeRenameOpcaoMaterial(
  tx: Prisma.TransactionClient,
  tipo: TipoOpcaoMaterial,
  nomeAnterior: string,
  nomeNovo: string,
) {
  if (nomeAnterior === nomeNovo) return
  if (tipo === 'aco') {
    await tx.materialLamina.updateMany({ where: { aco: nomeAnterior }, data: { aco: nomeNovo } })
    return
  }
  if (tipo === 'carimbo') {
    await tx.materialLamina.updateMany({
      where: { carimbo: nomeAnterior },
      data: { carimbo: nomeNovo },
    })
    return
  }
  if (tipo === 'cabo') {
    await tx.materialCabo.updateMany({ where: { tipo: nomeAnterior }, data: { tipo: nomeNovo } })
    return
  }
  if (tipo === 'botao') {
    await tx.materialBainha.updateMany({
      where: { botao: nomeAnterior },
      data: { botao: nomeNovo },
    })
    return
  }
  await tx.materialBainha.updateMany({
    where: { modelo: nomeAnterior },
    data: { modelo: nomeNovo },
  })
}

export async function getOpcoesMaterial(
  tipo: TipoOpcaoMaterial,
  incluirInativos = false,
): Promise<OpcaoMaterial[]> {
  await assertPermissao('materias_primas', 'ver')
  const userId = await requireAuthenticatedUserId()
  return fetchOpcoesMaterialList(userId, tipo, incluirInativos)
}

export async function getOpcoesMaterialPorTipo(
  incluirInativos = false,
): Promise<OpcoesMateriaisPorTipo> {
  await assertPermissao('materias_primas', 'ver')
  const userId = await requireAuthenticatedUserId()
  const entries = await Promise.all(
    TIPOS_OPCAO_MATERIAL.map(async (tipo) => [
      tipo,
      await fetchOpcoesMaterialList(userId, tipo, incluirInativos),
    ] as const),
  )
  return Object.fromEntries(entries) as OpcoesMateriaisPorTipo
}

export async function criarOpcaoMaterial(tipo: TipoOpcaoMaterial, input: OpcaoMaterialInput) {
  await assertPermissao('materias_primas', 'criar')
  const nome = normalizeNome(input.nome)
  const ultima = await prisma.opcaoMaterial.findFirst({
    where: { tipo },
    select: { ordem: true },
    orderBy: { ordem: 'desc' },
  })

  try {
    await prisma.opcaoMaterial.create({
      data: {
        tipo,
        nome,
        ordem: (ultima?.ordem ?? 0) + 1,
        ativo: true,
      },
    })
  } catch (error) {
    throwFriendlyUniqueError(error, tipo)
  }

  await revalidateOpcoesMateriais(tipo)
}

export async function atualizarOpcaoMaterial(
  id: string,
  tipo: TipoOpcaoMaterial,
  input: OpcaoMaterialInput,
) {
  await assertPermissao('materias_primas', 'editar')
  const nome = normalizeNome(input.nome)
  const atual = await prisma.opcaoMaterial.findUnique({
    where: { id },
    select: { id: true, nome: true, tipo: true },
  })

  if (!atual || atual.tipo !== tipo) throw new Error('Opção configurável não encontrada.')

  try {
    await prisma.$transaction(async (tx) => {
      await tx.opcaoMaterial.update({
        where: { id },
        data: { nome },
      })
      await cascadeRenameOpcaoMaterial(tx, tipo, atual.nome, nome)
    })
  } catch (error) {
    throwFriendlyUniqueError(error, tipo)
  }

  await revalidateOpcoesMateriais(tipo)
}

export async function alterarStatusOpcaoMaterial(id: string, ativo: boolean) {
  await assertPermissao('materias_primas', 'editar')
  const atual = await prisma.opcaoMaterial.findUnique({
    where: { id },
    select: { id: true, tipo: true },
  })
  if (!atual) throw new Error('Opção configurável não encontrada.')

  await prisma.opcaoMaterial.update({
    where: { id },
    data: { ativo },
  })

  await revalidateOpcoesMateriais(atual.tipo)
}

export async function deletarOpcaoMaterial(id: string) {
  await assertPermissao('materias_primas', 'deletar')
  const atual = await prisma.opcaoMaterial.findUnique({
    where: { id },
    select: { id: true, tipo: true, nome: true },
  })
  if (!atual) throw new Error('Opção configurável não encontrada.')

  const uso = await prisma.$transaction(async (tx) => countUsoOpcaoMaterial(tx, atual.tipo, atual.nome))
  if (uso > 0) {
    throw new Error('Esta opção já está em uso. Inative-a em vez de excluir.')
  }

  await prisma.opcaoMaterial.delete({ where: { id } })
  await revalidateOpcoesMateriais(atual.tipo)
}
