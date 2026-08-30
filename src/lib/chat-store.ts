import { PRIVATE_CHAT_ID, USERS, type UserKey } from "@/lib/chat-config";

export type ChatMessage = {
  id: string;
  sender: UserKey;
  text: string;
  status: "sent" | "read";
  createdAt: number;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "file";
  fileName?: string;
};

const STORAGE_KEY = `messagerie-prive-${PRIVATE_CHAT_ID}`;

const defaultMessages: ChatMessage[] = [
  { id: "1", sender: "friend", text: "Salut !", status: "read", createdAt: Date.now() - 120000 },
  { id: "2", sender: "me", text: "Ça marche, on peut parler ici.", status: "read", createdAt: Date.now() - 90000 },
];

export function loadMessages(): ChatMessage[] {
  if (typeof window === "undefined") {
    return defaultMessages;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultMessages;

    const parsed = JSON.parse(saved) as ChatMessage[];
    return Array.isArray(parsed) && parsed.length ? parsed : defaultMessages;
  } catch {
    return defaultMessages;
  }
}

export function saveMessages(messages: ChatMessage[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function getPartner(userKey: UserKey) {
  return userKey === "me" ? USERS.friend : USERS.me;
}
