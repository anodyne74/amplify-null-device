# Coding Standards

Rules a reviewer checks a diff against. Each one comes from a bug that compiled, passed CI and reached dev; the incident is cited so the reason travels with the rule.

## Customer-facing copy

Applies to every string a Customer User can read: portal screens, help pages (`content/help/`), emails, error messages.

- **Use glossary names.** Every noun naming a domain thing matches `CONTEXT.md`; a word on any _Avoid_ list is a violation (e.g. "Preferences" on the Route Defaults page, #481; "jobs" on sign-in, #347). Plain marketing phrasing that names no domain thing is fine.
- **Speak only to Customer Users.** Customer copy describes what the Customer sees and does. It names no operators, drivers, staff, administrators or other Customers, and says nothing about how Routes are operated (#347, #481).

## Data schema and authorization (`amplify/data/resource.ts`)

- **Owner fields hold a Cognito sub.** Every `allow.ownerDefinedIn(...)` / `allow.ownersDefinedIn(...)` names a field holding the caller's sub (`accountOwnerSub`, `operatorSub`, `userSub`, `viewerSubs`), never a foreign key like `customerId`. A foreign key compiles and silently admits nobody (fixed on 8 models).
- **Field-level read rules match the model's.** A field whose read rules differ gets its own resolver, and subscriptions redact it, so `observeQuery` live updates lose the value (#443).
- **Field-level rules go on scalars.** `a.enum(...)` takes no `.authorization()`; a field needing its own rule is `a.string()` validated in code (#483).
- **Auth changes come with `npm run synth:auth -- <Model>` output** checked for who may set, null, delete and read, before a deploy is requested.

## Writing data

- **Omit an index-key field rather than send `null`.** DynamoDB rejects an explicit `null` on any attribute keying a secondary index (`AuditLog.customerId`; pass `customerId ?? undefined`). Broke all-customers Property History Reports until #395.
- **Send `null` only for fields the role may delete.** An update carrying `null` fails with "Unauthorized on [field]" unless the role has `delete` on that field; check with `npm run synth:auth`. Broke Route Request link/unlink (#401).
- **Test fakes reject what the real API rejects:** `null` index keys (as `app/api/property-history/reports/__tests__/routes.test.ts` does for `AuditLog.customerId`) and `null` fields the caller can't delete. Fakes that accepted both hid #395 and #401.

## Server routes (`app/api/`)

- **One client per route: the IAM client.** A route reads and writes every model through `lib/server/iamDataClient.ts`. Modules built on `lib/data-client.ts` (`lib/routes.ts`, `lib/customers.ts`, `lib/invoices.ts`, `lib/queries/*`, …) need a browser session; on the server they throw `NoValidAuthTokens`, which callers tend to swallow into a wrong "X not found" (invoice email, 2026-09-16).
- **Each new SES command gets its IAM action in the same diff.** The SSR role is granted SES actions one by one in `amplify/backend.ts` (`AllowSesSendEmailFromBranchDomain`); a missing one is AccessDenied on dev only, since tests mock SES (#468 → #488).

## Infrastructure (`amplify/backend.ts`)

- **Imported-role construct IDs are unique across all stacks.** CDK names an imported role's inline policy from the construct ID alone, so a repeated ID collides and the deploy rolls back (#341 → #351). CI doesn't synth, so only the Amplify build shows it.

## Live data

- **Copy `observeQuery` items before storing or memoising them** (`[...items]`). Amplify reuses one array across emissions, so anything keyed on its reference misses later pages and live changes (#457: Routes past the first 100 vanished).

## Sign-in and sign-out

- **Await sign-out through `signOut` from `aws-amplify/auth`.** `useAuthenticator().signOut` is a fire-and-forget dispatch; awaiting it before a navigation leaves the session alive (#205).
- **Drive the shared Authenticator by calling its transition functions (`toForgotPassword`, `toSignUp`, `toSignIn`) inside the click handler, with `<Authenticator>` always mounted** (visibility-toggled). `initialState` remounts, effect-based retries and conditional mounting each fail silently (see `app/page.tsx`).
