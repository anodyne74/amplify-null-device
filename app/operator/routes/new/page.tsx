'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { RouteForm } from '@/app/operator/components/RouteForm';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { createRoute } from '@/lib/queries';

export default function NewRoutePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCustomers() {
      setLoadingCustomers(true);
      const result = await listAllCustomers({ limit: 100 });
      if (!result.errors || result.errors.length === 0) {
        setCustomers(
          (result.data as any[]).map((c) => ({ id: c.id, name: c.name, email: c.email }))
        );
      }
      setLoadingCustomers(false);
    }
    fetchCustomers();
  }, []);

  const handleSubmit = async (values: {
    customerId: string;
    estimatedDurationMinutes: number;
    notes: string;
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createRoute({
        customerId: values.customerId,
        status: 'planned',
        estimatedDurationMinutes: values.estimatedDurationMinutes,
        notes: values.notes || undefined,
      });

      if (result.errors && result.errors.length > 0) {
        setSubmitError('Failed to create route. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (result.data?.id) {
        router.push(`/operator/routes/detail?id=${result.data.id}`);
      } else {
        setSubmitError('Route created but ID not returned.');
        setIsSubmitting(false);
      }
    } catch {
      setSubmitError('An unexpected error occurred.');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/operator/routes');
  };

  return (
    <OperatorRoute>
      <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ color: '#1b5e20', marginBottom: '24px' }}>Create New Route</h1>

        {loadingCustomers ? (
          <LoadingSpinner message="Loading customers..." />
        ) : (
          <RouteForm
            customers={customers}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            error={submitError}
          />
        )}
      </div>
    </OperatorRoute>
  );
}
