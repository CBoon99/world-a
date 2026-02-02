/**
 * Storage Adapter Interface
 * Abstracts blob storage (Netlify Blobs, S3, etc.)
 */

import { getStore } from '@netlify/blobs';

export interface StorageAdapter {
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
}

/**
 * Netlify Blobs Storage Implementation
 */
export class NetlifyBlobStorage implements StorageAdapter {
  private store: ReturnType<typeof getStore>;

  constructor() {
    this.store = getStore('world-a-storage');
  }

  async write(key: string, data: Buffer): Promise<void> {
    await this.store.set(key, data as any);
  }

  async read(key: string): Promise<Buffer | null> {
    const data = await this.store.get(key, { type: 'arrayBuffer' });
    if (!data) return null;
    return Buffer.from(data);
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const data = await this.store.get(key);
    return data !== null;
  }

  async list(prefix: string): Promise<string[]> {
    const list = await this.store.list({ prefix });
    return list.blobs.map((blob: any) => blob.key);
  }
}

// Singleton instance
let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    storageInstance = new NetlifyBlobStorage();
  }
  return storageInstance;
}
