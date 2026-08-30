import { getToken, type Messaging } from "firebase/messaging";
import { messaging } from "@/lib/firebase";

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
