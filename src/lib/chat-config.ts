export const USERS = {
  me: {
    id: "me",
    name: "Moi",
    email: process.env.NEXT_PUBLIC_APP_USER_ME_EMAIL || "me@example.com",
    accent: "#8b5cf6",
    photoURL: null as string | null,
  },
  friend: {
    id: "friend",
    name: "Ami",
    email: process.env.NEXT_PUBLIC_APP_USER_FRIEND_EMAIL || "friend@example.com",
    accent: "#22c55e",
    photoURL: null as string | null,
  },
} as const;

export type UserKey = keyof typeof USERS;

export const ACTIVE_USER_KEY = "messagerie-prive-active-user";
export const PRIVATE_CHAT_ID = "private-conversation";

export function getStoredUser(): UserKey | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(ACTIVE_USER_KEY);
  return stored && stored in USERS ? (stored as UserKey) : null;
}

export function setStoredUser(userKey: UserKey) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_USER_KEY, userKey);
}

export function clearStoredUser() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_USER_KEY);
}

export function getUserByEmail(email: string | null | undefined): UserKey | null {
  if (!email) return null;

  const entries = Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][];
  const match = entries.find(([, user]) => user.email.toLowerCase() === email.toLowerCase());
  return match?.[0] ?? null;
}

export function getFixedUsers() {
  return Object.keys(USERS) as UserKey[];
}
