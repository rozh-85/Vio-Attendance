import reference from './reference.json';
import { getSupabaseClient } from '@/lib/supabase';
import type {
  CatalogCategory,
  CatalogDraft,
  CatalogDraftProduct,
  CatalogProduct,
  CatalogRepository,
  CatalogState,
  CatalogSummary,
} from './types';

const STORAGE_KEY = 'vio.catalog.library.v2';
const LEGACY_KEY = 'vio.catalog.state.v1';
const CLONE = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const referenceData = reference as unknown as {
  categories: CatalogCategory[];
  products: CatalogProduct[];
  cover: string;
};

export function emptyMaster(): CatalogState {
  return { categories: [], products: [], catalogs: [], masterRevision: 0 };
}

export function referenceMaster(): CatalogState {
  return { categories: CLONE(referenceData.categories), products: CLONE(referenceData.products), catalogs: [], masterRevision: 0 };
}

export function summaryOf(draft: CatalogDraft): CatalogSummary {
  return {
    id: draft.id,
    name: draft.name,
    type: draft.type,
    priceMode: draft.priceMode,
    productCount: draft.products.length,
    categoryCount: draft.categories.length,
    status: draft.status,
    createdBy: draft.createdBy,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    revision: draft.revision,
  };
}

function copyMaster(state: CatalogState): CatalogState {
  return CLONE({ categories: state.categories, products: state.products, catalogs: [], masterRevision: state.masterRevision });
}

function toDraftProduct(product: CatalogProduct): CatalogDraftProduct {
  return { ...CLONE(product), sourceProductId: product.id, hiddenSpecifications: [] };
}

export function makeCatalogDraft(
  state: CatalogState,
  input: Pick<CatalogDraft, 'name' | 'type' | 'priceMode' | 'coverImage' | 'showSpecifications'>,
  productIds: string[],
  categoryIds?: string[],
  createdBy = 'Admin',
): CatalogDraft {
  const selected = productIds
    .map((id) => state.products.find((product) => product.id === id))
    .filter((product): product is CatalogProduct => Boolean(product))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = categoryIds ?? [...new Set(selected.map((product) => product.categoryId))];
  const categories = state.categories.filter((category) => ids.includes(category.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  const stamp = new Date().toISOString();
  return {
    id: 'catalog-' + crypto.randomUUID(),
    name: input.name.trim(), type: input.type, priceMode: input.priceMode,
    categories: CLONE(categories), products: selected.map(toDraftProduct),
    coverImage: input.coverImage, categoryBanners: {}, showSpecifications: input.showSpecifications, layout: 3,
    categoryDividers: categories.map((category) => category.id), customPages: [], status: 'draft', createdBy,
    createdAt: stamp, updatedAt: stamp, revision: 0,
  };
}

function readLibrary(): { master: CatalogState; drafts: CatalogDraft[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as { master: CatalogState; drafts: CatalogDraft[] };
      return { master: value.master, drafts: value.drafts ?? [] };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as { categories: CatalogCategory[]; products: CatalogProduct[]; catalogs?: CatalogDraft[] };
      return { master: { categories: old.categories ?? [], products: old.products ?? [], catalogs: [], masterRevision: 0 }, drafts: (old.catalogs ?? []) as CatalogDraft[] };
    }
  } catch {
    // Corrupt browser data is handled by the empty state and can be re-imported.
  }
  return { master: emptyMaster(), drafts: [] };
}

function writeLibrary(value: { master: CatalogState; drafts: CatalogDraft[] }): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export class LocalCatalogRepository implements CatalogRepository {
  async loadMaster(): Promise<CatalogState> {
    const value = readLibrary();
    return { ...copyMaster(value.master), catalogs: value.drafts.map(summaryOf) };
  }

  async saveMaster(expectedRevision: number, categories: CatalogCategory[], products: CatalogProduct[]): Promise<CatalogState> {
    const value = readLibrary();
    if (value.master.masterRevision !== expectedRevision) throw new Error('The Master Catalog changed in another tab. Reload before saving.');
    const master = { categories: CLONE(categories), products: CLONE(products), catalogs: [], masterRevision: expectedRevision + 1 };
    writeLibrary({ ...value, master });
    return { ...copyMaster(master), catalogs: value.drafts.map(summaryOf) };
  }

  async listCatalogs(): Promise<CatalogSummary[]> {
    return readLibrary().drafts.map(summaryOf).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getCatalog(id: string): Promise<CatalogDraft | null> {
    return CLONE(readLibrary().drafts.find((draft) => draft.id === id) ?? null);
  }

  async createCatalog(draft: CatalogDraft): Promise<CatalogSummary> {
    const value = readLibrary();
    const copy = CLONE(draft);
    writeLibrary({ ...value, drafts: [copy, ...value.drafts] });
    return summaryOf(copy);
  }

  async saveCatalog(draft: CatalogDraft, expectedRevision: number): Promise<CatalogSummary> {
    const value = readLibrary();
    const index = value.drafts.findIndex((item) => item.id === draft.id);
    if (index === -1) throw new Error('Catalog draft not found.');
    if (value.drafts[index].revision !== expectedRevision) throw new Error('This catalog changed in another tab. Reload before saving.');
    const next = { ...CLONE(draft), revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    value.drafts[index] = next;
    writeLibrary(value);
    return summaryOf(next);
  }

  async deleteCatalog(id: string, expectedRevision: number): Promise<void> {
    const value = readLibrary();
    const draft = value.drafts.find((item) => item.id === id);
    if (!draft) return;
    if (draft.revision !== expectedRevision) throw new Error('This catalog changed in another tab. Reload before deleting.');
    writeLibrary({ ...value, drafts: value.drafts.filter((item) => item.id !== id) });
  }
}

class SupabaseCatalogRepository implements CatalogRepository {
  private readonly client = getSupabaseClient();

  private requireClient() {
    if (!this.client) throw new Error('Catalog database is not configured.');
    return this.client;
  }

  async loadMaster(): Promise<CatalogState> {
    const client = this.requireClient();
    const [masterResult, draftResult] = await Promise.all([
      client.from('vio_catalog_master').select('categories,products,master_revision').eq('id', 'default').maybeSingle(),
      client.from('vio_catalog_drafts').select('document'),
    ]);
    if (masterResult.error) throw masterResult.error;
    if (draftResult.error) throw draftResult.error;
    const source = masterResult.data;
    const master = source
      ? { categories: (source.categories ?? []) as CatalogCategory[], products: (source.products ?? []) as CatalogProduct[], catalogs: [], masterRevision: Number(source.master_revision ?? 0) }
      : emptyMaster();
    const catalogs = (draftResult.data ?? []).map((row) => summaryOf(row.document as CatalogDraft));
    return { ...master, catalogs };
  }

  async saveMaster(expectedRevision: number, categories: CatalogCategory[], products: CatalogProduct[]): Promise<CatalogState> {
    const client = this.requireClient();
    const nextRevision = expectedRevision + 1;
    const updated = await client.from('vio_catalog_master').update({
      categories: CLONE(categories), products: CLONE(products), master_revision: nextRevision,
    }).eq('id', 'default').eq('master_revision', expectedRevision).select('categories,products,master_revision').maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) {
      const inserted = await client.from('vio_catalog_master').insert({
        id: 'default', categories: CLONE(categories), products: CLONE(products), master_revision: nextRevision,
      }).select('categories,products,master_revision').maybeSingle();
      if (inserted.error) throw inserted.error;
    }
    return this.loadMaster();
  }

  async listCatalogs(): Promise<CatalogSummary[]> {
    const client = this.requireClient();
    const result = await client.from('vio_catalog_drafts').select('document').order('updated_at', { ascending: false });
    if (result.error) throw result.error;
    return (result.data ?? []).map((row) => summaryOf(row.document as CatalogDraft));
  }

  async getCatalog(id: string): Promise<CatalogDraft | null> {
    const client = this.requireClient();
    const result = await client.from('vio_catalog_drafts').select('document').eq('id', id).maybeSingle();
    if (result.error) throw result.error;
    return result.data ? CLONE(result.data.document as CatalogDraft) : null;
  }

  async createCatalog(draft: CatalogDraft): Promise<CatalogSummary> {
    const client = this.requireClient();
    const result = await client.from('vio_catalog_drafts').insert({
      id: draft.id, revision: draft.revision, document: CLONE(draft),
    }).select('document').single();
    if (result.error) throw result.error;
    return summaryOf(result.data.document as CatalogDraft);
  }

  async saveCatalog(draft: CatalogDraft, expectedRevision: number): Promise<CatalogSummary> {
    const client = this.requireClient();
    const next = { ...CLONE(draft), revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    const result = await client.from('vio_catalog_drafts').update({
      revision: next.revision, document: next, updated_at: next.updatedAt,
    }).eq('id', draft.id).eq('revision', expectedRevision).select('document').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('This catalog changed in another tab. Reload before saving.');
    return summaryOf(result.data.document as CatalogDraft);
  }

  async deleteCatalog(id: string, expectedRevision: number): Promise<void> {
    const client = this.requireClient();
    const result = await client.from('vio_catalog_drafts').delete().eq('id', id).eq('revision', expectedRevision).select('id').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('This catalog changed in another tab. Reload before deleting.');
  }
}

export const catalogRepository: CatalogRepository = getSupabaseClient()
  ? new SupabaseCatalogRepository()
  : new LocalCatalogRepository();
