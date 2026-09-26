# Property History reports are frozen snapshots, not saved queries

Status: proposed

A Property History report answers an agent's question ("which of these properties did you service, and when?"), so it has to show what we told them on the day we told them. Each report is stored as a generated PDF plus a record of who generated it, when, for which Customer and which search. Reopening it never runs the search again. The alternative was to save only the search and regenerate on open. That's cheaper to store and always current, but it was rejected because later edits to Routes, Stops or Invoices would silently change a document that has already gone to an agent.

## Consequences

Reports can go stale by design. A route edited after generation is not reflected. Soft delete, restore and hard delete operate on the stored report record and its PDF, so a retention mechanism has to exist for them.
