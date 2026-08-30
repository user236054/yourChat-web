"use client";

import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  CheckCheck,
  LogOut,
  MessageSquareReply,
  MoreHorizontal,
  Paperclip,
  Pin,
  SendHorizontal,
  Smile,
  Trash2,
  Pencil,
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

  useEffect(() => {
    setNotificationPermission(getNotificationPermissionState());
  }, []);

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

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f5f7fb 0%, #eef3fb 100%)",
        padding: "22px 16px",
      }}
    >
      <div
        style={{
          maxWidth: 980,
          width: "100%",
          margin: "0 auto",
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 28,
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 44px)",
          minHeight: 620,
        }}
      >
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            padding: "18px 20px",
            borderBottom: "1px solid rgba(148,163,184,0.14)",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: partner.accent,
                boxShadow: `0 0 18px ${partner.accent}`,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 16 }}>{partner.name}</div>
              <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                {partnerTyping ? "Écrit..." : partnerOnline ? "En ligne" : "Hors ligne"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              clearStoredUser();
              if (isFirebaseConfigured && auth) {
                void firebaseSignOut(auth).then(() => router.push("/login"));
                return;
              }
              router.push("/login");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 12,
              background: "#f8fafc",
              color: "#0f172a",
              padding: "9px 12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <LogOut size={16} />
            Déconnexion
          </button>
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
              background: "linear-gradient(180deg, #f8fafc 0%, #f4f7fb 100%)",
            }}
          >
            {messages.length === 0 && !loadingAuth ? (
              <div
                style={{
                  placeSelf: "center",
                  textAlign: "center",
                  color: "#64748b",
                  maxWidth: 360,
                  padding: "28px 18px",
                  borderRadius: 18,
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(148,163,184,0.12)",
                }}
              >
                Aucun message pour le moment. Commencez la conversation.
              </div>
            ) : null}

            {messages.map((message) => {
              const isMine = message.sender === activeUser;
              const isDeleted = Boolean(message.isDeleted);
              const canManageOwnMessage = Boolean(
                (message.senderId && currentUserUid && message.senderId === currentUserUid) ||
                  (!message.senderId && isMine),
              );
              const referenceMessage = message.replyTo ? messageById[message.replyTo] : null;
              const bubbleText = isDeleted ? "Ce message a été supprimé" : message.text || "";

              return (
                <div
                  key={message.id}
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
                      maxWidth: "75%",
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
                          border: "1px solid rgba(148,163,184,0.16)",
                          borderRadius: 12,
                          padding: "8px 10px",
                          background: "rgba(255,255,255,0.75)",
                          color: "#334155",
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>
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
                            ? "#f8fafc"
                            : isMine
                              ? "linear-gradient(135deg, #eaf1ff 0%, #dfe9ff 100%)"
                              : "#ffffff",
                          color: isDeleted ? "#64748b" : "#0f172a",
                          borderRadius: 18,
                          padding: "12px 14px",
                          boxShadow: "0 8px 22px rgba(15, 23, 42, 0.06)",
                          border: isDeleted ? "1px dashed rgba(148,163,184,0.3)" : isMine ? "1px solid rgba(79, 124, 255, 0.14)" : "1px solid rgba(148,163,184,0.12)",
                          opacity: isDeleted ? 0.8 : 1,
                          minWidth: 0,
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
                                color: "#3453d1",
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
                            color: isDeleted ? "#94a3b8" : isMine ? "#4761bf" : "#64748b",
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>{isMine ? `envoyé · ${message.status}` : "reçu"}</span>
                          {message.editedAt ? <span style={{ color: "#64748b" }}>modifié</span> : null}
                          {isMine ? <CheckCheck size={14} /> : null}
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
                            border: "1px solid rgba(148,163,184,0.14)",
                            background: "rgba(255,255,255,0.8)",
                            color: "#334155",
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
                              background: "#ffffff",
                              border: "1px solid rgba(148,163,184,0.18)",
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
                                color: "#0f172a",
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
                                  color: "#0f172a",
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
                                color: "#0f172a",
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
            background: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(148,163,184,0.14)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Emoji"
              onClick={() => setEmojiPickerOpen((current) => !current)}
              style={{
                width: 42,
                height: 42,
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 12,
                background: "#f8fafc",
                color: "#334155",
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
                  background: "#ffffff",
                  border: "1px solid rgba(148,163,184,0.18)",
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

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileSelection}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 42,
              height: 42,
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 12,
              background: "#f8fafc",
              color: "#334155",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <Paperclip size={18} />
          </button>

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
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 14,
              background: "#f8fafc",
              color: "#0f172a",
              padding: "12px 14px",
              fontSize: 15,
              outline: "none",
              opacity: isComposerDisabled ? 0.7 : 1,
            }}
          />

          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={isComposerDisabled}
            style={{
              width: 46,
              height: 46,
              border: "none",
              borderRadius: 14,
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

      <div style={{ marginTop: 14, color: "#64748b", fontSize: 12, textAlign: "center" }}>
        Utilisateur actif : {userLabel}
      </div>
    </main>
  );
}
