import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { FeedbackImagePicker } from '@/components/FeedbackImagePicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import {
  Copy,
  Eye,
  ImageIcon,
  LinkIcon,
  Logout,
  MessageSquare,
  Plus,
  Search,
  Trash,
} from '@/components/icons';
import { paths } from '@/routes';
import { useAuth } from '@/services/auth/context';
import type { CatalogProduct } from '@/services/catalog/types';
import type { CompressedFeedbackImage } from '@/services/feedback/image';
import {
  addFeedbackProduct,
  createManualFeedback,
  deleteFeedback,
  disableFeedbackLink,
  generateFeedbackLink,
  listFeedback,
  listFeedbackLinks,
  loadFeedbackCatalog,
} from '@/services/feedback/store';
import type {
  FeedbackLink,
  ManualFeedbackInput,
  NewFeedbackProductInput,
  ProductFeedback,
} from '@/services/feedback/types';

const selectClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

function formatDate(value: string): string {
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function isCurrentLink(link: FeedbackLink): boolean {
  return link.isActive && (!link.expiresAt || new Date(link.expiresAt).getTime() > Date.now());
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  document.execCommand('copy');
  field.remove();
}

export function FeedbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isFeedbackManager, signOut } = useAuth();
  const initialProductId = searchParams.get('product') ?? '';
  const initialAction = searchParams.get('action') ?? '';
  const handledInitialAction = useRef(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [feedback, setFeedback] = useState<ProductFeedback[]>([]);
  const [links, setLinks] = useState<FeedbackLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState(initialProductId || 'all');
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addProductId, setAddProductId] = useState(initialProductId);
  const [details, setDetails] = useState<ProductFeedback | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linkProductId, setLinkProductId] = useState(initialProductId);

  useEffect(() => {
    let active = true;
    Promise.all([loadFeedbackCatalog(), listFeedback(), listFeedbackLinks()])
      .then(([catalog, loadedFeedback, loadedLinks]) => {
        if (!active) return;
        setProducts(catalog.products);
        setFeedback(loadedFeedback);
        setLinks(loadedLinks);
      })
      .catch((problem: unknown) => {
        if (active) setError(problem instanceof Error ? problem.message : 'Feedback could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loading || handledInitialAction.current || !initialProductId) return;
    handledInitialAction.current = true;
    if (!products.some((product) => product.id === initialProductId)) return;
    setProductFilter(initialProductId);
    if (initialAction === 'add') openAdd(initialProductId);
    if (initialAction === 'link') openLinks(initialProductId);
    if (initialAction === 'copy') {
      const activeLink = links.find((link) => link.productId === initialProductId && isCurrentLink(link));
      if (activeLink) void copyLink(activeLink);
      else {
        openLinks(initialProductId);
        showNotice('Generate a gallery link for this product first.');
      }
    }
  }, [initialAction, initialProductId, links, loading, products]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4500);
  }

  function productFor(id: string): CatalogProduct | undefined {
    return products.find((product) => product.id === id);
  }

  function openAdd(productId = productFilter === 'all' ? '' : productFilter) {
    setAddProductId(productId);
    setAddOpen(true);
  }

  function openLinks(productId = productFilter === 'all' ? '' : productFilter) {
    setLinkProductId(productId);
    setLinksOpen(true);
  }

  async function createProduct(input: NewFeedbackProductInput) {
    setBusy(true);
    try {
      const created = await addFeedbackProduct(input);
      setProducts((items) => [...items, created].sort((a, b) => a.sortOrder - b.sortOrder));
      setProductFilter(created.id);
      setAddProductId(created.id);
      setAddProductOpen(false);
      setAddOpen(true);
      showNotice(`${created.name} was added. You can upload its first feedback image now.`);
    } finally {
      setBusy(false);
    }
  }

  async function addManual(input: ManualFeedbackInput, image: CompressedFeedbackImage) {
    setBusy(true);
    try {
      const created = await createManualFeedback(input, image);
      setFeedback((items) => [created, ...items]);
      setProductFilter(input.productId);
      setAddOpen(false);
      showNotice('Feedback image added to the selected product gallery.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFeedback(item: ProductFeedback) {
    const product = productFor(item.productId);
    if (!window.confirm(`Delete this feedback image${product ? ` for ${product.name}` : ''}?`)) return;
    setBusy(true);
    try {
      const cleanupFailed = await deleteFeedback(item);
      setFeedback((items) => items.filter((feedbackItem) => feedbackItem.id !== item.id));
      if (details?.id === item.id) setDetails(null);
      showNotice(cleanupFailed ? 'Feedback deleted. Its Storage image may need manual cleanup.' : 'Feedback image deleted.');
    } catch (problem) {
      showNotice(problem instanceof Error ? problem.message : 'Feedback could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  async function createLink(productId: string) {
    setBusy(true);
    try {
      const created = await generateFeedbackLink(productId);
      setLinks((items) => [
        created,
        ...items.map((item) => item.productId === productId ? { ...item, isActive: false } : item),
      ]);
      showNotice('A new secure gallery link was generated.');
    } finally {
      setBusy(false);
    }
  }

  async function disableLink(link: FeedbackLink) {
    setBusy(true);
    try {
      await disableFeedbackLink(link.id);
      setLinks((items) => items.map((item) => item.id === link.id ? { ...item, isActive: false } : item));
      showNotice('Gallery link disabled.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(link: FeedbackLink) {
    await copyToClipboard(window.location.origin + paths.publicFeedback(link.token));
    showNotice('Gallery link copied.');
  }

  async function logOut() {
    await signOut();
    navigate(paths.admin, { replace: true });
  }

  const filteredFeedback = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feedback.filter((item) => {
      if (productFilter !== 'all' && item.productId !== productFilter) return false;
      if (!query) return true;
      const product = products.find((candidate) => candidate.id === item.productId);
      return `${product?.name ?? ''} ${product?.sku ?? ''}`.toLowerCase().includes(query);
    });
  }, [feedback, productFilter, products, search]);

  const productsWithFeedback = new Set(feedback.map((item) => item.productId)).size;
  const activeLinkCount = links.filter(isCurrentLink).length;

  return (
    <AdminLayout>
      {notice && <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-brand-600">
            <MessageSquare width={16} height={16} /> Feedback
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Product feedback galleries</h1>
          <p className="mt-2 max-w-2xl text-ink-500">Add screenshots manually, then share one secure read-only gallery link for each product.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isFeedbackManager && <Button variant="ghost" leftIcon={<Logout width={17} height={17} />} onClick={() => void logOut()}>Log out</Button>}
          <Button variant="outline" leftIcon={<Plus width={17} height={17} />} onClick={() => setAddProductOpen(true)}>Add product</Button>
          <Button variant="outline" leftIcon={<LinkIcon width={17} height={17} />} disabled={products.length === 0} onClick={() => openLinks()}>Product links</Button>
          <Button leftIcon={<ImageIcon width={18} height={18} />} disabled={products.length === 0} onClick={() => openAdd()}>Add Feedback</Button>
        </div>
      </header>

      {error && (
        <Card className="mb-5 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="font-bold">Feedback setup is not available</div>
          <div className="mt-1">{error}</div>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Summary label="Feedback images" value={feedback.length} />
        <Summary label="Products with feedback" value={productsWithFeedback} />
        <Summary label="Active gallery links" value={activeLinkCount} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search width={17} height={17} className="absolute left-3.5 top-3.5 text-ink-400" />
            <input
              className={selectClass + ' pl-10'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product name or model"
            />
          </div>
          <select className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-brand-500 sm:w-72" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="all">All products</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="py-20 text-center text-ink-400">Loading feedback…</div>
        ) : filteredFeedback.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-ink-400"><ImageIcon width={21} height={21} /></span>
            <div className="mt-4 font-bold">No feedback images found</div>
            <p className="mt-1 text-sm text-ink-500">Choose a product and upload its first customer feedback screenshot.</p>
            {products.length === 0
              ? <Button className="mt-4" leftIcon={<Plus width={16} height={16} />} onClick={() => setAddProductOpen(true)}>Add first product</Button>
              : <Button className="mt-4" leftIcon={<ImageIcon width={16} height={16} />} onClick={() => openAdd()}>Add Feedback</Button>}
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_150px_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink-400 md:grid">
              <span>Product</span><span>Feedback image</span><span>Date added</span><span />
            </div>
            <div className="divide-y divide-slate-100">
              {filteredFeedback.map((item) => {
                const product = productFor(item.productId);
                return (
                  <div key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(220px,1.4fr)_minmax(180px,1fr)_150px_auto] md:items-center md:gap-4 md:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        {product?.mainImage ? <img src={product.mainImage} alt="" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-ink-300"><ImageIcon width={18} height={18} /></span>}
                      </div>
                      <div className="min-w-0"><div className="truncate font-bold">{product?.name ?? 'Unknown product'}</div><div className="truncate text-xs text-ink-400">{product?.sku ?? item.productId}</div></div>
                    </div>
                    <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setDetails(item)}>
                      <span className="size-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        {item.imageUrl ? <img src={item.imageUrl} alt="Feedback screenshot" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-ink-300"><ImageIcon width={17} height={17} /></span>}
                      </span>
                      <span className="text-sm font-semibold text-brand-600">Open image</span>
                    </button>
                    <div className="text-sm text-ink-500"><span className="mr-2 font-semibold text-ink-400 md:hidden">Added</span>{formatDate(item.feedbackDate)}</div>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" title="Open feedback image" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => setDetails(item)}><Eye width={16} height={16} /></button>
                      <button type="button" title="Delete feedback image" disabled={busy} className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" onClick={() => void removeFeedback(item)}><Trash width={16} height={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <AddProductModal open={addProductOpen} busy={busy} onClose={() => setAddProductOpen(false)} onSave={createProduct} />
      <AddFeedbackModal open={addOpen} products={products} initialProductId={addProductId} busy={busy} onClose={() => setAddOpen(false)} onSave={addManual} />
      <FeedbackDetailsModal feedback={details} product={details ? productFor(details.productId) : undefined} onClose={() => setDetails(null)} />
      <LinkManagerModal
        open={linksOpen}
        products={products}
        feedback={feedback}
        links={links}
        initialProductId={linkProductId}
        busy={busy}
        onClose={() => setLinksOpen(false)}
        onGenerate={createLink}
        onDisable={disableLink}
        onCopy={copyLink}
      />
    </AdminLayout>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return <Card className="flex items-center justify-between p-4"><span className="text-sm font-semibold text-ink-500">{label}</span><span className="text-xl font-bold">{value}</span></Card>;
}

function AddProductModal({
  open,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (input: NewFeedbackProductInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [mainImage, setMainImage] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setSku('');
    setMainImage('');
    setFormError('');
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !sku.trim()) return setFormError('Product name and model / SKU are required.');
    setFormError('');
    try {
      await onSave({ name, sku, mainImage });
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'The product could not be added.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add product" description="Add a future product once, then it appears in the filter, feedback form, and link manager." className="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Product name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Air Fryer" />
          <Input label="Model / SKU" required value={sku} onChange={(event) => setSku(event.target.value)} placeholder="V-400" />
        </div>
        <Input label="Product image URL" value={mainImage} onChange={(event) => setMainImage(event.target.value)} placeholder="Optional" hint="This image appears at the top of the customer gallery." />
        {formError && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} leftIcon={<Plus width={17} height={17} />}>Add product</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddFeedbackModal({
  open,
  products,
  initialProductId,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  products: CatalogProduct[];
  initialProductId: string;
  busy: boolean;
  onClose: () => void;
  onSave: (input: ManualFeedbackInput, image: CompressedFeedbackImage) => Promise<void>;
}) {
  const [productId, setProductId] = useState('');
  const [image, setImage] = useState<CompressedFeedbackImage | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId || products[0]?.id || '');
    setImage(null);
    setFormError('');
  }, [initialProductId, open, products]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!productId) return setFormError('Select a product.');
    if (!image) return setFormError('Choose a feedback screenshot or image.');
    setFormError('');
    try {
      await onSave({ productId }, image);
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'Feedback could not be saved.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Feedback" description="Select the product and upload one feedback screenshot. The date is saved automatically." className="max-w-2xl">
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Product<span className="ml-0.5 text-rose-500">*</span></span>
          <select className={selectClass} required value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Select product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </label>
        <FeedbackImagePicker value={image} onChange={setImage} disabled={busy} />
        {formError && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} leftIcon={<ImageIcon width={17} height={17} />}>Upload feedback</Button>
        </div>
      </form>
    </Modal>
  );
}

function FeedbackDetailsModal({ feedback, product, onClose }: { feedback: ProductFeedback | null; product?: CatalogProduct; onClose: () => void }) {
  return (
    <Modal open={Boolean(feedback)} onClose={onClose} title="Feedback image" description={product ? `${product.name} · ${product.sku}` : 'Product feedback'} className="max-w-2xl">
      {feedback && (
        <div className="space-y-4">
          <div className="text-sm text-ink-500">Added {formatDate(feedback.feedbackDate)}</div>
          {feedback.imageUrl
            ? <a href={feedback.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><img src={feedback.imageUrl} alt="Feedback screenshot" className="mx-auto max-h-[65vh] w-auto object-contain" /></a>
            : <div className="rounded-2xl bg-slate-50 py-16 text-center text-sm text-ink-400">Image preview is unavailable.</div>}
        </div>
      )}
    </Modal>
  );
}

function LinkManagerModal({
  open,
  products,
  feedback,
  links,
  initialProductId,
  busy,
  onClose,
  onGenerate,
  onDisable,
  onCopy,
}: {
  open: boolean;
  products: CatalogProduct[];
  feedback: ProductFeedback[];
  links: FeedbackLink[];
  initialProductId: string;
  busy: boolean;
  onClose: () => void;
  onGenerate: (productId: string) => Promise<void>;
  onDisable: (link: FeedbackLink) => Promise<void>;
  onCopy: (link: FeedbackLink) => Promise<void>;
}) {
  const [productId, setProductId] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId || products[0]?.id || '');
    setFormError('');
  }, [initialProductId, open, products]);

  const activeLink = links.find((link) => link.productId === productId && isCurrentLink(link));
  const publicUrl = activeLink ? window.location.origin + paths.publicFeedback(activeLink.token) : '';
  const imageCount = feedback.filter((item) => item.productId === productId && item.imagePath).length;

  async function generate() {
    if (!productId) return setFormError('Select a product.');
    if (activeLink && !window.confirm('Generate a new gallery link and disable the current one?')) return;
    setFormError('');
    try {
      await onGenerate(productId);
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'The link could not be generated.');
    }
  }

  async function disable() {
    if (!activeLink || !window.confirm('Disable this gallery link? Customers will no longer be able to open it.')) return;
    setFormError('');
    try {
      await onDisable(activeLink);
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'The link could not be disabled.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Product gallery link" description="The customer can view all feedback images for the selected product. They cannot submit or edit anything." className="max-w-xl">
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Product</span>
          <select className={selectClass} value={productId} onChange={(event) => { setProductId(event.target.value); setFormError(''); }}>
            <option value="">Select product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </label>

        {productId && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span className="font-semibold text-ink-600">Images visible in this gallery</span>
            <span className="font-bold text-ink-900">{imageCount}</span>
          </div>
        )}

        {activeLink ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-emerald-900">Active read-only gallery</div><div className="mt-0.5 text-xs text-emerald-700">New feedback images for this product appear automatically.</div></div><Badge tone="success">Active</Badge></div>
            <div className="mt-3 flex gap-2"><input readOnly value={publicUrl} className="h-11 min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 text-sm text-ink-700 outline-none" /><button type="button" title="Copy link" className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm hover:bg-brand-50" onClick={() => void onCopy(activeLink)}><Copy width={17} height={17} /></button></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" leftIcon={<Copy width={15} height={15} />} onClick={() => void onCopy(activeLink)}>Copy link</Button>
              <Button size="sm" variant="outline" leftIcon={<LinkIcon width={15} height={15} />} loading={busy} onClick={() => void generate()}>Generate new</Button>
              <Button size="sm" variant="ghost" onClick={() => void disable()}>Disable</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-white text-brand-600 shadow-sm"><LinkIcon width={20} height={20} /></span>
            <div className="mt-3 font-bold">No active gallery link</div>
            <p className="mt-1 text-sm text-ink-500">Generate one secure URL and send it to customers who should view this product’s feedback images.</p>
            <Button className="mt-4" loading={busy} disabled={!productId} onClick={() => void generate()}>Generate gallery link</Button>
          </div>
        )}
        {formError && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
      </div>
    </Modal>
  );
}
