export type QueuedMessage = {
  id: string;
  createdAt: number;
  sender: "me" | "friend";
  text?: string;
  status: "pending";
  replyTo?: string | null;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "file";
  fileName?: string;
  mediaDataUrl?: string | null;
  audioDuration?: number | null;
};

const STORAGE_KEY = "messagerie-prive-queued-messages";

export function loadQueuedMessages(): QueuedMessage[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueuedMessages(messages: QueuedMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function enqueueMessage(message: QueuedMessage) {
  const current = loadQueuedMessages();
  const next = [...current.filter((item) => item.id !== message.id), message];
  saveQueuedMessages(next);
  return next;
}

export function removeQueuedMessage(messageId: string) {
  const current = loadQueuedMessages();
  const next = current.filter((message) => message.id !== messageId);
  saveQueuedMessages(next);
  return next;
}

export function getQueuedMessageCount() {
  return loadQueuedMessages().length;
}
