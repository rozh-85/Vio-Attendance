import { getSupabaseClient } from '@/lib/supabase';
import type { CatalogProduct } from '@/services/catalog/types';
import type { CompressedFeedbackImage } from './image';
import type {
  FeedbackLink,
  ManualFeedbackInput,
  ProductFeedback,
  PublicFeedbackInput,
  PublicFeedbackProduct,
} from './types';

const FEEDBACK_BUCKET = 'feedback-images';

interface FeedbackRow {
  id: string;
  product_id: string;
  customer_name: string | null;
  feedback_text: string | null;
  image_path: string | null;
  source: ProductFeedback['source'];
  internal_note: string | null;
  feedback_link_id: string | null;
  feedback_date: string;
  created_at: string;
}

interface FeedbackLinkRow {
  id: string;
  product_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
  submission_count: number;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured for feedback.');
  return client;
}

function mapLink(row: FeedbackLinkRow): FeedbackLink {
  return {
    id: row.id,
    productId: row.product_id,
    token: row.token,
    isActive: row.is_active,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    submissionCount: Number(row.submission_count ?? 0),
  };
}

function mapFeedback(row: FeedbackRow, imageUrl: string | null): ProductFeedback {
  return {
    id: row.id,
    productId: row.product_id,
    customerName: row.customer_name,
    feedbackText: row.feedback_text,
    imagePath: row.image_path,
    imageUrl,
    source: row.source,
    internalNote: row.internal_note,
    feedbackLinkId: row.feedback_link_id,
    feedbackDate: row.feedback_date,
    createdAt: row.created_at,
  };
}

async function uploadImage(path: string, image: CompressedFeedbackImage): Promise<void> {
  const client = requireClient();
  const result = await client.storage.from(FEEDBACK_BUCKET).upload(path, image.blob, {
    contentType: 'image/webp',
    cacheControl: '3600',
    upsert: false,
  });
  if (result.error) throw result.error;
}

export async function listFeedbackProducts(): Promise<CatalogProduct[]> {
  const client = requireClient();
  const result = await client
    .from('vio_catalog_master')
    .select('products')
    .eq('id', 'default')
    .maybeSingle();
  if (result.error) throw result.error;
  return ((result.data?.products ?? []) as CatalogProduct[]).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function listFeedback(): Promise<ProductFeedback[]> {
  const client = requireClient();
  const result = await client
    .from('product_feedback')
    .select('id,product_id,customer_name,feedback_text,image_path,source,internal_note,feedback_link_id,feedback_date,created_at')
    .order('feedback_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as FeedbackRow[];
  const paths = rows.map((row) => row.image_path).filter((path): path is string => Boolean(path));
  const signedByPath = new Map<string, string>();

  if (paths.length > 0) {
    const signed = await client.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 60 * 60);
    if (!signed.error) {
      signed.data.forEach((item, index) => {
        const path = paths[index];
        if (path && item.signedUrl) signedByPath.set(path, item.signedUrl);
      });
    }
  }

  return rows.map((row) => mapFeedback(row, row.image_path ? signedByPath.get(row.image_path) ?? null : null));
}

export async function createManualFeedback(
  input: ManualFeedbackInput,
  image: CompressedFeedbackImage | null,
): Promise<ProductFeedback> {
  const client = requireClient();
  const id = crypto.randomUUID();
  const imagePath = image ? `${input.productId}/${id}/image.webp` : null;
  if (image && imagePath) await uploadImage(imagePath, image);

  const result = await client.from('product_feedback').insert({
    id,
    product_id: input.productId,
    customer_name: input.customerName.trim() || null,
    feedback_text: input.feedbackText.trim() || null,
    image_path: imagePath,
    source: 'manual',
    internal_note: input.internalNote.trim() || null,
    feedback_date: input.feedbackDate,
  }).select('id,product_id,customer_name,feedback_text,image_path,source,internal_note,feedback_link_id,feedback_date,created_at').single();

  if (result.error) {
    if (imagePath) await client.storage.from(FEEDBACK_BUCKET).remove([imagePath]);
    throw result.error;
  }

  let imageUrl: string | null = null;
  if (imagePath) {
    const signed = await client.storage.from(FEEDBACK_BUCKET).createSignedUrl(imagePath, 60 * 60);
    imageUrl = signed.data?.signedUrl ?? null;
  }
  return mapFeedback(result.data as FeedbackRow, imageUrl);
}

export async function deleteFeedback(feedback: ProductFeedback): Promise<boolean> {
  const client = requireClient();
  const result = await client.from('product_feedback').delete().eq('id', feedback.id);
  if (result.error) throw result.error;
  if (!feedback.imagePath) return false;
  const cleanup = await client.storage.from(FEEDBACK_BUCKET).remove([feedback.imagePath]);
  return Boolean(cleanup.error);
}

export async function listFeedbackLinks(): Promise<FeedbackLink[]> {
  const client = requireClient();
  const result = await client
    .from('feedback_links')
    .select('id,product_id,token,is_active,created_at,expires_at,submission_count')
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return ((result.data ?? []) as FeedbackLinkRow[]).map(mapLink);
}

export async function generateFeedbackLink(productId: string): Promise<FeedbackLink> {
  const client = requireClient();
  const result = await client.rpc('generate_feedback_link', {
    p_product_id: productId,
    p_expires_at: null,
  });
  if (result.error) throw result.error;
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as FeedbackLinkRow | undefined;
  if (!row) throw new Error('The feedback link could not be generated.');
  return mapLink(row);
}

export async function disableFeedbackLink(linkId: string): Promise<void> {
  const client = requireClient();
  const result = await client.from('feedback_links').update({ is_active: false }).eq('id', linkId);
  if (result.error) throw result.error;
}

export async function getPublicFeedbackProduct(token: string): Promise<PublicFeedbackProduct | null> {
  const client = requireClient();
  const result = await client.rpc('get_feedback_product', { p_token: token });
  if (result.error) throw result.error;
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as {
    product_name?: string;
    product_image?: string;
  } | undefined;
  if (!row?.product_name) return null;
  return { productName: row.product_name, productImage: row.product_image ?? '' };
}

export async function uploadPublicFeedbackImage(
  token: string,
  feedbackId: string,
  image: CompressedFeedbackImage,
): Promise<string> {
  const path = `submissions/${token}/${feedbackId}/image.webp`;
  await uploadImage(path, image);
  return path;
}

export async function submitPublicFeedback(input: PublicFeedbackInput): Promise<void> {
  const client = requireClient();
  const result = await client.rpc('submit_product_feedback', {
    p_token: input.token,
    p_feedback_id: input.feedbackId,
    p_customer_name: input.customerName.trim() || null,
    p_feedback_text: input.feedbackText.trim() || null,
    p_image_path: input.imagePath,
  });
  if (result.error) throw result.error;
}
