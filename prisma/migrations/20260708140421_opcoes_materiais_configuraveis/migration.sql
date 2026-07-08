-- CreateEnum
CREATE TYPE "TipoOpcaoMaterial" AS ENUM ('aco', 'cabo', 'botao', 'carimbo', 'bainha');

-- CreateTable
CREATE TABLE "opcoes_material" (
    "id" UUID NOT NULL,
    "tipo" "TipoOpcaoMaterial" NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opcoes_material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_opcoes_material_tipo_ativo_ordem" ON "opcoes_material"("tipo", "ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "opcoes_material_tipo_nome_key" ON "opcoes_material"("tipo", "nome");
