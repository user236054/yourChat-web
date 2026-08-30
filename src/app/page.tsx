import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.badge}>PWA • 1-to-1 • Firebase</span>
        <h1>Messagerie privée, simple et installable.</h1>
        <p>
          Une conversation entre deux personnes, avec messages en temps réel,
          envoi de média, notifications push et installation sur mobile.
        </p>

        <div className={styles.actions}>
          <Link href="/login" className={styles.primaryAction}>
            Ouvrir la messagerie
          </Link>
          <Link href="/chat" className={styles.secondaryAction}>
            Voir le chat
          </Link>
        </div>

        <ul className={styles.features}>
          <li>Authentification Firebase</li>
          <li>Firestore temps réel</li>
          <li>Storage pour images, vidéos et fichiers</li>
          <li>Notifications push</li>
        </ul>
      </section>
    </main>
  );
}
