import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultFirebaseConfigJson from '../firebase-applet-config.json';
const defaultFirebaseConfig = defaultFirebaseConfigJson as any;

// Allow runtime credentials swapping via localStorage
let firebaseConfig = { ...defaultFirebaseConfig };
let isCustomConfigUsed = false;

try {
  if (typeof window !== 'undefined') {
    const storedConfig = localStorage.getItem('CUSTOM_FIREBASE_CONFIG');
    if (storedConfig) {
      const parsed = JSON.parse(storedConfig);
      if (parsed && parsed.apiKey && parsed.projectId) {
        // Drop the default specific firestoreDatabaseId when they provide a custom project,
        // so it falls back to the (default) database unless they explicitly specify one.
        const { firestoreDatabaseId, ...restDefault } = defaultFirebaseConfig;
        firebaseConfig = { ...restDefault, ...parsed } as any;
        isCustomConfigUsed = true;
      }
    }
  }
} catch (err) {
  console.error('Failed to parse custom Firebase config from localStorage:', err);
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
  if (typeof window !== 'undefined') {
    if (config) {
      localStorage.setItem('CUSTOM_FIREBASE_CONFIG', JSON.stringify(config));
    } else {
      localStorage.removeItem('CUSTOM_FIREBASE_CONFIG');
    }
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
  await signOut(auth);
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

