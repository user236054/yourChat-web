import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    });

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
export default app;
