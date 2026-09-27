# Route Requests are captured from inbound email, and the raw message is the evidence

Status: accepted

Customers ask for Routes by emailing a Schedule, and they send Route Amendments the same way. These emails are the audit trail behind a Route and its invoice. Mail sent to a dedicated `requests@` address is captured by the existing SES inbound pipeline, which already stores every raw message in a versioned, retained bucket. Each email becomes a record holding the sender, the time sent, the subject, the plain-text body, the attachments and SES's SPF/DKIM/DMARC results. It waits in an administrator inbox until it is linked to a Route as its Route Request or as a Route Amendment, used to create a Route, or dismissed. The email is still forwarded to staff as before.

- The raw message stays the evidence. Only administrators can download it. Customers see only the extracted parts, through an API route that checks the caller's Customer (the same pattern as ADR 0003).
- An email that fails the SPF/DKIM/DMARC checks is flagged, not rejected. Only an administrator can turn an email into a Route, and some agencies' mail fails DKIM for harmless reasons.
- Email from our own domain, such as staff forwarding a phone request, is recorded as a manual Route Request with the requester entered by hand. Otherwise a staff member would appear to the customer as the person who made the request.
- A Schedule is never parsed automatically, and an Amendment never changes Stops. Both are records. The administrator edits the Route.
- Records live as long as the Customer, and are unlinked, not deleted, when their Route is deleted.

## Considered Options

- **Upload only (an administrator attaches the file and types in the sender and date).** Simpler, but the sender and time become claims typed in by staff, not facts taken from the email headers. It survives only as the fallback for requests that don't arrive by email.
- **Parse the Schedule or Amendment into Stops automatically.** Rejected for now. Schedules vary, and a record that is wrong but looks authoritative is worse than a manual edit.
- **Capture from the existing `admin@` address.** It would pull unrelated mail into the inbox.
