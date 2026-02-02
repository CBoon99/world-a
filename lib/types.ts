/**
 * Common types for World A
 */

export interface WorldARequest {
  agent_id: string;
  embassy_certificate: string;
  embassy_visa?: string;
  request_id?: string;
  timestamp?: string;
  data?: any;
}

export interface WorldAResponse {
  ok: boolean;
  request_id?: string;
  data?: any;
  receipt?: Receipt;
  error?: string;
  reason?: string;
  pagination?: Pagination;
}

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
