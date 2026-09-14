import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { APP_NAME } from '@/brand';
import { ImageIcon, MessageSquare } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/Card';
import { getPublicFeedbackGallery } from '@/services/feedback/store';
import type { PublicFeedbackGallery } from '@/services/feedback/types';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

export function PublicFeedbackPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [gallery, setGallery] = useState<PublicFeedbackGallery | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setUnavailable(true);
      setLoading(false);
      return () => { active = false; };
    }
    getPublicFeedbackGallery(token)
      .then((loaded) => {
        if (!active) return;
        if (loaded) setGallery(loaded);
        else setUnavailable(true);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <Logo size={38} />
          <div className="leading-tight"><div className="font-bold text-ink-900">{APP_NAME}</div><div className="text-xs text-ink-400">Customer feedback</div></div>
        </div>

        {loading ? (
          <Card className="py-24 text-center text-ink-400">Loading feedback…</Card>
        ) : unavailable || !gallery ? (
          <Card className="px-6 py-16 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-ink-400"><MessageSquare width={24} height={24} /></span>
            <h1 className="mt-5 text-xl font-bold">This feedback link is unavailable</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-500">The link may have been disabled or replaced. Please ask the sender for a new link.</p>
          </Card>
        ) : (
          <>
            <Card className="mb-6 flex flex-col items-center gap-5 p-5 text-center sm:flex-row sm:p-6 sm:text-left">
              <div className="size-28 shrink-0 overflow-hidden rounded-2xl bg-slate-100 sm:size-32">
                {gallery.productImage ? <img src={gallery.productImage} alt={gallery.productName} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-ink-300"><ImageIcon width={28} height={28} /></span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Customer feedback</div>
                <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{gallery.productName}</h1>
                <p className="mt-2 text-ink-500">{gallery.images.length} feedback image{gallery.images.length === 1 ? '' : 's'} shared for this product.</p>
              </div>
            </Card>

            {gallery.images.length === 0 ? (
              <Card className="px-6 py-16 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-ink-400"><ImageIcon width={21} height={21} /></span>
                <h2 className="mt-4 font-bold">No feedback images yet</h2>
                <p className="mt-1 text-sm text-ink-500">Feedback added for this product will automatically appear here.</p>
              </Card>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {gallery.images.map((image, index) => (
                  <a key={image.id} href={image.imageUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="aspect-[4/5] overflow-hidden bg-slate-100">
                      <img src={image.imageUrl} alt={`Customer feedback ${index + 1} for ${gallery.productName}`} className="size-full object-contain transition duration-300 group-hover:scale-[1.01]" />
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                      <span className="text-sm font-bold">Feedback {index + 1}</span>
                      <span className="text-xs text-ink-400">{formatDate(image.feedbackDate)}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
