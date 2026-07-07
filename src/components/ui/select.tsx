import { SelectHTMLAttributes, forwardRef } from 'react'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, id, children, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium" style={{ color: 'var(--ac-text)' }}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all appearance-none ${className}`}
        style={{
          background: 'var(--ac-card)',
          border: `1px solid ${error ? '#f87171' : 'var(--ac-border)'}`,
          color: 'var(--ac-text)',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%236b7280' stroke-width='2' d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '16px',
          paddingRight: '36px',
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
      >
        {children}
      </select>
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  )
)

Select.displayName = 'Select'
