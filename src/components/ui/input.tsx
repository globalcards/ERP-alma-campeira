import { InputHTMLAttributes, forwardRef } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium" style={{ color: 'var(--ac-text)' }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all ${className}`}
        style={{
          background: 'var(--ac-card)',
          border: `1px solid ${error ? '#f87171' : 'var(--ac-border)'}`,
          color: 'var(--ac-text)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--ac-accent)'
          e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--ac-accent) 20%, transparent)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? '#f87171' : 'var(--ac-border)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        {...props}
      />
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  )
)

Input.displayName = 'Input'
