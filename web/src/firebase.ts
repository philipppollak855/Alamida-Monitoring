import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/** Öffentliche Web-SDK-Config (kein Geheimnis) — Fallback falls Env leer ist. */
const productionDefaults = {
  apiKey: 'AIzaSyCOUbjpx40AyAKjRpZwsI1jceKIy2eACLg',
  authDomain: 'alamida---monitoring.firebaseapp.com',
  projectId: 'alamida---monitoring',
  storageBucket: 'alamida---monitoring.firebasestorage.app',
  messagingSenderId: '217625911120',
  appId: '1:217625911120:web:9f465e3a7aa0e3d8791655',
} as const;

function envOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const config = {
  apiKey: envOrDefault(import.meta.env.VITE_FIREBASE_API_KEY, productionDefaults.apiKey),
  authDomain: envOrDefault(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    productionDefaults.authDomain,
  ),
  projectId: envOrDefault(
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    productionDefaults.projectId,
  ),
  storageBucket: envOrDefault(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    productionDefaults.storageBucket,
  ),
  messagingSenderId: envOrDefault(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    productionDefaults.messagingSenderId,
  ),
  appId: envOrDefault(import.meta.env.VITE_FIREBASE_APP_ID, productionDefaults.appId),
};

export const firebaseConfigured = Boolean(config.apiKey && config.appId);

export const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const googleProvider = new GoogleAuthProvider();

if (auth) {
  void setPersistence(auth, browserLocalPersistence).catch(() => {
    /* Fallback: Firebase-Standard (meist ebenfalls local). */
  });
}
