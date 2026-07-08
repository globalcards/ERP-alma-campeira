import { Suspense } from 'react'
import { ConfiguracoesClient } from '@/components/configuracoes/configuracoes-client'
import { getCategoriasFaca } from '@/lib/actions/categorias-faca'
import { getCategoriasConsumivel } from '@/lib/actions/categorias-consumivel'
import { getOpcoesMaterialPorTipo } from '@/lib/actions/opcoes-materiais'
import { getTaxasLucroConfig } from '@/lib/actions/app-config'
import { getEmpresa } from '@/lib/actions/empresa'
import { getPermissoesEfetivas } from '@/lib/auth'
import { ConfiguracoesSkeleton } from '@/components/ui/page-skeletons-config'

export const metadata = { title: 'Configurações — Alma Campeira' }

export default async function ConfiguracoesPage() {
  return (
    <Suspense fallback={<ConfiguracoesSkeleton />}>
      <ConfiguracoesPageData />
    </Suspense>
  )
}

async function ConfiguracoesPageData() {
  const [perms, categorias, categoriasConsumivel, opcoesMateriais, taxasLucro, empresa] = await Promise.all([
    getPermissoesEfetivas(),
    getCategoriasFaca(),
    getCategoriasConsumivel(),
    getOpcoesMaterialPorTipo(true),
    getTaxasLucroConfig(),
    getEmpresa().catch(() => null),
  ])
  return (
    <div data-nav-content-ready="Configurações">
      <ConfiguracoesClient
        categorias={categorias}
        categoriasConsumivel={categoriasConsumivel}
        opcoesMateriais={opcoesMateriais}
        taxasLucro={taxasLucro}
        permTaxasLucro={perms.taxas_lucro}
        empresa={empresa}
      />
    </div>
  )
}
