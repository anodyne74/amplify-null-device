# Delivery Management

Role-based delivery management system for sign-run operations: signs are placed on customer properties, then picked up and returned. Three portals (administrator, operator, customer) share this vocabulary.

## Language

**Route**:
A single trip assigned to an operator, made up of Stops, progressing through the Sign Run phases in order.
_Avoid_: Job, trip

**Stop**:
One property visit on a Route, where signs are placed and later picked up.
_Avoid_: Property, location, visit

**Sign Run**:
The phase flow a Route moves through: Load (signs collected from the customer, onto the van) → Placement (signs deployed) → Pickup (signs retrieved) → Unload (signs returned to the customer) → Finalise. A Route's current phase is derived from which phase-completion timestamps are set, not from a separately stored "current phase" pointer.
_Avoid_: Delivery run, job flow. Also avoid calling the Load phase "signs collected" — that phrase is reserved for the Signs Collected metric below, a different phase and a different count.

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
