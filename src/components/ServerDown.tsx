import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLockdown } from '@/services/auth/adminLockdown';

/**
 * The maintenance ("service is down") screen shown over the admin areas while
 * the owner's switch is on. It is deliberately self-contained and uses fixed
 * colours so it reads the same in light and dark mode, like a real status page.
 *
 * It behaves like a genuine outage: an indeterminate progress bar sweeps, a
 * retry countdown loops, and it quietly re-checks the switch in the background —
 * so the moment the owner turns it off, the page reconnects on its own.
 */
export function ServerDown() {
  // A stable-looking incident reference, generated once per mount.
  const incident = useMemo(() => {
    const hex = () =>
      Math.floor(Math.random() * 0xffff)
        .toString(16)
        .padStart(4, '0');
    return `${hex()}-${hex()}-${hex()}`.toUpperCase();
  }, []);
  const since = useMemo(
    () =>
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  const [seconds, setSeconds] = useState(15);
  const [attempt, setAttempt] = useState(1);
  const reloading = useRef(false);

  // Loop a 15 → 0 "retrying in" countdown. Each time it hits zero we bump the
  // attempt counter and actually re-check the switch; if it has been turned
  // off, the page reloads itself back into the app.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s > 1) return s - 1;
        setAttempt((a) => a + 1);
        void recheck();
        return 15;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recheck() {
    if (reloading.current) return;
    try {
      const stillDown = await fetchLockdown();
      if (!stillDown) {
        reloading.current = true;
        window.location.reload();
      }
    } catch {
      // Keep waiting; the next tick tries again.
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0b1120] px-6 py-10 text-slate-300"
    >
      <LocalKeyframes />
      {/* Faint grid + glow, so the dark field has some depth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.9) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            maskImage: 'radial-gradient(70% 60% at 50% 38%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 50% 38%, black, transparent)',
          }}
        />
        <div className="absolute left-1/2 top-[30%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        {/* The icon: a server stack with a broken-link pulse radiating out. */}
        <div className="relative mx-auto grid size-28 place-items-center">
          <span className="absolute inline-flex size-20 rounded-full bg-amber-400/20 [animation:vio-sonar_2.4s_ease-out_infinite]" />
          <span className="absolute inline-flex size-20 rounded-full bg-amber-400/20 [animation:vio-sonar_2.4s_ease-out_infinite_1.2s]" />
          <span className="relative grid size-20 place-items-center rounded-2xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/40">
            <ServerGlyph />
          </span>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-amber-400/90">
          Service unavailable
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          We&rsquo;ll be right back
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
          Our servers are temporarily unreachable and the team has been paged.
          This page will reconnect automatically as soon as the service is back.
        </p>

        {/* Indeterminate progress bar — the classic "working on it" sweep. */}
        <div className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-400 to-amber-500/20 [animation:vio-sweep_1.6s_ease-in-out_infinite]" />
        </div>

        {/* Live-looking status line. */}
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-400">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-75 [animation:vio-ping_1.4s_cubic-bezier(0,0,0.2,1)_infinite]" />
            <span className="relative inline-flex size-2.5 rounded-full bg-amber-400" />
          </span>
          <span>
            Reconnecting<Dots /> · attempt {attempt}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Retrying in <span className="tabular-nums text-slate-300">{seconds}s</span>
        </p>

        {/* Faux technical detail, the kind a real gateway error shows. */}
        <div className="mx-auto mt-8 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left font-mono text-[11px] leading-relaxed text-slate-400 shadow-inner">
          <Row label="status" value="503 Service Unavailable" valueClass="text-amber-300" />
          <Row label="upstream" value="connect: timed out" />
          <Row label="gateway" value="edge-02 · unhealthy" />
          <Row label="since" value={since} />
          <Row label="incident" value={incident} valueClass="text-slate-300" />
        </div>

        <p className="mt-6 text-xs text-slate-500">
          If this keeps happening, contact your administrator and quote the
          incident reference above.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass = '',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-slate-600">{label}</span>
      <span className={valueClass || 'text-slate-400'}>{value}</span>
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

/** A small server-stack mark with a disconnected spark, in amber. */
function ServerGlyph() {
  return (
    <svg
      width="34"
      height="34"
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
      @keyframes vio-sonar {
        0%   { transform: scale(0.6); opacity: 0.7; }
        100% { transform: scale(1.6); opacity: 0; }
      }
      @keyframes vio-ping {
        75%, 100% { transform: scale(2); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        [class*="vio-sweep"], [class*="vio-sonar"], [class*="vio-ping"] {
          animation: none !important;
        }
      }
    `}</style>
  );
}
