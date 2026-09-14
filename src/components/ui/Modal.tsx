import { useEffect, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 my-auto flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-3xl bg-card p-4 shadow-xl sm:max-h-[calc(100dvh-3rem)] sm:p-6',
          !className?.includes('max-w-') && 'max-w-md',
          'animate-[fadeIn_0.15s_ease-out]',
          className,
        )}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-ink-400 transition-colors hover:bg-slate-100 hover:text-ink-700"
        >
          ✕
        </button>
        {title && (
          <h2 className="pr-8 text-xl font-bold text-ink-900">{title}</h2>
        )}
        {description && (
          <p className="mt-1 text-sm text-ink-500">{description}</p>
        )}
        <div className={cn('min-h-0 overflow-y-auto overscroll-contain pr-1', title && 'mt-5')}>
          {children}
        </div>
      </div>
    </div>
  );
}
