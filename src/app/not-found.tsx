import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.copy}>
          That route does not exist in the employee directory.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/">
            Home
          </Link>
          <Link className={styles.secondary} href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
