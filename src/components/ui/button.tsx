import { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
}

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'var(--ac-accent)',
    color: '#111827',
    border: '1px solid transparent',
    fontWeight: 600,
  },
  secondary: {
    background: 'transparent',
    color: 'var(--ac-text)',
    border: '1px solid var(--ac-border)',
    fontWeight: 500,
  },
  danger: {
    background: '#fee2e2',
    color: '#dc2626',
    border: '1px solid #fca5a5',
    fontWeight: 500,
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ac-muted)',
    border: '1px solid transparent',
    fontWeight: 500,
  },
}

export function Button({
  variant = 'primary',
  loading = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${className}`}
      style={{
        ...styles[variant],
        opacity: disabled || loading ? 0.6 : 1,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (disabled || loading) return
        e.currentTarget.style.filter = 'brightness(0.93)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none'
      }}
      {...props}
    >
      {loading && (
        <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
