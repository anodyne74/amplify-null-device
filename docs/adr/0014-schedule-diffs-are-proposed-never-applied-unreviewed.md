# Schedules are read into a Schedule Diff that an administrator reviews

Status: accepted

ADR 0008 said a Schedule is never parsed automatically, because a record that is wrong but looks authoritative is worse than a manual edit. That still holds, but the manual edit is now the slow part: each week the administrator copies the previous Route, opens the Schedule and compares the two by eye. Customers rewrite the Schedule's layout often (column headings, title, prefixes such as `New -` and `Auction`, agents as initials one week and first names the next), so a fixed parser breaks. The text layer of these PDFs is sound.

When an administrator creates a Route from a Route Request, the Schedule's layout-preserving text and the email's plain-text body are sent to a model (Bedrock, in our own AWS account) that returns rows. The rows are compared with the copied Route's Stops and become a Schedule Diff: adds, drops and changes. The administrator accepts or rejects each line; only accepted lines touch the Route.

- Nothing is written to a Route without that review. The Schedule is still kept exactly as received.
- Rows match Stops by Property key (ADR 0004), never by the model's reading of an address. A row that can't be matched is flagged, not guessed. `New` in the Schedule is a hint only.
- Agents are read against the copied Route's existing agent values, so `BO`, `Betty` and a typo are not reported as three changes. Unmatched agents are shown as new.
- The Schedule's own totals are checked against the rows. A mismatch is a warning on the Diff, not a block.
- A PDF with no text layer is not read; the administrator uses the manual flow.
- The result is stored on the Route Request, so reopening it doesn't call the model again. It runs when the administrator asks, not when the email arrives, so mail that is never made into a Route costs nothing.
- A Route Amendment is read the same way, once an administrator has linked it to its Route (linking starts the read; if the read fails the link stands and it can be retried). Its Diff is against the Route's Stops as they are then, so earlier accepted amendments and manual edits count. Only the additions and drops the amendment states are proposed: a Property a revised Schedule leaves out is flagged, never proposed for dropping. A Property named without a suburb takes it from the Route's own Stops on that street, or is flagged unmatched. The administrator reviews the lines on the Route's detail page, and can accept them only until Load starts. The Customer is shown nothing new.

## Considered Options

- **Harden the regex parser.** Rejected: the layout changes faster than the rules can.
- **Import Stops automatically.** Rejected for the reason in ADR 0008.
- **Keep it fully manual.** Remains the fallback for scans and for requests with no Schedule.
- **Extract when the email is captured.** Rejected: spends model calls on mail that is never used and adds work to the capture Lambda.
