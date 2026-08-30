"use client";

import { onAuthStateChanged } from "firebase/auth";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
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
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, #f5f7fb 0%, #eef3fb 100%)",
        padding: "28px 18px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 1040,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          background: "rgba(255,255,255,0.82)",
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 30,
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(180deg, #eef4ff 0%, #f8fafc 100%)",
            padding: "40px 32px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            borderRight: "1px solid rgba(148, 163, 184, 0.16)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(135deg, #eaf1ff 0%, #edf0ff 100%)",
              color: "#3557d6",
              display: "grid",
              placeItems: "center",
              marginBottom: 18,
            }}
          >
            <ShieldCheck size={28} />
          </div>

          <p
            style={{
              margin: 0,
              color: "#3b82f6",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1.6,
              textTransform: "uppercase",
            }}
          >
            Messagerie privée
          </p>

          <h1
            style={{
              margin: "18px 0 10px",
              fontSize: "clamp(2.2rem, 4vw, 3.2rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.06em",
              color: "#0f172a",
            }}
          >
            Accédez à votre espace sécurisé.
          </h1>

          <p style={{ margin: 0, color: "#475569", lineHeight: 1.8, maxWidth: 420 }}>
            {isFirebaseConfigured
              ? "Saisissez votre email et votre mot de passe pour ouvrir la conversation en cours."
              : "Mode de démonstration actif. La conversation reste disponible localement tant que Firebase n’est pas configuré."}
          </p>
        </div>

        <div style={{ padding: "40px 32px", display: "grid", alignContent: "center" }}>
          <form onSubmit={handleLogin} style={{ display: "grid", gap: 18 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ color: "#334155", fontWeight: 600, fontSize: 14 }}>Email</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#f8fafc",
                  border: "1px solid rgba(148,163,184,0.22)",
                  borderRadius: 14,
                  padding: "0 14px",
                }}
              >
                <Mail size={18} color="#64748b" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="vous@example.com"
                  required
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    color: "#0f172a",
                    padding: "14px 0",
                    outline: "none",
                    fontSize: 15,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ color: "#334155", fontWeight: 600, fontSize: 14 }}>Mot de passe</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#f8fafc",
                  border: "1px solid rgba(148,163,184,0.22)",
                  borderRadius: 14,
                  padding: "0 14px",
                }}
              >
                <LockKeyhole size={18} color="#64748b" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Votre mot de passe"
                  required
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    color: "#0f172a",
                    padding: "14px 0",
                    outline: "none",
                    fontSize: 15,
                  }}
                />
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#475569",
                fontSize: 14,
                marginTop: 4,
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#4f7cff" }}
              />
              Se souvenir de moi
            </label>

            {error ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#fff1f2",
                  border: "1px solid rgba(239, 68, 68, 0.18)",
                  color: "#b91c1c",
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                border: "none",
                borderRadius: 14,
                background: "linear-gradient(135deg, #4f7cff 0%, #6d5efc 100%)",
                color: "#ffffff",
                padding: "15px 18px",
                fontWeight: 700,
                fontSize: 15,
                boxShadow: "0 14px 28px rgba(79, 124, 255, 0.22)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.82 : 1,
              }}
            >
              {loading ? "Connexion..." : "Se connecter"}
              <ArrowRight size={18} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
