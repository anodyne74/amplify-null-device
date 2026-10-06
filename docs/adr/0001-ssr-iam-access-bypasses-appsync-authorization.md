# SSR IAM access bypasses per-model AppSync authorization; routes self-enforce instead

Status: accepted

## Context

A handful of Next.js API routes (`sync-profile-access`, `invite-user`, `send-invoice-email`, `send-job-assigned-email`) need to read/write across models in ways a Cognito user-pool session can't support from inside an SSR handler — e.g. looking up a customer's own mapping before an owner-scoped session exists. They call `generateClient({ authMode: 'iam' })` (`lib/server/iamDataClient.ts`). `AWS_IAM` was already enabled as an additional auth provider on the AppSync API (Amplify turns it on automatically for the `allow.resource(...)` grants on the two activation Lambdas), but the shared `AmplifyHostingSSRCompute` role itself had no grant to call it — every IAM-signed request from these routes was silently rejected, surfacing as misleading "not found" errors rather than an auth failure.

None of the 16 models declare a model-specific IAM authorization rule. Amplify Gen 2's compiled AppSync resolvers treat any direct (non-Identity-Pool) IAM-signed caller as unconditionally authorized on every `Query`/`Mutation` field — there is no per-model restriction available at the AppSync layer for IAM-mode callers, only for Cognito-group/owner-based callers. This was already true before this change (via the two Lambdas' grants); it just hadn't been exercised for SSR-originated calls.

## Decision

Grant `grantMutation`/`grantQuery` on the whole AppSync API (scoped to this branch's own API ARN) to the shared `AmplifyHostingSSRCompute` role, rather than hand-writing a narrower per-field IAM policy or building a wrapping-helper mechanism to enforce authorization at the client layer. Authorization for IAM-mode calls is enforced entirely inside each Next.js route — verify the caller's JWT and `cognito:groups` claim before calling `getIamDataClient()` — not at the AppSync layer.

The narrow alternative (a hand-maintained IAM policy enumerating exactly which fields each call site needs) was rejected: it has to be kept in sync by hand every time one of these routes' data needs change, for marginal benefit given there are currently only four call sites, all code-reviewed.

## Consequences

Every current and future route that calls `getIamDataClient()` gets full, unrestricted CRUD on all 16 models — including `PaymentRecord`, `OrganizationSettings`, and `CustomerUser.role` — with no AppSync-side backstop. The in-route Cognito-group check is the *only* authorization boundary for IAM-mode access; there is no schema-level safety net to catch a route that omits or misorders that check. Anyone adding a new `getIamDataClient()` call site must independently re-verify caller identity via the JWT/`cognito:groups` claim before using it — reviewers should treat a new `getIamDataClient()` call site without a preceding group check as a full multi-tenant authorization bypass, not a minor omission.
