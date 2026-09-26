# Operator notifications are live, best-effort toasts; route events aren't stored

Status: accepted

An operator gets an in-app toast when a Route is assigned to them or a Customer changes its instructions (`lib/useOperatorRouteNotifications.ts`). The hook compares the operator's live Route list with the last copy it saw. It doesn't read a stored record of events. When the subscription connects or resyncs, it takes a fresh copy without toasting, so a change made while the operator was offline never toasts. That's accepted: the operator still sees newly assigned Routes and their instructions on the dashboard and Route detail, which update live. The job-assigned email stays a deliberate, manual Notify Operator action on route edit, separate from the toast.

A future architecture review may spot the offline gap and suggest storing Route events. Don't do that unless a missed notification has caused a real problem.

## Considered Options

- **A `RouteEvent` model written by `lib/routes.ts`.** Toasts would survive going offline, but every browser client, Customers included, would need permission to create events. A crash between the Route write and the event write loses the event, and each operator would need a record of what they've seen, all for a toast.
- **A `RouteEvent` model written by a DynamoDB-stream Lambda on the Route table.** This is the reliable version, and the one to build if this decision is reopened. It adds backend infrastructure per branch, plus the same record of what each operator has seen.
- **A shared `routeChanges(before, after)` rule with nothing stored.** The rule is about ten lines, and the toast and the email don't actually share it, since the email is a manual action. The offline gap would remain.
