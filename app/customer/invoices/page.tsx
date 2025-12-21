'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { listMyInvoices } from '@/lib/queries/ListMyInvoices';
import InvoiceListItem from '../components/InvoiceListItem';
import LoadingSpinner from '@/app/components/LoadingSpinner';

/**
 * Customer Invoices List Page
 * Displays all customer's invoices with filtering options
 */
export default function InvoicesPage() {
  const { user } = useAuthenticator();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch invoices on mount or when filters change
  useEffect(() => {
    if (!user?.userId) return;

    const fetchInvoices = async () => {
      setLoading(true);
      setError(null);

      const result = await listMyInvoices({
        customerId: user.userId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 50,
      });

      if (result.errors && result.errors.length > 0) {
        setError('Failed to load invoices');
        console.error('Error fetching invoices:', result.errors);
      } else {
        setInvoices(result.data || []);
      }

      setLoading(false);
    };

    fetchInvoices();
  }, [user?.userId, startDate, endDate]);

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700' }}>
          Invoices
        </h1>
        <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
          View and download your invoices
        </p>
      </div>

      {/* Filter Section */}
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '24px',
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#333',
            }}
          >
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#333',
            }}
          >
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>

        <button
          onClick={handleClearFilters}
          style={{
            padding: '8px 16px',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          Clear Filters
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginBottom: '24px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Invoice List or Empty State */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
        {invoices.length === 0 ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: '#999',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
              No invoices found
            </p>
            <p style={{ margin: '0', fontSize: '14px' }}>
              {startDate || endDate
                ? 'Try adjusting your date filters'
                : 'Your invoices will appear here'}
            </p>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div
              style={{
                display: 'flex',
                padding: '12px 16px',
                backgroundColor: '#f5f5f5',
                borderBottom: '1px solid #e0e0e0',
                fontSize: '13px',
                fontWeight: '600',
                color: '#666',
              }}
            >
              <div style={{ flex: 0.8 }}>Invoice #</div>
              <div style={{ flex: 0.9 }}>Date</div>
              <div style={{ flex: 1.2 }}>Period</div>
              <div style={{ flex: 0.8, textAlign: 'right' }}>Amount</div>
              <div style={{ flex: 0.6, textAlign: 'center' }}>Status</div>
              <div style={{ flex: 0.6 }}></div>
            </div>

            {/* Invoice Items */}
            {invoices.map((invoice) => (
              <InvoiceListItem key={invoice.id} invoice={invoice} />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      {invoices.length > 0 && (
        <div style={{ marginTop: '24px', color: '#666', fontSize: '14px' }}>
          Showing {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
