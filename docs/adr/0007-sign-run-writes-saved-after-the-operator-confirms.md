# Sign Run writes are saved after the operator confirms, through a per-device outbox

Status: accepted

Starting or ending a Sign Run phase took 20-30 seconds in the field (#266), though AppSync never took more than about 600 ms. The time was spent before the mutation was sent, most likely a stalled Cognito token refresh while the phone switched networks. So a Sign Run Transition, a Stop settlement and Finalise now take effect on the operator's screen as soon as they confirm, at the time the confirm dialog opened. The write goes into an outbox kept on the device (localStorage), and the operator never waits on the network.

- The outbox's writes are sent strictly in the order tapped, one Route at a time.
- Network trouble is retried with backoff for as long as it takes.
- A write the server rejects stops the queue for that Route. It and every write queued after it are undone on screen, and the operator can Try again or Discard.
- Writes less than 12 hours old are resent automatically when the app reopens. Older ones wait for the operator to send or discard them.
- Every operator screen on the device shows the Route with the outbox applied. Everyone else sees a change once it's saved.

Concurrent edits stay last-write-wins, as they were before. There's no version check.

## Considered Options

- **Keep waiting for the save, and refresh the token ahead of time.** This is simpler, but any network stall still freezes the operator mid-run. The early refresh is kept as well as the outbox, so background saves rarely stall.
- **Keep unsaved writes in memory only.** Phones kill background tabs, and a lost Start Pickup would silently corrupt billed minutes.

## Consequences

- An administrator or Customer can see a Route a few seconds, or hours with no signal, behind what the operator's screen shows. The recorded times are still the operator's confirm times.
- Anything added to the Sign Run must go through the outbox, or its writes can overtake earlier queued writes on the same Route.

## Administrator actions save straight away

An administrator can settle a Stop and Finalise a Route from the Route's detail page (`lib/administratorRouteActions.ts`). These don't use the outbox. They save straight away, the administrator waits for the save, and each is recorded in the audit log. The outbox exists for a phone in the field. An administrator is at a desk, and the outbox couldn't order their writes against the operator's anyway, because it's per device. An operator's write still queued for the same Route or Stop can therefore land after an administrator's and win. That's the same last-write-wins as any other concurrent edit.
