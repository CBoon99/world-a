import type { WorldAIdentity } from './types';

const DB_NAME = 'world_a_identity';
const STORE_NAME = 'identity';
const IDENTITY_KEY = 'current';

/**
 * Initialize IndexedDB for identity storage
 */
export async function initIdentityDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Store identity in IndexedDB
 * 
 * SECURITY WARNING: privateKeyPem stored locally = v1 convenience, NOT secure against XSS
 * TODO: encrypt at rest with user passphrase (WebCrypto AES-GCM) later
 * 
 * User must understand: clearing browser data = losing identity
 * This is acceptable for v1 but MUST be improved before production use
 */
export async function storeIdentity(identity: WorldAIdentity): Promise<void> {
  const db = await initIdentityDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const request = store.put(identity, IDENTITY_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve identity from IndexedDB
 */
export async function getIdentity(): Promise<WorldAIdentity | null> {
  try {
    const db = await initIdentityDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
      const request = store.get(IDENTITY_KEY);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get identity:', error);
    return null;
  }
}

/**
 * Delete identity from IndexedDB (for logout/reset)
 */
export async function deleteIdentity(): Promise<void> {
  const db = await initIdentityDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const request = store.delete(IDENTITY_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Check if identity exists
 */
export async function hasIdentity(): Promise<boolean> {
  const identity = await getIdentity();
  return identity !== null;
}
