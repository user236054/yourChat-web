"use client";

import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  Check,
  CheckCheck,
  LogOut,
  MessageSquareReply,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  Smile,
  SunMedium,
  Trash2,
  Pencil,
  Video,
  X,
  PinOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { clearStoredUser, getStoredUser, getUserByEmail, setStoredUser, USERS, type UserKey } from "@/lib/chat-config";
import { loadMessages, saveMessages, type ChatMessage } from "@/lib/chat-store";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import {
  deleteMessage,
  markConversationMessagesAsRead,
  pinMessage,
  sendMediaMessage,
  sendTextMessage,
  setTypingState,
  subscribeToConversation,
  subscribeToMessages,
  subscribeToTypingState,
  type FirestoreMessage,
  unpinMessage,
  updateMessageText,
} from "@/lib/firestore-chat";
import { startPresenceTracking, subscribeToUserPresenceByEmail } from "@/lib/presence";
import {
  attachForegroundMessageListener,
  getNotificationPermissionState,
  storeFcmTokenForCurrentUser,
} from "@/lib/notifications";
import { uploadToCloudinary } from "@/lib/cloudinary";
import Picker from "emoji-picker-react";

export default function ChatPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [activeUser, setActiveUser] = useState<UserKey | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState<boolean | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setNotificationPermission(getNotificationPermissionState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem("messagerie-prive-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("messagerie-prive-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      const storedUser = getStoredUser() ?? "me";
      setActiveUser(storedUser);
      setMessages(loadMessages());
      setLoadingAuth(false);
      return;
    }

    setLoadingAuth(true);

    const firebaseAuth = auth;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const matchedUser = getUserByEmail(user.email);
      if (!matchedUser) {
        if (auth) {
          void firebaseSignOut(auth);
        }
        router.push("/login");
        return;
      }

      setActiveUser(matchedUser);
      setStoredUser(matchedUser);
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !activeUser) {
      if (!isFirebaseConfigured) {
        saveMessages(messages);
      }
      return;
    }

    const unsubscribe = subscribeToMessages((nextMessages: FirestoreMessage[]) => {
      const normalized: ChatMessage[] = nextMessages
        .map((message) => ({
          id: message.id || crypto.randomUUID(),
          sender: getUserByEmail(message.senderEmail) ?? "me",
          senderId: message.senderId ?? message.senderEmail,
          text: message.text || "",
          status: message.status || "sent",
          createdAt: message.createdAt?.toDate ? message.createdAt.toDate().getTime() : Date.now(),
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType || (message.type === "image" ? "image" : message.type === "video" ? "video" : message.mediaUrl ? "file" : undefined),
          fileName: message.fileName,
          replyTo: message.replyTo ?? null,
          editedAt: message.editedAt?.toDate ? message.editedAt.toDate().getTime() : null,
          isDeleted: Boolean(message.isDeleted),
          deletedAt: message.deletedAt?.toDate ? message.deletedAt.toDate().getTime() : null,
          senderEmail: message.senderEmail,
        }))
        .sort((a, b) => a.createdAt - b.createdAt);

      setMessages(normalized);
      void markConversationMessagesAsRead();
    });

    return () => unsubscribe();
  }, [activeUser]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !activeUser) {
      setPartnerTyping(false);
      setPartnerOnline(false);
      return;
    }

    void storeFcmTokenForCurrentUser();
    void attachForegroundMessageListener();

    const unsubscribeTyping = subscribeToTypingState((isTyping) => {
      setPartnerTyping(isTyping);
    });

    const unsubscribeConversation = subscribeToConversation((conversation) => {
      setPinnedMessageId(conversation?.pinnedMessageId ?? null);
    });

    const partnerEmail = activeUser === "me" ? USERS.friend.email : USERS.me.email;
    const unsubscribePresence = subscribeToUserPresenceByEmail(partnerEmail, (isOnline) => {
      setPartnerOnline(isOnline);
    });

    const unsubscribePresenceTracker = startPresenceTracking();

    return () => {
      unsubscribeTyping();
      unsubscribeConversation();
      unsubscribePresence();
      unsubscribePresenceTracker();
    };
  }, [activeUser]);

  const partner = activeUser === "me" ? USERS.friend : USERS.me;
  const isComposerDisabled = loadingAuth !== false || !activeUser || uploading;
  const currentUserUid = auth?.currentUser?.uid;
  const messageById = Object.fromEntries(messages.map((message) => [message.id, message]));
  const pinnedMessage = pinnedMessageId ? messageById[pinnedMessageId] : null;
  const replyMessage = replyToMessageId ? messageById[replyToMessageId] : null;
  const palette = theme === "dark"
    ? {
        pageBg: "#0f172a",
        panelBg: "rgba(15, 23, 42, 0.92)",
        appBg: "#111827",
        headerBg: "rgba(17, 24, 39, 0.9)",
        surface: "#1f2937",
        surfaceSoft: "#111827",
        surfaceAlt: "#0b1220",
        border: "rgba(148, 163, 184, 0.18)",
        text: "#e5eefb",
        textMuted: "#94a3b8",
        messageIncoming: "#1f2937",
        messageOutgoing: "linear-gradient(135deg, #4f46e5 0%, #8b5cf6 100%)",
        composerBg: "#111827",
        inputBg: "#0b1220",
        accent: "#8b5cf6",
        accentSoft: "#312e81",
        bubbleShadow: "0 8px 18px rgba(15, 23, 42, 0.28)",
        floating: "rgba(17, 24, 39, 0.95)",
      }
    : {
        pageBg: "linear-gradient(180deg, #f5f7fb 0%, #eef3fb 100%)",
        panelBg: "rgba(255,255,255,0.92)",
        appBg: "#f3f4f6",
        headerBg: "rgba(255,255,255,0.88)",
        surface: "#ffffff",
        surfaceSoft: "#f8fafc",
        surfaceAlt: "#eef2ff",
        border: "rgba(148, 163, 184, 0.18)",
        text: "#0f172a",
        textMuted: "#64748b",
        messageIncoming: "#ffffff",
        messageOutgoing: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        composerBg: "rgba(255,255,255,0.96)",
        inputBg: "#f8fafc",
        accent: "#6d5efc",
        accentSoft: "#ede9fe",
        bubbleShadow: "0 8px 22px rgba(15, 23, 42, 0.06)",
        floating: "rgba(255,255,255,0.96)",
      };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setSelectedFile(null);
      setPreviewUrl(null);
      event.target.value = "";
      alert("Le fichier dépasse la limite de 10 Mo.");
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const resetComposer = () => {
    setDraft("");
    setReplyToMessageId(null);
    setEditingMessageId(null);
    setMenuOpenId(null);
  };

  const sendMessage = async () => {
    const hasContent = Boolean(draft.trim()) || Boolean(selectedFile);
    if (!hasContent || uploading) return;

    const trimmedText = draft.trim();
    setDraft("");
    void setTypingState(false);

    if (selectedFile) {
      try {
        setUploading(true);
        const cloudResult = await uploadToCloudinary(selectedFile, setUploadProgress);

        if (isFirebaseConfigured && auth?.currentUser) {
          await sendMediaMessage({
            text: trimmedText,
            mediaUrl: cloudResult.url,
            mediaType: cloudResult.type,
            fileName: cloudResult.fileName,
            replyTo: replyToMessageId ?? null,
          });
        } else {
          const nextMessage: ChatMessage = {
            id: crypto.randomUUID(),
            sender: activeUser ?? "me",
            text: trimmedText,
            status: "sent",
            createdAt: Date.now(),
            mediaUrl: cloudResult.url,
            mediaType: cloudResult.type,
            fileName: cloudResult.fileName,
            replyTo: replyToMessageId ?? null,
          };

          setMessages((current) => {
            const next = [...current, nextMessage];
            saveMessages(next);
            return next;
          });
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : "Le fichier n’a pas pu être envoyé.");
      } finally {
        setUploadProgress(0);
        setUploading(false);
        setSelectedFile(null);
        setPreviewUrl(null);
        setReplyToMessageId(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
      return;
    }

    if (editingMessageId) {
      if (isFirebaseConfigured && auth?.currentUser) {
        await updateMessageText(editingMessageId, trimmedText);
      }
      resetComposer();
      return;
    }

    if (isFirebaseConfigured && auth?.currentUser) {
      await sendTextMessage(trimmedText, { replyTo: replyToMessageId ?? null });
      resetComposer();
      return;
    }

    const nextMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: activeUser ?? "me",
      text: trimmedText,
      status: "sent",
      createdAt: Date.now(),
      replyTo: replyToMessageId ?? null,
    };

    setMessages((current) => {
      const next = [...current, nextMessage];
      saveMessages(next);
      return next;
    });
    resetComposer();
  };

  const beginEditMessage = (message: ChatMessage) => {
    if (!message.text || message.isDeleted) return;
    setEditingMessageId(message.id);
    setReplyToMessageId(null);
    setDraft(message.text);
    setMenuOpenId(null);
    inputRef.current?.focus();
  };

  const beginReplyMessage = (messageId: string) => {
    setReplyToMessageId(messageId);
    setEditingMessageId(null);
    setMenuOpenId(null);
    inputRef.current?.focus();
  };

  const handleDeleteMessage = async (messageId: string) => {
    const shouldDelete = window.confirm("Supprimer ce message ? Il sera remplacé par \"Ce message a été supprimé\".");
    if (!shouldDelete) return;

    if (isFirebaseConfigured && auth?.currentUser) {
      await deleteMessage(messageId);
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, isDeleted: true, deletedAt: Date.now(), text: "Ce message a été supprimé" }
            : message,
        ),
      );
    }

    setMenuOpenId(null);
  };

  const handlePinMessage = async (messageId: string) => {
    if (isFirebaseConfigured && auth?.currentUser) {
      await pinMessage(messageId);
    }
    setMenuOpenId(null);
  };

  const handleScrollToMessage = (messageId: string) => {
    const node = messageRefs.current[messageId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      node.style.outline = "2px solid rgba(79, 124, 255, 0.7)";
      node.style.outlineOffset = "4px";
      window.setTimeout(() => {
        if (node) {
          node.style.outline = "none";
          node.style.outlineOffset = "0";
        }
      }, 1200);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !activeUser) {
      return;
    }

    if (!draft.trim()) {
      void setTypingState(false);
      return;
    }

    void setTypingState(true);
    const timer = window.setTimeout(() => {
      void setTypingState(false);
    }, 900);

    return () => {
      window.clearTimeout(timer);
      void setTypingState(false);
    };
  }, [draft, activeUser]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    const closeMenu = () => setMenuOpenId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const userLabel = activeUser ? USERS[activeUser].name : "Connexion...";

  const handleEmojiSelect = (emojiData: { emoji: string }) => {
    const insertion = emojiData.emoji;
    const input = inputRef.current;
    const nextValue = (() => {
      if (!input) {
        return `${draft}${insertion}`;
      }

      const start = input.selectionStart ?? draft.length;
      const end = input.selectionEnd ?? draft.length;
      const before = draft.slice(0, start);
      const after = draft.slice(end);
      return `${before}${insertion}${after}`;
    })();

    setDraft(nextValue);
    setEmojiPickerOpen(false);

    requestAnimationFrame(() => {
      const nextInput = inputRef.current;
      if (!nextInput) return;

      const cursorPosition = (draft.slice(0, input?.selectionStart ?? draft.length).length ?? 0) + insertion.length;
      nextInput.focus();
      nextInput.setSelectionRange(cursorPosition, cursorPosition);
    });
  };

  const getQuotedText = (message: ChatMessage | undefined) => {
    if (!message) return "Message supprimé";
    if (message.isDeleted) return "Ce message a été supprimé";
    if (message.mediaUrl) return message.fileName || "Pièce jointe";
    return message.text || "Pièce jointe";
  };

  const headerActionStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 12,
    border: `1px solid ${palette.border}`,
    background: theme === "dark" ? "rgba(15, 23, 42, 0.9)" : "#f8fafc",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    opacity: 0.9,
  };

  return (
    <main
      style={{
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        background: palette.pageBg,
        padding: 0,
        margin: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: palette.panelBg,
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            padding: "16px 18px",
            borderBottom: `1px solid ${palette.border}`,
            background: palette.headerBg,
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            color: palette.text,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: partner.accent,
                display: "grid",
                placeItems: "center",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
                position: "relative",
                boxShadow: `0 10px 24px ${partner.accent}55`,
              }}
            >
              {partner.name.charAt(0).toUpperCase()}
              <span
                style={{
                  position: "absolute",
                  right: 1,
                  bottom: 1,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: partnerOnline ? "#22c55e" : "#94a3b8",
                  border: `2px solid ${theme === "dark" ? "#0f172a" : "#ffffff"}`,
                  boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.16)",
                }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: palette.text, fontWeight: 700, fontSize: 16 }}>{partner.name}</div>
              <div style={{ color: palette.textMuted, fontSize: 12, marginTop: 2 }}>
                {partnerTyping ? "Écrit..." : partnerOnline ? "En ligne" : "Hors ligne"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" aria-label="Recherche" style={{ ...headerActionStyle, color: palette.textMuted }} disabled>
              <Search size={16} />
            </button>
            <button type="button" aria-label="Appel audio" style={{ ...headerActionStyle, color: palette.textMuted }} disabled>
              <Phone size={16} />
            </button>
            <button type="button" aria-label="Appel vidéo" style={{ ...headerActionStyle, color: palette.textMuted }} disabled>
              <Video size={16} />
            </button>
            <button
              type="button"
              aria-label="Menu du contact"
              onClick={() => setMenuOpenId((current) => (current === "header" ? null : "header"))}
              style={{ ...headerActionStyle, color: palette.textMuted }}
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </header>

        {pinnedMessage ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: "#eff6ff",
              borderBottom: "1px solid rgba(148,163,184,0.12)",
              padding: "10px 18px",
              color: "#1e3a8a",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Pin size={15} />
              <span>Message épinglé</span>
            </div>
            <button
              type="button"
              onClick={() => void unpinMessage()}
              style={{
                border: "none",
                background: "transparent",
                color: "#1e3a8a",
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <PinOff size={14} />
              Désépingler
            </button>
          </div>
        ) : null}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <section
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "22px 18px",
              display: "grid",
              gap: 14,
              background: palette.pageBg,
            }}
          >
            {messages.length === 0 && !loadingAuth ? (
              <div
                style={{
                  placeSelf: "center",
                  textAlign: "center",
                  color: palette.textMuted,
                  maxWidth: 360,
                  padding: "28px 18px",
                  borderRadius: 18,
                  background: palette.surface,
                  border: `1px solid ${palette.border}`,
                  boxShadow: palette.bubbleShadow,
                }}
              >
                Aucun message pour le moment. Commencez la conversation.
              </div>
            ) : null}

            {messages.map((message, index) => {
              const isMine = message.sender === activeUser;
              const isDeleted = Boolean(message.isDeleted);
              const canManageOwnMessage = Boolean(
                (message.senderId && currentUserUid && message.senderId === currentUserUid) ||
                  (!message.senderId && isMine),
              );
              const referenceMessage = message.replyTo ? messageById[message.replyTo] : null;
              const bubbleText = isDeleted ? "Ce message a été supprimé" : message.text || "";
              const previousMessage = index > 0 ? messages[index - 1] : null;
              const showDateSeparator = !previousMessage || new Date(previousMessage.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
              const readableTime = new Date(message.createdAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div key={message.id} style={{ display: "grid", gap: 10 }}>
                  {showDateSeparator ? (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          background: theme === "dark" ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.08)",
                          color: palette.textMuted,
                          borderRadius: 999,
                          padding: "6px 12px",
                          fontSize: 11,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          border: `1px solid ${palette.border}`,
                        }}
                      >
                        {new Date(message.createdAt).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: isMine ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      ref={(node) => {
                        if (node) {
                          messageRefs.current[message.id] = node;
                        }
                      }}
                      style={{
                        maxWidth: "76%",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {referenceMessage ? (
                        <button
                          type="button"
                          onClick={() => handleScrollToMessage(referenceMessage.id || "")}
                          style={{
                            textAlign: "left",
                            alignSelf: isMine ? "flex-end" : "flex-start",
                            maxWidth: "90%",
                            border: `1px solid ${palette.border}`,
                            borderRadius: 12,
                            padding: "8px 10px",
                            background: theme === "dark" ? "rgba(15, 23, 42, 0.72)" : "rgba(255,255,255,0.72)",
                            color: palette.text,
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ color: palette.textMuted, fontSize: 11, marginBottom: 4 }}>
                            Réponse à {referenceMessage.sender === activeUser ? "vous" : partner.name}
                          </div>
                          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {getQuotedText(referenceMessage)}
                          </div>
                        </button>
                      ) : null}

                      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div
                          style={{
                            flex: 1,
                            background: isDeleted
                              ? theme === "dark" ? "rgba(148, 163, 184, 0.1)" : "#f8fafc"
                              : isMine
                                ? palette.messageOutgoing
                                : palette.messageIncoming,
                            color: isDeleted ? palette.textMuted : isMine ? "#ffffff" : palette.text,
                            borderRadius: isMine ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                            padding: "12px 14px",
                            boxShadow: palette.bubbleShadow,
                            border: isDeleted ? "1px dashed rgba(148,163,184,0.3)" : "1px solid transparent",
                            opacity: isDeleted ? 0.8 : 1,
                            minWidth: 0,
                            maxWidth: "100%",
                          }}
                        >
                          {message.mediaUrl && !isDeleted ? (
                            message.mediaType === "image" ? (
                              <img
                                src={message.mediaUrl}
                                alt={message.fileName || "Image envoyée"}
                                style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 8, display: "block" }}
                              />
                            ) : message.mediaType === "video" ? (
                              <video
                                src={message.mediaUrl}
                                controls
                                style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 8, display: "block" }}
                              />
                            ) : (
                              <a
                                href={message.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: isMine ? "#ffffff" : "#3453d1",
                                  textDecoration: "underline",
                                  display: "block",
                                  marginBottom: 8,
                                  wordBreak: "break-all",
                                }}
                              >
                                {message.fileName || "Fichier joint"}
                              </a>
                            )
                          ) : null}

                          {bubbleText ? <div style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{bubbleText}</div> : null}

                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 11,
                              color: isDeleted ? palette.textMuted : isMine ? "rgba(255,255,255,0.8)" : palette.textMuted,
                              display: "flex",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              gap: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <span>{readableTime}</span>
                            {message.editedAt ? <span>• modifié</span> : null}
                            {isMine ? (
                              message.status === "read" ? <CheckCheck size={12} /> : <Check size={12} />
                            ) : null}
                          </div>
                        </div>

                        <div style={{ position: "relative" }} onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            aria-label="Actions du message"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMenuOpenId((current) => (current === message.id ? null : message.id));
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: `1px solid ${palette.border}`,
                              background: theme === "dark" ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.8)",
                              color: palette.text,
                              display: "grid",
                              placeItems: "center",
                              cursor: "pointer",
                            }}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {menuOpenId === message.id ? (
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: 36,
                                zIndex: 20,
                                minWidth: 180,
                                background: palette.floating,
                                border: `1px solid ${palette.border}`,
                                borderRadius: 14,
                                boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
                                padding: 8,
                                display: "grid",
                                gap: 4,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => beginReplyMessage(message.id)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  background: "transparent",
                                  border: "none",
                                  color: palette.text,
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                              >
                                <MessageSquareReply size={14} />
                                Répondre
                              </button>
                              {!isDeleted && canManageOwnMessage ? (
                                <button
                                  type="button"
                                  onClick={() => beginEditMessage(message)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    background: "transparent",
                                    border: "none",
                                    color: palette.text,
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    textAlign: "left",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Pencil size={14} />
                                  Modifier
                                </button>
                              ) : null}
                              {!isDeleted && canManageOwnMessage ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(message.id)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    background: "transparent",
                                    border: "none",
                                    color: "#dc2626",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    textAlign: "left",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Trash2 size={14} />
                                  Supprimer
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  if (pinnedMessageId === message.id) {
                                    void unpinMessage();
                                  } else {
                                    void handlePinMessage(message.id);
                                  }
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  background: "transparent",
                                  border: "none",
                                  color: palette.text,
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                              >
                                {pinnedMessageId === message.id ? <PinOff size={14} /> : <Pin size={14} />}
                                {pinnedMessageId === message.id ? "Désépingler" : "Épingler"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {replyMessage || editingMessageId ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                borderTop: "1px solid rgba(148,163,184,0.12)",
                padding: "12px 18px 0",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid rgba(148,163,184,0.14)",
                  borderRadius: 12,
                  padding: "8px 10px",
                  color: "#334155",
                  fontSize: 12,
                  maxWidth: "80%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {editingMessageId ? "Modification du message" : `Réponse à ${replyMessage ? getQuotedText(replyMessage) : "message"}`}
              </div>
              <button
                type="button"
                onClick={resetComposer}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.14)",
                  background: "transparent",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

          {previewUrl || selectedFile ? (
            <div style={{ padding: "0 18px 12px" }}>
              <div
                style={{
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: 16,
                  background: "#ffffff",
                  padding: 12,
                  display: "grid",
                  gap: 8,
                  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
                }}
              >
                {previewUrl ? (
                  selectedFile?.type.startsWith("image/") ? (
                    <img src={previewUrl} alt="Aperçu" style={{ maxHeight: 180, objectFit: "cover", borderRadius: 10, width: "100%" }} />
                  ) : selectedFile?.type.startsWith("video/") ? (
                    <video src={previewUrl} controls style={{ maxHeight: 180, borderRadius: 10, width: "100%" }} />
                  ) : null
                ) : null}
                <div style={{ color: "#334155", fontSize: 12, fontWeight: 600 }}>{selectedFile?.name || "Pièce jointe"}</div>
              </div>
            </div>
          ) : null}

          {uploading ? (
            <div style={{ padding: "0 18px 12px" }}>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ color: "#334155", fontSize: 12, fontWeight: 600 }}>
                  Téléversement Cloudinary… {uploadProgress}%
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${uploadProgress}%`,
                      height: "100%",
                      background: "linear-gradient(135deg, #4f7cff 0%, #6d5efc 100%)",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 10,
            background: palette.composerBg,
            backdropFilter: "blur(12px)",
            borderTop: `1px solid ${palette.border}`,
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            type="button"
            aria-label="Ajouter une pièce jointe"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 38,
              height: 38,
              border: "none",
              borderRadius: "50%",
              background: theme === "dark" ? "rgba(139, 92, 246, 0.18)" : "#ede9fe",
              color: palette.accent,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              boxShadow: "inset 0 0 0 1px rgba(139,92,246,0.15)",
            }}
          >
            <Plus size={18} />
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Emoji"
              onClick={() => setEmojiPickerOpen((current) => !current)}
              style={{
                width: 38,
                height: 38,
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 12,
                background: theme === "dark" ? "#0f172a" : "#f8fafc",
                color: palette.text,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <Smile size={18} />
            </button>

            {emojiPickerOpen ? (
              <div
                style={{
                  position: "absolute",
                  bottom: 54,
                  left: 0,
                  zIndex: 40,
                  background: palette.floating,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 18,
                  boxShadow: "0 24px 52px rgba(15, 23, 42, 0.12)",
                  overflow: "hidden",
                }}
              >
                <Picker
                  onEmojiClick={handleEmojiSelect}
                  autoFocusSearch={false}
                  searchPlaceHolder="Rechercher"
                  skinTonesDisabled
                  width={320}
                  height={360}
                  previewConfig={{ showPreview: false }}
                />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 38,
              height: 38,
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 12,
              background: theme === "dark" ? "#0f172a" : "#f8fafc",
              color: palette.text,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <Paperclip size={18} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileSelection}
            style={{ display: "none" }}
          />

          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void sendMessage();
              }
            }}
            placeholder={editingMessageId ? "Modifier le message..." : "Écrire un message..."}
            disabled={isComposerDisabled}
            style={{
              flex: 1,
              border: `1px solid ${palette.border}`,
              borderRadius: 18,
              background: theme === "dark" ? "#0b1220" : "#f8fafc",
              color: palette.text,
              padding: "12px 14px",
              fontSize: 15,
              outline: "none",
              opacity: isComposerDisabled ? 0.7 : 1,
            }}
          />

          <button
            type="button"
            aria-label="Basculer le thème"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            style={{
              width: 38,
              height: 38,
              border: `1px solid ${palette.border}`,
              borderRadius: 12,
              background: theme === "dark" ? "#0b1220" : "#f8fafc",
              color: palette.text,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? <SunMedium size={16} /> : <Moon size={16} />}
          </button>

          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={isComposerDisabled}
            style={{
              width: 42,
              height: 42,
              border: "none",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #4f7cff 0%, #6d5efc 100%)",
              color: "#ffffff",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 14px 28px rgba(79, 124, 255, 0.22)",
              cursor: isComposerDisabled ? "not-allowed" : "pointer",
              opacity: isComposerDisabled ? 0.7 : 1,
            }}
          >
            <SendHorizontal size={18} />
          </button>
        </footer>
      </div>

    </main>
  );
}
