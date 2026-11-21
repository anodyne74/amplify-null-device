import Link from 'next/link';
import styles from './Breadcrumbs.module.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Operator field screens: links get a 44px tap target without the row looking any different. */
  touch?: boolean;
}

/**
 * Breadcrumb Navigation
 * Renders the page's location within the portal hierarchy.
 * Ancestors with an href render as links; the final item is plain
 * text marked with aria-current="page".
 */
export default function Breadcrumbs({ items, touch = false }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={`${styles.breadcrumbs} ${touch ? styles.touch : ""}`}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={styles.item}>
              {index > 0 && (
                <span aria-hidden="true" className={styles.separator}>
                  /
                </span>
              )}
              {!isLast && item.href ? (
                <Link href={item.href} className={styles.link}>
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? styles.current : styles.text}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
