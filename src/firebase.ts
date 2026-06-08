import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultFirebaseConfigJson from '../firebase-applet-config.json';
const defaultFirebaseConfig = defaultFirebaseConfigJson as any;

// Global memory store fallback for partitioned iframe environments
const memoryStore: Record<string, string> = {};

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`localStorage.getItem('${key}') blocked, using memory:`, e);
    }
    return memoryStore[key] || null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`localStorage.setItem('${key}') blocked, using memory:`, e);
    }
    memoryStore[key] = value;
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`localStorage.removeItem('${key}') blocked, using memory:`, e);
    }
    delete memoryStore[key];
  }
};

// Allow runtime credentials swapping via safeStorage
let firebaseConfig = { ...defaultFirebaseConfig };
let isCustomConfigUsed = false;

try {
  const storedConfig = safeStorage.getItem('CUSTOM_FIREBASE_CONFIG');
  if (storedConfig) {
    const parsed = JSON.parse(storedConfig);
    if (parsed && parsed.apiKey && parsed.projectId) {
      // Robust verification: check for placeholder dots or cut-off patterns
      const hasPlaceholders = Object.values(parsed).some(
        val => typeof val === 'string' && (val.includes('...') || val === '...' || val.trim() === '')
      );
      const isApiKeyTooShort = typeof parsed.apiKey === 'string' && parsed.apiKey.trim().length < 15;
      const isPlaceholderProject = typeof parsed.projectId === 'string' && parsed.projectId.toLowerCase().includes('your');

      if (hasPlaceholders || isApiKeyTooShort || isPlaceholderProject) {
        console.warn('Dummy or placeholder CUSTOM_FIREBASE_CONFIG detected. Discarding to avoid initialization freeze.', parsed);
        try {
          safeStorage.removeItem('CUSTOM_FIREBASE_CONFIG');
        } catch (_) {}
      } else {
        // Drop the default specific firestoreDatabaseId when they provide a custom project,
        // so it falls back to the (default) database unless they explicitly specify one.
        const { firestoreDatabaseId, ...restDefault } = defaultFirebaseConfig;
        firebaseConfig = { ...restDefault, ...parsed } as any;
        isCustomConfigUsed = true;
      }
    }
  }
} catch (err) {
  console.error('Failed to parse custom Firebase config:', err);
}

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (err) {
  console.error('Failed to initialize App with config, rolling back to default:', err);
  firebaseConfig = { ...defaultFirebaseConfig };
  app = initializeApp(defaultFirebaseConfig);
  isCustomConfigUsed = false;
}

export { app };

let db: any;
try {
  db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
} catch (err) {
  console.error('getFirestore failed with specified database ID, trying default database:', err);
  try {
    db = getFirestore(app);
  } catch (err2) {
    console.error('getFirestore completely failed:', err2);
  }
}

export { db };

let auth: any;
try {
  auth = getAuth(app);
} catch (err) {
  console.error('getAuth failed:', err);
}

export { auth };

export function getLoadedFirebaseConfig() {
  return firebaseConfig;
}

export function saveCustomFirebaseConfig(config: any) {
  try {
    if (config) {
      safeStorage.setItem('CUSTOM_FIREBASE_CONFIG', JSON.stringify(config));
    } else {
      safeStorage.removeItem('CUSTOM_FIREBASE_CONFIG');
    }
  } catch (e) {
    console.warn('safeStorage custom config write failed:', e);
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function loginWithGoogleRedirect() {
  await signInWithRedirect(auth, googleProvider);
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Firebase signOut failed, performing hard local session cleanup:', err);
  } finally {
    // Perform thorough local browser caching purge
    if (typeof window !== 'undefined') {
      try {
        // Clear localStorage keys with 'firebase' or 'g_state'
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.toLowerCase().includes('firebase') || key.toLowerCase().includes('g_state'))) {
            localStorage.removeItem(key);
          }
        }
        // Clear sessionStorage keys with 'firebase' or 'g_state'
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key && (key.toLowerCase().includes('firebase') || key.toLowerCase().includes('g_state'))) {
            sessionStorage.removeItem(key);
          }
        }
        // Purge default Firebase IndexedDB databases to reset authentication states
        if (window.indexedDB && window.indexedDB.deleteDatabase) {
          window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
          // Purge firestore offline cache DB too if present
          window.indexedDB.deleteDatabase('firestore/[DEFAULT]/team-shuffle-2f2f9/main');
        }
      } catch (cacheErr) {
        console.warn('Failed to completely clean secondary auth storage:', cacheErr);
      }
    }
  }
}

// Keep a placeholder for compatibility
export async function authenticateApp() {
  // Now using Google Sign-In, so we don't need silent anonymous authentication
}

// Connectivity fallback check (no-op as onSnapshot manages connectivity natively)
export async function testConnection() {
  // Graceful no-op to optimize performance
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

