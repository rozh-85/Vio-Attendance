import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Book, Check, ChevronDown, ChevronUp, Copy, Download, Eye, EyeOff,
  GripVertical, ImageIcon, Layers, LinkIcon, MessageSquare, MoreHorizontal,
  Pencil, Plus, Printer, Search, Sliders, Trash, X,
} from '@/components/icons';
import { paths } from '@/routes';
import { referenceMaster, catalogRepository, makeCatalogDraft } from '@/services/catalog/store';
import { openCatalogPreviewWindow, openCatalogPrintWindow } from '@/services/catalog/print';
import type {
  CatalogCategory, CatalogCustomPage, CatalogDraft, CatalogDraftProduct,
  CatalogLayout, CatalogPriceMode, CatalogProduct, CatalogState, CatalogSummary,
} from '@/services/catalog/types';
import reference from '@/services/catalog/reference.json';
import { cn } from '@/utils/cn';

type View = 'overview' | 'master' | 'history' | 'builder';
type Preset = CatalogDraft['type'];
type ProductForm = CatalogProduct;

const ref = reference as unknown as { cover: string };
const inputClass = 'h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const money = (value: number | null) => value === null ? 'Not set' : value.toLocaleString('en-US') + ' IQD';
const dateText = (value: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));

function ImageField({ label, value, onChange, hint, preview = true }: { label: string; value: string; onChange: (value: string) => void; hint?: string; preview?: boolean }) {
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ''));
    reader.readAsDataURL(file);
    event.target.value = '';
  }
  return <div><span className="mb-1.5 block text-sm font-semibold text-ink-900">{label}</span><div className="flex min-w-0 gap-2"><input className={inputClass + ' min-w-0 flex-1'} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Paste an image URL or upload" /><label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-slate-200 bg-slate-50 text-ink-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600" title="Upload image"><ImageIcon width={18} height={18} /><input type="file" accept="image/*" className="sr-only" onChange={handleFile} /></label></div>{hint && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}{preview && value && <div className="mt-2 flex items-center gap-2"><div className="size-12 overflow-hidden rounded-lg bg-slate-100"><img src={value} alt="Preview" className="size-full object-cover" /></div><span className="min-w-0 flex-1 truncate text-xs text-ink-500">Image ready</span><button type="button" className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => onChange('')}>Clear</button></div>}</div>;
}

const presets: Array<{ type: Preset; title: string; description: string; mode: CatalogPriceMode; tone: string }> = [
  { type: 'main', title: 'Main Catalog · With Price', description: 'The complete retail catalog.', mode: 'retail', tone: 'bg-brand-50 text-brand-700' },
  { type: 'without-price', title: 'Catalog · Without Price', description: 'A clean customer-facing catalog.', mode: 'none', tone: 'bg-slate-100 text-ink-700' },
  { type: 'wholesale', title: 'Wholesale Catalog', description: 'Dealer pricing from the same products.', mode: 'wholesale', tone: 'bg-amber-50 text-amber-700' },
  { type: 'custom', title: 'Custom Catalog', description: 'Choose exactly what this customer sees.', mode: 'retail', tone: 'bg-emerald-50 text-emerald-700' },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyProduct(categoryId: string): ProductForm {
  return {
    id: '', name: '', sku: '', categoryId, mainImage: '', additionalImages: [],
    capacity: '', power: '', warranty: '', weight: '', cbm: '', ctnQuantity: '',
    retailPrice: null, wholesalePrice: null, specifications: {}, status: 'active',
    sortOrder: 999, updatedAt: new Date().toISOString(),
  };
}

function effectivePrice(product: CatalogDraftProduct, mode: CatalogPriceMode): number | null {
  if (mode === 'none') return null;
  return mode === 'wholesale' ? product.wholesalePrice : product.retailPrice;
}

function specificationKeys(product: Pick<CatalogProduct, 'capacity' | 'power' | 'warranty' | 'weight' | 'cbm' | 'ctnQuantity' | 'specifications'>): string[] {
  return [
    ['Capacity', product.capacity], ['Power', product.power], ['Warranty', product.warranty],
    ['Weight', product.weight], ['CBM', product.cbm], ['CTN quantity', product.ctnQuantity],
  ].filter(([, value]) => Boolean(value)).map(([key]) => key).concat(Object.keys(product.specifications));
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const item = next.splice(from, 1)[0];
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function CatalogManagementPage() {
  const [master, setMaster] = useState<CatalogState | null>(null);
  const [view, setView] = useState<View>('overview');
  const [draft, setDraft] = useState<CatalogDraft | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductForm | null>(null);
  const [productEditorContext, setProductEditorContext] = useState<{ categories: CatalogCategory[]; products: CatalogProduct[] } | null>(null);
  const [pageOpen, setPageOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [createPreset, setCreatePreset] = useState<Preset>('custom');

  useEffect(() => {
    Promise.all([catalogRepository.loadMaster(), catalogRepository.listCatalogs()])
      .then(([loaded, summaries]) => { setMaster(loaded); setCatalogs(summaries); })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load catalog data.'))
      .finally(() => setLoading(false));
  }, []);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4500);
  }

  async function saveMaster(nextCategories: CatalogCategory[], nextProducts: CatalogProduct[]) {
    if (!master) return;
    setBusy(true);
    try {
      const next = await catalogRepository.saveMaster(master.masterRevision, nextCategories, nextProducts);
      setMaster(next);
      setCatalogs(next.catalogs);
      showNotice('Master Catalog saved.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not save Master Catalog.');
    } finally {
      setBusy(false);
    }
  }

  async function importReference() {
    if (!master || (master.products.length > 0 && !window.confirm('Import the 124 Vio reference products into the existing Master Catalog?'))) return;
    const source = referenceMaster();
    await saveMaster(source.categories, source.products);
  }

  function openCreate(preset: Preset = 'custom') {
    setCreatePreset(preset);
    setCreateOpen(true);
  }

  async function createSnapshot(values: { name: string; mode: CatalogPriceMode; productIds: string[]; showSpecifications: boolean; coverImage: string }) {
    if (!master || !values.productIds.length) return;
    setBusy(true);
    try {
      const info = presets.find((item) => item.type === createPreset) ?? presets[3];
      const next = makeCatalogDraft(master, {
        name: values.name, type: createPreset, priceMode: values.mode,
        coverImage: values.coverImage || ref.cover, showSpecifications: values.showSpecifications,
      }, values.productIds, undefined, 'Admin');
      const summary = await catalogRepository.createCatalog(next);
      setCatalogs((items) => [summary, ...items]);
      setDraft(next);
      setDirty(false);
      setCreateOpen(false);
      setView('builder');
      showNotice(info.title + ' snapshot created.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not create catalog.');
    } finally {
      setBusy(false);
    }
  }

  async function openDraft(id: string) {
    setBusy(true);
    try {
      const found = await catalogRepository.getCatalog(id);
      if (found) { setDraft(found); setDirty(false); setView('builder'); }
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    try {
      const summary = await catalogRepository.saveCatalog(draft, draft.revision);
      const next = { ...draft, revision: summary.revision, updatedAt: summary.updatedAt };
      setDraft(next);
      setDirty(false);
      setCatalogs((items) => items.map((item) => item.id === summary.id ? summary : item));
      showNotice('Draft saved. The Master Catalog was not changed.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Could not save draft.');
    } finally {
      setBusy(false);
    }
  }

  async function duplicateCatalog(summary: CatalogSummary) {
    const source = await catalogRepository.getCatalog(summary.id);
    if (!source) return;
    const copy = { ...clone(source), id: 'catalog-' + crypto.randomUUID(), name: source.name + ' copy', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 0, createdBy: 'Admin' };
    const saved = await catalogRepository.createCatalog(copy);
    setCatalogs((items) => [saved, ...items]);
    showNotice('Catalog duplicated as a new snapshot.');
  }

  async function deleteCatalog(summary: CatalogSummary) {
    if (!window.confirm('Delete ' + summary.name + '?')) return;
    await catalogRepository.deleteCatalog(summary.id, summary.revision);
    setCatalogs((items) => items.filter((item) => item.id !== summary.id));
    if (draft?.id === summary.id) { setDraft(null); setView('history'); }
    showNotice('Catalog deleted.');
  }

  async function downloadCatalog(id: string) {
    const found = await catalogRepository.getCatalog(id);
    if (!found) return;
    if (!openCatalogPrintWindow(found)) showNotice('Allow popups to download this PDF.');
  }

  function goBackFromBuilder() {
    if (dirty && !window.confirm('This draft has unsaved changes. Leave without saving?')) return;
    setDraft(null);
    setView('history');
  }

  if (loading) return <AdminLayout><div className="py-24 text-center text-ink-400">Loading Catalog Management…</div></AdminLayout>;

  return <AdminLayout>
    {notice && <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
    {view === 'builder' && draft ? <BuilderHeader draft={draft} busy={busy} onBack={goBackFromBuilder} onSave={saveDraft} onPreview={() => openCatalogPreviewWindow(draft)} onDownload={() => openCatalogPrintWindow(draft)} /> : <PageHeader onCreate={() => openCreate()} />}
    {view !== 'builder' && <NavigationTabs view={view} masterCount={master?.products.length ?? 0} catalogCount={catalogs.length} setView={setView} />}
    {master?.products.length === 0 && view === 'overview' && <EmptyMaster onImport={importReference} onStart={() => setView('master')} />}
    {master && master.products.length > 0 && view === 'overview' && <Overview state={master} catalogs={catalogs} onPreset={openCreate} setView={setView} onOpen={openDraft} onDuplicate={duplicateCatalog} />}
    {master && view === 'master' && <MasterCatalog state={master} busy={busy} onSave={saveMaster} onImport={importReference} onEdit={(product, categories, products) => { setProductEditorContext({ categories, products }); setProductToEdit(product); setProductOpen(true); }} />}
    {view === 'history' && <CatalogHistory catalogs={catalogs} onOpen={openDraft} onDownload={downloadCatalog} onDuplicate={duplicateCatalog} onDelete={deleteCatalog} onCreate={() => openCreate()} />}
    {view === 'builder' && draft && <DraftBuilder draft={draft} setDraft={(next) => { setDraft(next); setDirty(true); }} onSave={saveDraft} onPreview={() => openCatalogPreviewWindow(draft)} onAddPage={() => setPageOpen(true)} />}
    {master && <CreateCatalogModal open={createOpen} type={createPreset} master={master} onClose={() => setCreateOpen(false)} onCreate={createSnapshot} busy={busy} />}
    {productToEdit && <ProductModal open={productOpen} product={productToEdit} categories={productEditorContext?.categories ?? master?.categories ?? []} onClose={() => { setProductOpen(false); setProductEditorContext(null); }} onSave={async (product) => { const categories = productEditorContext?.categories ?? master?.categories ?? []; const baseProducts = productEditorContext?.products ?? master?.products ?? []; const exists = baseProducts.some((item) => item.id === product.id); const products = exists ? baseProducts.map((item) => item.id === product.id ? product : item) : [product, ...baseProducts]; await saveMaster(categories, products); setProductOpen(false); setProductEditorContext(null); }} />}
    {draft && <CustomPageModal open={pageOpen} onClose={() => setPageOpen(false)} onSave={(page) => { const next = { ...draft, customPages: [...draft.customPages, { ...page, id: 'page-' + crypto.randomUUID(), sortOrder: draft.customPages.length }] }; setDraft(next); setDirty(true); setPageOpen(false); }} />}
  </AdminLayout>;
}

function PageHeader({ onCreate }: { onCreate: () => void }) {
  return <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div className="min-w-0 max-w-3xl"><div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-brand-600"><Book width={16} height={16} /> Catalog Management</div><h1 className="text-3xl font-bold tracking-tight">Build every catalog from one source</h1><p className="mt-2 max-w-2xl text-ink-500">Manage products once in the Master Catalog, then create safe snapshots for retail, wholesale, or customer-specific catalogs.</p></div><Button className="shrink-0 self-start md:self-auto" size="lg" leftIcon={<Plus width={18} height={18} />} onClick={onCreate}>Create New Catalog</Button></header>;
}

function LegacyPageHeader({ onCreate }: { onCreate: () => void }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-brand-600"><Book width={16} height={16} /> Catalog Management</div><h1 className="text-3xl font-bold tracking-tight">Build every catalog from one source</h1><p className="mt-2 max-w-2xl text-ink-500">Manage products once in the Master Catalog, then create safe snapshots for retail, wholesale, or customer-specific catalogs.</p></div><Button size="lg" leftIcon={<Plus width={18} height={18} />} onClick={onCreate}>Create New Catalog</Button></header>;
}

function BuilderHeader({ draft, busy, onBack, onSave, onPreview, onDownload }: { draft: CatalogDraft; busy: boolean; onBack: () => void; onSave: () => void; onPreview: () => void; onDownload: () => void }) {
  return <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><button className="mb-3 text-sm font-semibold text-ink-500 hover:text-brand-600" onClick={onBack}>← Back to catalog history</button><div className="flex items-center gap-3"><h1 className="text-3xl font-bold">{draft.name}</h1><Badge tone="warning">Draft</Badge></div><p className="mt-1 text-ink-500">{draft.products.length} products · Last edited {dateText(draft.updatedAt)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" leftIcon={<Eye width={17} height={17} />} onClick={onPreview}>Preview PDF</Button><Button variant="secondary" leftIcon={<Download width={17} height={17} />} onClick={onDownload}>Download PDF</Button><Button leftIcon={<Check width={17} height={17} />} loading={busy} onClick={onSave}>Save Draft</Button></div></header>;
}

function NavigationTabs({ view, masterCount, catalogCount, setView }: { view: View; masterCount: number; catalogCount: number; setView: (view: View) => void }) {
  return <div className="mb-7 flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm"><Tab active={view === 'overview'} onClick={() => setView('overview')}>Overview</Tab><Tab active={view === 'master'} onClick={() => setView('master')}>Master Catalog <span>{masterCount}</span></Tab><Tab active={view === 'history'} onClick={() => setView('history')}>Catalog History <span>{catalogCount}</span></Tab></div>;
}

function Tab({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('rounded-xl px-4 py-2.5 text-sm font-semibold transition', active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900')}>{children}</button>;
}

function EmptyMaster({ onImport, onStart }: { onImport: () => void; onStart: () => void }) {
  return <Card className="mx-auto max-w-2xl p-10 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Book width={25} height={25} /></div><h2 className="mt-5 text-xl font-bold">Your Master Catalog is ready</h2><p className="mx-auto mt-2 max-w-lg text-ink-500">Import the products from the supplied Vio 2026 catalog, or start with an empty catalog and add products manually.</p><div className="mt-6 flex justify-center gap-2"><Button onClick={onImport} leftIcon={<Download width={17} height={17} />}>Import Vio reference catalog</Button><Button variant="outline" onClick={onStart}>Start empty</Button></div></Card>;
}

function Overview({ state, catalogs, onPreset, setView, onOpen, onDuplicate }: { state: CatalogState; catalogs: CatalogSummary[]; onPreset: (preset: Preset) => void; setView: (view: View) => void; onOpen: (id: string) => void; onDuplicate: (summary: CatalogSummary) => void }) {
  return <div className="space-y-7"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Master products" value={String(state.products.length)} detail={state.products.filter((p) => p.status === 'active').length + ' active'} icon={<Layers width={19} height={19} />} /><Stat label="Categories" value={String(state.categories.length)} detail="Reorderable source groups" icon={<Book width={19} height={19} />} /><Stat label="Saved catalogs" value={String(catalogs.length)} detail="Independent snapshots" icon={<Copy width={19} height={19} />} /><Stat label="Master revision" value={String(state.masterRevision)} detail="Source of truth version" icon={<Sliders width={19} height={19} />} /></div><section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold">Start with a preset</h2><p className="text-sm text-ink-500">Each preset opens the same snapshot builder.</p></div><button className="text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => setView('master')}>Manage Master Catalog →</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{presets.map((preset) => <button key={preset.type} type="button" onClick={() => onPreset(preset.type)} className="group rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"><div className="mb-8 flex items-center justify-between"><span className={cn('grid size-10 place-items-center rounded-xl', preset.tone)}><Book width={20} height={20} /></span><Plus className="text-ink-300 transition group-hover:text-brand-600" width={20} height={20} /></div><div className="font-bold">{preset.title}</div><p className="mt-1 text-sm leading-5 text-ink-500">{preset.description}</p></button>)}</div></section><section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold">Recent catalogs</h2><p className="text-sm text-ink-500">Snapshots stay unchanged when the Master Catalog is updated.</p></div><button className="text-sm font-semibold text-brand-600" onClick={() => setView('history')}>View history →</button></div>{catalogs.length === 0 ? <Card className="p-10 text-center text-ink-500">No catalogs yet. Choose a preset to create the first snapshot.</Card> : <div className="grid gap-3 md:grid-cols-2">{catalogs.slice(0, 4).map((catalog) => <Card key={catalog.id} className="flex items-center gap-4 p-4"><div className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Book width={21} height={21} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="truncate font-bold">{catalog.name}</div><Badge tone="warning">Draft</Badge></div><div className="mt-1 text-sm text-ink-500">{catalog.productCount} products · {dateText(catalog.updatedAt)}</div></div><button title="Edit" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onOpen(catalog.id)}><Pencil width={16} height={16} /></button><button title="Duplicate" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onDuplicate(catalog)}><Copy width={16} height={16} /></button></Card>)}</div>}</section></div>;
}

function Stat({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <Card className="p-5"><div className="mb-5 flex items-center justify-between"><span className="text-sm font-semibold text-ink-500">{label}</span><span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span></div><div className="text-2xl font-bold">{value}</div><div className="mt-1 text-sm text-ink-400">{detail}</div></Card>;
}

function MasterCatalog({ state, busy, onSave, onImport, onEdit }: { state: CatalogState; busy: boolean; onSave: (categories: CatalogCategory[], products: CatalogProduct[]) => Promise<void>; onImport: () => void; onEdit: (product: ProductForm, categories: CatalogCategory[], products: CatalogProduct[]) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [localCategories, setLocalCategories] = useState(state.categories);
  const [localProducts, setLocalProducts] = useState(state.products);

  useEffect(() => { setLocalCategories(state.categories); setLocalProducts(state.products); }, [state]);
  const filtered = useMemo(() => localProducts.filter((product) => {
    return (category === 'all' || product.categoryId === category) && (product.name + ' ' + product.sku).toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => a.sortOrder - b.sortOrder), [category, localProducts, search]);

  function updateProduct(id: string, patch: Partial<CatalogProduct>) {
    setLocalProducts((items) => items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  }
  function moveProduct(id: string, direction: -1 | 1) {
    const ordered = localProducts.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((product) => product.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    setLocalProducts(move(ordered, index, target).map((product, order) => ({ ...product, sortOrder: order + 1 })));
  }
  function updateCategories(next: CatalogCategory[]) {
    const reordered = next.map((item, index) => ({ ...item, sortOrder: index + 1 }));
    setLocalCategories(reordered);
  }
  function saveCategoryChanges() {
    void onSave(localCategories, localProducts);
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><section className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Master Catalog</h2><p className="text-sm text-ink-500">The source of truth for new catalogs. Existing snapshots stay independent.</p></div><div className="flex gap-2"><Button variant="outline" onClick={onImport} leftIcon={<Download width={16} height={16} />}>Import reference</Button><Button disabled={localCategories.length === 0} title={localCategories.length === 0 ? 'Create a category first' : 'Add a master product'} leftIcon={<Plus width={17} height={17} />} onClick={() => onEdit(emptyProduct(localCategories[0]?.id ?? ''), localCategories, localProducts)}>Add product</Button></div></div><Card className="overflow-hidden"><div className="flex flex-wrap gap-3 border-b border-slate-100 p-4"><div className="relative min-w-[240px] flex-1"><Search width={17} height={17} className="absolute left-3 top-3 text-ink-400" /><input className={inputClass + ' w-full pl-9'} placeholder="Search product or SKU" value={search} onChange={(event) => setSearch(event.target.value)} /></div><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{localCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="divide-y divide-slate-100">{filtered.map((product) => <div key={product.id} className="flex items-center gap-4 px-4 py-4"><div className="size-16 shrink-0 overflow-hidden rounded-xl bg-slate-100"><img src={product.mainImage} alt="" className="size-full object-cover" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-bold">{product.name}</span><Badge tone={product.status === 'active' ? 'success' : 'neutral'}>{product.status === 'active' ? 'Active' : 'Hidden'}</Badge></div><div className="mt-1 text-sm text-ink-500">{product.sku} · {localCategories.find((item) => item.id === product.categoryId)?.name ?? 'Uncategorized'}</div><div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-400"><span>{product.capacity || 'Capacity -'}</span><span>{product.power || 'Power -'}</span><span>Retail {money(product.retailPrice)}</span><span>{product.sourcePage ? 'Source p.' + product.sourcePage : 'Manual'}</span></div></div><div className="flex items-center gap-1"><ProductFeedbackActions productId={product.id} /><button title="Move product up" className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-slate-100 hover:text-brand-600" onClick={() => moveProduct(product.id, -1)}><ChevronUp width={15} height={15} /></button><button title="Move product down" className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-slate-100 hover:text-brand-600" onClick={() => moveProduct(product.id, 1)}><ChevronDown width={15} height={15} /></button><button title={product.status === 'active' ? 'Hide product' : 'Show product'} className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => updateProduct(product.id, { status: product.status === 'active' ? 'hidden' : 'active' })}>{product.status === 'active' ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}</button><button title="Edit product" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onEdit(product, localCategories, localProducts)}><Pencil width={16} height={16} /></button></div></div>)}{filtered.length === 0 && <div className="p-10 text-center text-ink-500">No matching products.</div>}</div></Card><div className="mt-4 flex justify-end"><Button loading={busy} leftIcon={<Check width={17} height={17} />} onClick={saveCategoryChanges}>Save Master Catalog</Button></div></section><CategoryManager categories={localCategories} onChange={updateCategories} /></div>;
}

function ProductFeedbackActions({ productId }: { productId: string }) {
  const destination = (action?: 'add' | 'link' | 'copy') => {
    const query = new URLSearchParams({ product: productId });
    if (action) query.set('action', action);
    return `${paths.feedback}?${query.toString()}`;
  };
  const itemClass = 'flex items-center gap-2.5 whitespace-nowrap px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-slate-50 hover:text-brand-700';
  return (
    <details className="group relative">
      <summary title="Feedback actions" className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600 [&::-webkit-details-marker]:hidden"><MoreHorizontal width={17} height={17} /></summary>
      <div className="absolute right-0 top-10 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
        <Link className={itemClass} to={destination()}><MessageSquare width={15} height={15} />View Feedback</Link>
        <Link className={itemClass} to={destination('add')}><Plus width={15} height={15} />Add Feedback</Link>
        <Link className={itemClass} to={destination('link')}><LinkIcon width={15} height={15} />Generate Feedback Link</Link>
        <Link className={itemClass} to={destination('copy')}><Copy width={15} height={15} />Copy Feedback Link</Link>
      </div>
    </details>
  );
}

function CategoryManager({ categories, onChange }: { categories: CatalogCategory[]; onChange: (categories: CatalogCategory[]) => void }) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  function saveCategory(event: FormEvent) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    if (editingId) onChange(categories.map((item) => item.id === editingId ? { ...item, name: value } : item));
    else onChange([...categories, { id: 'cat-' + crypto.randomUUID(), name: value, sortOrder: categories.length + 1, visible: true }]);
    setName('');
    setEditingId(null);
  }
  function moveCategory(id: string, direction: -1 | 1) {
    const index = categories.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= categories.length) return;
    onChange(move(categories, index, target));
  }
  return <Card className="h-fit p-5"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-bold">Categories</h2><p className="mt-1 text-sm text-ink-500">Create, rename, reorder, or hide source groups.</p></div><Book width={19} height={19} className="text-brand-600" /></div><form onSubmit={saveCategory} className="mb-4 flex gap-2"><input className={inputClass + ' min-w-0 flex-1'} placeholder={editingId ? 'Rename category' : 'New category'} value={name} onChange={(event) => setName(event.target.value)} /><button className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white hover:bg-brand-700" title={editingId ? 'Save category name' : 'Add category'}><Plus width={18} height={18} /></button></form><div className="space-y-2">{categories.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5"><span className="grid size-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-ink-500">{String(index + 1).padStart(2, '0')}</span><span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', !item.visible && 'text-ink-400 line-through')}>{item.name}</span><button type="button" title="Edit category" className="text-ink-400 hover:text-brand-600" onClick={() => { setEditingId(item.id); setName(item.name); }}><Pencil width={14} height={14} /></button><button type="button" title="Move up" disabled={index === 0} className="text-ink-400 hover:text-brand-600 disabled:opacity-30" onClick={() => moveCategory(item.id, -1)}><ChevronUp width={15} height={15} /></button><button type="button" title="Move down" disabled={index === categories.length - 1} className="text-ink-400 hover:text-brand-600 disabled:opacity-30" onClick={() => moveCategory(item.id, 1)}><ChevronDown width={15} height={15} /></button><button type="button" title={item.visible ? 'Hide category' : 'Show category'} className="text-ink-400 hover:text-brand-600" onClick={() => onChange(categories.map((category) => category.id === item.id ? { ...category, visible: !category.visible } : category))}>{item.visible ? <Eye width={15} height={15} /> : <EyeOff width={15} height={15} />}</button></div>)}</div><div className="mt-5 rounded-xl bg-brand-50 p-3 text-xs leading-5 text-brand-700">Hidden categories stay in saved snapshots and will not be offered in new selections.</div></Card>;
}

function CatalogHistory({ catalogs, onOpen, onDownload, onDuplicate, onDelete, onCreate }: { catalogs: CatalogSummary[]; onOpen: (id: string) => void; onDownload: (id: string) => void; onDuplicate: (summary: CatalogSummary) => void; onDelete: (summary: CatalogSummary) => void; onCreate: () => void }) {
  return <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Catalog History</h2><p className="text-sm text-ink-500">Each catalog is a complete snapshot with its own product data.</p></div><Button leftIcon={<Plus width={17} height={17} />} onClick={onCreate}>Create catalog</Button></div>{catalogs.length === 0 ? <Card className="p-12 text-center text-ink-500">No saved catalogs yet.</Card> : <Card className="overflow-hidden"><div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink-400 md:grid"><span>Catalog</span><span>Type</span><span>Created by</span><span>Products</span><span>Last edited</span><span /></div><div className="divide-y divide-slate-100">{catalogs.map((catalog) => <div key={catalog.id} className="grid gap-3 px-5 py-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-bold">{catalog.name}</span><Badge tone="warning">Draft</Badge></div><div className="mt-1 text-sm text-ink-500">{catalog.priceMode === 'none' ? 'No price' : catalog.priceMode + ' pricing'}</div></div><span className="text-sm capitalize text-ink-600">{catalog.type.replace('-', ' ')}</span><span className="text-sm text-ink-600">{catalog.createdBy}<br /><span className="text-xs text-ink-400">{dateText(catalog.createdAt)}</span></span><span className="text-sm text-ink-600">{catalog.productCount} items</span><span className="text-sm text-ink-600">{dateText(catalog.updatedAt)}</span><div className="flex items-center gap-1"><button title="Edit" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onOpen(catalog.id)}><Pencil width={16} height={16} /></button><button title="Download PDF" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onDownload(catalog.id)}><Download width={16} height={16} /></button><button title="Duplicate" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onDuplicate(catalog)}><Copy width={16} height={16} /></button><button title="Delete" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => onDelete(catalog)}><Trash width={16} height={16} /></button></div></div>)}</div></Card>}</section>;
}

function CatalogHistoryLegacy({ catalogs, onOpen, onDuplicate, onDelete, onCreate }: { catalogs: CatalogSummary[]; onOpen: (id: string) => void; onDuplicate: (summary: CatalogSummary) => void; onDelete: (summary: CatalogSummary) => void; onCreate: () => void }) {
  return <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Catalog History</h2><p className="text-sm text-ink-500">Each catalog is a complete snapshot with its own product data.</p></div><Button leftIcon={<Plus width={17} height={17} />} onClick={onCreate}>Create catalog</Button></div>{catalogs.length === 0 ? <Card className="p-12 text-center text-ink-500">No saved catalogs yet.</Card> : <Card className="overflow-hidden"><div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink-400 md:grid"><span>Catalog</span><span>Type</span><span>Created by</span><span>Products</span><span>Last edited</span><span /></div><div className="divide-y divide-slate-100">{catalogs.map((catalog) => <div key={catalog.id} className="grid gap-3 px-5 py-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-bold">{catalog.name}</span><Badge tone="warning">Draft</Badge></div><div className="mt-1 text-sm text-ink-500">{catalog.priceMode === 'none' ? 'No price' : catalog.priceMode + ' pricing'}</div></div><span className="text-sm capitalize text-ink-600">{catalog.type.replace('-', ' ')}</span><span className="text-sm text-ink-600">{catalog.createdBy}<br /><span className="text-xs text-ink-400">{dateText(catalog.createdAt)}</span></span><span className="text-sm text-ink-600">{catalog.productCount} items</span><span className="text-sm text-ink-600">{dateText(catalog.updatedAt)}</span><div className="flex items-center gap-1"><button title="Edit" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onOpen(catalog.id)}><Pencil width={16} height={16} /></button><button title="Download PDF" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => void onOpen(catalog.id)}><Download width={16} height={16} /></button><button title="Duplicate" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => onDuplicate(catalog)}><Copy width={16} height={16} /></button><button title="Delete" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => onDelete(catalog)}><Trash width={16} height={16} /></button></div></div>)}</div></Card>}</section>;
}

function CreateCatalogModal({ open, type, master, onClose, onCreate, busy }: { open: boolean; type: Preset; master: CatalogState; onClose: () => void; onCreate: (values: { name: string; mode: CatalogPriceMode; productIds: string[]; showSpecifications: boolean; coverImage: string }) => Promise<void>; busy: boolean }) {
  const preset = presets.find((item) => item.type === type) ?? presets[3];
  const [name, setName] = useState(preset.title);
  const [mode, setMode] = useState<CatalogPriceMode>(preset.mode);
  const [selected, setSelected] = useState<string[]>([]);
  const [showSpecifications, setShowSpecifications] = useState(true);
  const [coverImage, setCoverImage] = useState(ref.cover);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const selectableProducts = useMemo(() => master.products.filter((product) => product.status === 'active' && master.categories.find((category) => category.id === product.categoryId)?.visible !== false), [master.products, master.categories]);
  const products = selectableProducts.filter((product) => categoryFilter === 'all' || product.categoryId === categoryFilter);

  useEffect(() => {
    if (!open) return;
    setName(preset.title); setMode(preset.mode); setSelected(type === 'custom' ? [] : selectableProducts.map((product) => product.id)); setShowSpecifications(true); setCoverImage(ref.cover); setCategoryFilter('all');
  }, [open, type, preset.mode, preset.title, selectableProducts]);

  function toggleProduct(id: string) { setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : items.concat(id)); }
  function toggleCategory(id: string) {
    const ids = selectableProducts.filter((product) => product.categoryId === id).map((product) => product.id);
    const checked = ids.every((id) => selected.includes(id));
    setSelected((items) => checked ? items.filter((item) => !ids.includes(item)) : [...new Set(items.concat(ids))]);
  }
  function submit(event: FormEvent) { event.preventDefault(); void onCreate({ name, mode, productIds: selected, showSpecifications, coverImage }); }

  return <Modal open={open} onClose={onClose} title="Create new catalog" description="Start with a preset, select products, then edit only this snapshot." className="max-w-4xl"><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Input label="Catalog name" required value={name} onChange={(event) => setName(event.target.value)} /><label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink-900">Price mode</span><select className={inputClass + ' w-full'} value={mode} onChange={(event) => setMode(event.target.value as CatalogPriceMode)}><option value="retail">Retail price</option><option value="wholesale">Wholesale price</option><option value="none">No price</option></select></label></div><div className="grid gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><ImageField label="Start page image" value={coverImage} onChange={setCoverImage} hint="Upload a cover image or paste a URL." /><label className="flex items-center gap-2 pb-1 text-sm font-semibold text-ink-800"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={showSpecifications} onChange={(event) => setShowSpecifications(event.target.checked)} /> Show specifications</label></div><section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Selection</div><h2 className="mt-1 font-bold">Categories and products</h2><p className="mt-1 text-sm text-ink-500">Select a category to include its products, then remove individual items if needed.</p></div><div className="flex w-full items-center gap-2 sm:w-auto"><select className={inputClass + ' min-w-0 flex-1 sm:w-44'} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{master.categories.filter((category) => category.visible).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={selectableProducts.length > 0 && selectableProducts.every((product) => selected.includes(product.id))} onChange={() => setSelected(selectableProducts.every((product) => selected.includes(product.id)) ? [] : selectableProducts.map((product) => product.id))} /> All</label></div></div><div className="grid max-h-80 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">{master.categories.filter((category) => category.visible && (categoryFilter === 'all' || category.id === categoryFilter)).map((category) => { const group = products.filter((product) => product.categoryId === category.id); if (!group.length) return null; const checked = group.every((product) => selected.includes(product.id)); return <div key={category.id} className="rounded-xl border border-slate-200 bg-white p-3"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={checked} onChange={() => toggleCategory(category.id)} /> {category.name}<span className="ml-auto text-xs font-normal text-ink-400">{group.length}</span></label><div className="mt-2 space-y-1 border-t border-slate-100 pt-2">{group.map((product) => <label key={product.id} className="flex items-center gap-2 text-sm text-ink-600"><input type="checkbox" className="size-3.5 accent-[#a5292b]" checked={selected.includes(product.id)} onChange={() => toggleProduct(product.id)} /><span className="truncate">{product.name}</span></label>)}</div></div>; })}</div></section><div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-slate-100 bg-white/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-semibold text-ink-500">{selected.length} products selected</span><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim() || selected.length === 0} leftIcon={<Layers width={17} height={17} />}>Create snapshot</Button></div></div></form></Modal>;
}

function LegacyCreateCatalogModal({ open, type, master, onClose, onCreate, busy }: { open: boolean; type: Preset; master: CatalogState; onClose: () => void; onCreate: (values: { name: string; mode: CatalogPriceMode; productIds: string[]; showSpecifications: boolean; coverImage: string }) => Promise<void>; busy: boolean }) {
  const preset = presets.find((item) => item.type === type) ?? presets[3];
  const [name, setName] = useState(preset.title);
  const [mode, setMode] = useState<CatalogPriceMode>(preset.mode);
  const [selected, setSelected] = useState<string[]>([]);
  const [showSpecifications, setShowSpecifications] = useState(true);
  const [coverImage, setCoverImage] = useState(ref.cover);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const selectableProducts = useMemo(() => master.products.filter((product) => product.status === 'active' && master.categories.find((category) => category.id === product.categoryId)?.visible !== false), [master.products, master.categories]);

  useEffect(() => {
    if (!open) return;
    setName(preset.title);
    setMode(preset.mode);
    setSelected(type === 'custom' ? [] : selectableProducts.map((item) => item.id));
    setShowSpecifications(true);
    setCoverImage(ref.cover);
    setCategoryFilter('all');
  }, [open, type, selectableProducts, preset.mode, preset.title]);

  const products = selectableProducts.filter((product) => categoryFilter === 'all' || product.categoryId === categoryFilter);
  function toggle(id: string) { setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  function toggleCategory(id: string) {
    const ids = master.products.filter((product) => product.status === 'active' && product.categoryId === id).map((product) => product.id);
    const all = ids.every((item) => selected.includes(item));
    setSelected((items) => all ? items.filter((item) => !ids.includes(item)) : [...new Set(items.concat(ids))]);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void onCreate({ name, mode, productIds: selected, showSpecifications, coverImage });
  }
  return <Modal open={open} onClose={onClose} title="Create new catalog" description="Select products, then edit only this snapshot." className="max-w-4xl"><form onSubmit={submit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Input label="Catalog name" required value={name} onChange={(event) => setName(event.target.value)} /><label className="block"><span className="mb-1.5 block text-sm font-semibold">Price mode</span><select className={inputClass + ' w-full'} value={mode} onChange={(event) => setMode(event.target.value as CatalogPriceMode)}><option value="retail">Retail price</option><option value="wholesale">Wholesale price</option><option value="none">No price</option></select></label></div><div className="grid gap-4 sm:grid-cols-2"><Input label="Cover image URL" value={coverImage} onChange={(event) => setCoverImage(event.target.value)} /><label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={showSpecifications} onChange={(event) => setShowSpecifications(event.target.checked)} /> Show specifications</label></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold">Select categories and products</div><div className="text-sm text-ink-500">Category selection includes all items; individual products can be removed.</div></div><div className="flex items-center gap-3"><select className={inputClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{master.categories.filter((category) => category.visible).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={selected.length === master.products.filter((item) => item.status === 'active').length} onChange={() => setSelected(selected.length === master.products.filter((item) => item.status === 'active').length ? [] : master.products.filter((item) => item.status === 'active').map((item) => item.id))} /> All</label></div></div><div className="grid max-h-72 gap-3 overflow-y-auto pr-1 md:grid-cols-2">{master.categories.filter((category) => category.visible && (categoryFilter === 'all' || category.id === categoryFilter)).map((category) => { const group = products.filter((product) => product.categoryId === category.id); if (!group.length) return null; const all = group.every((product) => selected.includes(product.id)); return <div key={category.id} className="rounded-xl border border-slate-200 bg-white p-3"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={all} onChange={() => toggleCategory(category.id)} /> {category.name}<span className="ml-auto text-xs font-normal text-ink-400">{group.length}</span></label><div className="mt-2 space-y-1 border-t border-slate-100 pt-2">{group.map((product) => <label key={product.id} className="flex items-center gap-2 text-sm text-ink-600"><input type="checkbox" className="size-3.5 accent-[#a5292b]" checked={selected.includes(product.id)} onChange={() => toggle(product.id)} /><span className="truncate">{product.name}</span></label>)}</div></div>; })}</div></div><div className="flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-sm text-ink-500">{selected.length} products selected</span><div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={!name.trim() || selected.length === 0} leftIcon={<Layers width={17} height={17} />}>Create snapshot</Button></div></div></form></Modal>;
}

function ProductModal({ open, product, categories, onClose, onSave }: { open: boolean; product: ProductForm; categories: CatalogCategory[]; onClose: () => void; onSave: (product: ProductForm) => Promise<void> }) {
  const [form, setForm] = useState(product);
  const [specs, setSpecs] = useState<Array<{ key: string; value: string }>>([]);
  useEffect(() => { setForm(product); setSpecs(Object.entries(product.specifications).map(([key, value]) => ({ key, value }))); }, [product]);
  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const specifications = Object.fromEntries(specs.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value.trim()]));
    void onSave({ ...form, id: form.id || 'prd-' + crypto.randomUUID(), specifications, additionalImages: form.additionalImages.filter(Boolean), updatedAt: new Date().toISOString() });
  }
  return <Modal open={open} onClose={onClose} title={form.id ? 'Edit master product' : 'Add master product'} description="New catalogs copy this data. Existing snapshots are never rewritten." className="max-w-3xl"><form onSubmit={submit} className="space-y-5"><section className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="mb-4"><div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Product identity</div><p className="mt-1 text-sm text-ink-500">Keep the name and model clear for managers and customers.</p></div><div className="grid gap-4 sm:grid-cols-2"><Input label="Product name" required value={form.name} onChange={(event) => update('name', event.target.value)} /><Input label="Model / SKU" required value={form.sku} onChange={(event) => update('sku', event.target.value)} /><label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink-900">Category</span><select className={inputClass + ' w-full'} value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-sm font-semibold text-ink-900">Product status</span><select className={inputClass + ' w-full'} value={form.status} onChange={(event) => update('status', event.target.value as CatalogProduct['status'])}><option value="active">Active</option><option value="hidden">Hidden</option></select></label><div className="sm:col-span-2"><ImageField label="Main product image" value={form.mainImage} onChange={(value) => update('mainImage', value)} hint="Upload a photo or paste an image URL." /></div></div></section><section><div className="mb-3"><div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Product details</div><p className="mt-1 text-sm text-ink-500">These values appear in the generated specification table.</p></div><div className="grid gap-4 sm:grid-cols-3"><Input label="Capacity" value={form.capacity} onChange={(event) => update('capacity', event.target.value)} /><Input label="Power" value={form.power} onChange={(event) => update('power', event.target.value)} /><Input label="Warranty" value={form.warranty} onChange={(event) => update('warranty', event.target.value)} /><Input label="Weight" value={form.weight} onChange={(event) => update('weight', event.target.value)} /><Input label="CBM" value={form.cbm} onChange={(event) => update('cbm', event.target.value)} /><Input label="CTN quantity" value={form.ctnQuantity} onChange={(event) => update('ctnQuantity', event.target.value)} /></div></section><section className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="mb-3"><div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Pricing</div><p className="mt-1 text-sm text-ink-500">Leave prices empty for no-price catalogs.</p></div><div className="grid gap-4 sm:grid-cols-2"><Input label="Retail price (IQD)" type="number" value={form.retailPrice ?? ''} onChange={(event) => update('retailPrice', event.target.value ? Number(event.target.value) : null)} /><Input label="Wholesale price (IQD)" type="number" value={form.wholesalePrice ?? ''} onChange={(event) => update('wholesalePrice', event.target.value ? Number(event.target.value) : null)} /></div></section><section><div className="mb-3 flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">More media & specs</div><p className="mt-1 text-sm text-ink-500">Optional supporting photos and custom specification rows.</p></div><button type="button" className="shrink-0 text-sm font-bold text-brand-600 hover:text-brand-700" onClick={() => setSpecs((items) => items.concat({ key: '', value: '' }))}>+ Add specification</button></div><Input label="Additional image URLs" hint="Separate multiple URLs with commas." value={form.additionalImages.join(', ')} onChange={(event) => update('additionalImages', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} /><div className="mt-4 space-y-2">{specs.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"><input className={inputClass} placeholder="Specification" value={item.key} onChange={(event) => setSpecs((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, key: event.target.value } : row))} /><input className={inputClass} placeholder="Value" value={item.value} onChange={(event) => setSpecs((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} /><button type="button" className="grid size-11 place-items-center rounded-xl text-ink-400 hover:bg-rose-50 hover:text-rose-600" title="Remove specification" onClick={() => setSpecs((items) => items.filter((_, rowIndex) => rowIndex !== index))}><X width={16} height={16} /></button></div>)}</div></section><div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" leftIcon={<Check width={17} height={17} />}>Save master product</Button></div></form></Modal>;
}

function LegacyProductModal({ open, product, categories, onClose, onSave }: { open: boolean; product: ProductForm; categories: CatalogCategory[]; onClose: () => void; onSave: (product: ProductForm) => Promise<void> }) {
  const [form, setForm] = useState(product);
  const [specs, setSpecs] = useState<Array<{ key: string; value: string }>>([]);
  useEffect(() => { setForm(product); setSpecs(Object.entries(product.specifications).map(([key, value]) => ({ key, value }))); }, [product]);
  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const specifications = Object.fromEntries(specs.filter((item) => item.key.trim()).map((item) => [item.key.trim(), item.value.trim()]));
    void onSave({ ...form, id: form.id || 'prd-' + crypto.randomUUID(), specifications, additionalImages: form.additionalImages.filter(Boolean), updatedAt: new Date().toISOString() });
  }
  return <Modal open={open} onClose={onClose} title={form.id ? 'Edit master product' : 'Add master product'} description="New catalogs copy this data. Existing snapshots are never rewritten." className="max-w-3xl"><form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Input label="Product name" required value={form.name} onChange={(event) => update('name', event.target.value)} /><Input label="Model / SKU" required value={form.sku} onChange={(event) => update('sku', event.target.value)} /><label className="block"><span className="mb-1.5 block text-sm font-semibold">Category</span><select className={inputClass + ' w-full'} value={form.categoryId} onChange={(event) => update('categoryId', event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Input label="Main product image URL" value={form.mainImage} onChange={(event) => update('mainImage', event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-3"><Input label="Capacity" value={form.capacity} onChange={(event) => update('capacity', event.target.value)} /><Input label="Power" value={form.power} onChange={(event) => update('power', event.target.value)} /><Input label="Warranty" value={form.warranty} onChange={(event) => update('warranty', event.target.value)} /><Input label="Weight" value={form.weight} onChange={(event) => update('weight', event.target.value)} /><Input label="CBM" value={form.cbm} onChange={(event) => update('cbm', event.target.value)} /><Input label="CTN quantity" value={form.ctnQuantity} onChange={(event) => update('ctnQuantity', event.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><Input label="Retail price (IQD)" type="number" value={form.retailPrice ?? ''} onChange={(event) => update('retailPrice', event.target.value ? Number(event.target.value) : null)} /><Input label="Wholesale price (IQD)" type="number" value={form.wholesalePrice ?? ''} onChange={(event) => update('wholesalePrice', event.target.value ? Number(event.target.value) : null)} /></div><Input label="Additional image URLs" hint="Separate multiple URLs with commas." value={form.additionalImages.join(', ')} onChange={(event) => update('additionalImages', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} /><div><div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-semibold">Custom specifications</span><button type="button" className="text-sm font-semibold text-brand-600" onClick={() => setSpecs((items) => items.concat({ key: '', value: '' }))}>+ Add specification</button></div><div className="space-y-2">{specs.map((item, index) => <div key={index} className="grid grid-cols-2 gap-2"><input className={inputClass} placeholder="Specification" value={item.key} onChange={(event) => setSpecs((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, key: event.target.value } : row))} /><input className={inputClass} placeholder="Value" value={item.value} onChange={(event) => setSpecs((items) => items.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} /></div>)}</div></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" leftIcon={<Check width={17} height={17} />}>Save master product</Button></div></form></Modal>;
}

function DraftBuilder({ draft, setDraft, onSave, onPreview, onAddPage }: { draft: CatalogDraft; setDraft: (draft: CatalogDraft) => void; onSave: () => Promise<void>; onPreview: () => void; onAddPage: () => void }) {
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dividerId, setDividerId] = useState('');

  function update(patch: Partial<CatalogDraft>) { setDraft({ ...draft, ...patch }); }
  function updateProduct(id: string, patch: Partial<CatalogDraftProduct>) { update({ products: draft.products.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function reorderProducts(targetId: string) {
    if (!draggedProductId || draggedProductId === targetId) return;
    const from = draft.products.findIndex((item) => item.id === draggedProductId);
    const target = draft.products.findIndex((item) => item.id === targetId);
    if (from >= 0 && target >= 0) update({ products: move(draft.products, from, target) });
    setDraggedProductId(null);
  }
  function reorderCategories(targetId: string) {
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    const from = draft.categories.findIndex((item) => item.id === draggedCategoryId);
    const target = draft.categories.findIndex((item) => item.id === targetId);
    if (from >= 0 && target >= 0) update({ categories: move(draft.categories, from, target) });
    setDraggedCategoryId(null);
  }
  function moveCategory(id: string, direction: -1 | 1) {
    const index = draft.categories.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < draft.categories.length) update({ categories: move(draft.categories, index, target) });
  }
  function moveProduct(id: string, direction: -1 | 1) {
    const index = draft.products.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < draft.products.length) update({ products: move(draft.products, index, target) });
  }
  function addDivider() {
    if (!dividerId || draft.categoryDividers.includes(dividerId)) return;
    update({ categoryDividers: draft.categoryDividers.concat(dividerId) });
  }

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
    <section className="min-w-0">
      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Draft design</div><h2 className="font-bold">Build your catalog</h2><p className="mt-1 text-sm text-ink-500">These changes stay inside this catalog copy.</p></div>
          <div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><span className="text-ink-500">Layout</span><select className="h-9 bg-transparent outline-none" value={draft.layout} onChange={(event) => update({ layout: Number(event.target.value) as CatalogLayout })}><option value="3">3 products / page</option><option value="2">2 products / page</option><option value="1">1 product / page</option></select></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={draft.showSpecifications} onChange={(event) => update({ showSpecifications: event.target.checked })} /> Specifications</label></div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><Input label="Catalog name" value={draft.name} onChange={(event) => update({ name: event.target.value })} /><ImageField label="Start page image" value={draft.coverImage} onChange={(value) => update({ coverImage: value })} hint="Upload a new cover or paste an image URL." /></div>
      </Card>
      <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Product order</h2><p className="text-sm text-ink-500">Drag cards to reorder. Edit or remove items without touching Master Catalog.</p></div><span className="shrink-0 text-sm font-semibold text-ink-400">{draft.products.length} selected</span></div>
      <div className="space-y-3">{draft.products.map((product, index) => <DraftProductCard key={product.id} product={product} index={index} draft={draft} editing={editingProductId === product.id} onEdit={() => setEditingProductId(editingProductId === product.id ? null : product.id)} onUpdate={(patch) => updateProduct(product.id, patch)} onRemove={() => update({ products: draft.products.filter((item) => item.id !== product.id) })} onMove={(direction) => moveProduct(product.id, direction)} onDragStart={() => setDraggedProductId(product.id)} onDrop={() => reorderProducts(product.id)} />)}</div>
    </section>
    <aside className="min-w-0 space-y-4">
      <Card className="p-5"><div className="mb-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Pages</div><h2 className="mt-1 font-bold">Catalog sections</h2><p className="mt-1 text-sm leading-5 text-ink-500">Category banners are ready by default. Add custom pages when needed.</p></div><div className="space-y-2"><Button fullWidth variant="outline" leftIcon={<Plus width={16} height={16} />} onClick={onAddPage}>Add custom page</Button><div className="flex gap-2"><select className={inputClass + ' min-w-0 flex-1'} value={dividerId} onChange={(event) => setDividerId(event.target.value)}><option value="">Add a category divider</option>{draft.categories.filter((category) => !draft.categoryDividers.includes(category.id)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 text-ink-600 hover:border-brand-500 hover:text-brand-600" title="Add divider" onClick={addDivider}><Plus width={17} height={17} /></button></div></div><div className="mt-4 space-y-2">{draft.categoryDividers.map((id) => <div key={id} className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"><span>{draft.categories.find((item) => item.id === id)?.name ?? 'Category'} banner</span><button type="button" onClick={() => update({ categoryDividers: draft.categoryDividers.filter((item) => item !== id) })}><X width={14} height={14} /></button></div>)}{draft.customPages.map((page, index) => <div key={page.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-ink-600"><span>{index + 1}. {page.title || 'Custom page'}</span><button type="button" onClick={() => update({ customPages: draft.customPages.filter((item) => item.id !== page.id) })}><X width={14} height={14} /></button></div>)}</div></Card>
      <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Order</div><h2 className="mt-1 font-bold">Category order</h2></div><Layers width={18} height={18} className="text-brand-600" /></div><div className="space-y-2">{draft.categories.map((category, index) => <div key={category.id} draggable onDragStart={() => setDraggedCategoryId(category.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderCategories(category.id)} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5"><GripVertical width={15} height={15} className="text-ink-300" /><span className="grid size-6 place-items-center rounded-md bg-slate-100 text-xs font-bold text-ink-500">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{category.name}</span><button type="button" title="Move up" disabled={index === 0} className="text-ink-400 disabled:opacity-30" onClick={() => moveCategory(category.id, -1)}><ChevronUp width={14} height={14} /></button><button type="button" title="Move down" disabled={index === draft.categories.length - 1} className="text-ink-400 disabled:opacity-30" onClick={() => moveCategory(category.id, 1)}><ChevronDown width={14} height={14} /></button></div>)}</div></Card>
      <Card className="p-5"><div className="mb-4"><div className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Visual system</div><h2 className="mt-1 font-bold">Category banner images</h2><p className="mt-1 text-sm leading-5 text-ink-500">Each category divider can have its own image. Leave it empty to use the Vio graphic.</p></div><div className="max-h-80 space-y-4 overflow-y-auto pr-1">{draft.categories.map((category) => <ImageField key={category.id} label={category.name} value={draft.categoryBanners?.[category.id] ?? ''} onChange={(value) => update({ categoryBanners: { ...(draft.categoryBanners ?? {}), [category.id]: value } })} preview={false} />)}</div></Card>
      <Card className="overflow-hidden p-0"><div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Preview</div><h2 className="mt-1 font-bold">Start page</h2></div><ImageIcon width={18} height={18} className="text-brand-600" /></div><div className="mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-brand-50">{draft.coverImage ? <img src={draft.coverImage} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-sm text-ink-400">Add a start page image</div>}</div><div className="mt-3 text-sm font-semibold">{draft.name}</div><div className="mt-1 text-xs text-ink-400">Vio · {draft.priceMode === 'none' ? 'No price' : draft.priceMode + ' pricing'} · {draft.layout} per page</div></div><div className="flex gap-2 p-5"><Button fullWidth variant="secondary" leftIcon={<Eye width={16} height={16} />} onClick={onPreview}>Preview PDF</Button><Button fullWidth leftIcon={<Printer width={16} height={16} />} onClick={() => void onSave()}>Save draft</Button></div></Card>
    </aside>
  </div>;
}

function LegacyDraftBuilder({ draft, setDraft, onSave, onPreview, onAddPage }: { draft: CatalogDraft; setDraft: (draft: CatalogDraft) => void; onSave: () => Promise<void>; onPreview: () => void; onAddPage: () => void }) {
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dividerId, setDividerId] = useState(draft.categoryDividers[0] ?? '');

  function update(patch: Partial<CatalogDraft>) { setDraft({ ...draft, ...patch }); }
  function updateProduct(id: string, patch: Partial<CatalogDraftProduct>) { update({ products: draft.products.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function reorderProducts(targetId: string) {
    if (!draggedProductId || draggedProductId === targetId) return;
    const from = draft.products.findIndex((item) => item.id === draggedProductId);
    const target = draft.products.findIndex((item) => item.id === targetId);
    if (from >= 0 && target >= 0) update({ products: move(draft.products, from, target) });
    setDraggedProductId(null);
  }
  function reorderCategories(targetId: string) {
    if (!draggedCategoryId || draggedCategoryId === targetId) return;
    const from = draft.categories.findIndex((item) => item.id === draggedCategoryId);
    const target = draft.categories.findIndex((item) => item.id === targetId);
    if (from >= 0 && target >= 0) update({ categories: move(draft.categories, from, target) });
    setDraggedCategoryId(null);
  }
  function moveCategory(id: string, direction: -1 | 1) {
    const index = draft.categories.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < draft.categories.length) update({ categories: move(draft.categories, index, target) });
  }
  function moveProduct(id: string, direction: -1 | 1) {
    const index = draft.products.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < draft.products.length) update({ products: move(draft.products, index, target) });
  }
  function addDivider() {
    if (!dividerId || draft.categoryDividers.includes(dividerId)) return;
    update({ categoryDividers: draft.categoryDividers.concat(dividerId) });
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><section><Card className="mb-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Catalog setup</h2><p className="mt-1 text-sm text-ink-500">Everything below is temporary for this draft.</p></div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><span className="text-ink-500">Layout</span><select className="h-9 bg-transparent outline-none" value={draft.layout} onChange={(event) => update({ layout: Number(event.target.value) as CatalogLayout })}><option value="1">1 product / page</option><option value="2">2 products / page</option><option value="3">3 products / page</option></select></label><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#a5292b]" checked={draft.showSpecifications} onChange={(event) => update({ showSpecifications: event.target.checked })} /> Specifications</label></div></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Input label="Catalog name" value={draft.name} onChange={(event) => update({ name: event.target.value })} /><Input label="Cover image URL" value={draft.coverImage} onChange={(event) => update({ coverImage: event.target.value })} /></div></Card><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-bold">Product order</h2><p className="text-sm text-ink-500">Drag products to reorder, or use the arrows on each card.</p></div><span className="text-sm font-semibold text-ink-400">{draft.products.length} selected</span></div><div className="space-y-3">{draft.products.map((product, index) => <DraftProductCard key={product.id} product={product} index={index} draft={draft} editing={editingProductId === product.id} onEdit={() => setEditingProductId(editingProductId === product.id ? null : product.id)} onUpdate={(patch) => updateProduct(product.id, patch)} onRemove={() => update({ products: draft.products.filter((item) => item.id !== product.id) })} onMove={(direction) => moveProduct(product.id, direction)} onDragStart={() => setDraggedProductId(product.id)} onDrop={() => reorderProducts(product.id)} />)}</div></section><aside className="space-y-4"><Card className="p-5"><h2 className="font-bold">Catalog pages</h2><p className="mt-1 text-sm leading-5 text-ink-500">Add category dividers and custom pages without touching the source.</p><div className="mt-4 space-y-2"><Button fullWidth variant="outline" leftIcon={<Plus width={16} height={16} />} onClick={onAddPage}>Add custom page</Button><div className="flex gap-2"><select className={inputClass + ' min-w-0 flex-1'} value={dividerId} onChange={(event) => setDividerId(event.target.value)}><option value="">Choose divider</option>{draft.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><button className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 text-ink-600 hover:border-brand-500 hover:text-brand-600" title="Add divider" onClick={addDivider}><Plus width={17} height={17} /></button></div></div><div className="mt-4 space-y-2">{draft.categoryDividers.map((id) => <div key={id} className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"><span>{draft.categories.find((item) => item.id === id)?.name ?? 'Category'} divider</span><button onClick={() => update({ categoryDividers: draft.categoryDividers.filter((item) => item !== id) })}><X width={14} height={14} /></button></div>)}{draft.customPages.map((page, index) => <div key={page.id} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-ink-600"><span>{index + 1}. {page.title || 'Custom page'}</span><button onClick={() => update({ customPages: draft.customPages.filter((item) => item.id !== page.id) })}><X width={14} height={14} /></button></div>)}</div></Card><Card className="p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Category order</h2><p className="mt-1 text-sm text-ink-500">Divider and section order for this draft.</p></div><Layers width={18} height={18} className="text-brand-600" /></div><div className="space-y-2">{draft.categories.map((category, index) => <div key={category.id} draggable onDragStart={() => setDraggedCategoryId(category.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderCategories(category.id)} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2.5"><GripVertical width={15} height={15} className="text-ink-300" /><span className="grid size-6 place-items-center rounded-md bg-slate-100 text-xs font-bold text-ink-500">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{category.name}</span><button title="Move up" disabled={index === 0} className="text-ink-400 disabled:opacity-30" onClick={() => moveCategory(category.id, -1)}><ChevronUp width={14} height={14} /></button><button title="Move down" disabled={index === draft.categories.length - 1} className="text-ink-400 disabled:opacity-30" onClick={() => moveCategory(category.id, 1)}><ChevronDown width={14} height={14} /></button></div>)}</div></Card><Card className="overflow-hidden p-0"><div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between"><h2 className="font-bold">Cover preview</h2><ImageIcon width={18} height={18} className="text-brand-600" /></div><div className="mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-brand-50">{draft.coverImage ? <img src={draft.coverImage} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-sm text-ink-400">Add a cover image URL</div>}</div><div className="mt-3 text-sm font-semibold">{draft.name}</div><div className="mt-1 text-xs text-ink-400">Vio · {draft.priceMode === 'none' ? 'No price' : draft.priceMode + ' pricing'}</div></div><div className="flex gap-2 p-5"><Button fullWidth variant="secondary" leftIcon={<Eye width={16} height={16} />} onClick={onPreview}>Preview PDF</Button><Button fullWidth leftIcon={<Printer width={16} height={16} />} onClick={() => void onSave()}>Save</Button></div></Card></aside></div>;
}

function DraftProductCard({ product, index, draft, editing, onEdit, onUpdate, onRemove, onMove, onDragStart, onDrop }: { product: CatalogDraftProduct; index: number; draft: CatalogDraft; editing: boolean; onEdit: () => void; onUpdate: (patch: Partial<CatalogDraftProduct>) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; onDragStart: () => void; onDrop: () => void }) {
  const category = draft.categories.find((item) => item.id === product.categoryId)?.name ?? 'Category';
  const price = effectivePrice(product, draft.priceMode);
  return <div draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"><div className="flex gap-4"><div className="flex items-center text-ink-300"><GripVertical width={18} height={18} /></div><div className="size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100"><img src={product.mainImage} alt="" className="size-full object-cover" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-ink-400">{String(index + 1).padStart(2, '0')}</span><span className="truncate font-bold">{product.name}</span><Badge tone="neutral">{category}</Badge></div><div className="mt-1 text-sm text-ink-500">{product.sku} · {price === null ? 'No price' : money(price)}</div><div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-brand-50 hover:text-brand-700" onClick={onEdit}><Pencil width={13} height={13} className="mr-1 inline" /> Edit snapshot</button><button className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-brand-50 hover:text-brand-700" onClick={() => onUpdate({ hiddenSpecifications: product.hiddenSpecifications.length ? [] : specificationKeys(product) })}>{product.hiddenSpecifications.length ? <><Eye width={13} height={13} className="mr-1 inline" /> Show specifications</> : <><EyeOff width={13} height={13} className="mr-1 inline" /> Hide specifications</>}</button></div></div><div className="flex gap-1"><button title="Move up" disabled={index === 0} className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-slate-100 disabled:opacity-30" onClick={() => onMove(-1)}><ChevronUp width={15} height={15} /></button><button title="Move down" disabled={index === draft.products.length - 1} className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-slate-100 disabled:opacity-30" onClick={() => onMove(1)}><ChevronDown width={15} height={15} /></button><button title="Remove from catalog" className="grid size-9 place-items-center rounded-lg text-ink-300 hover:bg-rose-50 hover:text-rose-600" onClick={onRemove}><X width={16} height={16} /></button></div></div>{editing && <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2"><Input label="Temporary product name" value={product.name} onChange={(event) => onUpdate({ name: event.target.value })} /><Input label="Temporary image URL" value={product.mainImage} onChange={(event) => onUpdate({ mainImage: event.target.value })} /><Input label="Temporary retail price" type="number" value={product.retailPrice ?? ''} onChange={(event) => onUpdate({ retailPrice: event.target.value ? Number(event.target.value) : null })} /><Input label="Temporary wholesale price" type="number" value={product.wholesalePrice ?? ''} onChange={(event) => onUpdate({ wholesalePrice: event.target.value ? Number(event.target.value) : null })} /><div className="rounded-xl bg-slate-50 p-3 text-sm text-ink-500 sm:col-span-2"><div className="mb-2 font-semibold text-ink-700">Visible specifications</div><div className="flex flex-wrap gap-x-4 gap-y-2">{specificationKeys(product).map((key) => <label key={key} className="flex items-center gap-2"><input type="checkbox" className="size-3.5 accent-[#a5292b]" checked={!product.hiddenSpecifications.includes(key)} onChange={() => onUpdate({ hiddenSpecifications: product.hiddenSpecifications.includes(key) ? product.hiddenSpecifications.filter((item) => item !== key) : product.hiddenSpecifications.concat(key) })} /> {key}</label>)}</div></div></div>}</div>;
}

function CustomPageModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (page: Omit<CatalogCustomPage, 'id' | 'sortOrder'>) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ title: title.trim() || 'Custom page', body: body.trim(), image: image.trim() });
    setTitle('');
    setBody('');
    setImage('');
  }
  return <Modal open={open} onClose={onClose} title="Add custom page" description="This page exists only inside the current catalog draft."><form onSubmit={submit} className="space-y-4"><Input label="Page title" required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Dealer terms" /><Textarea label="Page text" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a short note or campaign message." /><Input label="Image URL" value={image} onChange={(event) => setImage(event.target.value)} placeholder="Optional" /><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" leftIcon={<Plus width={17} height={17} />}>Add page</Button></div></form></Modal>;
}

void CatalogHistoryLegacy;
void LegacyDraftBuilder;
void LegacyProductModal;
void LegacyCreateCatalogModal;
void LegacyPageHeader;
