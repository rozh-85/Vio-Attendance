import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/** Full-height, centered page container. */
export function Screen({
  children,
  width = 'md',
  className,
}: {
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  } as const;

  return (
    <div className="min-h-full w-full px-4 py-8 sm:py-12">
      <div className={cn('mx-auto w-full', widths[width], className)}>
        {children}
      </div>
    </div>
  );
}
