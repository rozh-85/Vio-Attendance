export type FeedbackSource = 'manual' | 'customer_link';

export interface ProductFeedback {
  id: string;
  productId: string;
  customerName: string | null;
  feedbackText: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  source: FeedbackSource;
  internalNote: string | null;
  feedbackLinkId: string | null;
  feedbackDate: string;
  createdAt: string;
}

export interface FeedbackLink {
  id: string;
  productId: string;
  token: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  submissionCount: number;
}

export interface ManualFeedbackInput {
  productId: string;
  customerName: string;
  feedbackText: string;
  internalNote: string;
  feedbackDate: string;
}

export interface PublicFeedbackProduct {
  productName: string;
  productImage: string;
}

export interface PublicFeedbackInput {
  token: string;
  feedbackId: string;
  customerName: string;
  feedbackText: string;
  imagePath: string | null;
}
