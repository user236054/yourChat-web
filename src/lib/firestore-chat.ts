import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { USERS } from "@/lib/chat-config";

export type FirestoreMessage = {
  id?: string;
  senderId?: string;
  senderEmail: string;
  senderName?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "file" | null;
  fileName?: string | null;
  type: "text" | "image" | "video" | "audio" | "file" | "sticker" | "gif";
  createdAt: any;
  status?: "sent" | "read";
  replyTo?: string | null;
  editedAt?: any;
  deletedAt?: any;
  isDeleted?: boolean;
  audioDuration?: number | null;
  reactions?: Record<string, string> | null;
};

export type FirestoreConversation = {
  participants?: string[];
  typingBy?: string[];
  pinnedMessageId?: string | null;
  updatedAt?: any;
};

export const PRIVATE_CONVERSATION_ID = "private-conversation";

export function ensureConversation() {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return Promise.resolve();

  const conversationRef = doc(db, "conversations", PRIVATE_CONVERSATION_ID);
  return setDoc(
    conversationRef,
    {
      participants: [USERS.me.email, USERS.friend.email],
      typingBy: [],
      pinnedMessageId: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeToConversation(onData: (conversation: FirestoreConversation | null) => void) {
  if (!db || !isFirebaseConfigured) return () => {};

  const conversationRef = doc(db, "conversations", PRIVATE_CONVERSATION_ID);

  return onSnapshot(conversationRef, (snapshot) => {
    const data = snapshot.data() as FirestoreConversation | undefined;
    onData(data ?? null);
  });
}

export function subscribeToMessages(onData: (messages: FirestoreMessage[]) => void) {
  if (!db || !isFirebaseConfigured) return () => {};

  const q = query(
    collection(db, "conversations", PRIVATE_CONVERSATION_ID, "messages"),
    orderBy("createdAt", "asc"),
  );

  return onSnapshot(q, (snapshot) => {
    const list = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as FirestoreMessage[];

    onData(list);
  });
}

export function subscribeToTypingState(onData: (isTyping: boolean) => void) {
  if (!db || !isFirebaseConfigured) return () => {};

  const conversationRef = doc(db, "conversations", PRIVATE_CONVERSATION_ID);

  return onSnapshot(conversationRef, (snapshot) => {
    const typingBy = Array.isArray(snapshot.data()?.typingBy) ? (snapshot.data()?.typingBy as string[]) : [];
    const currentEmail = auth?.currentUser?.email?.toLowerCase();

    const isPartnerTyping = currentEmail
      ? typingBy.some((email) => typeof email === "string" && email.toLowerCase() !== currentEmail)
      : false;

    onData(isPartnerTyping);
  });
}

export async function setTypingState(isTyping: boolean) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const currentEmail = auth.currentUser.email?.toLowerCase();
  if (!currentEmail) return;

  const conversationRef = doc(db, "conversations", PRIVATE_CONVERSATION_ID);
  const snapshot = await getDoc(conversationRef);
  const currentTyping = Array.isArray(snapshot.data()?.typingBy)
    ? (snapshot.data()?.typingBy as string[])
    : [];

  const normalizedTyping = currentTyping.filter(
    (email) => typeof email === "string" && email.toLowerCase() !== currentEmail,
  );
  const nextTyping = isTyping ? [...normalizedTyping, currentEmail] : normalizedTyping;

  await setDoc(
    conversationRef,
    {
      typingBy: Array.from(new Set(nextTyping)),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function markConversationMessagesAsRead() {
  const firestoreDb = db;
  if (!firestoreDb || !auth?.currentUser?.email || !isFirebaseConfigured) return;

  const currentEmail = auth.currentUser.email.toLowerCase();
  const messagesRef = collection(firestoreDb, "conversations", PRIVATE_CONVERSATION_ID, "messages");
  const messageQuery = query(messagesRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(messageQuery);

  const unreadUpdates = snapshot.docs
    .filter((messageDoc) => {
      const message = messageDoc.data() as FirestoreMessage;
      return (
        message.senderEmail &&
        message.senderEmail.toLowerCase() !== currentEmail &&
        message.status !== "read"
      );
    })
    .map((messageDoc) =>
      updateDoc(doc(firestoreDb, "conversations", PRIVATE_CONVERSATION_ID, "messages", messageDoc.id), {
        status: "read",
      }),
    );

  await Promise.allSettled(unreadUpdates);
}

export async function sendTextMessage(text: string, options?: { replyTo?: string | null }) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  await ensureConversation();

  const messageRef = collection(db, "conversations", PRIVATE_CONVERSATION_ID, "messages");
  await addDoc(messageRef, {
    senderId: auth.currentUser.uid,
    senderEmail: auth.currentUser.email,
    senderName: auth.currentUser.displayName || auth.currentUser.email,
    text,
    type: "text",
    status: "sent",
    replyTo: options?.replyTo ?? null,
    editedAt: null,
    deletedAt: null,
    isDeleted: false,
    reactions: {},
    createdAt: serverTimestamp(),
  });
}

export async function sendMediaMessage(payload: {
  text?: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "audio" | "file";
  fileName?: string;
  replyTo?: string | null;
  audioDuration?: number | null;
}) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  await ensureConversation();

  const messageRef = collection(db, "conversations", PRIVATE_CONVERSATION_ID, "messages");
  await addDoc(messageRef, {
    senderId: auth.currentUser.uid,
    senderEmail: auth.currentUser.email,
    senderName: auth.currentUser.displayName || auth.currentUser.email,
    text: payload.text || "",
    mediaUrl: payload.mediaUrl,
    mediaType: payload.mediaType,
    fileName: payload.fileName || "Fichier joint",
    type: payload.mediaType,
    status: "sent",
    replyTo: payload.replyTo ?? null,
    editedAt: null,
    deletedAt: null,
    isDeleted: false,
    audioDuration: payload.mediaType === "audio" ? payload.audioDuration ?? null : null,
    reactions: {},
    createdAt: serverTimestamp(),
  });
}

export async function updateMessageText(messageId: string, nextText: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const ref = doc(db, "conversations", PRIVATE_CONVERSATION_ID, "messages", messageId);
  await updateDoc(ref, {
    text: nextText,
    editedAt: serverTimestamp(),
    isDeleted: false,
    deletedAt: null,
  });
}

export async function deleteMessage(messageId: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const ref = doc(db, "conversations", PRIVATE_CONVERSATION_ID, "messages", messageId);
  await updateDoc(ref, {
    text: "Ce message a été supprimé",
    mediaUrl: null,
    mediaType: null,
    fileName: null,
    isDeleted: true,
    deletedAt: serverTimestamp(),
  });
}

export async function pinMessage(messageId: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const conversationRef = doc(db, "conversations", PRIVATE_CONVERSATION_ID);
  await setDoc(
    conversationRef,
    {
      pinnedMessageId: messageId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function unpinMessage() {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const conversationRef = doc(db, "conversations", PRIVATE_CONVERSATION_ID);
  await setDoc(
    conversationRef,
    {
      pinnedMessageId: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function toggleMessageReaction(messageId: string, emoji: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const ref = doc(db, "conversations", PRIVATE_CONVERSATION_ID, "messages", messageId);
  const snapshot = await getDoc(ref);
  const currentReactions = (snapshot.data()?.reactions as Record<string, string> | undefined) ?? {};
  const nextReactions = { ...currentReactions };

  if (nextReactions[auth.currentUser.uid] === emoji) {
    delete nextReactions[auth.currentUser.uid];
  } else {
    nextReactions[auth.currentUser.uid] = emoji;
  }

  await updateDoc(ref, {
    reactions: nextReactions,
  });
}

export async function markMessageAsRead(messageId: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const ref = doc(db, "conversations", PRIVATE_CONVERSATION_ID, "messages", messageId);
  await updateDoc(ref, { status: "read" });
}
