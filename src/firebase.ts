import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
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

let app: any;
try {
  if (getApps().length > 0) {
    app = getApp();
    console.log('Firebase App already exists, using existing instance.');
  } else {
    app = initializeApp(firebaseConfig);
    console.log('Firebase App successfully initialized.');
  }
} catch (err) {
  console.error('Failed to initialize App with config, rolling back to default:', err);
  try {
    firebaseConfig = { ...defaultFirebaseConfig };
    isCustomConfigUsed = false;
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp(defaultFirebaseConfig);
    }
  } catch (fallbackErr) {
    console.error('Fallback Firebase App initialization completely failed:', fallbackErr);
  }
}

export { app };

let db: any;
try {
  if (app) {
    db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
} catch (err) {
  console.error('getFirestore completely failed:', err);
}

export { db };

let auth: any;
try {
  if (app) {
    auth = getAuth(app);
  } else {
    auth = getAuth();
  }
} catch (err) {
  console.error('getAuth failed:', err);
  try {
    auth = getAuth();
  } catch (err2) {
    console.error('getAuth() dual fallback failed:', err2);
  }
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

export async function loginWithGoogle() {
  let currentAuth = auth;
  if (!currentAuth) {
    try {
      currentAuth = app ? getAuth(app) : getAuth();
    } catch (e) {
      try {
        currentAuth = getAuth();
      } catch (e2) {
        console.error('Failed to resolve auth for sign in:', e2);
      }
    }
  }
  if (!currentAuth) {
    throw new Error("Firebase Authentication 이 정상적으로 초기화되지 않았습니다. 앱 설정이나 네트워크를 확인하세요.");
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(currentAuth, provider);
  return result.user;
}

export async function loginWithGoogleRedirect() {
  let currentAuth = auth;
  if (!currentAuth) {
    try {
      currentAuth = app ? getAuth(app) : getAuth();
    } catch (e) {
      try {
        currentAuth = getAuth();
      } catch (e2) {
        console.error('Failed to resolve auth for redirect:', e2);
      }
    }
  }
  if (!currentAuth) {
    throw new Error("Firebase Authentication 이 정상적으로 초기화되지 않았습니다. 앱 설정이나 네트워크를 확인하세요.");
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(currentAuth, provider);
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
        // Clear localStorage keys with 'firebase' or 'g_state', excluding custom configurations
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.toLowerCase().includes('firebase') || key.toLowerCase().includes('g_state')) && key !== 'CUSTOM_FIREBASE_CONFIG') {
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

