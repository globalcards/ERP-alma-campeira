'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  alterarStatusOpcaoMaterial,
  atualizarOpcaoMaterial,
  criarOpcaoMaterial,
  deletarOpcaoMaterial,
} from '@/lib/actions/opcoes-materiais'
import { labelTipoOpcaoMaterial, labelTipoOpcaoMaterialSingular } from '@/lib/materiais/opcoes'
import { useOpcoesMaterial } from '@/lib/query/hooks'
import { useResourceRefresh } from '@/lib/realtime/client'
import type { OpcaoMaterial, TipoOpcaoMaterial } from '@/types'

type Props = {
  tipo: TipoOpcaoMaterial
  opcoes: OpcaoMaterial[]
}

export function OpcoesMaterialSection({ tipo, opcoes }: Props) {
  const { data: opcoesAtuais = opcoes } = useOpcoesMaterial(tipo, {
    initialData: opcoes,
    incluirInativos: true,
  })
  const { refreshResources } = useResourceRefresh()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<OpcaoMaterial | null>(null)
  const [deletando, setDeletando] = useState<OpcaoMaterial | null>(null)
  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingDelete, setLoadingDelete] = useState(false)
  const [erroDelete, setErroDelete] = useState('')

  const titulo = labelTipoOpcaoMaterial(tipo)
  const singular = labelTipoOpcaoMaterialSingular(tipo)

  function abrirNova() {
    setEditando(null)
    setNome('')
    setErro('')
    setModalAberto(true)
  }

  function abrirEditar(opcao: OpcaoMaterial) {
    setEditando(opcao)
    setNome(opcao.nome)
    setErro('')
    setModalAberto(true)
  }

  async function syncResource() {
    await refreshResources(['opcoes_material'], { refreshRoute: true })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!nome.trim()) {
      setErro('Nome é obrigatório.')
      return
    }

    setLoading(true)
    try {
      if (editando) await atualizarOpcaoMaterial(editando.id, tipo, { nome: nome.trim() })
      else await criarOpcaoMaterial(tipo, { nome: nome.trim() })
      setModalAberto(false)
      await syncResource()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  async function confirmarDelete() {
    if (!deletando) return
    setErroDelete('')
    setLoadingDelete(true)
    try {
      await deletarOpcaoMaterial(deletando.id)
      setDeletando(null)
      await syncResource()
    } catch (e: unknown) {
      setErroDelete(e instanceof Error ? e.message : 'Erro ao excluir.')
    } finally {
      setLoadingDelete(false)
    }
  }

  async function toggleAtivo(opcao: OpcaoMaterial) {
    setAlterandoStatusId(opcao.id)
    try {
      await alterarStatusOpcaoMaterial(opcao.id, !opcao.ativo)
      await syncResource()
    } finally {
      setAlterandoStatusId(null)
    }
  }

  return (
    <>
      <div
        id={`opcoes-material-${tipo}`}
        className="scroll-mt-24 rounded-xl p-5 sm:p-6 shadow-sm"
        style={{
          background: 'var(--ac-card)',
          border: '1px solid var(--ac-border)',
          boxShadow: '0 1px 3px color-mix(in srgb, var(--ac-text) 6%, transparent)',
        }}
      >
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-lg" style={{ color: 'var(--ac-text)' }}>
              {titulo}
            </h2>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--ac-muted)' }}>
              Gerencie as opções oficiais de {singular.toLowerCase()} usadas nos cadastros de matérias-primas.
            </p>
          </div>
          <Button onClick={abrirNova} variant="secondary">
            Novo {singular.toLowerCase()}
          </Button>
        </div>

        {opcoesAtuais.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--ac-muted)' }}>
            Nenhuma opção cadastrada.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opcoesAtuais.map((opcao) => (
              <div
                key={opcao.id}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ border: '1px solid var(--ac-border)', background: 'var(--ac-bg)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--ac-text)' }}>
                  {opcao.nome}
                </span>
                {!opcao.ativo && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ background: '#fef3c7', color: '#92400e' }}
                  >
                    Inativo
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => abrirEditar(opcao)}
                  className="p-1 rounded-md transition-colors"
                  style={{ color: 'var(--ac-muted)' }}
                  title="Editar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-3.5">
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleAtivo(opcao)}
                  disabled={alterandoStatusId === opcao.id}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-60"
                  style={{
                    color: opcao.ativo ? '#92400e' : '#166534',
                    background: opcao.ativo ? '#fef3c7' : '#dcfce7',
                  }}
                  title={opcao.ativo ? 'Inativar' : 'Ativar'}
                >
                  {opcao.ativo ? 'Inativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeletando(opcao)
                    setErroDelete('')
                  }}
                  className="p-1 rounded-md transition-colors"
                  style={{ color: 'var(--ac-muted)' }}
                  title="Excluir"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-3.5">
                    <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? `Editar ${singular.toLowerCase()}` : `Novo ${singular.toLowerCase()}`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--ac-text)' }}>
              Nome *
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={`Ex: ${singular === 'Aço' ? 'Inox 4mm' : singular === 'Cabo' ? 'Madeira' : singular === 'Botão' ? 'Alma Campeira' : singular === 'Carimbo' ? 'Fio de Prata' : 'Churrasco 8"'}`}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
              style={{ background: 'var(--ac-bg)', border: '1px solid var(--ac-border)', color: 'var(--ac-text)' }}
            />
          </div>
          {erro && <p className="text-sm rounded-lg px-3 py-2" style={{ color: '#dc2626', background: '#fee2e2' }}>{erro}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setModalAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              {editando ? 'Salvar alterações' : `Criar ${singular.toLowerCase()}`}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deletando} onClose={() => setDeletando(null)} title={`Excluir ${singular.toLowerCase()}`}>
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--ac-text)' }}>
            Tem certeza que deseja excluir <strong>{deletando?.nome}</strong>?
          </p>
          {erroDelete && <p className="text-sm rounded-lg px-3 py-2" style={{ color: '#dc2626', background: '#fee2e2' }}>{erroDelete}</p>}
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
    </>
  )
}
