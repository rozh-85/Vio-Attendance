import { getSupabaseClient } from '@/lib/supabase';
import type { CatalogProduct } from '@/services/catalog/types';
import type { CompressedFeedbackImage } from './image';
import type {
  FeedbackLink,
  ManualFeedbackInput,
  NewFeedbackProductInput,
  ProductFeedback,
  PublicFeedbackGallery,
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

export interface FeedbackCatalogData {
  products: CatalogProduct[];
}

export async function loadFeedbackCatalog(): Promise<FeedbackCatalogData> {
  const client = requireClient();
  const result = await client
    .from('vio_catalog_master')
    .select('products')
    .eq('id', 'default')
    .maybeSingle();
  if (result.error) throw result.error;
  return {
    products: ((result.data?.products ?? []) as CatalogProduct[]).slice().sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function addFeedbackProduct(input: NewFeedbackProductInput): Promise<CatalogProduct> {
  const client = requireClient();
  const result = await client.rpc('add_feedback_product', {
    p_name: input.name.trim(),
    p_sku: input.sku.trim(),
    p_main_image: input.mainImage.trim(),
  });
  if (result.error) throw result.error;
  if (!result.data || typeof result.data !== 'object') throw new Error('The product could not be added.');
  return result.data as CatalogProduct;
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

export async function createManualFeedbackBatch(
  input: ManualFeedbackInput,
  images: CompressedFeedbackImage[],
): Promise<ProductFeedback[]> {
  if (images.length === 0) throw new Error('Choose at least one feedback image.');
  const client = requireClient();
  const pending = images.map((image) => {
    const id = crypto.randomUUID();
    return { id, image, imagePath: `${input.productId}/${id}/image.webp` };
  });
  const uploadedPaths: string[] = [];

  try {
    for (const item of pending) {
      await uploadImage(item.imagePath, item.image);
      uploadedPaths.push(item.imagePath);
    }
  } catch (problem) {
    if (uploadedPaths.length > 0) await client.storage.from(FEEDBACK_BUCKET).remove(uploadedPaths);
    throw problem;
  }

  const result = await client.from('product_feedback').insert(pending.map((item) => ({
    id: item.id,
    product_id: input.productId,
    customer_name: null,
    feedback_text: null,
    image_path: item.imagePath,
    source: 'manual',
    internal_note: null,
  }))).select('id,product_id,customer_name,feedback_text,image_path,source,internal_note,feedback_link_id,feedback_date,created_at');

  if (result.error) {
    await client.storage.from(FEEDBACK_BUCKET).remove(uploadedPaths);
    throw result.error;
  }

  const rows = (result.data ?? []) as FeedbackRow[];
  const paths = rows.map((row) => row.image_path).filter((path): path is string => Boolean(path));
  const signed = await client.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 60 * 60);
  const signedByPath = new Map<string, string>();
  if (!signed.error) {
    signed.data.forEach((item, index) => {
      const path = paths[index];
      if (path && item.signedUrl) signedByPath.set(path, item.signedUrl);
    });
  }
  return rows.map((row) => mapFeedback(row, row.image_path ? signedByPath.get(row.image_path) ?? null : null));
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

export async function getPublicFeedbackGallery(token: string): Promise<PublicFeedbackGallery | null> {
  const client = requireClient();
  const result = await client.rpc('get_feedback_gallery', { p_token: token });
  if (result.error) throw result.error;
  const rows = (Array.isArray(result.data) ? result.data : []) as Array<{
    product_name: string;
    product_image: string | null;
    feedback_id: string | null;
    image_path: string | null;
    feedback_date: string | null;
  }>;
  const first = rows[0];
  if (!first?.product_name) return null;
  const imageRows = rows.filter((row) => row.feedback_id && row.image_path && row.feedback_date);
  const paths = imageRows.map((row) => row.image_path as string);
  const signed = paths.length
    ? await client.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 15 * 60)
    : { data: [], error: null };
  if (signed.error) throw signed.error;
  return {
    productName: first.product_name,
    productImage: first.product_image ?? '',
    images: imageRows.flatMap((row, index) => {
      const imageUrl = signed.data?.[index]?.signedUrl;
      return imageUrl && row.feedback_id && row.feedback_date
        ? [{ id: row.feedback_id, imageUrl, feedbackDate: row.feedback_date }]
        : [];
    }),
  };
}
