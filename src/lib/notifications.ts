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
    console.log("[FCM] Notification permission not granted:", permission);
    return null;
  }

  try {
    const swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const firebaseMessaging = await messaging;

    if (!firebaseMessaging || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
      console.warn("[FCM] Messaging is unavailable or VAPID key missing.");
      return null;
    }

    const token = await getToken(firebaseMessaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    console.log("[FCM] Token generated:", token);
    return token;
  } catch (error) {
    console.error("[FCM] Failed to register messaging or get token:", error);
    return null;
  }
}

export async function storeFcmTokenForCurrentUser() {
  if (!isFirebaseConfigured || !auth || !auth.currentUser || !db) {
    console.log("[FCM] storeFcmTokenForCurrentUser skipped:", {
      isFirebaseConfigured,
      hasAuth: Boolean(auth),
      hasCurrentUser: Boolean(auth?.currentUser),
      hasDb: Boolean(db),
    });
    return null;
  }

  console.log("[FCM] storeFcmTokenForCurrentUser called for user:", auth.currentUser.uid, auth.currentUser.email);

  const token = await registerMessaging();
  if (!token) {
    console.log("[FCM] No token available, aborting Firestore write.");
    return null;
  }

  try {
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

    console.log("[FCM] Firestore write successful for users/", auth.currentUser.uid, "token:", token);
    return token;
  } catch (error) {
    console.error("[FCM] Firestore write failed for users/", auth.currentUser.uid, error);
    return null;
  }
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
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

    if (getNotificationPermissionState() === "granted") {
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
