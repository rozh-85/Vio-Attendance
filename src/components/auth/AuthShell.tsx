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
          <div className="pointer-events-none absolute -bottom-10 left-1/2 w-[15rem] -translate-x-1/2 sm:w-[18rem]">
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
            <div className="pointer-events-none absolute bottom-12 right-10 w-[19rem] xl:right-12 xl:w-[24rem] 2xl:bottom-16 2xl:right-16 2xl:w-[28rem] [@media(max-height:760px)]:hidden">
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
 * sessions — in real laptop proportions: a 16:10 screen in a thin bezel, and
 * a base a little wider than the lid with the notch for opening it. Fixed
 * colours, so it looks the same in light and dark mode. Decoration only.
 */
function LaptopPreview() {
  const rows: [string, string][] = [
    ['#34d399', '58%'],
    ['#cbd5e1', '42%'],
    ['#cbd5e1', '50%'],
    ['#34d399', '36%'],
    ['#cbd5e1', '46%'],
    ['#34d399', '40%'],
  ];
  return (
    <div aria-hidden className="relative select-none">
      {/* Lid */}
      <div className="relative rounded-[1rem] bg-[#16181d] p-[2.4%] pb-[3%] shadow-[0_40px_70px_-25px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
        <span className="absolute left-1/2 top-[1.1%] size-[0.3rem] -translate-x-1/2 rounded-full bg-[#2f343d]" />
        <div className="flex aspect-[16/10] overflow-hidden rounded-[0.35rem] bg-[#f4f6f9]">
          {/* Sidebar */}
          <div className="flex w-[20%] shrink-0 flex-col gap-[6%] bg-white p-[3%]">
            <div className="flex items-center gap-[8%]">
              <span className="aspect-square w-[22%] rounded-[3px] bg-[#a5292b]" />
              <span className="h-[5px] w-[50%] rounded bg-[#cbd5e1]" />
            </div>
            <span className="h-[9px] rounded-[3px] bg-[#a5292b]" />
            {[70, 60, 75, 55, 65].map((w, i) => (
              <span key={i} className="h-[5px] rounded bg-[#e2e8f0]" style={{ width: `${w}%` }} />
            ))}
          </div>
          {/* Page */}
          <div className="flex flex-1 flex-col gap-[5%] p-[3.5%]">
            <div className="flex items-center justify-between">
              <span className="h-[8px] w-[34%] rounded bg-[#334155]" />
              <span className="h-[10px] w-[18%] rounded-[3px] bg-[#a5292b]" />
            </div>
            <div className="grid grid-cols-4 gap-[4%]">
              {['#fde2e2', '#d1fae5', '#fef3c7', '#fde2e2'].map((tone, i) => (
                <div key={i} className="rounded-[4px] bg-white p-[8%]">
                  <span className="block aspect-square w-[28%] rounded-[3px]" style={{ background: tone }} />
                  <span className="mt-[12%] block h-[6px] w-[55%] rounded bg-[#475569]" />
                </div>
              ))}
            </div>
            <div className="flex flex-1 flex-col justify-around rounded-[4px] bg-white px-[3%] py-[2%]">
              {rows.map(([dot, w], i) => (
                <div key={i} className="flex items-center gap-[3%]">
                  <span className="h-[4px] w-[14%] rounded bg-[#cbd5e1]" />
                  <span className="h-[4px] rounded bg-[#e2e8f0]" style={{ width: w }} />
                  <span className="ml-auto h-[6px] w-[10%] rounded-full" style={{ background: dot }} />
                  <span className="h-[4px] w-[16%] rounded-full bg-[#6ee7b7]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Base, with the notch for opening the lid */}
      <div className="relative mx-[-7%] h-[0.8rem] rounded-b-[1.2rem] rounded-t-[3px] bg-gradient-to-b from-[#e4e7ec] via-[#c5c9d1] to-[#9399a4]">
        <span className="absolute left-1/2 top-0 h-[38%] w-[15%] -translate-x-1/2 rounded-b-[6px] bg-[#aeb3bc]" />
      </div>
      <div className="mx-[2%] h-2 rounded-full bg-black/30 blur-md" />
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
