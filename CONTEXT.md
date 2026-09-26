# Delivery Management

Role-based delivery management system for sign-run operations: signs are placed on customer properties, then picked up and returned. Three portals (administrator, operator, customer) share this vocabulary.

## Language

**Route**:
A single trip assigned to an operator, made up of Stops, progressing through the Sign Run phases in order.
_Avoid_: Job, trip. "Visit" means one Route at one Property, not the Route itself.

**Stop**:
One visit to a Property on a Route, where signs are placed and later picked up.
_Avoid_: Property (when you mean the single visit), location, visit

**Property**:
The real-world address a Stop visits; many Stops, across many Routes and Customers, can share one Property. Identified by street number, street, suburb and postcode, never by map coordinates or a geocoder's place identifier, so one address is always one Property even when its pin is wrong. Where the geocoder and the entered address disagree on suburb, the entered address wins.
_Avoid_: Location, site, address (when you mean the place rather than the text)

**Location Precision**:
How well a Property's pin matches the real address: Precise (rooftop), Interpolated (estimated along the street, usually within a few houses), Approximate (e.g. the middle of the street, possibly far from the house), or Confirmed (set by hand, so it outranks the others and is never overwritten). Only Approximate needs fixing. Precision affects maps, never Property identity or Property History.
_Avoid_: Accuracy, geocode quality, verified/unverified

**Property History**:
The record of every Route that has visited a Property, grouped by Property and explorable by suburb, street or exact address.
_Avoid_: Property search, address lookup

**Visit**:
One Route's Stop at a Property, as one row of Property History. Only visits on Routes that have happened (signs placed or later) count toward a Property's total. Skipped Stops are listed but not counted, and upcoming Routes appear separately as scheduled.
_Avoid_: Job, service (as a noun)

**Property History Report**:
A frozen PDF snapshot of a filtered Property History view, generated for one Customer's scope (or across all Customers by an administrator), recording who generated it, when, and with which search and filters. It belongs to the Customer, not the person who generated it.
_Avoid_: Export, audit PDF, property report

**Retention**:
A Property History Report's lifecycle: active for 30 days, then soft-deleted (hidden from the Customer, restorable by an administrator for a fresh 30 days), then hard-deleted at 60 days (PDF destroyed, record kept as a stub). A manual delete by an Account Owner is an early soft delete.
_Avoid_: Expiry, archive (Route already uses "archived")

**Sign Run**:
The phase flow a Route moves through: Load (signs collected from the customer, onto the van) → Placement (signs deployed) → Pickup (signs retrieved) → Unload (signs returned to the customer) → Finalise. A Route's current phase is derived from which phase-completion timestamps are set, not from a separately stored "current phase" pointer.
_Avoid_: Delivery run, job flow. Also avoid calling the Load phase "signs collected" — that phrase is reserved for the Signs Collected metric below, a different phase and a different count.

**Sign Run Transition**:
One operator action that moves a Route along its Sign Run — start or confirm Load, start or complete Placement, start or complete Pickup, start or confirm Unload, Finalise. Each is only allowed from its own phase; one attempted from any other phase is refused and nothing is written.
_Avoid_: Status change, phase update

**Signs Placed**:
The gross count of signs put out on a Route — `sum(Stop.numberOfSigns)`, no exclusions. Answers "how many signs are on this route," independent of what happens afterward.
_Avoid_: Total signs, sign count

**Signs Collected**:
The net count of signs actually recovered during Pickup — summed only over Stops that were completed (not skipped), each stop's contribution reduced by that stop's Missing Signs. A Route with Stops still in progress reports a partial, growing figure.
_Avoid_: Total signs, returned signs

**Missing Signs**:
Signs logged as lost during the Pickup phase (`Stop.missingSignsCount`) — one tap logs one missing sign; a missing sign never counts as collected. Tracked as its own metric to identify locations with high loss rates (sign attrition), independent of reconciliation or billing.
_Avoid_: Lost signs, sign loss (except when specifically discussing the attrition-analysis use case)

**Reconciliation**:
The Unload/Finalise-time accounting of a Route's signs — how many were loaded onto the van, returned, still on-site, or missing, plus how many Stops were completed vs. skipped. Distinct from Signs Placed/Collected, which are simpler standalone counts usable anywhere in a Route's lifecycle.
_Avoid_: Summary, totals

**Account Owner**:
A Customer user who can see the Customer's invoices and manage its users and Property History reports. The other Customer user role, read-only, sees Routes and Stops only.
_Avoid_: Customer Admin, customer administrator

**Customer Access Sync**:
Rewriting who may read a Customer's records after its users change — every record the Customer owns carries the list of its users (and, on the Customer itself, the Account Owner), and all of them are restamped together whenever a user is added, removed or activated. Derived from the Customer's current users, never supplied by the caller; a sync that can't read the full user list changes nothing.
_Avoid_: viewerSubs sync, backfill, profile access sync

**Feature Flag**:
A temporary switch that gradually rolls out one customer portal feature, Customer by Customer, until it's on for everyone and the switch is removed. Its state is **Off** (the default), **Selected Customers**, or **Everyone** (which includes Customers created later). Switching a flag Off pauses it without forgetting its Selected Customers. Only administrators change it, and all users of one Customer always see the same thing. While a flag is off for a Customer, that Customer's users can't use the feature at all and see no sign of it. Flags limit customer users only, never operators or administrators acting for a Customer.
_Avoid_: Toggle, entitlement, plan feature (a flag is never a permanent difference between Customers)
