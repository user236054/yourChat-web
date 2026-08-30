"use client";

import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  LogOut,
  Paperclip,
  SendHorizontal,
  Smile,
  Sparkles,
  CheckCheck,
  MessageSquareText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { clearStoredUser, getStoredUser, getUserByEmail, setStoredUser, USERS, type UserKey } from "@/lib/chat-config";
import { loadMessages, saveMessages, type ChatMessage } from "@/lib/chat-store";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import {
  markConversationMessagesAsRead,
  sendMediaMessage,
  sendTextMessage,
  setTypingState,
  subscribeToMessages,
  subscribeToTypingState,
  type FirestoreMessage,
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
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported" | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
          text: message.text || "",
          status: message.status || "sent",
          createdAt: message.createdAt?.toDate ? message.createdAt.toDate().getTime() : Date.now(),
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType || (message.type === "image" ? "image" : message.type === "video" ? "video" : message.mediaUrl ? "file" : undefined),
          fileName: message.fileName,
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

    const partnerEmail = activeUser === "me" ? USERS.friend.email : USERS.me.email;
    const unsubscribePresence = subscribeToUserPresenceByEmail(partnerEmail, (isOnline) => {
      setPartnerOnline(isOnline);
    });

    const unsubscribePresenceTracker = startPresenceTracking();

    return () => {
      unsubscribeTyping();
      unsubscribePresence();
      unsubscribePresenceTracker();
    };
  }, [activeUser]);

  const partner = activeUser === "me" ? USERS.friend : USERS.me;
  const isComposerDisabled = loadingAuth !== false || !activeUser || uploading;

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
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
      return;
    }

    if (isFirebaseConfigured && auth?.currentUser) {
      await sendTextMessage(trimmedText);
      return;
    }

    const nextMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: activeUser ?? "me",
      text: trimmedText,
      status: "sent",
      createdAt: Date.now(),
    };

    setMessages((current) => {
      const next = [...current, nextMessage];
      saveMessages(next);
      return next;
    });
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

              return (
                <div
                  key={message.id}
                  style={{
                    display: "flex",
                    justifyContent: isMine ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "75%",
                      background: isMine ? "linear-gradient(135deg, #eaf1ff 0%, #dfe9ff 100%)" : "#ffffff",
                      color: "#0f172a",
                      borderRadius: 18,
                      padding: "12px 14px",
                      boxShadow: "0 8px 22px rgba(15, 23, 42, 0.06)",
                      border: isMine ? "1px solid rgba(79, 124, 255, 0.14)" : "1px solid rgba(148,163,184,0.12)",
                    }}
                  >
                    {message.mediaUrl ? (
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

                    {message.text ? <div style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{message.text}</div> : null}
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: isMine ? "#4761bf" : "#64748b",
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>{isMine ? `envoyé · ${message.status}` : "reçu"}</span>
                      {isMine ? <CheckCheck size={14} /> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

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
            placeholder="Écrire un message..."
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
