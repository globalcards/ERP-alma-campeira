import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

// Em `next start`, múltiplos módulos SSR podem compartilhar o mesmo processo.
// Reusar o client global evita abrir pools paralelos desnecessários.
globalForPrisma.prisma = prisma
