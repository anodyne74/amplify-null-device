# Property identity is the address, not the geocode

Status: proposed

A Property is identified by street number, street, suburb and postcode. When the geocoder and the entered address disagree on suburb, the entered address wins. Using Google's place ID looks like the obvious choice, and it was the first plan. It was rejected because Google can only approximate some addresses and returns the street's midpoint. That result carries the *street's* place ID, so every house on a long street would collapse into one Property, and one house's Property History would list every visit on that street. That error is exactly what agents, who know these suburbs, would catch. Coordinates and place ID are kept for maps only, where their Location Precision is tracked and Approximate pins are corrected by hand.

## Consequences

Property identity depends on address text being consistent. Earlier backfills corrected Stop addresses by hand, and those corrections must not be overwritten by re-geocoding. The geocode backfill therefore gains an assess mode that records only precision and address components, and a Confirmed location is never replaced automatically.
