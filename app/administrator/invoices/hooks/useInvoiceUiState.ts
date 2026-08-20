import { useEffect, useRef, useState } from 'react';

const SUCCESS_MESSAGE_TIMEOUT_MS = 5000;

export function useInvoiceUiState() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfActionLoadingId, setPdfActionLoadingId] = useState<string | null>(null);
  const [emailingInvoiceId, setEmailingInvoiceId] = useState<string | null>(null);
  const [pendingUploadInvoiceId, setPendingUploadInvoiceId] = useState<string | null>(null);
  const pendingUploadInvoiceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, SUCCESS_MESSAGE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  return {
    loading,
    setLoading,
    saving,
    setSaving,
    error,
    setError,
    successMessage,
    setSuccessMessage,
    uploadingId,
    setUploadingId,
    uploadError,
    setUploadError,
    pdfActionLoadingId,
    setPdfActionLoadingId,
    emailingInvoiceId,
    setEmailingInvoiceId,
    pendingUploadInvoiceId,
    setPendingUploadInvoiceId,
    pendingUploadInvoiceIdRef,
  };
}