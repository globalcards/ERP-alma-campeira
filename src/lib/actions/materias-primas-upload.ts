"use server";

import { Prisma } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { assertPermissao, requireAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLocalStorage } from "@/lib/storage";
import { gerarCodigoForte } from "@/lib/utils/codigo";
import { normalizarTipoMaterial } from "@/lib/materiais/tipos";
import { getMateriaPrimaUniqueErrorMessage } from "@/lib/materiais/unicidade";
import type { TipoMaterial, TipoOpcaoMaterial } from "@/types";

const FOTO_BUCKET_MP = "materias-primas-fotos";

async function revalidateMPLists() {
  const userId = await requireAuthenticatedUserId();
  revalidateTag(`list-materias-primas-${userId}`, "max");
  revalidateTag(`list-fornecedores-select-${userId}`, "max");
  revalidateTag(`list-facas-${userId}`, "max");
}

async function gerarCodigoMP(): Promise<string> {
  return gerarCodigoForte("MP");
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(Number.isFinite(value) ? value : 0);
}

function extFromFile(file: { type?: string; name?: string }): string {
  const mime = file.type ?? "";
  const n = file.name ?? "";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg") || mime.includes("pjpeg")) return "jpg";
  const m = n.match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1]?.toLowerCase() ?? "jpg") === "jpeg" ? "jpg" : (m?.[1]?.toLowerCase() ?? "jpg");
}

function isFileLike(v: unknown): v is Blob & { type?: string; name?: string } {
  return typeof v === "object" && v !== null && typeof (v as Blob).arrayBuffer === "function";
}

function normalizeOptionalText(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function fornecedorAtendeTipo(
  fornecedor: { tiposMaterial: { tipoMaterial: TipoMaterial }[] },
  tipoMaterial: TipoMaterial,
): boolean {
  const tipos = fornecedor.tiposMaterial.map((item) => item.tipoMaterial);
  return tipos.length === 0 || tipos.includes(tipoMaterial);
}

async function validarFornecedorParaTipo(fornecedorId: string | null, tipoMaterial: TipoMaterial) {
  if (!fornecedorId) return;
  const fornecedor = await prisma.fornecedor.findUnique({
    where: { id: fornecedorId },
    select: {
      id: true,
      tiposMaterial: {
        select: { tipoMaterial: true },
      },
    },
  });
  if (!fornecedor) throw new Error("Fornecedor selecionado não é válido.");
  if (!fornecedorAtendeTipo(fornecedor, tipoMaterial)) {
    throw new Error("O fornecedor selecionado não atende o tipo de material informado.");
  }
}

function listarOpcoesSelecionadas(
  tipoMaterial: TipoMaterial,
  formData: FormData,
): Array<{
  tipo: TipoOpcaoMaterial;
  valor: string | null;
}> {
  if (tipoMaterial === "lamina") {
    return [{ tipo: "aco", valor: normalizeOptionalText(formData.get("lamina_aco")) }];
  }
  if (tipoMaterial === "bloco") {
    return [{ tipo: "bloco", valor: normalizeOptionalText(formData.get("bloco_tipo")) }];
  }
  if (tipoMaterial === "bainha") {
    return [{ tipo: "bainha", valor: normalizeOptionalText(formData.get("bainha_modelo")) }];
  }
  return [];
}

async function validarOpcoesConfiguraveis(tipoMaterial: TipoMaterial, formData: FormData) {
  const opcoes = listarOpcoesSelecionadas(tipoMaterial, formData).filter(
    (item): item is { tipo: TipoOpcaoMaterial; valor: string } => Boolean(item.valor),
  );
  if (opcoes.length === 0) return;

  const checks = await Promise.all(
    opcoes.map(async (item) => ({
      ...item,
      exists: await prisma.opcaoMaterial.findFirst({
        where: { tipo: item.tipo, nome: item.valor },
        select: { id: true },
      }),
    })),
  );

  const invalida = checks.find((item) => !item.exists);
  if (invalida) {
    throw new Error(`A opção "${invalida.valor}" não existe mais nas configurações de materiais.`);
  }
}

async function salvarDetalhesTipoMaterial(
  tx: Prisma.TransactionClient,
  materiaPrimaId: string,
  tipoMaterial: TipoMaterial,
  formData: FormData,
) {
  await Promise.all([
    tx.materialLamina.deleteMany({ where: { materiaPrimaId } }),
    tx.materialBloco.deleteMany({ where: { materiaPrimaId } }),
    tx.materialBainha.deleteMany({ where: { materiaPrimaId } }),
  ]);

  if (tipoMaterial === "lamina") {
    await tx.materialLamina.create({
      data: {
        materiaPrimaId,
        aco: normalizeOptionalText(formData.get("lamina_aco")),
      },
    });
    return;
  }

  if (tipoMaterial === "bloco") {
    await tx.materialBloco.create({
      data: {
        materiaPrimaId,
        tipo: normalizeOptionalText(formData.get("bloco_tipo")),
        cor: normalizeOptionalText(formData.get("bloco_cor")),
      },
    });
    return;
  }

  if (tipoMaterial === "bainha") {
    await tx.materialBainha.create({
      data: {
        materiaPrimaId,
        polegadas: normalizeOptionalText(formData.get("bainha_polegadas")),
        modelo: normalizeOptionalText(formData.get("bainha_modelo")),
      },
    });
  }
}

function throwFriendlyUniqueError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const targets = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    if (
      (targets.includes("tipo_material") && targets.includes("sku")) ||
      (targets.includes("tipoMaterial") && targets.includes("sku")) ||
      targets.includes("materias_primas_tipo_material_sku_key")
    ) {
      throw new Error("Já existe uma matéria-prima com este SKU neste tipo de material.");
    }
    if (targets.includes("codigo")) {
      throw new Error("Já existe uma matéria-prima com este código.");
    }
  }
  throw error;
}

async function assertMateriaPrimaUniqueFromFormData(
  tx: Prisma.TransactionClient,
  formData: FormData,
  tipoMaterial: TipoMaterial,
  sku: string,
  currentId?: string,
): Promise<void> {
  if (tipoMaterial === "lamina") {
    const aco = normalizeOptionalText(formData.get("lamina_aco"));
    const existing = await tx.materiaPrima.findFirst({
      where: {
        id: currentId ? { not: currentId } : undefined,
        tipoMaterial: "lamina",
        sku,
        lamina: {
          is: {
            aco,
          },
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw new Error(
        getMateriaPrimaUniqueErrorMessage({
          tipo_material: "lamina",
          sku,
          lamina: { aco },
        }),
      );
    }

    return;
  }

  const existing = await tx.materiaPrima.findFirst({
    where: {
      id: currentId ? { not: currentId } : undefined,
      tipoMaterial,
      sku,
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(
      getMateriaPrimaUniqueErrorMessage({
        tipo_material: tipoMaterial,
        sku,
      }),
    );
  }
}

export async function salvarMPComFoto(formData: FormData) {
  const id = formData.get("id");
  const sku = String(formData.get("sku") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const tipo_material = normalizarTipoMaterial(String(formData.get("tipo_material") ?? ""));
  const fornecedor_id = formData.get("fornecedor_id");
  const preco_custo = Number(formData.get("preco_custo"));
  const estoque_atual = Number(formData.get("estoque_atual"));
  const estoque_minimo = Number(formData.get("estoque_minimo"));
  const foto = formData.get("foto");

  if (!sku) throw new Error("SKU é obrigatório.");
  if (!nome) throw new Error("Nome é obrigatório.");
  if (!tipo_material) throw new Error("Tipo de material é obrigatório.");
  if (!Number.isFinite(preco_custo)) throw new Error("Preço de custo inválido.");

  const isEdit = typeof id === "string" && id.length > 0;

  await assertPermissao("materias_primas", isEdit ? "editar" : "criar");
  await validarFornecedorParaTipo(fornecedor_id ? String(fornecedor_id) : null, tipo_material);
  await validarOpcoesConfiguraveis(tipo_material, formData);

  let mpId: string;

  if (isEdit) {
    mpId = id as string;
    try {
      await prisma.$transaction(async (tx) => {
        await assertMateriaPrimaUniqueFromFormData(tx, formData, tipo_material, sku, mpId);
        await tx.materiaPrima.update({
          where: { id: mpId },
          data: {
            sku,
            nome,
            tipoMaterial: tipo_material,
            fornecedorId: fornecedor_id ? String(fornecedor_id) : null,
            precoCusto: decimal(preco_custo),
            estoqueAtual: decimal(estoque_atual || 0),
            estoqueMinimo: decimal(estoque_minimo || 0),
          },
        });
        await salvarDetalhesTipoMaterial(tx, mpId, tipo_material, formData);
      });
    } catch (error) {
      throwFriendlyUniqueError(error);
    }
  } else {
    const codigo = await gerarCodigoMP();
    let data: { id: string };
    try {
      data = await prisma.$transaction(async (tx) => {
        await assertMateriaPrimaUniqueFromFormData(tx, formData, tipo_material, sku);
        const created = await tx.materiaPrima.create({
          data: {
            codigo,
            sku,
            nome,
            tipoMaterial: tipo_material,
            fornecedorId: fornecedor_id ? String(fornecedor_id) : null,
            precoCusto: decimal(preco_custo),
            estoqueAtual: decimal(estoque_atual || 0),
            estoqueMinimo: decimal(estoque_minimo || 0),
          },
          select: { id: true },
        });
        await salvarDetalhesTipoMaterial(tx, created.id, tipo_material, formData);
        return created;
      });
    } catch (error) {
      throwFriendlyUniqueError(error);
    }
    if (!data?.id) throw new Error("Falha ao criar matéria-prima.");
    mpId = data.id;
  }

  if (foto && isFileLike(foto)) {
    const storage = createLocalStorage();

    const { data: buckets, error: listErr } = await storage.listBuckets();
    if (listErr) throw new Error(listErr.message);

    const exists = (buckets ?? []).some((b: { name: string }) => b.name === FOTO_BUCKET_MP);
    if (!exists) {
      await storage.createBucket(FOTO_BUCKET_MP);
    }

    const fileExt = extFromFile(foto as unknown as { type?: string; name?: string });
    const filePath = `${mpId}/foto.${fileExt}`;

    const { error: upErr } = await storage.from(FOTO_BUCKET_MP).upload(filePath, foto, {
      upsert: true,
      contentType: foto.type ?? "image/jpeg",
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = storage.from(FOTO_BUCKET_MP).getPublicUrl(filePath);
    if (pub?.publicUrl) {
      await prisma.materiaPrima.update({
        where: { id: mpId },
        data: { fotoUrl: pub.publicUrl },
      });
    }
  }

  await revalidateMPLists();
}
