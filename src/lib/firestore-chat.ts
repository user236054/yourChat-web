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
  senderEmail: string;
  senderName?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "file";
  fileName?: string;
  type: "text" | "image" | "video" | "file" | "sticker" | "gif";
  createdAt: any;
  status?: "sent" | "read";
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
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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

export async function sendTextMessage(text: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  await ensureConversation();

  const messageRef = collection(db, "conversations", PRIVATE_CONVERSATION_ID, "messages");
  await addDoc(messageRef, {
    senderEmail: auth.currentUser.email,
    senderName: auth.currentUser.displayName || auth.currentUser.email,
    text,
    type: "text",
    status: "sent",
    createdAt: serverTimestamp(),
  });
}

export async function sendMediaMessage(payload: {
  text?: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "file";
  fileName?: string;
}) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  await ensureConversation();

  const messageRef = collection(db, "conversations", PRIVATE_CONVERSATION_ID, "messages");
  await addDoc(messageRef, {
    senderEmail: auth.currentUser.email,
    senderName: auth.currentUser.displayName || auth.currentUser.email,
    text: payload.text || "",
    mediaUrl: payload.mediaUrl,
    mediaType: payload.mediaType,
    fileName: payload.fileName || "Fichier joint",
    type: payload.mediaType,
    status: "sent",
    createdAt: serverTimestamp(),
  });
}

export async function markMessageAsRead(messageId: string) {
  if (!db || !auth?.currentUser || !isFirebaseConfigured) return;

  const ref = doc(db, "conversations", PRIVATE_CONVERSATION_ID, "messages", messageId);
  await updateDoc(ref, { status: "read" });
}
