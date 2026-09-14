import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { APP_NAME } from '@/brand';
import { FeedbackImagePicker } from '@/components/FeedbackImagePicker';
import { CheckCircle, MessageSquare } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import type { CompressedFeedbackImage } from '@/services/feedback/image';
import {
  getPublicFeedbackProduct,
  submitPublicFeedback,
  uploadPublicFeedbackImage,
} from '@/services/feedback/store';
import type { PublicFeedbackProduct } from '@/services/feedback/types';

export function PublicFeedbackPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [product, setProduct] = useState<PublicFeedbackProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<CompressedFeedbackImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setUnavailable(true);
      setLoading(false);
      return () => { active = false; };
    }
    getPublicFeedbackProduct(token)
      .then((loaded) => {
        if (!active) return;
        if (loaded) setProduct(loaded);
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) {
      setError('Please enter your feedback message.');
      return;
    }
    setError('');
    setBusy(true);
    const feedbackId = crypto.randomUUID();
    try {
      const imagePath = image
        ? await uploadPublicFeedbackImage(token, feedbackId, image)
        : null;
      await submitPublicFeedback({
        token,
        feedbackId,
        customerName: name,
        feedbackText: message,
        imagePath,
      });
      setSubmitted(true);
      setName('');
      setMessage('');
      setImage(null);
    } catch (problem) {
      const detail = problem instanceof Error ? problem.message : '';
      setError(detail || 'Your feedback could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <Logo size={38} />
          <div className="leading-tight"><div className="font-bold text-ink-900">{APP_NAME}</div><div className="text-xs text-ink-400">Product feedback</div></div>
        </div>

        {loading ? (
          <Card className="py-24 text-center text-ink-400">Loading feedback form…</Card>
        ) : unavailable || !product ? (
          <Card className="px-6 py-16 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-ink-400"><MessageSquare width={24} height={24} /></span>
            <h1 className="mt-5 text-xl font-bold">This feedback link is unavailable</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-500">The link may have been disabled or replaced. Please ask the sender for a new link.</p>
          </Card>
        ) : submitted ? (
          <Card className="px-6 py-16 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle width={27} height={27} /></span>
            <h1 className="mt-5 text-2xl font-bold">Thank you</h1>
            <p className="mx-auto mt-2 max-w-sm leading-6 text-ink-500">Your feedback for {product.productName} was sent successfully.</p>
            <Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}>Send another response</Button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-4 border-b border-slate-100 bg-white p-5 sm:p-6">
              <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 sm:size-24">
                {product.productImage ? <img src={product.productImage} alt={product.productName} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-ink-300"><MessageSquare width={23} height={23} /></span>}
              </div>
              <div className="min-w-0"><div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Share your experience</div><h1 className="mt-1 text-xl font-bold sm:text-2xl">{product.productName}</h1><p className="mt-1 text-sm text-ink-500">Your feedback helps us improve.</p></div>
            </div>
            <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
              <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" autoComplete="name" />
              <Textarea label="Feedback message" required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell us about your experience" className="min-h-32" />
              <FeedbackImagePicker value={image} onChange={setImage} disabled={busy} />
              {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
              <Button type="submit" fullWidth size="lg" loading={busy} leftIcon={<MessageSquare width={18} height={18} />}>Submit feedback</Button>
              <p className="text-center text-xs leading-5 text-ink-400">This form accepts feedback only for {product.productName}.</p>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
