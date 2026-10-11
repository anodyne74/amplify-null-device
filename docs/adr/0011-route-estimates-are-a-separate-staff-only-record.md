# Route Estimates are a separate staff-only record, not fields on Route

Status: accepted

A Route Estimate (the road distance an Operator will drive, Leg by Leg, from their home base through the Route's Stops and back) is stored in its own record, one per Route, readable only by staff. Its first and last Legs reveal where an Operator lives, and Customers can read `Route`, so the estimate must never be reachable through a Customer's Route queries or subscriptions. Keeping it off `Route` makes that true by construction, rather than by a rule someone has to keep right.

## Considered Options

- **Fields on `Route` with field-level authorization.** One fewer model, and the estimate arrives with the Route. But it's the shape that has gone wrong here before: a field rule only redacts if the read rules differ, subscriptions don't redact when they're identical (#443), and `Route` has already had silent authorization bugs. A mistake would leak an Operator's home address to Customers.
- **A staff-only record keyed by Route (chosen).** Costs one more model and a second query on the staff screens that show it. Customer access to `Route` can change freely without ever touching the estimate.

## Consequences

Anything that deletes or reassigns a Route has to consider its estimate. The record also keeps the Stops and Operator it was calculated from, which is how a Route that has since changed is shown as out of date.
