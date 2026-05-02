'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { RouteForm, type RouteDraftStop } from '@/app/operator/components/RouteForm';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { createRoute, createStop } from '@/lib/queries';
import styles from './page.module.css';

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
    stops: RouteDraftStop[];
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
        for (let index = 0; index < values.stops.length; index += 1) {
          const stop = values.stops[index];
          const stopResult = await createStop({
            routeId: result.data.id,
            customerId: values.customerId,
            sequence: index + 1,
            address: stop.address,
            serviceType: stop.serviceType,
            estimatedArrivalTime: stop.estimatedArrivalTime,
            numberOfSigns: stop.numberOfSigns,
            agent: stop.agent,
            isAuction: stop.isAuction,
            latitude: stop.latitude,
            longitude: stop.longitude,
            formattedAddress: stop.formattedAddress,
            notes: stop.notes,
          });

          if (stopResult.errors && stopResult.errors.length > 0) {
            setSubmitError('Route was created, but one or more stops failed to save.');
            setIsSubmitting(false);
            return;
          }
        }

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
    <OperatorRoute requireAdmin>
      <div className={styles.container}>
        <h1 className={styles.heading}>Create New Route</h1>

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
