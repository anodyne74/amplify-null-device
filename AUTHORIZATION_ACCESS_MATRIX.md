# Authorization Access Matrix (Amplify Gen2)

This matrix reflects the current data authorization intent in amplify/data/resource.ts.

## Identity Mapping

- Customer identity claim: sub
- Operator role: Cognito group operator
- Customer-scoped ownership field: customerId (for Route, Stop, Invoice, LineItem, PaymentRecord)

## Model Access by Role

| Model | Customer | Operator |
|---|---|---|
| Customer | create, read, update (owner by sub) | read, create, update, delete |
| Operator | read (owner by sub) | read, create, update, delete |
| Route | read when route.customerId == user sub | read, create, update, delete |
| Stop | read when stop.customerId == user sub | read, create, update, delete |
| Invoice | read when invoice.customerId == user sub | read, create, update, delete |
| LineItem | read when lineItem.customerId == user sub | read, create, update, delete |
| PaymentRecord | read when paymentRecord.customerId == user sub | read, create, update, delete |
| AuditLog | no direct customer access | read, create |

## Operational Verification Checklist

- Customer can list only own Route records.
- Customer can list only own Invoice records.
- Customer can fetch invoice details only when invoice.customerId matches customer identity.
- Customer cannot read another customer's Invoice by direct id.
- Operator can create/update/delete all operational models.
- Operator-only access is enforced for AuditLog reads/creates.

## Notes

- Stop and LineItem now support optional customerId for tenant-safe read scoping.
- Operator workflows that create Stop and LineItem should populate customerId consistently.
