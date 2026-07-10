CREATE TABLE "materia_prima_fornecedores" (
  "id" UUID NOT NULL,
  "materia_prima_id" UUID NOT NULL,
  "fornecedor_id" UUID NOT NULL,
  "preco_custo" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "preferencial" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "observacao" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "materia_prima_fornecedores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "materia_prima_fornecedor_unique"
  ON "materia_prima_fornecedores"("materia_prima_id", "fornecedor_id");

CREATE INDEX "idx_materia_prima_fornecedores_mp"
  ON "materia_prima_fornecedores"("materia_prima_id");

CREATE INDEX "idx_materia_prima_fornecedores_fornecedor"
  ON "materia_prima_fornecedores"("fornecedor_id");

CREATE INDEX "idx_materia_prima_fornecedores_preferencial"
  ON "materia_prima_fornecedores"("materia_prima_id", "preferencial");

ALTER TABLE "materia_prima_fornecedores"
  ADD CONSTRAINT "materia_prima_fornecedores_materia_prima_id_fkey"
  FOREIGN KEY ("materia_prima_id") REFERENCES "materias_primas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "materia_prima_fornecedores"
  ADD CONSTRAINT "materia_prima_fornecedores_fornecedor_id_fkey"
  FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "materia_prima_fornecedores" (
  "id",
  "materia_prima_id",
  "fornecedor_id",
  "preco_custo",
  "preferencial",
  "ativo",
  "observacao",
  "created_at"
)
SELECT
  gen_random_uuid(),
  mp."id",
  mp."fornecedor_id",
  mp."preco_custo",
  true,
  true,
  NULL,
  CURRENT_TIMESTAMP
FROM "materias_primas" mp
WHERE mp."fornecedor_id" IS NOT NULL;
