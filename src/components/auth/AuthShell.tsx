import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Eye, EyeOff, Lock } from '@/components/icons';
import { BRAND_NAME } from '@/brand';
import { cn } from '@/utils/cn';

export interface AuthFeature {
  icon: ReactNode;
  title: string;
  text: string;
}

/**
 * Every sign-in screen in the app — supervisors, the owner's private pages
 * and the social media sellers — shares this frame. On a laptop the form sits
 * beside a red panel with the headline, three reasons to be here and a picture
 * of the app; on a phone the panel becomes a red top and the form a sheet
 * that rises over it.
 */
export function AuthShell({
  badgeIcon,
  badge,
  title,
  accent,
  subtitle,
  children,
  footnote,
  headline,
  tagline,
  description,
  features,
}: {
  badgeIcon: ReactNode;
  /** e.g. "Sign in to your account". */
  badge: ReactNode;
  /** The heading, with `accent` after it in red: "Welcome" + "back". */
  title: string;
  accent: string;
  subtitle: ReactNode;
  /** The form. */
  children: ReactNode;
  footnote?: ReactNode;
  /** Two lines on the red panel: ["Attendance,", "handled"]. */
  headline: [string, string];
  tagline: string;
  description: string;
  features: AuthFeature[];
}) {
  const form = (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          {badgeIcon}
        </span>
        <span className="text-sm font-medium text-ink-500">{badge}</span>
      </div>
      <h1 className="mt-5 text-[2rem] font-bold leading-tight tracking-tight text-ink-900 sm:text-[2.6rem]">
        {title} <span className="text-brand-600">{accent}</span>
      </h1>
      <p className="mt-2 text-ink-500">{subtitle}</p>
      <div className="mt-7">{children}</div>
      {footnote && <p className="mt-6 text-center text-sm text-ink-400">{footnote}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface lg:p-4">
      {/* ── Phone and tablet ──────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col lg:hidden">
        <div className="relative h-64 shrink-0 overflow-hidden bg-brand-600 sm:h-72">
          <PanelBackdrop />
          <div className="relative z-10 flex items-center gap-2.5 px-5 pt-5">
            <Logo size={34} className="rounded-lg ring-2 ring-white/25" />
            <span className="flex-1 text-lg font-bold tracking-tight text-white">Attendance</span>
            <ThemeToggle variant="icon" onBrand />
          </div>
          <div className="pointer-events-none absolute -bottom-12 left-1/2 w-[16.5rem] -translate-x-1/2 sm:w-[20rem]">
            <LaptopPreview />
          </div>
        </div>
        <div className="relative -mt-8 flex flex-1 flex-col rounded-t-[2rem] bg-card px-6 pb-8 pt-8 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] sm:px-10">
          <div className="mx-auto w-full max-w-[25rem]">{form}</div>
          <p className="mt-auto pt-10 text-center text-xs text-ink-400">
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </p>
        </div>
      </div>

      {/* ── Laptop ────────────────────────────────────────────────────── */}
      <div className="hidden min-h-[calc(100vh-2rem)] overflow-hidden rounded-[2rem] border border-slate-200/70 bg-card shadow-xl lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex justify-center px-10 py-10 xl:px-14">
          <div className="flex w-full max-w-[26rem] flex-col 2xl:max-w-[28rem]">
            <div className="flex items-center gap-2.5">
              <Logo size={36} className="rounded-lg" />
              <span className="flex-1 text-lg font-bold tracking-tight text-ink-900">Attendance</span>
              <ThemeToggle variant="icon" />
            </div>
            <div className="flex flex-1 items-center py-10">{form}</div>
            <p className="text-center text-xs text-ink-400">
              © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-brand-600">
          <PanelBackdrop />
          <div className="relative flex h-full flex-col px-12 py-14 xl:px-16 2xl:px-20 2xl:py-20">
            <h2 className="text-5xl font-bold leading-[1.05] tracking-tight text-white xl:text-6xl">
              {headline[0]}
              <br />
              {headline[1]}
              <span className="text-brand-200">.</span>
            </h2>
            <p className="mt-4 text-xl text-white/85">{tagline}</p>
            <p className="mt-5 max-w-md leading-relaxed text-white/80">{description}</p>
            <ul className="mt-9 space-y-4">
              {features.map((f) => (
                <li key={f.title} className="flex items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur">
                    {f.icon}
                  </span>
                  <span>
                    <span className="block font-semibold text-white">{f.title}</span>
                    <span className="block text-sm text-white/75">{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="pointer-events-none absolute bottom-10 -right-12 w-[28rem] xl:-right-6 xl:w-[32rem] 2xl:w-[36rem]">
              <LaptopPreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Depth behind the flat red: a soft light, a darker corner and a faint grid. */
function PanelBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,rgba(255,255,255,0.16),transparent_55%),radial-gradient(90%_70%_at_100%_100%,rgba(60,8,10,0.55),transparent_60%)]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(80% 70% at 70% 60%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(80% 70% at 70% 60%, black, transparent)',
        }}
      />
    </div>
  );
}

/**
 * A small drawing of the app on a laptop — sidebar, figures and a table of
 * sessions. Decoration only.
 */
function LaptopPreview() {
  const rows = [
    ['bg-emerald-400', 'w-14'],
    ['bg-slate-300', 'w-10'],
    ['bg-slate-300', 'w-12'],
    ['bg-emerald-400', 'w-9'],
    ['bg-slate-300', 'w-11'],
  ];
  return (
    <div aria-hidden className="relative select-none">
      <div className="rotate-[-4deg] drop-shadow-2xl">
        {/* Screen */}
        <div className="rounded-t-2xl bg-[#1b1f27] p-2 pb-2.5">
          <div className="flex h-[13.5rem] overflow-hidden rounded-lg bg-[#f6f7f9] text-[0px]">
            <div className="w-16 shrink-0 space-y-2 bg-white p-2">
              <div className="flex items-center gap-1">
                <span className="size-3.5 rounded bg-[#a5292b]" />
                <span className="h-1.5 w-7 rounded bg-slate-300" />
              </div>
              <span className="block h-3 rounded bg-[#a5292b]" />
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="block h-1.5 w-10 rounded bg-slate-200" />
              ))}
            </div>
            <div className="flex-1 space-y-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className="h-2.5 w-20 rounded bg-slate-700/80" />
                <span className="h-3 w-12 rounded bg-[#a5292b]" />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {['bg-rose-100', 'bg-emerald-100', 'bg-amber-100', 'bg-rose-100'].map((tone, i) => (
                  <div key={i} className="rounded-md bg-white p-1.5">
                    <span className={cn('block size-2.5 rounded', tone)} />
                    <span className="mt-1 block h-2 w-5 rounded bg-slate-700/70" />
                  </div>
                ))}
              </div>
              <div className="space-y-1 rounded-md bg-white p-1.5">
                {rows.map(([dot, w], i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-8 rounded bg-slate-300" />
                    <span className={cn('h-1.5 rounded', w, 'bg-slate-200')} />
                    <span className={cn('ml-auto h-2 w-6 rounded-full', dot)} />
                    <span className="h-1.5 w-10 rounded-full bg-emerald-400/70" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Base */}
        <div className="mx-[-6%] h-3 rounded-b-xl bg-gradient-to-b from-[#c9ccd3] to-[#8e929b]" />
      </div>

    </div>
  );
}

/** A filled field with an icon in front, as on the sign-in screens. */
export function AuthField({
  label,
  icon,
  className,
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-900">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400">{icon}</span>
        <input
          className={cn(
            'h-[3.25rem] w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand-500/30',
            trailing ? 'pr-12' : 'pr-4',
            className,
          )}
          {...props}
        />
        {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
      </span>
    </label>
  );
}

/** Password with an eye to show or hide what was typed. */
export function PasswordField(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <AuthField
      label="Password"
      icon={<Lock width={18} height={18} />}
      type={shown ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="grid size-9 place-items-center rounded-lg text-ink-400 transition hover:bg-slate-100 hover:text-ink-700"
        >
          {shown ? <EyeOff width={18} height={18} /> : <Eye width={18} height={18} />}
        </button>
      }
      {...props}
    />
  );
}
