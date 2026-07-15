import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { absoluteUrl } from '@/utils/url';
import {
  currentQrToken,
  staticQrToken,
  QR_ROTATION_MS,
  type QrMode,
} from '@/utils/qrToken';

/**
 * A QR code that rebuilds itself every few seconds with a fresh time-based
 * token, so a screenshot can't be reused later. Used for check-in / check-out.
 * With `rotating` off it renders one constant, session-scoped code instead.
 */
export function RotatingQRPanel({
  sessionId,
  mode,
  path,
  caption,
  rotating = true,
}: {
  sessionId: string;
  mode: QrMode;
  /** Route to encode, e.g. `paths.checkIn(sessionId)`. */
  path: string;
  caption?: string;
  /** When false, shows a constant QR that stays valid all session. */
  rotating?: boolean;
}) {
  // Re-render a few times a second so the QR flips exactly on each 5s boundary
  // and the countdown ticks smoothly.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rotating]);

  const token = rotating
    ? currentQrToken(sessionId, mode)
    : staticQrToken(sessionId, mode);
  const url = absoluteUrl(`${path}?t=${token}`);

  const remainingMs = QR_ROTATION_MS - (now % QR_ROTATION_MS);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progress = remainingMs / QR_ROTATION_MS;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <QRCodeSVG value={url} size={232} level="M" marginSize={2} />
      </div>

      {rotating && (
        <>
          {/* Countdown bar */}
          <div className="mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-200 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-semibold text-ink-600">
            New code in {secondsLeft}s
          </p>
        </>
      )}

      <p className="mt-2 max-w-xs text-sm text-ink-500">
        {caption ??
          (rotating
            ? 'This code changes every few seconds — students must scan the live code on screen.'
            : 'This code stays the same for the whole session.')}
      </p>
    </div>
  );
}
