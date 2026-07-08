-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('lamina', 'cabo', 'bainha', 'outro');

-- AlterTable
ALTER TABLE "materias_primas" ADD COLUMN     "tipo_material" "TipoMaterial" NOT NULL DEFAULT 'outro';

-- CreateTable
CREATE TABLE "fornecedor_tipos_material" (
    "id" UUID NOT NULL,
    "fornecedor_id" UUID NOT NULL,
    "tipo_material" "TipoMaterial" NOT NULL,

    CONSTRAINT "fornecedor_tipos_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiais_laminas" (
    "materia_prima_id" UUID NOT NULL,
    "aco" TEXT,
    "carimbo" TEXT,

    CONSTRAINT "materiais_laminas_pkey" PRIMARY KEY ("materia_prima_id")
);

-- CreateTable
CREATE TABLE "materiais_cabos" (
    "materia_prima_id" UUID NOT NULL,
    "tipo" TEXT,
    "cor" TEXT,

    CONSTRAINT "materiais_cabos_pkey" PRIMARY KEY ("materia_prima_id")
);

-- CreateTable
CREATE TABLE "materiais_bainhas" (
    "materia_prima_id" UUID NOT NULL,
    "polegadas" TEXT,
    "modelo" TEXT,
    "botao" TEXT,

    CONSTRAINT "materiais_bainhas_pkey" PRIMARY KEY ("materia_prima_id")
);

-- CreateIndex
CREATE INDEX "idx_fornecedor_tipos_material_tipo" ON "fornecedor_tipos_material"("tipo_material");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedor_tipos_material_fornecedor_tipo_key" ON "fornecedor_tipos_material"("fornecedor_id", "tipo_material");

-- CreateIndex
CREATE INDEX "idx_materias_primas_tipo_material" ON "materias_primas"("tipo_material");

-- AddForeignKey
ALTER TABLE "fornecedor_tipos_material" ADD CONSTRAINT "fornecedor_tipos_material_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_laminas" ADD CONSTRAINT "materiais_laminas_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_cabos" ADD CONSTRAINT "materiais_cabos_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_bainhas" ADD CONSTRAINT "materiais_bainhas_materia_prima_id_fkey" FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
