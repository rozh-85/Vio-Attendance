import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ImageIcon, Trash, Upload } from '@/components/icons';
import {
  compressFeedbackImage,
  formatImageBytes,
  type CompressedFeedbackImage,
} from '@/services/feedback/image';
import { cn } from '@/utils/cn';

interface FeedbackImagePickerProps {
  value: CompressedFeedbackImage | null;
  onChange: (image: CompressedFeedbackImage | null) => void;
  disabled?: boolean;
}

export function FeedbackImagePicker({ value, onChange, disabled = false }: FeedbackImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!value) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function prepare(file?: File) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      onChange(await compressFeedbackImage(file));
    } catch (problem) {
      onChange(null);
      setError(problem instanceof Error ? problem.message : 'The image could not be prepared.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    void prepare(event.target.files?.[0]);
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) void prepare(event.dataTransfer.files?.[0]);
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink-900">Screenshot / image</span>
      {value && previewUrl ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="relative max-h-72 overflow-hidden bg-slate-100">
            <img src={previewUrl} alt="Feedback upload preview" className="mx-auto max-h-72 w-auto object-contain" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className="absolute right-3 top-3 grid size-9 place-items-center rounded-xl bg-white/95 text-rose-600 shadow-sm hover:bg-rose-50 disabled:opacity-50"
              aria-label="Remove image"
            >
              <Trash width={16} height={16} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-ink-500">
            <span className="font-semibold text-ink-700">Ready to upload</span>
            <span>{value.width} × {value.height} · {formatImageBytes(value.compressedBytes)}</span>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!disabled && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={dropFile}
          className={cn(
            'flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition',
            dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/60',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> : <Upload width={19} height={19} />}
          </span>
          <span className="mt-3 text-sm font-semibold text-ink-700">{busy ? 'Compressing image…' : 'Choose or drop an image'}</span>
          <span className="mt-1 text-xs leading-5 text-ink-500">Up to 10 MB · automatically converted to readable WebP</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={selectFile} disabled={disabled || busy} />
      {error && <div className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><ImageIcon width={14} height={14} />{error}</div>}
    </div>
  );
}
