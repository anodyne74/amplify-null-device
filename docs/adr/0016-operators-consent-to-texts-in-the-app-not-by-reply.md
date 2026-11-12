# Operators consent to texts in the app, not by reply

Status: accepted

Notify Operator texts come from an alphanumeric sender name, which is one-way (ADR 0010): an Operator can't reply STOP, and a carrier's own opt-out handling never sees them. We still treat the Spam Act 2003's consent, identification and unsubscribe rules as binding, although a job text to a contractor about their own Route is arguably not a commercial message. So consent is held in the app as Text Consent (see `CONTEXT.md`), and a text goes out only when the Operator has said yes.

- Every Operator starts not yet asked, including those with a mobile number already on file. They are asked once, at their next sign-in, and can change their answer in their own settings. Dismissing the question is a no.
- The text carries no opt-out footer. Its 160 characters are for the Route, and the Customer's name is the part that would be cut to make room.
- Clients can't write Text Consent. The `Operator` model lets every Operator update every Operator, and field rules can't narrow that, so Text Consent lives in its own read-only model and one server route writes it with the IAM client, refuses an Operator changing anyone else's, and records each change in the audit log with the signed-in user as actor. An administrator turns it on for an Operator only by recording that the Operator agreed to them directly; turning it off needs no such record.
- Consent belongs to the number it was given for. Replacing the number with a different one, or removing it, takes the Operator back to not yet asked.

Whether the Spam Act applies at all is not settled by this decision. If a lawyer confirms it doesn't, the consent step can be relaxed without changing how it is written.

## Considered Options

- **Treat the numbers already on file as consent.** Rejected: the consent record would be an administrator's data entry, not the Operator's own act, and we'd have to explain it to a regulator or AWS.
- **Operators ask the office to stop texts.** Rejected: an opt-out that depends on someone at the office acting is the weakest kind, and it leaves no record of the request.
- **A footer link to turn texts off.** Rejected: it cuts the Customer's name from about 67 characters to about 25.
- **A dedicated number so Operators can reply STOP.** Already rejected for ADR 0010: replies nobody watches, plus number registration and a monthly cost.
- **Let clients write the field under the model's existing rules.** Rejected: any Operator could change another's consent, and the audit actor couldn't be trusted.
