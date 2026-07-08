-- Remove o conceito legado de categoria de matérias-primas.
DROP INDEX IF EXISTS "materias_primas_categoria_sku_key";
DROP INDEX IF EXISTS "materias_primas_tipo_material_sku_key";

ALTER TABLE "materias_primas"
DROP COLUMN IF EXISTS "categoria";

DROP TABLE IF EXISTS "categorias_materia_prima";

CREATE INDEX IF NOT EXISTS "idx_materias_primas_tipo_material_sku"
ON "materias_primas"("tipo_material", "sku");
