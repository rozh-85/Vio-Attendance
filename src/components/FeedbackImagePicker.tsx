import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ImageIcon, Trash, Upload } from '@/components/icons';
import {
  compressFeedbackImage,
  formatImageBytes,
  type CompressedFeedbackImage,
} from '@/services/feedback/image';
import { cn } from '@/utils/cn';

interface FeedbackImagePickerProps {
  value: CompressedFeedbackImage[];
  onChange: (images: CompressedFeedbackImage[]) => void;
  disabled?: boolean;
}

export function FeedbackImagePicker({ value, onChange, disabled = false }: FeedbackImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const urls = value.map((image) => URL.createObjectURL(image.blob));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [value]);

  async function prepare(files: File[]) {
    if (files.length === 0) return;
    setError('');
    setBusy(true);
    setProcessed(0);
    setTotal(files.length);
    const prepared: CompressedFeedbackImage[] = [];
    const failures: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        prepared.push(await compressFeedbackImage(file));
      } catch (problem) {
        const detail = problem instanceof Error ? problem.message : 'The image could not be prepared.';
        failures.push(`${file.name}: ${detail}`);
      }
      setProcessed(index + 1);
    }

    if (prepared.length > 0) onChange([...value, ...prepared]);
    if (failures.length > 0) {
      setError(failures.length === 1 ? failures[0] : `${failures.length} images were skipped. ${failures[0]}`);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    void prepare(Array.from(event.target.files ?? []));
  }

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled && !busy) void prepare(Array.from(event.dataTransfer.files));
  }

  function removeImage(index: number) {
    onChange(value.filter((_, imageIndex) => imageIndex !== index));
  }

  const totalBytes = value.reduce((sum, image) => sum + image.compressedBytes, 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink-900">Feedback screenshots / images</span>
        {value.length > 0 && <span className="text-xs font-semibold text-ink-400">{value.length} selected · {formatImageBytes(totalBytes)}</span>}
      </div>

      {value.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {value.map((image, index) => (
            <div key={`${image.originalBytes}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <div className="relative aspect-[4/5] overflow-hidden bg-slate-100">
                {previewUrls[index] && <img src={previewUrls[index]} alt={`Feedback upload preview ${index + 1}`} className="size-full object-contain" />}
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => removeImage(index)}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-white/95 text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <Trash width={14} height={14} />
                </button>
                <span className="absolute bottom-2 left-2 rounded-lg bg-ink-900/80 px-2 py-1 text-[11px] font-bold text-white">{index + 1}</span>
              </div>
              <div className="truncate px-3 py-2 text-[11px] text-ink-500">{image.width} × {image.height} · {formatImageBytes(image.compressedBytes)}</div>
            </div>
          ))}
        </div>
      )}

      <div
        role="button"
        tabIndex={disabled || busy ? -1 : 0}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!disabled && !busy && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={dropFiles}
        className={cn(
          'flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-5 text-center transition',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/60',
          (disabled || busy) && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="grid size-10 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
          {busy ? <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> : <Upload width={19} height={19} />}
        </span>
        <span className="mt-3 text-sm font-semibold text-ink-700">
          {busy ? `Compressing ${processed} of ${total}…` : value.length > 0 ? 'Add more images' : 'Choose one or several images'}
        </span>
        <span className="mt-1 text-xs leading-5 text-ink-500">Select several at once or drag them here · 10 MB maximum per image</span>
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" onChange={selectFiles} disabled={disabled || busy} />
      {error && <div className="mt-1.5 flex items-start gap-1.5 text-sm text-rose-600"><ImageIcon width={14} height={14} className="mt-0.5 shrink-0" />{error}</div>}
    </div>
  );
}
