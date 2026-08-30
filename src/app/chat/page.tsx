"use client";

import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
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
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      const storedUser = getStoredUser() ?? "me";
      setActiveUser(storedUser);
      setMessages(loadMessages());
      setLoadingAuth(false);
      return;
    }

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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <div
        style={{
          border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: 20,
          background: "#131b2d",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(148,163,184,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: partner.accent,
                boxShadow: `0 0 18px ${partner.accent}`,
              }}
            />
            <div>
              <strong>{partner.name}</strong>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>
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
              background: "transparent",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 12,
              color: "#edf2ff",
              padding: "8px 12px",
            }}
          >
            Se déconnecter
          </button>
        </header>

        <section style={{ minHeight: 440, padding: 16, display: "grid", gap: 12 }}>
          {messages.length === 0 && !loadingAuth ? (
            <div style={{ color: "#94a3b8", textAlign: "center", marginTop: 24 }}>
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
                    background: isMine
                      ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
                      : "#1a2540",
                    color: "#edf2ff",
                    borderRadius: 16,
                    padding: "10px 12px",
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.2)",
                  }}
                >
                  {message.mediaUrl ? (
                    message.mediaType === "image" ? (
                      <img
                        src={message.mediaUrl}
                        alt={message.fileName || "Image envoyée"}
                        style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 8 }}
                      />
                    ) : message.mediaType === "video" ? (
                      <video
                        src={message.mediaUrl}
                        controls
                        style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 8 }}
                      />
                    ) : (
                      <a
                        href={message.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#dbeafe", textDecoration: "underline", display: "block", marginBottom: 8 }}
                      >
                        {message.fileName || "Fichier joint"}
                      </a>
                    )
                  ) : null}

                  {message.text ? <div>{message.text}</div> : null}
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      opacity: 0.8,
                      textAlign: "right",
                    }}
                  >
                    {isMine ? `envoyé · ${message.status}` : "reçu"}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {previewUrl || selectedFile ? (
          <div style={{ padding: "0 16px 12px" }}>
            <div
              style={{
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 12,
                background: "#0b1020",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              {previewUrl ? (
                selectedFile?.type.startsWith("image/") ? (
                  <img src={previewUrl} alt="Aperçu" style={{ maxHeight: 180, objectFit: "cover", borderRadius: 8 }} />
                ) : selectedFile?.type.startsWith("video/") ? (
                  <video src={previewUrl} controls style={{ maxHeight: 180, borderRadius: 8 }} />
                ) : null
              ) : null}
              <div style={{ color: "#dfe8ff", fontSize: 12 }}>{selectedFile?.name || "Pièce jointe"}</div>
            </div>
          </div>
        ) : null}

        {uploading ? (
          <div style={{ padding: "0 16px 12px" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "#dfe8ff" }}>Téléversement Cloudinary… {uploadProgress}%</div>
              <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: "100%",
                    background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        <footer
          style={{
            padding: 16,
            borderTop: "1px solid rgba(148,163,184,0.2)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            position: "relative",
          }}
        >
          <div style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Emoji"
              style={{ padding: "0 12px", fontSize: 20, height: 42, borderRadius: 12, background: "#1a2540", border: "1px solid rgba(148,163,184,0.2)", color: "#edf2ff" }}
              onClick={() => setEmojiPickerOpen((current) => !current)}
            >
              😊
            </button>

            {emojiPickerOpen ? (
              <div
                style={{
                  position: "absolute",
                  bottom: 52,
                  left: 0,
                  zIndex: 20,
                  background: "#0b1020",
                  border: "1px solid rgba(148,163,184,0.2)",
                  borderRadius: 16,
                  boxShadow: "0 20px 45px rgba(15, 23, 42, 0.5)",
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
              padding: "0 12px",
              height: 42,
              borderRadius: 12,
              background: "#1a2540",
              color: "#edf2ff",
              border: "1px solid rgba(148,163,184,0.2)",
            }}
          >
            📎
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
            disabled={loadingAuth || !activeUser || uploading}
            style={{
              flex: 1,
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 12,
              background: "#0b1020",
              color: "#edf2ff",
              padding: "12px 14px",
              opacity: loadingAuth || !activeUser || uploading ? 0.7 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={loadingAuth || !activeUser || uploading}
            style={{
              border: "none",
              borderRadius: 12,
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "white",
              padding: "0 18px",
              height: 42,
              opacity: loadingAuth || !activeUser || uploading ? 0.7 : 1,
            }}
          >
            {uploading ? "Envoi..." : "Envoyer"}
          </button>
        </footer>
      </div>

      <div style={{ marginTop: 16, color: "#94a3b8", fontSize: 12 }}>
        Utilisateur actif : {userLabel}
      </div>
    </main>
  );
}
