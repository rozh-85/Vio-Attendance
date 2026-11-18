import { useEffect, useState } from 'react';

/**
 * A clean, realistic maintenance screen shown over the admin areas while the
 * owner's switch is on. It uses a fixed light palette so it always looks the
 * same, like a real status page. The gate that renders it re-checks the switch
 * on its own and swaps back to the app the moment it is turned off, so nothing
 * here needs to reload.
 */
export function ServerDown() {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#f6f9ff] px-6 py-12 text-center"
    >
      <LocalKeyframes />

      <div className="relative z-10 w-full max-w-md">
        <MaintenanceIcon />

        <div className="mt-8 inline-flex items-center rounded-full bg-[#dbeafe] px-4 py-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2563eb]">
            Maintenance in progress
          </span>
        </div>

        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#101a30] sm:text-5xl">
          We&rsquo;ll be right back
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-[#64748b]">
          The service is down for a short maintenance break. It will be back in a
          few minutes — thanks for your patience.
        </p>

        <Dots />

        <div className="mx-auto mt-8 flex max-w-xs items-center gap-3">
          <span className="h-px flex-1 bg-[#e2e8f0]" />
          <span className="whitespace-nowrap text-sm text-[#94a3b8]">
            This page updates on its own.
          </span>
          <span className="h-px flex-1 bg-[#e2e8f0]" />
        </div>
      </div>

      <Waves />
    </div>
  );
}

/** The light-blue tile: a server, a spinning progress ring and a gear. */
function MaintenanceIcon() {
  return (
    <div className="mx-auto grid size-40 place-items-center rounded-[2rem] bg-[#e3ecfb] shadow-sm">
      <svg viewBox="0 0 120 120" className="size-28" fill="none" aria-hidden>
        {/* Progress ring: a faint track with a brighter arc that spins slowly. */}
        <circle cx="56" cy="58" r="40" stroke="#cbddf9" strokeWidth="4" />
        <circle
          cx="56"
          cy="58"
          r="40"
          stroke="#3b82f6"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="168 83"
          className="[animation:vio-spin_2.6s_linear_infinite]"
          style={{ transformOrigin: '56px 58px' }}
        />

        {/* Server: two stacked drawers with status lights. */}
        <g
          stroke="#1e293b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="34" y="40" width="48" height="18" rx="6" fill="#ffffff" />
          <rect x="34" y="62" width="48" height="18" rx="6" fill="#ffffff" />
          <line x1="42" y1="49" x2="48" y2="49" />
          <line x1="42" y1="71" x2="48" y2="71" />
        </g>
        <circle cx="74" cy="49" r="2.4" fill="#1e293b" />
        <circle cx="74" cy="71" r="2.4" fill="#1e293b" />

        {/* Gear, overlapping the lower-right corner. */}
        <circle cx="84" cy="82" r="16" fill="#e3ecfb" />
        <g transform="translate(68.4 66.4) scale(1.3)">
          <path
            fill="#2563eb"
            d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
          />
        </g>
      </svg>
    </div>
  );
}

/** Three carousel dots; the active one steps along, 0 → 1 → 2 → 0. */
function Dots() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setActive((v) => (v + 1) % 3), 600);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={
            'h-2.5 rounded-full transition-all duration-300 ' +
            (i === active ? 'w-6 bg-[#2563eb]' : 'w-2.5 bg-[#cbd5e1]')
          }
        />
      ))}
    </div>
  );
}

/** Soft layered waves along the bottom edge. */
function Waves() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0">
      <svg
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
        className="h-40 w-full sm:h-48"
      >
        <path
          fill="#e8f1ff"
          d="M0 90 C 240 150 480 30 720 70 C 960 110 1200 180 1440 120 L1440 220 L0 220 Z"
        />
        <path
          fill="#d6e7ff"
          d="M0 140 C 280 100 520 180 760 150 C 1000 120 1220 170 1440 140 L1440 220 L0 220 Z"
        />
      </svg>
    </div>
  );
}

/** Keyframes the screen needs, scoped to this page via a plain style tag. */
function LocalKeyframes() {
  return (
    <style>{`
      @keyframes vio-spin {
        to { transform: rotate(360deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        [class*="vio-spin"] { animation: none !important; }
      }
    `}</style>
  );
}
