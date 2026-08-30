"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { signInWithPassword } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/chat");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isFirebaseConfigured || !auth) {
      router.push("/chat");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await signInWithPassword(email, password, rememberMe);
      if (!result) {
        setError("Connexion impossible. Vérifie l’email et le mot de passe Firebase.");
        return;
      }

      router.push("/chat");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Erreur de connexion. Vérifie l’email et le mot de passe.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 540,
        margin: "0 auto",
        padding: "32px 18px",
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <section
        style={{
          width: "100%",
          background: "rgba(19,27,45,0.9)",
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 28,
          padding: 24,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
        }}
      >
        <p style={{ color: "#a5b4fc", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 }}>
          Messagerie privée
        </p>
        <h1 style={{ marginTop: 12, fontSize: "clamp(2rem, 5vw, 3rem)" }}>Se connecter</h1>
        <p style={{ marginTop: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          {isFirebaseConfigured
            ? "Saisissez votre email et votre mot de passe pour accéder à la conversation."
            : "Mode de démonstration actif : la conversation reste disponible localement tant que Firebase n’est pas configuré."}
        </p>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 14, marginTop: 24 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ color: "#dfe8ff" }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@example.com"
              required
              style={{
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.2)",
                background: "#0b1020",
                color: "#edf2ff",
                padding: "12px 14px",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ color: "#dfe8ff" }}>Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Votre mot de passe"
              required
              style={{
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.2)",
                background: "#0b1020",
                color: "#edf2ff",
                padding: "12px 14px",
              }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#dfe8ff" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Se souvenir de moi
          </label>

          {error ? (
            <p style={{ color: "#fca5a5", fontSize: 14 }}>{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              border: "none",
              borderRadius: 14,
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "white",
              padding: "14px 16px",
              fontWeight: 700,
            }}
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}
