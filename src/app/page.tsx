import Link from "next/link";
import { ArrowRight, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, #f5f7fb 0%, #eef3fb 100%)",
        padding: "32px 20px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 1080,
          background: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(148,163,184,0.18)",
          borderRadius: 28,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 0,
        }}
      >
        <div style={{ padding: "56px 48px", display: "grid", alignContent: "center", gap: 26 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              alignSelf: "start",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              background: "#eef4ff",
              border: "1px solid rgba(96, 125, 255, 0.18)",
              color: "#3453d1",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={14} />
            PWA • 1-to-1 • Firebase
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(2.4rem, 4vw, 4.2rem)",
                lineHeight: 1.08,
                letterSpacing: "-0.06em",
                color: "#0f172a",
              }}
            >
              Messagerie privée, simple et élégante.
            </h1>
            <p
              style={{
                margin: 0,
                color: "#475569",
                fontSize: "1.08rem",
                lineHeight: 1.8,
                maxWidth: 560,
              }}
            >
              Une conversation entre deux personnes, avec messages en temps réel,
              envoi de média, notifications push et installation sur mobile, dans un
              environnement pensé pour être clair, rapide et premium.
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <Link
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                borderRadius: 14,
                background: "linear-gradient(135deg, #4f7cff 0%, #6d5efc 100%)",
                color: "#ffffff",
                padding: "14px 18px",
                textDecoration: "none",
                fontWeight: 700,
                boxShadow: "0 14px 28px rgba(79, 124, 255, 0.25)",
              }}
            >
              Ouvrir la messagerie
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/chat"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 14,
                background: "#f8fafc",
                color: "#0f172a",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                padding: "14px 18px",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Voir le chat
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
              maxWidth: 520,
            }}
          >
            {[
              "Authentification Firebase",
              "Firestore temps réel",
              "Stockage media",
              "Notifications push",
            ].map((feature) => (
              <div
                key={feature}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#1e293b",
                  background: "#f8fafc",
                  border: "1px solid rgba(148,163,184,0.16)",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={16} color="#3b82f6" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(180deg, #eef4ff 0%, #f8fafc 100%)",
            borderLeft: "1px solid rgba(148,163,184,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 32px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 24,
              padding: 24,
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                background: "linear-gradient(135deg, #eef3ff 0%, #e8eeff 100%)",
                display: "grid",
                placeItems: "center",
                marginBottom: 16,
                color: "#3557d6",
              }}
            >
              <MessageSquareText size={26} />
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0, color: "#3b82f6", fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", fontSize: 11 }}>
                Salle de discussion
              </p>
              <h2 style={{ margin: 0, color: "#0f172a", fontSize: "1.7rem", letterSpacing: "-0.05em" }}>Connecté et prêt</h2>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                Messages fiables, présence visible, médias partagés et notifications push sans friction.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
