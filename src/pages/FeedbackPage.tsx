import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { FeedbackImagePicker } from '@/components/FeedbackImagePicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
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
  createManualFeedback,
  deleteFeedback,
  disableFeedbackLink,
  generateFeedbackLink,
  listFeedback,
  listFeedbackLinks,
  listFeedbackProducts,
} from '@/services/feedback/store';
import type {
  FeedbackLink,
  ManualFeedbackInput,
  ProductFeedback,
} from '@/services/feedback/types';

const selectClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

function todayInput(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

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
  const [addOpen, setAddOpen] = useState(false);
  const [addProductId, setAddProductId] = useState(initialProductId);
  const [details, setDetails] = useState<ProductFeedback | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linkProductId, setLinkProductId] = useState(initialProductId);

  useEffect(() => {
    let active = true;
    Promise.all([
      listFeedbackProducts(),
      listFeedback(),
      listFeedbackLinks(),
    ]).then(([loadedProducts, loadedFeedback, loadedLinks]) => {
      if (!active) return;
      setProducts(loadedProducts);
      setFeedback(loadedFeedback);
      setLinks(loadedLinks);
    }).catch((problem: unknown) => {
      if (active) setError(problem instanceof Error ? problem.message : 'Feedback could not be loaded.');
    }).finally(() => {
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
        showNotice('Generate a link for this product first.');
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

  async function addManual(input: ManualFeedbackInput, image: CompressedFeedbackImage | null) {
    setBusy(true);
    try {
      const created = await createManualFeedback(input, image);
      setFeedback((items) => [created, ...items]);
      setAddOpen(false);
      showNotice('Feedback added to the selected product.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFeedback(item: ProductFeedback) {
    const product = productFor(item.productId);
    if (!window.confirm(`Delete this feedback${product ? ` for ${product.name}` : ''}?`)) return;
    setBusy(true);
    try {
      const cleanupFailed = await deleteFeedback(item);
      setFeedback((items) => items.filter((feedbackItem) => feedbackItem.id !== item.id));
      if (details?.id === item.id) setDetails(null);
      showNotice(cleanupFailed ? 'Feedback deleted. The image may need Storage cleanup.' : 'Feedback and its image were deleted.');
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
      setLinks((items) => [created, ...items.map((item) => item.productId === productId ? { ...item, isActive: false } : item)]);
      showNotice('A new secure feedback link was generated.');
    } finally {
      setBusy(false);
    }
  }

  async function disableLink(link: FeedbackLink) {
    setBusy(true);
    try {
      await disableFeedbackLink(link.id);
      setLinks((items) => items.map((item) => item.id === link.id ? { ...item, isActive: false } : item));
      showNotice('Feedback link disabled.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(link: FeedbackLink) {
    await copyToClipboard(window.location.origin + paths.publicFeedback(link.token));
    showNotice('Feedback link copied.');
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
      return [product?.name, product?.sku, item.customerName, item.feedbackText, item.internalNote]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [feedback, productFilter, products, search]);

  const activeLinkCount = links.filter(isCurrentLink).length;

  return (
    <AdminLayout>
      {notice && <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white shadow-xl">{notice}</div>}
      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-brand-600">
            <MessageSquare width={16} height={16} /> Feedback
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Product feedback</h1>
          <p className="mt-2 max-w-2xl text-ink-500">Keep customer messages and screenshots connected to the correct Master Catalog product.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isFeedbackManager && <Button variant="ghost" leftIcon={<Logout width={17} height={17} />} onClick={() => void logOut()}>Log out</Button>}
          <Button variant="outline" leftIcon={<LinkIcon width={17} height={17} />} onClick={() => openLinks()}>Product links</Button>
          <Button leftIcon={<Plus width={18} height={18} />} onClick={() => openAdd()}>Add Feedback</Button>
        </div>
      </header>

      {error && (
        <Card className="mb-5 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="font-bold">Feedback setup is not available</div>
          <div className="mt-1">{error}</div>
        </Card>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Summary label="Total feedback" value={feedback.length} />
        <Summary label="Customer submissions" value={feedback.filter((item) => item.source === 'customer_link').length} />
        <Summary label="Active product links" value={activeLinkCount} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search width={17} height={17} className="absolute left-3.5 top-3.5 text-ink-400" />
            <input
              className={selectClass + ' pl-10'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, customer, or feedback"
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
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-ink-400"><MessageSquare width={21} height={21} /></span>
            <div className="mt-4 font-bold">No feedback found</div>
            <p className="mt-1 text-sm text-ink-500">Add a WhatsApp screenshot manually or generate a customer link.</p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(210px,1.3fr)_minmax(220px,1.5fr)_130px_130px_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink-400 md:grid">
              <span>Product</span><span>Feedback</span><span>Source</span><span>Date</span><span />
            </div>
            <div className="divide-y divide-slate-100">
              {filteredFeedback.map((item) => {
                const product = productFor(item.productId);
                return (
                  <div key={item.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(210px,1.3fr)_minmax(220px,1.5fr)_130px_130px_auto] md:items-center md:gap-4 md:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                        {product?.mainImage ? <img src={product.mainImage} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-ink-300"><ImageIcon width={18} height={18} /></span>}
                      </div>
                      <div className="min-w-0"><div className="truncate font-bold">{product?.name ?? 'Unknown product'}</div><div className="truncate text-xs text-ink-400">{product?.sku ?? item.productId}</div></div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-ink-700">{item.customerName || 'Customer name not provided'}</span>{item.imageUrl && <ImageIcon width={14} height={14} className="shrink-0 text-brand-600" />}</div>
                      <div className="mt-1 truncate text-sm text-ink-500">{item.feedbackText || 'Screenshot feedback'}</div>
                    </div>
                    <div><Badge tone={item.source === 'customer_link' ? 'info' : 'neutral'}>{item.source === 'customer_link' ? 'Customer link' : 'Manual'}</Badge></div>
                    <div className="text-sm text-ink-500">{formatDate(item.feedbackDate)}</div>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" title="Open feedback" className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-brand-600" onClick={() => setDetails(item)}><Eye width={16} height={16} /></button>
                      <button type="button" title="Delete feedback" disabled={busy} className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" onClick={() => void removeFeedback(item)}><Trash width={16} height={16} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <AddFeedbackModal
        open={addOpen}
        products={products}
        initialProductId={addProductId}
        busy={busy}
        onClose={() => setAddOpen(false)}
        onSave={addManual}
      />
      <FeedbackDetailsModal feedback={details} product={details ? productFor(details.productId) : undefined} onClose={() => setDetails(null)} />
      <LinkManagerModal
        open={linksOpen}
        products={products}
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
  onSave: (input: ManualFeedbackInput, image: CompressedFeedbackImage | null) => Promise<void>;
}) {
  const [productId, setProductId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [feedbackDate, setFeedbackDate] = useState(todayInput());
  const [image, setImage] = useState<CompressedFeedbackImage | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProductId(initialProductId || products[0]?.id || '');
    setCustomerName('');
    setFeedbackText('');
    setInternalNote('');
    setFeedbackDate(todayInput());
    setImage(null);
    setFormError('');
  }, [initialProductId, open, products]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!productId) return setFormError('Select a product.');
    if (!feedbackText.trim() && !image) return setFormError('Add feedback text or a screenshot.');
    setFormError('');
    try {
      await onSave({ productId, customerName, feedbackText, internalNote, feedbackDate }, image);
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'Feedback could not be saved.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Feedback" description="Add a customer message or screenshot to one product." className="max-w-2xl">
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Product<span className="ml-0.5 text-rose-500">*</span></span>
          <select className={selectClass} required value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Select product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Optional" />
          <Input label="Date" type="date" required value={feedbackDate} onChange={(event) => setFeedbackDate(event.target.value)} />
        </div>
        <Textarea label="Feedback text" value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} placeholder="Paste or type the customer feedback (optional when an image is added)" />
        <FeedbackImagePicker value={image} onChange={setImage} disabled={busy} />
        <Textarea label="Internal note" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Only administrators can see this note" />
        {formError && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy} leftIcon={<Plus width={17} height={17} />}>Save feedback</Button>
        </div>
      </form>
    </Modal>
  );
}

function FeedbackDetailsModal({ feedback, product, onClose }: { feedback: ProductFeedback | null; product?: CatalogProduct; onClose: () => void }) {
  return (
    <Modal open={Boolean(feedback)} onClose={onClose} title="Feedback details" description={product ? `${product.name} · ${product.sku}` : 'Product feedback'} className="max-w-2xl">
      {feedback && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={feedback.source === 'customer_link' ? 'info' : 'neutral'}>{feedback.source === 'customer_link' ? 'Customer link' : 'Manual'}</Badge>
            <span className="text-sm text-ink-500">Submitted {formatDate(feedback.feedbackDate)}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Customer" value={feedback.customerName || 'Not provided'} />
            <Detail label="Added to system" value={formatDate(feedback.createdAt)} />
          </div>
          {feedback.feedbackText && <div><div className="mb-1.5 text-sm font-bold">Feedback</div><div className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-ink-700">{feedback.feedbackText}</div></div>}
          {feedback.imageUrl && <div><div className="mb-1.5 text-sm font-bold">Screenshot / image</div><a href={feedback.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><img src={feedback.imageUrl} alt="Feedback screenshot" className="mx-auto max-h-[60vh] w-auto object-contain" /></a></div>}
          {feedback.internalNote && <div><div className="mb-1.5 text-sm font-bold">Internal note</div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{feedback.internalNote}</div></div>}
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 p-3"><div className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</div><div className="mt-1 text-sm font-semibold text-ink-700">{value}</div></div>;
}

function LinkManagerModal({
  open,
  products,
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

  async function generate() {
    if (!productId) return setFormError('Select a product.');
    if (activeLink && !window.confirm('Generate a new link and disable the current one?')) return;
    setFormError('');
    try {
      await onGenerate(productId);
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'The link could not be generated.');
    }
  }

  async function disable() {
    if (!activeLink || !window.confirm('Disable this feedback link? Customers will no longer be able to use it.')) return;
    setFormError('');
    try {
      await onDisable(activeLink);
    } catch (problem) {
      setFormError(problem instanceof Error ? problem.message : 'The link could not be disabled.');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Product Feedback Link" description="Each secure link accepts feedback for one product only." className="max-w-xl">
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Product</span>
          <select className={selectClass} value={productId} onChange={(event) => { setProductId(event.target.value); setFormError(''); }}>
            <option value="">Select product</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
          </select>
        </label>

        {activeLink ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-bold text-emerald-900">Active link</div><div className="mt-0.5 text-xs text-emerald-700">{activeLink.submissionCount} submission{activeLink.submissionCount === 1 ? '' : 's'}</div></div><Badge tone="success">Active</Badge></div>
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
            <div className="mt-3 font-bold">No active link for this product</div>
            <p className="mt-1 text-sm text-ink-500">Generate one secure URL to send directly to customers.</p>
            <Button className="mt-4" loading={busy} disabled={!productId} onClick={() => void generate()}>Generate Feedback Link</Button>
          </div>
        )}
        {formError && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</div>}
      </div>
    </Modal>
  );
}
