"use client";

import { onAuthStateChanged, signOut as firebaseSignOut, updateProfile } from "firebase/auth";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Check,
  CheckCheck,
  ImagePlus,
  LogOut,
  Menu,
  MessageSquareReply,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Paperclip,
  Phone,
  Pin,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  Smile,
  Square,
  SunMedium,
  Trash2,
  Pencil,
  UserCircle2,
  Video,
  X,
  PinOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { clearStoredUser, getStoredUser, getUserByEmail, setStoredUser, USERS, type UserKey } from "@/lib/chat-config";
import { loadMessages, saveMessages, type ChatMessage } from "@/lib/chat-store";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
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
import { compressImageFile, isCloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";
import { extractUrls, fetchLinkPreview, type LinkPreview } from "@/lib/link-preview";
import { enqueueMessage, getQueuedMessageCount, loadQueuedMessages, removeQueuedMessage } from "@/lib/offline-queue";
import Picker from "emoji-picker-react";

type VoiceNotePlayerProps = {
  src: string;
  title?: string;
  duration?: number | null;
  isMine: boolean;
  theme: "light" | "dark";
};

function formatTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function VoiceNotePlayer({ src, title, duration, isMine, theme }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const waveformBars = useRef(Array.from({ length: 26 }, (_, index) => 18 + ((index * 13) % 42) + (index % 4) * 8));

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : duration ?? 0;
      setAudioDuration(nextDuration);
      setCurrentTime(0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [duration, src]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, [src]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerUp = () => setIsDragging(false);
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [isDragging]);

  const totalDuration = audioDuration > 0 ? audioDuration : duration ?? 0;
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const seekToPosition = (clientX: number) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || totalDuration <= 0) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const nextTime = ratio * totalDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Voice playback failed", error);
      }
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  const handleSpeedCycle = () => {
    const nextSpeeds = [1, 1.5, 2];
    const currentIndex = nextSpeeds.indexOf(playbackRate);
    const nextRate = nextSpeeds[(currentIndex + 1) % nextSpeeds.length];
    setPlaybackRate(nextRate);
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        minWidth: 260,
        width: "100%",
        borderRadius: 16,
        padding: isMine ? "12px 12px 10px" : "12px 12px 10px",
        background: isMine
          ? "linear-gradient(135deg, rgba(79,70,229,0.98) 0%, rgba(124,58,237,0.96) 100%)"
          : theme === "dark"
            ? "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.92) 100%)"
            : "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.98) 100%)",
        border: isMine ? "1px solid rgba(255,255,255,0.18)" : theme === "dark" ? "1px solid rgba(148,163,184,0.18)" : "1px solid rgba(148,163,184,0.18)",
        boxShadow: isMine
          ? "0 14px 26px rgba(79, 70, 229, 0.24)"
          : theme === "dark"
            ? "0 12px 22px rgba(15, 23, 42, 0.24)"
            : "0 12px 22px rgba(148, 163, 184, 0.18)",
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={() => void togglePlayback()}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            border: "none",
            background: isMine
              ? "rgba(255,255,255,0.18)"
              : theme === "dark"
                ? "linear-gradient(135deg, rgba(139,92,246,0.26), rgba(168,85,247,0.2))"
                : "linear-gradient(135deg, rgba(79,70,229,0.12), rgba(168,85,247,0.1))",
            color: isMine ? "#ffffff" : theme === "dark" ? "#ddd6fe" : "#4f46e5",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            boxShadow: isMine ? "0 8px 18px rgba(15, 23, 42, 0.18)" : "0 8px 18px rgba(79, 70, 229, 0.12)",
          }}
          aria-label={isPlaying ? "Pause" : "Lecture"}
        >
          {isPlaying ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gap: 4, flex: 1, minWidth: 0 }}>
            <div style={{ color: isMine ? "rgba(255,255,255,0.92)" : theme === "dark" ? "#e2e8f0" : "#1e293b", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {title || "Message vocal"}
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, color: isMine ? "rgba(255,255,255,0.75)" : theme === "dark" ? "#cbd5e1" : "#475569" }}>
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSpeedCycle}
            style={{
              border: isMine ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(148,163,184,0.2)",
              background: isMine ? "rgba(255,255,255,0.1)" : theme === "dark" ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.9)",
              color: isMine ? "#ffffff" : theme === "dark" ? "#e2e8f0" : "#334155",
              borderRadius: 999,
              padding: "4px 7px",
              fontSize: 10,
              fontWeight: 800,
              cursor: "pointer",
              minWidth: 34,
            }}
            aria-label="Changer la vitesse de lecture"
          >
            {playbackRate}x
          </button>
        </div>
      </div>

      <div
        ref={progressRef}
        onPointerDown={(event) => {
          setIsDragging(true);
          seekToPosition(event.clientX);
        }}
        onPointerMove={(event) => {
          if (isDragging) {
            seekToPosition(event.clientX);
          }
        }}
        style={{
          position: "relative",
          width: "100%",
          height: 30,
          borderRadius: 999,
          background: isMine
            ? "rgba(255,255,255,0.14)"
            : theme === "dark"
              ? "rgba(15, 23, 42, 0.8)"
              : "rgba(148,163,184,0.12)",
          border: isMine ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(148,163,184,0.18)",
          overflow: "hidden",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          padding: "0 7px",
          boxSizing: "border-box",
          boxShadow: isMine ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 2, width: "100%", height: "100%", paddingTop: 6, paddingBottom: 6 }}>
          {waveformBars.current.map((barHeight, index) => (
            <span
              key={`${title || "wave"}-${index}`}
              style={{
                display: "block",
                width: 4,
                height: `${barHeight}px`,
                borderRadius: 999,
                background: index / waveformBars.current.length < progress / 100
                  ? isMine
                    ? "rgba(255,255,255,0.96)"
                    : theme === "dark"
                      ? "#c4b5fd"
                      : "#8b5cf6"
                  : isMine
                    ? "rgba(255,255,255,0.28)"
                    : theme === "dark"
                      ? "rgba(148,163,184,0.28)"
                      : "rgba(148,163,184,0.32)",
                transition: "background 120ms ease, height 120ms ease",
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress}%`,
            background: isMine
              ? "linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.28))"
              : theme === "dark"
                ? "linear-gradient(90deg, rgba(167,139,250,0.32), rgba(196,181,253,0.4))"
                : "linear-gradient(90deg, rgba(99,102,241,0.15), rgba(168,85,247,0.18))",
            borderRadius: 999,
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: `calc(${Math.min(Math.max(progress, 0), 100)}% - 7px)`,
            top: "50%",
            transform: "translateY(-50%)",
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: isMine ? "#ffffff" : theme === "dark" ? "#f5f3ff" : "#4f46e5",
            boxShadow: isMine ? "0 0 0 4px rgba(255,255,255,0.18)" : "0 0 0 4px rgba(79,70,229,0.15)",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="5" width="3.5" height="14" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingSecondsRef = useRef(0);

  const [activeUser, setActiveUser] = useState<UserKey | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reactionMenuOpenId, setReactionMenuOpenId] = useState<string | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isOnline, setIsOnline] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [partnerProfilePhotoUrl, setPartnerProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoLoading, setProfilePhotoLoading] = useState(false);
  const [linkPreviews, setLinkPreviews] = useState<Record<string, Record<string, LinkPreview | null>>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const lastVisibleMessageIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    setHasHydrated(true);
    setNotificationPermission(getNotificationPermissionState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTheme = window.localStorage.getItem("messagerie-prive-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }

    const updateOnlineStatus = () => {
      setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    };

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
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
          reactions: message.reactions ?? {},
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

  useEffect(() => {
    const tasks: Array<{ messageId: string; url: string }> = [];

    for (const message of messages) {
      if (!message.text || message.isDeleted) continue;
      const urls = extractUrls(message.text);

      for (const url of urls) {
        const currentMessageMap = linkPreviews[message.id] ?? {};
        if (currentMessageMap[url] !== undefined) continue;
        tasks.push({ messageId: message.id, url });
      }
    }

    if (!tasks.length) return;

    void Promise.allSettled(
      tasks.map(async ({ messageId, url }) => {
        const preview = await fetchLinkPreview(url);
        setLinkPreviews((current) => {
          const messageMap = { ...(current[messageId] ?? {}) };
          messageMap[url] = preview ?? null;
          return { ...current, [messageId]: messageMap };
        });
      }),
    );
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      const queue = loadQueuedMessages();
      if (!queue.length || !isFirebaseConfigured || !auth?.currentUser) return;

      void (async () => {
        for (const queued of queue) {
          try {
            if (queued.mediaDataUrl && queued.mediaType && queued.mediaType !== "file") {
              const dataUrlMatches = queued.mediaDataUrl.match(/^data:(.*?);base64,(.*)$/);
              if (!dataUrlMatches) {
                continue;
              }

              const mimeType = dataUrlMatches[1] || "application/octet-stream";
              const binary = atob(dataUrlMatches[2]);
              const buffer = new Uint8Array(binary.length);

              for (let index = 0; index < binary.length; index += 1) {
                buffer[index] = binary.charCodeAt(index);
              }

              const blob = new Blob([buffer], { type: mimeType });
              const file = new File([blob], queued.fileName || `queued-${queued.id}.bin`, { type: mimeType });
              const cloudResult = await uploadToCloudinary(file);
              await sendMediaMessage({
                text: queued.text || "",
                mediaUrl: cloudResult.url,
                mediaType: cloudResult.type,
                fileName: cloudResult.fileName,
                replyTo: queued.replyTo ?? null,
                audioDuration: queued.audioDuration ?? undefined,
              });
            } else {
              await sendTextMessage(queued.text || "", { replyTo: queued.replyTo ?? null });
            }

            removeQueuedMessage(queued.id);
            setMessages((current) =>
              current.map((message) =>
                message.id === queued.id ? { ...message, status: "sent" } : message,
              ),
            );
          } catch (error) {
            console.error("Queued message resend failed", error);
          }
        }
      })();
    };

    window.addEventListener("online", handleOnline);
    handleOnline();

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [activeUser]);

  const partner = activeUser === "me" ? USERS.friend : USERS.me;
  const isComposerDisabled = !hasHydrated || loadingAuth || !activeUser || uploading || !isOnline;
  const currentUserUid = auth?.currentUser?.uid;
  const currentUserDisplayName = auth?.currentUser?.displayName || (activeUser ? USERS[activeUser].name : "Utilisateur");
  const messageById = Object.fromEntries(messages.map((message) => [message.id, message]));
  const pinnedMessage = pinnedMessageId ? messageById[pinnedMessageId] : null;
  const replyMessage = replyToMessageId ? messageById[replyToMessageId] : null;
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const searchMatches = normalizedSearchTerm
    ? messages.filter((message) => !message.isDeleted && Boolean(message.text) && message.text.toLowerCase().includes(normalizedSearchTerm))
    : [];

  const renderHighlightedText = (value: string) => {
    if (!normalizedSearchTerm || !searchOpen) return value;
    const escapedSearch = normalizedSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(${escapedSearch})`, "ig");
    const segments = value.split(pattern);

    return segments.map((segment, index) => {
      const isMatch = segment.toLowerCase() === normalizedSearchTerm;
      return isMatch ? <mark key={`${segment}-${index}`} style={{ background: "rgba(250,204,21,0.45)", color: "inherit", padding: "0 2px", borderRadius: 4 }}>{segment}</mark> : <span key={`${segment}-${index}`}>{segment}</span>;
    });
  };

  const draftStorageKey = activeUser ? `messagerie-prive-draft-${activeUser}` : null;
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

  const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];

  const getInitials = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return "U";

    const parts = cleanName.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
  };

  const getAvatarStyle = (name: string, accent?: string) => {
    const colors = ["#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b", "#ec4899", "#f97316"];
    const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
    const background = accent || colors[hash % colors.length];

    return {
      background,
      color: "#ffffff",
      fontWeight: 700,
    } as const;
  };

  const saveCurrentUserPhoto = async (nextPhotoUrl: string | null) => {
    if (!isFirebaseConfigured || !auth?.currentUser || !db) return;

    await setDoc(
      doc(db, "users", auth.currentUser.uid),
      {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email ?? "",
        displayName: auth.currentUser.displayName || currentUserDisplayName || "Utilisateur",
        photoURL: nextPhotoUrl ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    setProfilePhotoUrl(nextPhotoUrl ?? null);
  };

  const handleProfilePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setProfilePhotoLoading(true);
      const result = await uploadToCloudinary(file);
      if (!auth?.currentUser) {
        throw new Error("Utilisateur non connecté.");
      }

      await saveCurrentUserPhoto(result.url);
      await updateProfile(auth.currentUser, { photoURL: result.url });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Le changement de photo a échoué.");
    } finally {
      setProfilePhotoLoading(false);
      event.target.value = "";
    }
  };

  const deleteProfilePhoto = async () => {
    try {
      if (!auth?.currentUser) {
        throw new Error("Utilisateur non connecté.");
      }

      await saveCurrentUserPhoto(null);
      await updateProfile(auth.currentUser, { photoURL: null });
    } catch (error) {
      alert("La suppression de la photo a échoué.");
    }
  };

  const handleSignOut = async () => {
    try {
      if (!auth) {
        clearStoredUser();
        router.push("/login");
        return;
      }

      await firebaseSignOut(auth);
      clearStoredUser();
      router.push("/login");
    } catch (error) {
      console.error("Sign out failed", error);
    }
  };

  useEffect(() => {
    const currentUser = auth?.currentUser;

    if (!isFirebaseConfigured || !currentUser || !db) {
      setProfilePhotoUrl(null);
      return;
    }

    const profileRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(profileRef, (snapshot) => {
      const data = snapshot.data() as { photoURL?: string | null; displayName?: string | null } | undefined;
      const nextPhoto = data?.photoURL ?? currentUser.photoURL ?? null;
      setProfilePhotoUrl(nextPhoto);
    });

    return () => unsubscribe();
  }, [auth?.currentUser?.uid, isFirebaseConfigured]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !activeUser || !db) {
      setPartnerProfilePhotoUrl(null);
      return;
    }

    const partnerUser = activeUser === "me" ? USERS.friend : USERS.me;
    const usersRef = collection(db, "users");
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const partnerDoc = snapshot.docs.find((documentSnapshot) => {
        const userData = documentSnapshot.data() as { email?: string | null } | undefined;
        return userData?.email?.toLowerCase() === partnerUser.email.toLowerCase();
      });

      const nextPhoto = partnerDoc?.data()?.photoURL ?? partnerUser.photoURL ?? null;
      setPartnerProfilePhotoUrl(nextPhoto);
    });

    return () => unsubscribe();
  }, [activeUser, auth?.currentUser?.uid, isFirebaseConfigured]);

  const toggleMessageReaction = async (messageId: string, emoji: string) => {
    if (isFirebaseConfigured && auth?.currentUser) {
      const { toggleMessageReaction: toggleFirestoreReaction } = await import("@/lib/firestore-chat");
      await toggleFirestoreReaction(messageId, emoji);
      setReactionMenuOpenId(null);
      return;
    }

    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;

        const existingReactions = message.reactions ?? {};
        const currentUserId = activeUser === "me" ? USERS.me.id : USERS.friend.id;
        const previous = existingReactions[currentUserId];
        const nextReactions = { ...existingReactions };

        if (previous === emoji) {
          delete nextReactions[currentUserId];
        } else {
          nextReactions[currentUserId] = emoji;
        }

        return {
          ...message,
          reactions: Object.keys(nextReactions).length > 0 ? nextReactions : {},
        };
      }),
    );
    setReactionMenuOpenId(null);
  };

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
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

    const preparedFile = file.type.startsWith("image/") ? await compressImageFile(file) : file;
    setSelectedFile(preparedFile);
    if (preparedFile.type.startsWith("image/") || preparedFile.type.startsWith("video/")) {
      setPreviewUrl(URL.createObjectURL(preparedFile));
    } else {
      setPreviewUrl(null);
    }
  };

  const resetComposer = () => {
    setDraft("");
    setReplyToMessageId(null);
    setEditingMessageId(null);
    setMenuOpenId(null);

    if (typeof window !== "undefined" && draftStorageKey) {
      window.localStorage.removeItem(draftStorageKey);
    }
  };

  const sendMessage = async () => {
    const hasContent = Boolean(draft.trim()) || Boolean(selectedFile);
    if (!hasContent || uploading) return;

    const trimmedText = draft.trim();
    const queueEntryId = crypto.randomUUID();
    setDraft("");
    void setTypingState(false);

    const createQueuedMultipart = async (payload: { text: string; file?: File; mediaType?: "image" | "video" | "audio" | "file"; fileName?: string; audioDuration?: number | null; }) => {
      if (!isOnline) {
        const queuedMessage: Parameters<typeof enqueueMessage>[0] = {
          id: queueEntryId,
          createdAt: Date.now(),
          sender: "me",
          text: payload.text,
          status: "pending",
          replyTo: replyToMessageId ?? null,
          mediaType: payload.mediaType,
          fileName: payload.fileName,
          audioDuration: payload.audioDuration ?? null,
          mediaDataUrl: payload.file ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("Impossible de sauvegarder le fichier hors ligne."));
            reader.readAsDataURL(payload.file as File);
          }) : null,
        };

        enqueueMessage(queuedMessage);

        const pendingMessage: ChatMessage = {
          id: queuedMessage.id,
          sender: activeUser ?? "me",
          text: payload.text,
          status: "pending",
          createdAt: queuedMessage.createdAt,
          mediaUrl: payload.file ? URL.createObjectURL(payload.file) : undefined,
          mediaType: payload.mediaType,
          fileName: payload.fileName,
          replyTo: queuedMessage.replyTo ?? null,
        };

        setMessages((current) => [...current, pendingMessage]);
        setSelectedFile(null);
        setPreviewUrl(null);
        setReplyToMessageId(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      if (payload.file) {
        try {
          setUploading(true);
          const cloudResult = await uploadToCloudinary(payload.file, setUploadProgress);

          if (isFirebaseConfigured && auth?.currentUser) {
            await sendMediaMessage({
              text: payload.text,
              mediaUrl: cloudResult.url,
              mediaType: cloudResult.type,
              fileName: cloudResult.fileName,
              replyTo: replyToMessageId ?? null,
            });
          } else {
            const nextMessage: ChatMessage = {
              id: crypto.randomUUID(),
              sender: activeUser ?? "me",
              text: payload.text,
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
          await updateMessageText(editingMessageId, payload.text);
        }
        resetComposer();
        return;
      }

      if (isFirebaseConfigured && auth?.currentUser) {
        await sendTextMessage(payload.text, { replyTo: replyToMessageId ?? null });
        resetComposer();
        return;
      }

      const nextMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: activeUser ?? "me",
        text: payload.text,
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

    if (selectedFile) {
      const fileToSend = await compressImageFile(selectedFile);
      await createQueuedMultipart({
        text: trimmedText,
        file: fileToSend,
        mediaType: fileToSend.type.startsWith("image/") ? "image" : fileToSend.type.startsWith("video/") ? "video" : fileToSend.type.startsWith("audio/") ? "audio" : "file",
        fileName: fileToSend.name,
      });
      return;
    }

    if (editingMessageId) {
      await createQueuedMultipart({ text: trimmedText });
      return;
    }

    await createQueuedMultipart({ text: trimmedText });
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

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior });
    setShowScrollToBottom(false);
    setNewMessagesCount(0);
  };

  const moveSearchResult = (direction: 1 | -1) => {
    if (!searchMatches.length) return;

    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    setSearchIndex(nextIndex);
    handleScrollToMessage(searchMatches[nextIndex].id);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !activeUser) return;

    const savedDraft = window.localStorage.getItem(`messagerie-prive-draft-${activeUser}`);
    if (savedDraft && savedDraft !== draft) {
      setDraft(savedDraft);
    }
  }, [activeUser]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeUser) return;

    if (draft.trim()) {
      window.localStorage.setItem(`messagerie-prive-draft-${activeUser}`, draft);
    } else {
      window.localStorage.removeItem(`messagerie-prive-draft-${activeUser}`);
    }
  }, [draft, activeUser]);

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
    if (typeof document === "undefined") return;

    if (document.visibilityState !== "visible") {
      const unreadCount = messages.filter((message) => message.sender !== activeUser && !message.isDeleted).length;
      if (unreadCount > 0) {
        document.title = `(${unreadCount}) yourChat`;
      }
      return;
    }

    document.title = "yourChat";
  }, [messages, activeUser]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        document.title = "yourChat";
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const updateBottomState = () => {
      const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
      const isBottom = distanceFromBottom <= 120;
      isAtBottomRef.current = isBottom;
      setShowScrollToBottom(!isBottom);
      if (isBottom) {
        setNewMessagesCount(0);
      }
      console.log("[scroll-check] bottom-state", {
        distanceFromBottom,
        threshold: 120,
        isAtBottom: isBottom,
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
      });
    };

    updateBottomState();
    container.addEventListener("scroll", updateBottomState, { passive: true });
    return () => container.removeEventListener("scroll", updateBottomState);
  }, [messages.length]);

  useEffect(() => {
    if (!messages.length) return;

    const lastMessage = messages[messages.length - 1];
    if (lastVisibleMessageIdRef.current === null) {
      lastVisibleMessageIdRef.current = lastMessage.id;
      return;
    }

    const isIncomingFromPartner = lastMessage.id !== lastVisibleMessageIdRef.current && lastMessage.sender !== activeUser;
    if (isIncomingFromPartner) {
      const container = messagesContainerRef.current;
      if (!container) return;

      const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
      const isAtBottom = isAtBottomRef.current;

      console.log("[scroll-check] incoming-message", {
        messageId: lastMessage.id,
        sender: lastMessage.sender,
        activeUser,
        distanceFromBottom,
        isAtBottom,
        threshold: 120,
      });

      if (isAtBottom) {
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        });
        setNewMessagesCount(0);
      } else {
        setNewMessagesCount((current) => current + 1);
        setShowScrollToBottom(true);
      }
    }

    lastVisibleMessageIdRef.current = lastMessage.id;
  }, [messages, activeUser]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !messages.length) return;

    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    const isAtBottom = distanceFromBottom <= 120;
    if (isAtBottom && messages[messages.length - 1]?.sender !== activeUser) {
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
      });
    }
  }, [messages, activeUser]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (recordingIntervalRef.current) {
        window.clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    const closeMenu = () => {
      setMenuOpenId(null);
      setReactionMenuOpenId(null);
    };
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

  const formatDuration = (seconds: number | null | undefined) => {
    const totalSeconds = Math.max(0, Math.floor(seconds ?? 0));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    recordingSecondsRef.current = 0;
    setRecordingSeconds(0);
    setIsRecording(false);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const startVoiceRecording = async () => {
    if (!isCloudinaryConfigured()) {
      alert("Cloudinary n’est pas configuré. Ajoutez NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME et NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET pour pouvoir envoyer des messages vocaux.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("L’enregistrement audio n’est pas supporté par ce navigateur.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        console.log("[Voice] recorder stopped");
        const recordedBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        console.log("[Voice] blob ready", {
          type: recordedBlob.type,
          size: recordedBlob.size,
          chunks: chunks.length,
        });
        stream.getTracks().forEach((track) => track.stop());

        if (!recordedBlob.size) {
          console.error("[Voice] recorded blob is empty");
          alert("Le fichier audio enregistré est vide. Réessayez.");
          setIsRecording(false);
          return;
        }

        const duration = recordingSecondsRef.current;
        const fileExt = recordedBlob.type.includes("mp4") ? "m4a" : recordedBlob.type.includes("ogg") ? "ogg" : "webm";
        const audioFile = new File([recordedBlob], `voice-note-${Date.now()}.${fileExt}`, {
          type: recordedBlob.type || "audio/webm",
        });

        console.log("[Voice] File created", {
          name: audioFile.name,
          type: audioFile.type,
          size: audioFile.size,
          duration,
        });

        recordingSecondsRef.current = 0;
        setRecordingSeconds(0);

        try {
          setUploading(true);
          setUploadProgress(0);
          console.log("[Voice] starting Cloudinary upload...");
          const cloudResult = await uploadToCloudinary(audioFile, setUploadProgress);
          console.log("[Voice] Cloudinary upload success", cloudResult);
          const finalPayload = {
            text: "",
            mediaUrl: cloudResult.url,
            mediaType: "audio" as const,
            fileName: cloudResult.fileName,
            audioDuration: duration,
            replyTo: replyToMessageId ?? null,
          };
          console.log("[Voice] sending Firestore audio message", finalPayload);
          await sendMediaMessage(finalPayload);
          console.log("[Voice] Firestore send completed");
          resetComposer();
        } catch (error) {
          console.error("[Voice] send flow failed", error);
          alert(error instanceof Error ? error.message : "L’enregistrement audio n’a pas pu être envoyé.");
        } finally {
          setUploading(false);
          setSelectedFile(null);
          setPreviewUrl(null);
          setIsRecording(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recordingSecondsRef.current = 0;
      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();

      recordingIntervalRef.current = window.setInterval(() => {
        const nextSeconds = recordingSecondsRef.current + 1;
        recordingSecondsRef.current = nextSeconds;
        setRecordingSeconds(nextSeconds);

        if (nextSeconds >= 180) {
          stopRecording();
        }
      }, 1000);
    } catch (error) {
      console.error("Micro inaccessible", error);
      alert("Impossible d’accéder au microphone. Vérifie les autorisations du navigateur.");
    }
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

  const sidebarUserPhoto = profilePhotoUrl || auth?.currentUser?.photoURL || null;
  const sidebarAvatarStyle = getAvatarStyle(currentUserDisplayName, partner.accent);

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
          display: "flex",
          background: palette.panelBg,
          overflow: "hidden",
        }}
      >
        <aside
          style={{
            width: 300,
            minWidth: 300,
            borderRight: `1px solid ${palette.border}`,
            background: theme === "dark" ? "rgba(15, 23, 42, 0.96)" : "rgba(255,255,255,0.96)",
            backdropFilter: "blur(12px)",
            display: "flex",
            flexDirection: "column",
            padding: 18,
            gap: 18,
            position: "relative",
            zIndex: 30,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `2px solid ${palette.border}`,
                  background: sidebarAvatarStyle.background,
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                {sidebarUserPhoto ? (
                  <img src={sidebarUserPhoto} alt={currentUserDisplayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{getInitials(currentUserDisplayName)}</span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: palette.text, fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{currentUserDisplayName}</div>
                <div style={{ color: palette.textMuted, fontSize: 12 }}>En ligne</div>
              </div>
            </div>

            <button
              type="button"
              aria-label="Paramètres du profil"
              onClick={() => setProfilePanelOpen((current) => !current)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: `1px solid ${palette.border}`,
                background: theme === "dark" ? "rgba(15,23,42,0.8)" : "rgba(248,250,252,0.9)",
                color: palette.text,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <Settings size={17} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 14,
              border: `1px solid ${palette.border}`,
              background: theme === "dark" ? "rgba(15, 23, 42, 0.7)" : "rgba(248, 250, 252, 0.9)",
              color: palette.text,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              {theme === "dark" ? <Moon size={16} /> : <SunMedium size={16} />}
              Thème
            </span>
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              style={{
                width: 48,
                height: 28,
                borderRadius: 999,
                border: "none",
                background: theme === "dark" ? "#8b5cf6" : "#cbd5e1",
                position: "relative",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  left: theme === "dark" ? 26 : 4,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#ffffff",
                  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.18)",
                  transition: "left 180ms ease",
                }}
              />
            </button>
          </div>

          <div style={{ display: "grid", gap: 8, flex: 1 }}>
            <div style={{ color: palette.textMuted, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 8px" }}>
              Options
            </div>
            <div
              style={{
                border: `1px dashed ${palette.border}`,
                borderRadius: 14,
                padding: 14,
                minHeight: 120,
                background: theme === "dark" ? "rgba(15,23,42,0.5)" : "rgba(248,250,252,0.8)",
                color: palette.textMuted,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
              }}
            >
              Espace prêt pour de nouvelles options.
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 14,
              padding: "12px 14px",
              background: theme === "dark" ? "rgba(127, 29, 29, 0.2)" : "rgba(254, 242, 242, 0.9)",
              color: "#ef4444",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <LogOut size={17} />
            Se déconnecter
          </button>
        </aside>

        {profilePanelOpen ? (
          <div
            style={{
              position: "absolute",
              left: 310,
              top: 20,
              width: 300,
              background: palette.floating,
              border: `1px solid ${palette.border}`,
              borderRadius: 18,
              boxShadow: "0 24px 56px rgba(15, 23, 42, 0.14)",
              padding: 18,
              zIndex: 40,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ color: palette.text, fontWeight: 700, fontSize: 18 }}>Profil</div>
              <button
                type="button"
                onClick={() => setProfilePanelOpen(false)}
                style={{ border: "none", background: "transparent", color: palette.textMuted, cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `3px solid ${palette.border}`,
                  background: getAvatarStyle(currentUserDisplayName).background,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {sidebarUserPhoto ? (
                  <img src={sidebarUserPhoto} alt={currentUserDisplayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 28 }}>{getInitials(currentUserDisplayName)}</span>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: theme === "dark" ? "rgba(139,92,246,0.2)" : "#ede9fe",
                  color: palette.text,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <ImagePlus size={16} />
                {profilePhotoLoading ? "Téléchargement..." : "Changer la photo"}
                <input type="file" accept="image/*" onChange={handleProfilePhotoUpload} style={{ display: "none" }} />
              </label>

              <button
                type="button"
                onClick={deleteProfilePhoto}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: theme === "dark" ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.8)",
                  color: palette.text,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Trash2 size={15} />
                Supprimer la photo
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
              <button
                type="button"
                aria-label="Ouvrir le menu"
                onClick={() => setSidebarOpen((current) => !current)}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: `1px solid ${palette.border}`,
                  background: theme === "dark" ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.8)",
                  color: palette.text,
                  cursor: "pointer",
                }}
              >
                <Menu size={18} />
              </button>

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
                  overflow: "hidden",
                  boxShadow: `0 10px 24px ${partner.accent}55`,
                }}
              >
                {partnerProfilePhotoUrl || partner.photoURL ? (
                  <img src={partnerProfilePhotoUrl || partner.photoURL || undefined} alt={partner.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  partner.name.charAt(0).toUpperCase()
                )}
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
              <button
                type="button"
                aria-label="Recherche"
                onClick={() => setSearchOpen((current) => !current)}
                style={{ ...headerActionStyle, color: searchOpen ? palette.text : palette.textMuted, background: searchOpen ? (theme === "dark" ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.1)") : headerActionStyle.background }}
              >
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

          {lightboxImage ? (
            <div
              onClick={() => setLightboxImage(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.8)",
                display: "grid",
                placeItems: "center",
                zIndex: 80,
                backdropFilter: "blur(4px)",
                animation: "fadeIn 180ms ease",
              }}
            >
              <div
                onClick={(event) => event.stopPropagation()}
                style={{
                  position: "relative",
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  width: "auto",
                  height: "auto",
                  borderRadius: 18,
                  overflow: "hidden",
                  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.4)",
                  animation: "zoomIn 220ms ease",
                  background: "rgba(15, 23, 42, 0.6)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  aria-label="Fermer l’image"
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(15, 23, 42, 0.7)",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    zIndex: 2,
                  }}
                >
                  <X size={18} />
                </button>
                <img
                  src={lightboxImage}
                  alt="Image agrandie"
                  style={{
                    display: "block",
                    maxWidth: "90vw",
                    maxHeight: "90vh",
                    width: "auto",
                    height: "auto",
                    objectFit: "contain",
                    background: "#020617",
                  }}
                />
              </div>
            </div>
          ) : null}

          {searchOpen ? (
            <div
              style={{
                borderBottom: `1px solid ${palette.border}`,
                padding: "12px 18px 0",
                background: palette.headerBg,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: theme === "dark" ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.9)",
                  border: `1px solid ${palette.border}`,
                  borderRadius: 12,
                  padding: "8px 10px",
                }}
              >
                <Search size={16} color={palette.textMuted} />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSearchIndex(0);
                  }}
                  placeholder="Rechercher dans la conversation…"
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: palette.text,
                    fontSize: 14,
                  }}
                />
                {searchMatches.length ? (
                  <>
                    <button type="button" onClick={() => moveSearchResult(-1)} style={{ border: "none", background: "transparent", color: palette.text, cursor: "pointer", fontWeight: 700 }}>↑</button>
                    <button type="button" onClick={() => moveSearchResult(1)} style={{ border: "none", background: "transparent", color: palette.text, cursor: "pointer", fontWeight: 700 }}>↓</button>
                    <span style={{ color: palette.textMuted, fontSize: 12, minWidth: 44, textAlign: "right" }}>
                      {searchMatches.length ? `${Math.min(searchIndex + 1, searchMatches.length)}/${searchMatches.length}` : "0/0"}
                    </span>
                  </>
                ) : null}
              </div>

              {searchTerm.trim() && !searchMatches.length ? (
                <div style={{ color: palette.textMuted, fontSize: 12, padding: "8px 4px 0" }}>Aucun résultat trouvé.</div>
              ) : null}

              {searchMatches.length ? (
                <div style={{ display: "grid", gap: 6, padding: "10px 0 12px" }}>
                  {searchMatches.slice(0, 4).map((message, index) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => {
                        setSearchIndex(index);
                        handleScrollToMessage(message.id);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        width: "100%",
                        background: index === searchIndex ? "rgba(79,124,255,0.12)" : "transparent",
                        border: `1px solid ${palette.border}`,
                        borderRadius: 10,
                        padding: "8px 10px",
                        color: palette.text,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {message.text ? renderHighlightedText(message.text.slice(0, 80)) : "Message"}
                      </span>
                      <span style={{ color: palette.textMuted, fontSize: 11 }}>{new Date(message.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {sidebarOpen ? (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.28)",
                zIndex: 25,
              }}
            />
          ) : null}

          {sidebarOpen ? (
            <div
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                bottom: 0,
                width: 300,
                background: theme === "dark" ? "rgba(15, 23, 42, 0.98)" : "rgba(255,255,255,0.98)",
                borderRight: `1px solid ${palette.border}`,
                zIndex: 26,
                display: "flex",
                flexDirection: "column",
                padding: 18,
                gap: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: `1px solid ${palette.border}`,
                    background: "transparent",
                    color: palette.text,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: `2px solid ${palette.border}`,
                    background: sidebarAvatarStyle.background,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {sidebarUserPhoto ? (
                    <img src={sidebarUserPhoto} alt={currentUserDisplayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span>{getInitials(currentUserDisplayName)}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: palette.text, fontWeight: 700 }}>{currentUserDisplayName}</div>
                  <div style={{ color: palette.textMuted, fontSize: 12 }}>Compte principal</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfilePanelOpen((current) => !current);
                  setSidebarOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 12,
                  border: `1px solid ${palette.border}`,
                  padding: "10px 12px",
                  background: theme === "dark" ? "rgba(15,23,42,0.8)" : "rgba(248,250,252,0.9)",
                  color: palette.text,
                  cursor: "pointer",
                }}
              >
                <Settings size={16} />
                Profil
              </button>

              <div style={{ display: "grid", gap: 8, flex: 1 }}>
                <div style={{ color: palette.textMuted, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", padding: "0 8px" }}>Options</div>
                <div style={{ border: `1px dashed ${palette.border}`, borderRadius: 14, padding: 14, minHeight: 120, background: theme === "dark" ? "rgba(15,23,42,0.5)" : "rgba(248,250,252,0.8)", color: palette.textMuted, display: "grid", placeItems: "center", textAlign: "center" }}>Espace prêt pour de nouvelles options.</div>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, border: "1px solid rgba(239,68,68,0.25)", borderRadius: 14, padding: "12px 14px", background: theme === "dark" ? "rgba(127, 29, 29, 0.2)" : "rgba(254, 242, 242, 0.9)", color: "#ef4444", fontWeight: 700, cursor: "pointer" }}
              >
                <LogOut size={17} />
                Se déconnecter
              </button>
            </div>
          ) : null}

          {profilePanelOpen ? (
            <div
              onClick={() => setProfilePanelOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.14)",
                zIndex: 30,
              }}
            />
          ) : null}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
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

            <section
              ref={messagesContainerRef}
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
                const reactions = message.reactions ?? {};
                const reactionCounts = Object.entries(reactions).reduce<Record<string, number>>((accumulator, [userId, emoji]) => {
                  accumulator[emoji] = (accumulator[emoji] ?? 0) + 1;
                  return accumulator;
                }, {});
                const currentUserReactionKey = activeUser ? USERS[activeUser].id : null;
                const myReaction = currentUserReactionKey ? reactions[currentUserReactionKey] ?? null : null;

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
                        onMouseEnter={() => setReactionMenuOpenId((current) => current ?? message.id)}
                        onMouseLeave={() => {
                          setReactionMenuOpenId((current) => (current === message.id ? null : current));
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setReactionMenuOpenId((current) => (current === message.id ? null : message.id));
                        }}
                        onTouchStart={() => {
                          setReactionMenuOpenId((current) => (current === message.id ? null : message.id));
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
                          {reactionMenuOpenId === message.id ? (
                            <div
                              style={{
                                position: "absolute",
                                right: isMine ? "100%" : "auto",
                                left: isMine ? "auto" : "100%",
                                top: -10,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                background: palette.floating,
                                border: `1px solid ${palette.border}`,
                                borderRadius: 999,
                                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                                padding: "8px 10px",
                                zIndex: 20,
                                transform: isMine ? "translateX(-8px)" : "translateX(8px)",
                              }}
                            >
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void toggleMessageReaction(message.id, emoji);
                                  }}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    border: "none",
                                    borderRadius: 999,
                                    background: myReaction === emoji ? "rgba(79, 124, 255, 0.12)" : "transparent",
                                    fontSize: 16,
                                    cursor: "pointer",
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          ) : null}

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
                              position: "relative",
                            }}
                          >
                            {message.mediaUrl && !isDeleted ? (
                              message.mediaType === "image" ? (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImage(message.mediaUrl || null)}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    padding: 0,
                                    cursor: "pointer",
                                    display: "block",
                                    marginBottom: 8,
                                  }}
                                >
                                  <img
                                    src={message.mediaUrl}
                                    alt={message.fileName || "Image envoyée"}
                                    style={{
                                      width: 250,
                                      height: 250,
                                      maxWidth: "100%",
                                      maxHeight: 250,
                                      objectFit: "cover",
                                      borderRadius: 12,
                                      display: "block",
                                      boxShadow: "0 10px 20px rgba(15, 23, 42, 0.12)",
                                    }}
                                  />
                                </button>
                              ) : message.mediaType === "video" ? (
                                <video
                                  src={message.mediaUrl}
                                  controls
                                  style={{ maxWidth: "100%", borderRadius: 12, marginBottom: 8, display: "block" }}
                                />
                              ) : message.mediaType === "audio" ? (
                                <div style={{ display: "grid", gap: 8, minWidth: 280 }}>
                                  <VoiceNotePlayer
                                    src={message.mediaUrl}
                                    title={message.fileName || "Message vocal"}
                                    duration={message.audioDuration ?? null}
                                    isMine={isMine}
                                    theme={theme}
                                  />
                                </div>
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

                            {message.text ? extractUrls(message.text).map((url) => {
                              const preview = linkPreviews[message.id]?.[url] ?? null;
                              if (!preview && !url) return null;

                              return (
                                <div key={`${message.id}-${url}`} style={{ marginTop: 10, display: "grid", gap: 8, borderRadius: 12, overflow: "hidden", background: isMine ? "rgba(255,255,255,0.08)" : "rgba(148,163,184,0.08)", border: `1px solid ${isMine ? "rgba(255,255,255,0.2)" : palette.border}` }}>
                                  {preview?.image ? (
                                    <img src={preview.image} alt={preview.title} style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />
                                  ) : null}
                                  <div style={{ padding: "10px 12px", display: "grid", gap: 4 }}>
                                    <div style={{ fontSize: 10, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                      {preview?.siteName || "Lien"}
                                    </div>
                                    <div style={{ fontWeight: 700, lineHeight: 1.4 }}>{preview?.title || url}</div>
                                    {preview?.description ? (
                                      <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>{preview.description}</div>
                                    ) : null}
                                    <a href={url} target="_blank" rel="noreferrer" style={{ color: isMine ? "#ffffff" : "#3453d1", textDecoration: "underline", fontSize: 12, wordBreak: "break-all" }}>
                                      {url}
                                    </a>
                                  </div>
                                </div>
                              );
                            }) : null}

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
                                message.status === "pending" ? <span>• en attente</span> : message.status === "read" ? <CheckCheck size={12} /> : <Check size={12} />
                              ) : null}
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-label="Ajouter une réaction"
                            onClick={(event) => {
                              event.stopPropagation();
                              setReactionMenuOpenId((current) => (current === message.id ? null : message.id));
                            }}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              border: `1px solid ${palette.border}`,
                              background: theme === "dark" ? "rgba(15,23,42,0.8)" : "rgba(255,255,255,0.8)",
                              color: palette.text,
                              display: "grid",
                              placeItems: "center",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <Smile size={12} />
                          </button>

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

                        {Object.keys(reactionCounts).length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              justifyContent: isMine ? "flex-end" : "flex-start",
                              flexWrap: "wrap",
                              maxWidth: "100%",
                            }}
                          >
                            {Object.entries(reactionCounts).map(([emoji, count]) => {
                              const isSelectedByCurrentUser = myReaction === emoji;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => void toggleMessageReaction(message.id, emoji)}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    borderRadius: 999,
                                    border: `1px solid ${isSelectedByCurrentUser ? "rgba(79,124,255,0.5)" : palette.border}`,
                                    background: isSelectedByCurrentUser
                                      ? "rgba(79,124,255,0.12)"
                                      : theme === "dark"
                                        ? "rgba(15,23,42,0.8)"
                                        : "rgba(255,255,255,0.9)",
                                    color: palette.text,
                                    padding: "4px 8px",
                                    fontSize: 12,
                                    cursor: "pointer",
                                  }}
                                >
                                  <span>{emoji}</span>
                                  <span>{count}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>

            {showScrollToBottom ? (
              <div
                style={{
                  position: "absolute",
                  right: 24,
                  bottom: 110,
                  zIndex: 25,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => scrollToBottom("smooth")}
                  style={{
                    position: "relative",
                    width: 42,
                    height: 42,
                    border: "none",
                    borderRadius: "50%",
                    background: newMessagesCount > 0 ? "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)" : "linear-gradient(135deg, #4f7cff 0%, #6d5efc 100%)",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 14px 28px rgba(79,124,255,0.28)",
                    cursor: "pointer",
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                  aria-label="Revenir en bas"
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>↓</span>
                  {newMessagesCount > 0 ? (
                    <span
                      style={{
                        position: "absolute",
                        top: -6,
                        right: -4,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 999,
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "grid",
                        placeItems: "center",
                        padding: "0 4px",
                        border: "2px solid #ffffff",
                      }}
                    >
                      {newMessagesCount > 9 ? "9+" : newMessagesCount}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}

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

            {isRecording ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: theme === "dark" ? "rgba(239, 68, 68, 0.12)" : "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#ef4444",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    display: "inline-block",
                    borderRadius: "50%",
                    background: "#ef4444",
                    boxShadow: "0 0 0 6px rgba(239, 68, 68, 0.18)",
                    animation: "pulse 1s infinite",
                  }}
                />
                <span>{formatDuration(recordingSeconds)}</span>
                <button
                  type="button"
                  onClick={cancelRecording}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#ef4444",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: "none",
                    background: "#ef4444",
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <Square size={10} fill="currentColor" />
                </button>
              </div>
            ) : null}

            {!draft.trim() && !selectedFile ? (
              <button
                type="button"
                aria-label="Enregistrer un message vocal"
                onClick={() => void startVoiceRecording()}
                disabled={isComposerDisabled}
                style={{
                  width: 42,
                  height: 42,
                  border: "none",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                  color: "#ffffff",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 14px 28px rgba(34, 197, 94, 0.2)",
                  cursor: isComposerDisabled ? "not-allowed" : "pointer",
                  opacity: isComposerDisabled ? 0.7 : 1,
                }}
              >
                <Mic size={18} />
              </button>
            ) : null}

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
      </div>
    </main>
  );
}
