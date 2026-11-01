# A Route with no email has no Route Request

Status: accepted

ADR 0008 kept upload-and-type-in as the fallback for requests that don't arrive by email: an administrator uploaded the Schedule and entered the requester and the time by hand, and that became the Route's Route Request. Schedules are now read by a model (ADR 0014) from the email and its attachment, so an uploaded file no longer has a job, and a hand-typed requester is a claim, not a fact taken from the headers. The create page no longer offers it.

A Route made with no linked email has no Route Request. Who created it, and when, is in its audit trail. A request a staff member forwards from our own domain is still an email, marked as logged by staff, and the real requester is entered by hand (ADR 0008).

- Existing Route Requests recorded by hand are kept and shown as before. The create page no longer makes new ones.
- An administrator can still record a Route Request or a Route Amendment by hand on an existing Route, from its detail page. That is how a phone Amendment is kept; it is not part of creating a Route.
- A phone request has no record of who asked. The Route's notes are the place for that.

## Considered Options

- **Keep hand-recorded requests as an optional "Requested by" section.** Rejected: it keeps a second way to create a Route Request alive for a case the audit trail already covers.
- **Keep the Route Request card as it was.** Rejected: it asked every administrator for a requester on every Route, including Routes with no request.
