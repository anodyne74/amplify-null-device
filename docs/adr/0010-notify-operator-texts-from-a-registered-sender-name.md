# Notify Operator texts from a registered sender name; only production texts any Operator

Status: accepted

Notify Operator texts the Route's Operator as well as emailing them, when the Operator has an Australian mobile (#423). The text goes through AWS End User Messaging SMS, one-way, from the alphanumeric sender name "NullDevice". From 1 July 2026 Australian carriers block sender names that aren't on the ACMA Sender ID Register, so the name is registered (#422). Operators can't reply to it. Anything they need to say goes through the office as it does now.

The text is one SMS, at most 160 characters from the basic SMS alphabet, ending in a short link (`/r/<Route id>`) to the Route. Only the Customer's name is shortened when it wouldn't fit, because the Route code, Stop count, date and link are what the Operator acts on.

The SMS account (its sandbox, sender name and spend limit) is shared by every branch, just like SES. So the decision about who may be texted isn't left to whichever data a branch holds. Production texts any Operator. Every other branch texts only the numbers in its `SMS_TEST_NUMBERS` build variable, and skips the rest with a reason the administrator sees. That list stays out of `amplify_outputs.json`, which browsers download.

Each Notify Operator writes one audit entry against the Route, with the channels that went out or why they didn't, and the mobile masked.

## Considered Options

- **A dedicated number (long code or toll-free) so Operators can reply.** Two-way texting brings replies nobody is watching, plus number registration and a monthly cost. Operators already call the office.
- **Amazon SNS SMS.** Simpler to call, but AWS now steers SMS to End User Messaging, and SNS gives no configuration set or per-branch delivery logs.
- **Text automatically on assignment.** Rejected for the same reason the email isn't sent automatically: administrators often assign and reassign while planning, and each text costs money and interrupts the Operator.
- **A separate AWS account for development.** It's the clean isolation, but it's the same trade-off ADR 0009 turned down for SES.
