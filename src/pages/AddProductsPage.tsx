import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Check, ImageIcon, Plus, Upload, X } from '@/components/icons';
import { BackLink, LeaveNotice, LoadProblem } from '@/components/orders/profit/parts';
import { useProfitData } from '@/hooks/useProfitData';
import { CATEGORIES } from '@/services/orders/options';
import { modelKey, modelWith, type ModelValues } from '@/services/orders/profit';
import { catalogItem } from '@/services/orders/products';
import { filesFromDrop, isImageFile, modelFromFileName, shrinkImage } from '@/services/orders/productImages';
import { setProfitNotice } from '@/services/orders/profitMemory';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

interface Item {
  id: string;
  file: File | null;
  /** A local address to show the chosen picture before it is uploaded. */
  preview: string;
  model: string;
  name: string;
  category: string;
}

type Status =
  | { tone: 'new'; text: string }
  | { tone: 'update'; text: string }
  | { tone: 'missing'; text: string }
  | { tone: 'twice'; text: string };

const STATUS_CLASS: Record<Status['tone'], string> = {
  new: 'bg-emerald-50 text-emerald-700',
  update: 'bg-sky-50 text-sky-600',
  missing: 'bg-amber-50 text-amber-700',
  twice: 'bg-rose-50 text-rose-700',
};

const fieldClass =
  'h-10 w-full rounded-xl border bg-card px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/**
 * Products added from their pictures: a folder, or many pictures at once.
 * Each picture's file name is its model number (V-400.jpg → V-400), which
 * can be corrected before saving. A picture for a model already on the list
 * or in the catalogue replaces its picture. Prices come later, on Models &
 * prices; until then sellers can pick the product and write the price.
 */
export function AddProductsPage() {
  const navigate = useNavigate();
  const { profit, error, loading, reload, update } = useProfitData();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const previews = useRef<string[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    // The folder chooser: an attribute React does not know by name.
    folderRef.current?.setAttribute('webkitdirectory', '');
    folderRef.current?.setAttribute('directory', '');
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const saving = progress !== null;
  const dirty = items.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  function add(files: File[]) {
    const pictures = files.filter(isImageFile);
    setSkipped((n) => n + files.length - pictures.length);
    const next = pictures
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((file): Item => {
        const preview = URL.createObjectURL(file);
        previews.current.push(preview);
        return { id: crypto.randomUUID(), file, preview, model: modelFromFileName(file.name), name: '', category: '' };
      });
    setItems((list) => [...list, ...next]);
    setProblem(null);
    setLeaving(false);
  }

  const edit = (id: string, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const remove = (id: string) => setItems((list) => list.filter((it) => it.id !== id));

  // How many times each model appears in this batch.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const key = modelKey(it.model);
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const statusOf = (it: Item): Status => {
    const key = modelKey(it.model);
    if (!key) return { tone: 'missing', text: 'Write the model' };
    if ((counts.get(key) ?? 0) > 1) return { tone: 'twice', text: 'Same model twice' };
    const saved = profit?.models[key];
    const cat = catalogItem(key);
    if (saved || cat) return { tone: 'update', text: saved?.image || cat?.image ? 'New picture' : 'Adds a picture' };
    return { tone: 'new', text: 'New product' };
  };

  const statuses = items.map(statusOf);
  const ready = statuses.every((st) => st.tone === 'new' || st.tone === 'update');
  const tally = {
    new: statuses.filter((st) => st.tone === 'new').length,
    update: statuses.filter((st) => st.tone === 'update').length,
    fix: statuses.filter((st) => st.tone === 'missing' || st.tone === 'twice').length,
  };

  async function save(): Promise<void> {
    if (!profit || !items.length) return;
    if (!ready) {
      setProblem('Give every picture its own model number first — see the red and amber ones.');
      return;
    }
    setProblem(null);
    setLeaving(false);
    const store = getProfitStore();
    const list: ModelValues[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        setProgress({ done: i, total: items.length });
        const it = items[i];
        const key = modelKey(it.model);
        const image = it.file ? await store.uploadProductImage(await shrinkImage(it.file), it.model) : undefined;
        list.push(
          modelWith(profit, key, it.model.trim(), {
            image,
            name: it.name.trim() || undefined,
            category: it.category.trim() || undefined,
            active: true,
          }),
        );
      }
      setProgress({ done: items.length, total: items.length });
      await store.saveModels(list);
      update((d) => {
        const models = { ...d.models };
        const now = new Date().toISOString();
        for (const m of list) models[m.key] = { ...m, updatedAt: now };
        return { ...d, models };
      });
      setItems([]);
      setProfitNotice(`${list.length} ${list.length === 1 ? 'product' : 'products'} added — set their prices on Models & prices`);
      navigate(paths.profitModels);
    } catch (err) {
      setProblem(`${list.length ? `${list.length} pictures were uploaded, then: ` : ''}${profitErrorMessage(err)}`);
    } finally {
      setProgress(null);
    }
  }

  const goBack = () => {
    if (dirty) {
      setLeaving(true);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(paths.profitModels);
  };

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const fromFolders = await filesFromDrop(e.dataTransfer.items).catch(() => []);
    add(fromFolders.length ? fromFolders : [...e.dataTransfer.files]);
  }

  return (
    <AdminLayout>
      <div ref={topRef} className="scroll-mt-20 pb-28">
        <BackLink label="Back to models & prices" onClick={goBack} />

        {leaving && dirty && (
          <div className="mt-4">
            <LeaveNotice
              text={`${items.length} ${items.length === 1 ? 'picture is' : 'pictures are'} not added yet`}
              saving={saving}
              onSave={() => void save()}
              onLeave={() => navigate(paths.profitModels)}
              onStay={() => setLeaving(false)}
            />
          </div>
        )}

        <div className="mt-5">
          <h1 className="text-3xl font-bold text-ink-900">Add products</h1>
          <p className="mt-1 max-w-3xl text-ink-500">
            Upload the pictures of your products — a whole folder at once. Each picture’s file name is its model number.
            Prices come later, on Models &amp; prices.
          </p>
        </div>

        {error ? (
          <div className="mt-6">
            <LoadProblem error={error} onRetry={() => void reload()} />
          </div>
        ) : loading || !profit ? (
          <p className="py-16 text-center text-ink-400">Loading…</p>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {/* Drop a folder here, or choose one. */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => void onDrop(e)}
                className={cn(
                  'flex flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition',
                  dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-card',
                )}
              >
                <span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                  <Upload width={30} height={30} />
                </span>
                <h2 className="mt-4 text-xl font-bold text-ink-900">Drop a folder or pictures here</h2>
                <p className="mt-1 text-sm text-ink-500">JPG, PNG or WebP. Big photos are made smaller before upload.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button leftIcon={<Upload width={18} height={18} />} onClick={() => folderRef.current?.click()} className="hidden sm:inline-flex">
                    Choose a folder
                  </Button>
                  <Button
                    variant="outline"
                    leftIcon={<ImageIcon width={18} height={18} />}
                    onClick={() => filesRef.current?.click()}
                    className="max-sm:bg-brand-600 max-sm:text-white"
                  >
                    Choose pictures
                  </Button>
                </div>
                <input
                  ref={folderRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    add([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={filesRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    add([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
                {skipped > 0 && <p className="mt-3 text-xs text-ink-400">{skipped} files that are not pictures were left out.</p>}
              </div>

              {/* How to name the pictures. */}
              <Card className="p-5 sm:p-6">
                <h2 className="font-bold text-ink-900">Name each picture with its model</h2>
                <p className="mt-1 text-sm text-ink-500">The file name becomes the model number:</p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {[
                    ['V-400.jpg', 'V-400'],
                    ['VAF810D.png', 'VAF810D'],
                    ['v-502 (2).jpg', 'V-502'],
                  ].map(([file, model]) => (
                    <li key={file} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-ink-600">{file}</span>
                      <span className="text-ink-300">→</span>
                      <span className="w-24 font-mono font-bold text-ink-900">{model}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-xs text-ink-600">IMG_2041.jpg</span>
                    <span className="text-ink-300">→</span>
                    <span className="w-24 text-xs font-semibold text-amber-700">you write it</span>
                  </li>
                </ul>
                <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-ink-500">
                  A picture for a model that is already there replaces its picture. The 124 products of the Vio catalogue
                  are already in, with their pictures.
                </p>
              </Card>
            </div>

            {items.length > 0 && (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-ink-700">
                      {items.length} {items.length === 1 ? 'picture' : 'pictures'}
                    </span>
                    {tally.new > 0 && <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">{tally.new} new {tally.new === 1 ? 'product' : 'products'}</span>}
                    {tally.update > 0 && <span className="rounded-full bg-sky-50 px-3 py-1.5 font-semibold text-sky-600">{tally.update} new {tally.update === 1 ? 'picture' : 'pictures'}</span>}
                    {tally.fix > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">{tally.fix} to fix</span>}
                  </div>
                  <Button
                    variant="ghost"
                    leftIcon={<Plus width={16} height={16} />}
                    onClick={() =>
                      setItems((list) => [...list, { id: crypto.randomUUID(), file: null, preview: '', model: '', name: '', category: '' }])
                    }
                  >
                    Add one without a picture
                  </Button>
                </div>

                <datalist id="add-product-types">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>

                <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
                  {items.map((it, i) => {
                    const st = statuses[i];
                    const cat = catalogItem(it.model);
                    const bad = st.tone === 'missing' || st.tone === 'twice';
                    return (
                      <Card key={it.id} className={cn('overflow-hidden', bad && 'border-amber-300')}>
                        <div className="relative aspect-[4/3] border-b border-slate-100 bg-white">
                          {it.preview ? (
                            <img src={it.preview} alt="" className="size-full object-contain p-2" />
                          ) : (
                            <span className="grid size-full place-items-center text-slate-300">
                              <ImageIcon width={36} height={36} />
                            </span>
                          )}
                          <span className={cn('absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_CLASS[st.tone])}>
                            {st.text}
                          </span>
                          <button
                            type="button"
                            aria-label="Remove this picture"
                            onClick={() => remove(it.id)}
                            className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-card/90 text-ink-500 shadow-sm hover:text-rose-600"
                          >
                            <X width={16} height={16} />
                          </button>
                        </div>
                        <div className="space-y-2 p-3">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-400">Model</span>
                            <input
                              autoCapitalize="characters"
                              placeholder="e.g. V-400"
                              value={it.model}
                              onChange={(e) => edit(it.id, { model: e.target.value.toUpperCase() })}
                              className={cn(fieldClass, 'font-mono font-bold', bad ? 'border-amber-300' : 'border-slate-200')}
                            />
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              aria-label="Name"
                              placeholder={cat?.name || 'Name'}
                              value={it.name}
                              onChange={(e) => edit(it.id, { name: e.target.value })}
                              className={cn(fieldClass, 'border-slate-200')}
                            />
                            <input
                              aria-label="Type"
                              dir="auto"
                              list="add-product-types"
                              placeholder={cat?.typeKu || 'Type'}
                              value={it.category}
                              onChange={(e) => edit(it.id, { category: e.target.value })}
                              className={cn(fieldClass, 'border-slate-200')}
                            />
                          </div>
                          <div className="truncate text-[11px] text-ink-400" title={it.file?.name}>
                            {it.file?.name ?? 'No picture'}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Add bar: always in reach at the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-card/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {progress ? (
              <div>
                <div className="font-semibold text-ink-900">
                  Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              </div>
            ) : problem ? (
              <span className="text-rose-700">{problem}</span>
            ) : items.length ? (
              <span className="font-semibold text-ink-900">
                {items.length} {items.length === 1 ? 'product' : 'products'} ready{tally.fix ? ` · ${tally.fix} to fix` : ''}
              </span>
            ) : (
              <span className="text-ink-500">Choose pictures to start</span>
            )}
          </div>
          {items.length > 0 && !saving && (
            <Button variant="outline" onClick={() => setItems([])}>
              Clear
            </Button>
          )}
          <Button
            loading={saving}
            disabled={!items.length}
            leftIcon={<Check />}
            onClick={() => void save()}
            className={cn(!items.length && 'opacity-60')}
          >
            {items.length ? `Add ${items.length} ${items.length === 1 ? 'product' : 'products'}` : 'Add products'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
