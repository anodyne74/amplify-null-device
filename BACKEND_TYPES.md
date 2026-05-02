# Backend Types and Operator Payload Contract

## Purpose
This document defines the route payload used by operator clients, including the Android app, and the planning metadata required by administrators.

## Core Models

### Route
- `id: string`
- `customerId: string`
- `status: 'planned' | 'active' | 'completed' | 'archived'`
- `estimatedDurationMinutes?: number`
- `actualStartTime?: string` (ISO-8601)
- `actualEndTime?: string` (ISO-8601)
- `actualDurationMinutes?: number`
- `notes?: string`
- `createdAt?: string` (ISO-8601)
- `updatedAt?: string` (ISO-8601)

### Stop
- `id: string`
- `routeId: string`
- `customerId?: string`
- `sequence: number` (strict ordered position in route)
- `address: string`
- `formattedAddress?: string`
- `serviceType?: 'delivery' | 'pickup' | 'inspection'`
- `estimatedArrivalTime?: string` (ISO-8601)
- `actualArrivalTime?: string` (ISO-8601)
- `actualDepartureTime?: string` (ISO-8601)
- `numberOfSigns?: number`
- `agent?: string` (listing/real-estate agent contact)
- `isAuction?: boolean`
- `latitude?: number`
- `longitude?: number`
- `notes?: string`
- `createdAt?: string` (ISO-8601)
- `updatedAt?: string` (ISO-8601)

## Operator Route Detail Payload
The operator detail contract must always return stops sorted by `sequence` ascending.

```json
{
  "route": {
    "id": "route-123",
    "customerId": "customer-001",
    "status": "planned",
    "estimatedDurationMinutes": 140,
    "notes": "Saturday run"
  },
  "stops": [
    {
      "id": "stop-1",
      "sequence": 1,
      "formattedAddress": "10 Bridge St, Sydney NSW 2000, Australia",
      "numberOfSigns": 2,
      "agent": "Taylor Smith",
      "isAuction": false,
      "latitude": -33.864,
      "longitude": 151.207
    },
    {
      "id": "stop-2",
      "sequence": 2,
      "formattedAddress": "200 George St, Sydney NSW 2000, Australia",
      "numberOfSigns": 4,
      "agent": "Morgan Lee",
      "isAuction": true,
      "latitude": -33.869,
      "longitude": 151.209
    }
  ]
}
```

## Access Policy
- Administrator group:
  - Full planning permissions (create/edit/delete/reorder routes and stops).
- Operator group:
  - Read routes and stops.
  - Execution updates only (route status/time progression and stop operational timestamps).
- Customer owner:
  - Read-only access to owned route/stop records through `customerId` ownership mapping.

## Android Consumer Requirements
- Always sort stops by `sequence` client-side as a defensive fallback.
- Treat timestamps as UTC ISO-8601.
- Prefer `formattedAddress`; fallback to `address` when absent.
- Use `updatedAt` for sync conflict resolution and incremental refresh.
