export type CatalogPriceMode = 'retail' | 'wholesale' | 'none';
export type CatalogStatus = 'draft' | 'published';
export type CatalogLayout = 1 | 2 | 3;

export interface CatalogCategory {
  id: string;
  name: string;
  sortOrder: number;
  visible: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  mainImage: string;
  additionalImages: string[];
  capacity: string;
  power: string;
  warranty: string;
  weight: string;
  cbm: string;
  ctnQuantity: string;
  retailPrice: number | null;
  wholesalePrice: number | null;
  specifications: Record<string, string>;
  status: 'active' | 'hidden';
  sortOrder: number;
  updatedAt: string;
  sourcePage?: number;
  sourceNotes?: string;
}

export interface CatalogDraftProduct extends CatalogProduct {
  sourceProductId: string;
  hiddenSpecifications: string[];
}

export interface CatalogCustomPage {
  id: string;
  title: string;
  body: string;
  image: string;
  sortOrder: number;
}

export interface CatalogDraft {
  id: string;
  name: string;
  type: 'main' | 'without-price' | 'wholesale' | 'custom';
  priceMode: CatalogPriceMode;
  categories: CatalogCategory[];
  products: CatalogDraftProduct[];
  coverImage: string;
  categoryBanners?: Record<string, string>;
  showSpecifications: boolean;
  layout: CatalogLayout;
  categoryDividers: string[];
  customPages: CatalogCustomPage[];
  status: CatalogStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface CatalogSummary {
  id: string;
  name: string;
  type: CatalogDraft['type'];
  priceMode: CatalogPriceMode;
  productCount: number;
  categoryCount: number;
  status: CatalogStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface CatalogState {
  categories: CatalogCategory[];
  products: CatalogProduct[];
  catalogs: CatalogSummary[];
  masterRevision: number;
}

export interface CatalogRepository {
  loadMaster(): Promise<CatalogState>;
  saveMaster(expectedRevision: number, categories: CatalogCategory[], products: CatalogProduct[]): Promise<CatalogState>;
  listCatalogs(): Promise<CatalogSummary[]>;
  getCatalog(id: string): Promise<CatalogDraft | null>;
  createCatalog(draft: CatalogDraft): Promise<CatalogSummary>;
  saveCatalog(draft: CatalogDraft, expectedRevision: number): Promise<CatalogSummary>;
  deleteCatalog(id: string, expectedRevision: number): Promise<void>;
}
