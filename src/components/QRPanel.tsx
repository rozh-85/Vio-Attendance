import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './ui/Button';

/**
 * Displays a QR code for a URL, with the link shown below and copy / open
 * shortcuts. Students point their phone camera at this to open the flow.
 */
export function QRPanel({ url, caption }: { url: string; caption?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <QRCodeSVG value={url} size={232} level="M" marginSize={2} />
      </div>
      {caption && <p className="mt-4 max-w-xs text-sm text-ink-500">{caption}</p>}
      <code className="mt-3 block max-w-full truncate rounded-lg bg-slate-100 px-3 py-2 text-xs text-ink-500">
        {url}
      </code>
      <div className="mt-4 flex w-full gap-2">
        <Button variant="outline" size="sm" fullWidth onClick={copy}>
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => window.open(url, '_blank')}
        >
          Open
        </Button>
      </div>
    </div>
  );
}
