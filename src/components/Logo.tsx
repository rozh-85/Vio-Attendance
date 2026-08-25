import { cn } from '@/utils/cn';

/**
 * The Asiacell mark. Served from `public/asiacell-logo.svg` — the same file the
 * PDF export reads, so dropping the official artwork in at that path rebrands
 * the site and the export together.
 */
export function Logo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/asiacell-logo.svg"
      alt="Asiacell"
      width={size}
      height={size}
      className={cn('shrink-0 rounded-xl object-cover', className)}
    />
  );
}
