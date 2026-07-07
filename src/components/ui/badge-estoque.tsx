import type { StatusEstoque } from '@/types'

const config: Record<StatusEstoque, { label: string; style: React.CSSProperties }> = {
  ok: {
    label: 'OK',
    style: { color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0' },
  },
  atencao: {
    label: 'Atenção',
    style: { color: '#b45309', background: '#fef9c3', border: '1px solid #fde047' },
  },
  critico: {
    label: 'Crítico',
    style: { color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5' },
  },
}

export function BadgeEstoque({ status }: { status: StatusEstoque }) {
  const { label, style } = config[status]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={style}
    >
      {label}
    </span>
  )
}
