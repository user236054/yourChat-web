import { onDisconnect, onValue, ref, serverTimestamp, set, update } from "firebase/database";
import { auth, database, isFirebaseConfigured } from "@/lib/firebase";

export type PresenceStatus = {
  state: "online" | "offline";
  updatedAt: number | null;
  email?: string | null;
};

export function startPresenceTracking() {
  if (!database || !auth?.currentUser || !isFirebaseConfigured) {
    return () => {};
  }

  const userId = auth.currentUser.uid;
  const userEmail = auth.currentUser.email ?? null;
  const statusRef = ref(database, `status/${userId}`);

  const setOnline = () => {
    const now = Date.now();
    set(statusRef, {
      state: "online",
      updatedAt: now,
      email: userEmail,
    });
  };

  const setOffline = () => {
    const now = Date.now();
    update(statusRef, {
      state: "offline",
      updatedAt: now,
      email: userEmail,
    });
  };

  setOnline();
  onDisconnect(statusRef).set({
    state: "offline",
    updatedAt: serverTimestamp(),
    email: userEmail,
  });

  const heartbeat = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      setOnline();
    }
  }, 30000);

  const visibilityHandler = () => {
    if (document.visibilityState === "visible") {
      setOnline();
    } else {
      setOffline();
    }
  };

  document.addEventListener("visibilitychange", visibilityHandler);

  return () => {
    document.removeEventListener("visibilitychange", visibilityHandler);
    window.clearInterval(heartbeat);
    setOffline();
  };
}

export function subscribeToUserPresenceByEmail(email: string | null, onChange: (isOnline: boolean) => void) {
  if (!database || !email) {
    onChange(false);
    return () => {};
  }

  const userPath = ref(database, "status");
  return onValue(userPath, (snapshot) => {
    const statusMap = snapshot.val() ?? {};
    const onlineUser = Object.values(statusMap as Record<string, PresenceStatus>).find(
      (entry) => entry?.email?.toLowerCase() === email.toLowerCase() && entry.state === "online",
    );
    onChange(Boolean(onlineUser));
  });
}
