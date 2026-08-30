import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getToken, onMessage, type Messaging } from "firebase/messaging";
import { auth, db, isFirebaseConfigured, messaging } from "@/lib/firebase";

export async function registerMessaging() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!("Notification" in window)) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }

  try {
    const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const firebaseMessaging = await messaging;

    if (!firebaseMessaging || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
      return null;
    }

    const token = await getToken(firebaseMessaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    return token;
  } catch {
    return null;
  }
}

export async function storeFcmTokenForCurrentUser() {
  if (!isFirebaseConfigured || !auth || !auth.currentUser || !db) {
    return null;
  }

  const token = await registerMessaging();
  if (!token) {
    return null;
  }

  await setDoc(
    doc(db, "users", auth.currentUser.uid),
    {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      fcmToken: token,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return token;
}

export async function attachForegroundMessageListener() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const firebaseMessaging = await getMessagingInstance();
  if (!firebaseMessaging) {
    return () => {};
  }

  return onMessage(firebaseMessaging, (payload) => {
    const title = payload.notification?.title || "Nouveau message";
    const body = payload.notification?.body || "Vous avez reçu un message.";

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
      });
    }
  });
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined") {
    return false;
  }

  if (!("Notification" in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function hasNotificationSupport() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function getMessagingInstance(): Promise<Messaging | null> {
  return messaging;
}
