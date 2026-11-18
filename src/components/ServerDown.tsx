import { useEffect, useState } from 'react';

/**
 * A simple, realistic maintenance screen shown over the admin areas while the
 * owner's switch is on. Fixed colours, so it reads the same in light and dark
 * mode, like a real status page. The gate that renders it re-checks the switch
 * on its own and swaps back to the app the moment it is turned off, so nothing
 * here needs to reload.
 */
export function ServerDown() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0b1120] px-6 py-10 text-slate-300"
    >
      <LocalKeyframes />

      {/* A faint grid and a soft glow give the dark field some depth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.9) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(70% 55% at 50% 36%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(70% 55% at 50% 36%, black, transparent)',
          }}
        />
        <div className="absolute left-1/2 top-[34%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm text-center">
        {/* The icon: a server tile with a soft breathing glow behind it. */}
        <div className="relative mx-auto grid size-24 place-items-center">
          <span className="absolute inline-flex size-16 rounded-2xl bg-amber-400/20 [animation:vio-pulse_2.6s_ease-in-out_infinite]" />
          <span className="relative grid size-16 place-items-center rounded-2xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/40">
            <ServerGlyph />
          </span>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-amber-400/90">
          Maintenance in progress
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          We&rsquo;ll be right back
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
          The service is down for a short maintenance break. It will be back in a
          few minutes — thanks for your patience.
        </p>

        {/* One animated touch: an indeterminate progress sweep. */}
        <div className="mt-7 h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/3 rounded-full bg-amber-400/90 [animation:vio-sweep_1.7s_ease-in-out_infinite]" />
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-75 [animation:vio-ping_1.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
            <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
          </span>
          <span>
            Checking the connection<Dots />
          </span>
        </div>

        <p className="mt-8 text-xs text-slate-600">This page updates on its own.</p>
      </div>
    </div>
  );
}

/** Three dots that fill in one at a time: "", ".", "..", "...". */
function Dots() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => (v + 1) % 4), 450);
    return () => window.clearInterval(id);
  }, []);
  return <span className="inline-block w-4 text-left">{'.'.repeat(n)}</span>;
}

/** A small server-stack mark, in amber. */
function ServerGlyph() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-400"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <line x1="7" y1="7" x2="7" y2="7" />
      <line x1="7" y1="17" x2="7" y2="17" />
      <line x1="16" y1="7" x2="18" y2="7" />
      <line x1="16" y1="17" x2="18" y2="17" />
    </svg>
  );
}

/** Keyframes the screen needs, scoped to this page via a plain style tag. */
function LocalKeyframes() {
  return (
    <style>{`
      @keyframes vio-sweep {
        0%   { transform: translateX(-120%); }
        100% { transform: translateX(420%); }
      }
      @keyframes vio-ping {
        75%, 100% { transform: scale(2); opacity: 0; }
      }
      @keyframes vio-pulse {
        0%, 100% { transform: scale(1);    opacity: 0.55; }
        50%      { transform: scale(1.22); opacity: 0.12; }
      }
      @media (prefers-reduced-motion: reduce) {
        [class*="vio-sweep"], [class*="vio-ping"], [class*="vio-pulse"] {
          animation: none !important;
        }
      }
    `}</style>
  );
}
