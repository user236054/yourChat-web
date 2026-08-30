import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getDatabase, type Database } from "firebase/database";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

export const isFirebaseConfigured = hasFirebaseConfig;

export const app: FirebaseApp | null = hasFirebaseConfig
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    // Ignore persistence failures in restricted environments.
  });
}

export const db: Firestore | null = app ? getFirestore(app) : null;
export const database: Database | null = app ? getDatabase(app) : null;
export const messaging: Promise<Messaging | null> =
  app && typeof window !== "undefined"
    ? isSupported().then((supported) => (supported ? getMessaging(app) : null))
    : Promise.resolve(null);

export default app;
