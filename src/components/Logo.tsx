import { cn } from '@/utils/cn';
import { BRAND_NAME, LOGO_SRC } from '@/brand';

/**
 * The Vio mark. Served from `public/vio-logo.svg` — the same file the favicon
 * points at, so dropping the official artwork in at that path rebrands the site
 * and the browser tab together. The PDF export draws the mark inline from
 * `src/brand.ts`.
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
      src={LOGO_SRC}
      alt={BRAND_NAME}
      width={size}
      height={size}
      className={cn('shrink-0 rounded-xl object-cover', className)}
    />
  );
}
