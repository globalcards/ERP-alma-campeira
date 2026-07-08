-- Renomeia o domínio "cabo" para "bloco" preservando os registros existentes.
ALTER TYPE "TipoMaterial" RENAME VALUE 'cabo' TO 'bloco';
ALTER TYPE "TipoOpcaoMaterial" RENAME VALUE 'cabo' TO 'bloco';

ALTER TABLE "materiais_cabos" RENAME TO "materiais_blocos";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'materiais_cabos_pkey'
      AND table_name = 'materiais_blocos'
  ) THEN
    ALTER TABLE "materiais_blocos" RENAME CONSTRAINT "materiais_cabos_pkey" TO "materiais_blocos_pkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'materiais_cabos_materia_prima_id_fkey'
      AND table_name = 'materiais_blocos'
  ) THEN
    ALTER TABLE "materiais_blocos"
      RENAME CONSTRAINT "materiais_cabos_materia_prima_id_fkey" TO "materiais_blocos_materia_prima_id_fkey";
  END IF;
END $$;
