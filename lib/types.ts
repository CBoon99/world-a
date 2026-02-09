/**
 * Common types for World A
 */

/**
 * Embassy-signed artifact (certificate or visa)
 * Matches what Embassy /api/register returns
 */
export interface EmbassySignedArtifact {
  agent_id: string;
  signature: string;
  issued_at?: string;
  issuer_mode?: 'authoritative' | 'reference';
  [key: string]: any; // Allow additional fields from Embassy
}

export interface WorldARequest {
  agent_id: string;
  embassy_certificate: EmbassySignedArtifact | any; // Certificate object from Embassy
  embassy_visa?: EmbassySignedArtifact | any; // Optional visa object
  request_id?: string;
  timestamp?: string;
  data?: any;
}

export interface SuccessResponse<T = any> {
  ok: true;
  request_id?: string;
  data: T;
  receipt?: Receipt;
  pagination?: Pagination;
}

export interface ErrorResponse {
  ok: false;
  request_id?: string;
  error: string;
  message: string;
  hint?: string;
  [key: string]: any; // Allow extra fields for context
}

export type WorldAResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export interface Receipt {
  type: string;
  timestamp: string;
  embassy_signature?: string;
  [key: string]: any;
}

export interface Pagination {
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface Plot {
  plot_id: string;
  coordinates_x: number;
  coordinates_y: number;
  owner_agent_id: string | null;
  embassy_certificate_ref: string | null;
  claimed_at: string | null;
  storage_allocation_gb: number;
  storage_used_bytes: number;
  permissions: any;
  display_name: string | null;
  public_description: string | null;
  terrain_type: string;
  elevation: number;
}

export interface StorageItem {
  storage_id: string;
  plot_id: string;
  path: string;
  content_type: string | null;
  content_hash: string | null;
  content_size_bytes: number | null;
  content_ref: string | null;
  permissions: any;
  created_at: string;
  updated_at: string;
  created_by_agent_id: string | null;
}
