# Route Links are random codes stored on the Route and resolved in the portal

Status: accepted

Notify Operator's text ends in a link to the Route (ADR 0010). That link used to carry the Route's id, a 36-character UUID, which took about 60 of the text's 160 characters. It now carries a six-character code instead, a Route Link, so more of the Customer's name survives. Texts already sent keep working: `/r/` still accepts a Route id.

The code is six lowercase characters from `23456789abcdefghjkmnpqrstuvwxyz` (no `0`/`o`/`1`/`l`/`i`), matched without regard to case. It is random, stored on the Route, and made the first time the Route is notified. The Route keeps it, so every later Notify Operator sends the same link. Existing Routes need no backfill.

`/r/<code>` stays an unauthenticated redirect that reads no data. It forwards to `/operator/routes/detail?code=<code>`, and the portal, signed in, finds the Route through a secondary index on the code under the user's own AppSync authorization. An unknown code shows the same not-found state as an unknown id. The code is not a secret: it opens only a Route the signed-in person could already read, so it is readable wherever the Route is. It is not writable by Customer users, though: the Route's coarse `update` for them (kept for `customerInstructions`) would otherwise let one repoint a link already texted, so the field takes the same read-only-for-customers rule as `pickupDate`. Read rules stay identical to the model's, which is why subscriptions don't redact it, and that is fine here.

Creating the code happens in the Notify Operator server route, which already uses the IAM client. It reads the Route and uses its code if it has one. Otherwise it generates a code, checks the index for a clash, and writes the code only if the Route still has none. If that conditional write fails, it re-reads and uses the winner's code. This keeps two simultaneous notifications from replacing a code that has already been texted, and keeps two Routes from sharing one.

## Considered Options

- **Look the code up in `/r/` with the IAM client and redirect with the Route id.** Keeps the portal page unchanged, but puts full, unrestricted IAM data access (ADR 0001) behind an unauthenticated endpoint, and tells anyone whether a code exists.
- **Derive the code from the Route's `routeCode` (`/r/W41-26-003`).** No schema change, but `routeCode` is made in the browser, isn't enforced unique, and is easy to guess.
- **Make the code when the Route is created.** Every other Route flow would then have to make one, and old Routes would need a backfill, for a code only Notify Operator uses.
- **Field-level read restriction to staff.** Hides nothing a Customer user couldn't already see by opening the Route, and a read rule that differs from the model's has bitten before (identical read rules are what keep subscriptions from redacting fields).
