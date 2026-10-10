# A Route's phase is five different questions, each with its own function

Status: accepted

Five functions read a Route's phase, and they disagree on purpose. `getSignRunPhase` is the Working Phase, the one an Operator is on, so the next Operator screen unlocks the moment the previous phase is confirmed. `getRoutePhaseKey` is the last phase completed, read off timestamps, for staff badges, filters and counts. `customerProgressPhase` switches to Pickup only once Pickup has started, so a Customer sees every sign placed rather than none picked up. `stopPhaseOf` is the phase Stops are settled against, or null outside Placement and Pickup. `labelledPhase` is the phase a Stop's status is shown for. They look like six-way duplication; they are not, and merging them would make one of the answers wrong.

## Considered Options

- **One Route phase module that every screen asks.** One place for the legacy `signs_placed` mapping. But the answers differ by design, so it would either return one of them and misreport the others (reading `executionPhase` for badges reports a route one phase further along than it is), or become a bag of five named answers with no more depth than the five functions.
- **Five functions, one question each (chosen).** What they do share is extracted instead: `isRouteCompleted()` for the legacy `archived` status (#536). The Working Phase is named in `CONTEXT.md`.

## Consequences

A screen that needs a phase picks the function for its question, or adds a new named one; it does not read `executionPhase` or `status` itself. The operator Route detail page's Stop list is likewise deliberately an overview and is not filtered by `stopPhaseOf`.
