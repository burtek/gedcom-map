import styles from "./WarningsList.module.css";

interface WarningsListProps {
  warnings: string[];
}

export default function WarningsList({ warnings }: WarningsListProps) {
  if (warnings.length === 0) return null;

  return (
    <section className={styles.container}>
      <h2 className={styles.title}>⚠️ Warnings ({warnings.length})</h2>
      <ul className={styles.list}>
        {warnings.map((w, i) => (
          <li key={i} className={styles.item}>
            {w}
          </li>
        ))}
      </ul>
    </section>
  );
}
