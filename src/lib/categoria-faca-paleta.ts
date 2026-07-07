/**
 * Gera texto, fundo e borda do badge a partir de uma única cor base.
 * Fundo: tom bem claro; texto: tom escuro na mesma família; borda: intermediária.
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[c(r), c(g), c(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`
}

/** Mistura linear entre duas cores hex (t=0 → a, t=1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  if (!A || !B) return '#374151'
  const u = Math.max(0, Math.min(1, t))
  return rgbToHex(
    A.r + (B.r - A.r) * u,
    A.g + (B.g - A.g) * u,
    A.b + (B.b - A.b) * u
  )
}

export type PaletaCategoria = {
  cor_texto: string
  cor_fundo: string
  cor_borda: string
}

/** A partir da cor escolhida pelo usuário, gera o trio compatível com o schema atual. */
export function paletaCategoriaDeCorBase(corBase: string): PaletaCategoria {
  const base = corBase.startsWith('#') ? corBase : `#${corBase}`
  if (!hexToRgb(base)) {
    return { cor_texto: '#374151', cor_fundo: '#f3f4f6', cor_borda: '#e5e7eb' }
  }
  const branco = '#ffffff'
  const quasePreto = '#0f172a'
  // Fundo: lavagem suave da cor base (badge claro)
  const cor_fundo = mixHex(branco, base, 0.14)
  // Texto: mistura da base com slate escuro para legibilidade no fundo claro
  const cor_texto = mixHex(quasePreto, base, 0.42)
  // Borda: entre fundo e um tom mais saturado da base
  const cor_borda = mixHex(cor_fundo, base, 0.38)
  return { cor_texto, cor_fundo, cor_borda }
}

/**
 * Para edição: estima uma cor base a partir do que já está salvo (não é reversível de forma única).
 */
export function inferirCorBaseParaEdicao(p: {
  cor_texto: string
  cor_fundo: string
  cor_borda: string
}): string {
  if (!hexToRgb(p.cor_texto) || !hexToRgb(p.cor_fundo) || !hexToRgb(p.cor_borda)) return '#2563eb'
  // Aproximação a partir do que já foi salvo (uma única cor não é reversível com precisão)
  const meio = mixHex(p.cor_fundo, p.cor_texto, 0.38)
  return mixHex(meio, p.cor_borda, 0.12)
}
