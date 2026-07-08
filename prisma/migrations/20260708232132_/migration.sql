/*
  Warnings:

  - The values [outro] on the enum `TipoMaterial` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TipoMaterial_new" AS ENUM ('lamina', 'cabo', 'bainha', 'latao');
ALTER TABLE "materias_primas" ALTER COLUMN "tipo_material" DROP DEFAULT;
ALTER TABLE "materias_primas" ALTER COLUMN "tipo_material" TYPE "TipoMaterial_new" USING ("tipo_material"::text::"TipoMaterial_new");
ALTER TABLE "fornecedor_tipos_material" ALTER COLUMN "tipo_material" TYPE "TipoMaterial_new" USING ("tipo_material"::text::"TipoMaterial_new");
ALTER TYPE "TipoMaterial" RENAME TO "TipoMaterial_old";
ALTER TYPE "TipoMaterial_new" RENAME TO "TipoMaterial";
DROP TYPE "TipoMaterial_old";
COMMIT;

-- AlterTable
ALTER TABLE "materias_primas" ALTER COLUMN "tipo_material" DROP DEFAULT;
