import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";

const actionCodeSettings = {
  url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`,
  handleCodeInApp: true,
};

export async function signInWithPassword(email: string, password: string, rememberMe = true) {
  if (!isFirebaseConfigured || !auth) {
    return null;
  }

  if (!rememberMe) {
    await auth.setPersistence(browserSessionPersistence);
  } else {
    await auth.setPersistence(browserLocalPersistence);
  }

  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function createAccount(email: string, password: string) {
  if (!isFirebaseConfigured || !auth) {
    return null;
  }

  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function sendMagicLink(email: string) {
  if (!isFirebaseConfigured || !auth) {
    return false;
  }

  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  return true;
}

export async function signOut() {
  if (!isFirebaseConfigured || !auth) {
    return;
  }

  await firebaseSignOut(auth);
}

export function getCurrentUser(): User | null {
  if (!isFirebaseConfigured || !auth) {
    return null;
  }

  return auth.currentUser;
}
