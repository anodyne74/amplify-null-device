# Every branch's inbound mail rule lives in one shared, always-active SES rule set

Status: accepted

SES delivers inbound mail through only one receipt rule set per account and region: the active one. Production (`main`, nulldevice.com.au) and development (nulldevice.dev) deploy into the same account and region, and both need to receive mail.

When each branch had its own rule set, only one could be active at a time. Activating on deploy meant whichever branch built last took every address, and the other branch's mail bounced as "550 mailbox unavailable" until its next build. So no branch owns a rule set. There is one shared set, `inbound-rule-set-nulldevice`, that stays active. Each branch adds a single rule to it, covering only its own domain's addresses, and removes only that rule when the branch is deleted.

The deploy creates the set if it's missing and never deletes it, since another branch's rule may still be in it. It makes the set active only after the branch's rule is in place, so switching over from the old per-branch set loses no mail. The build script that ensures the active rule set still runs on every build, in case the active set is changed by hand.

## Considered Options

- **Per-branch rule sets, activated on deploy (what we had).** Simple until two branches need mail at once, which they now do.
- **Per-branch rule sets, only production activates.** Production gets mail and development permanently doesn't, which breaks testing Route Request capture.
- **A separate AWS account or region for development.** This is the clean isolation, but it means a second SES domain verification, a second sandbox and a second set of Cognito and Amplify infrastructure, all to solve one shared pointer.
