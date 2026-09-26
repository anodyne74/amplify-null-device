# Feature Flags are resolved server-side, and flagged writes go through server routes

Status: proposed

Everything else in the customer portal reads its data straight from AppSync, so a new reader will expect Feature Flags to be an AppSync model too. They aren't. A server endpoint works out which flags are on for the caller's Customer and returns only those names. Customers can't read flag records directly, so they never learn which other Customers have a flag, or even that a flag they don't have exists. AppSync permission rules can't check a flag, so any customer write that belongs to a flagged feature must go through a server route that checks the flag using the same calculation. Otherwise, turning a flag off would hide the feature without actually stopping anyone using it. If the flag check fails, every flag is treated as off: core features keep working and flagged ones disappear.

## Considered Options

- **Flag states readable by all users, Customer lists stored on each Customer's own record.** No extra request, but every customer could see every flag's name and state, and it still wouldn't stop direct AppSync writes.
