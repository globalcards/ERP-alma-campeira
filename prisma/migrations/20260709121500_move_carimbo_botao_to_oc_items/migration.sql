ALTER TABLE "ordem_compra_itens"
  ADD COLUMN "carimbo_fornecedor" TEXT,
  ADD COLUMN "botao_fornecedor" TEXT;

UPDATE "ordem_compra_itens" AS oci
SET "carimbo_fornecedor" = ml."carimbo"
FROM "materiais_laminas" AS ml
WHERE oci."materia_prima_id" = ml."materia_prima_id"
  AND ml."carimbo" IS NOT NULL;

UPDATE "ordem_compra_itens" AS oci
SET "botao_fornecedor" = mb."botao"
FROM "materiais_bainhas" AS mb
WHERE oci."materia_prima_id" = mb."materia_prima_id"
  AND mb."botao" IS NOT NULL;

ALTER TABLE "materiais_laminas"
  DROP COLUMN "carimbo";

ALTER TABLE "materiais_bainhas"
  DROP COLUMN "botao";
