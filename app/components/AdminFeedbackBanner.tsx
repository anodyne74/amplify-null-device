import styles from '@/app/dashboard.module.css';

type FeedbackTone = 'error' | 'success' | 'warning';

interface AdminFeedbackBannerProps {
  message?: string | null;
  tone: FeedbackTone;
  className?: string;
  contentClassName?: string;
  messageClassName?: string;
  dismissLabel?: string;
  dismissAriaLabel?: string;
  dismissButtonClassName?: string;
  onDismiss?: () => void;
}

function getDefaultMessageClassName(tone: FeedbackTone) {
  if (tone === 'success') return styles.inlineSuccessText;
  return styles.inlineErrorText;
}

export default function AdminFeedbackBanner({
  message,
  tone,
  className,
  contentClassName,
  messageClassName,
  dismissLabel = 'Dismiss',
  dismissAriaLabel = 'Dismiss message',
  dismissButtonClassName,
  onDismiss,
}: AdminFeedbackBannerProps) {
  if (!message) {
    return null;
  }

  const role = tone === 'success' ? 'status' : 'alert';
  const liveMode = tone === 'success' ? 'polite' : 'assertive';

  return (
    <div className={className} role={role} aria-live={liveMode}>
      <div className={contentClassName}>
        <p className={messageClassName ?? getDefaultMessageClassName(tone)}>{message}</p>
        {onDismiss && (
          <button
            type="button"
            className={dismissButtonClassName}
            onClick={onDismiss}
            aria-label={dismissAriaLabel}
          >
            {dismissLabel}
          </button>
        )}
      </div>
    </div>
  );
}