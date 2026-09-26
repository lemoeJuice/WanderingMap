# Decisions

## Place visit state is derived from VisitRecord

The design draft's `Place.visitState` includes `visited`, while the project invariant makes `VisitRecord` the sole source of visit facts. Current `Place.lifecycle` therefore models only `wishlist`, `active`, or `archived`; visit count, last visit, and dwell time are derived from `VisitRecord`.

When upgrading legacy IndexedDB data or importing schema v1 archives, `visitState: 'visited'` becomes `lifecycle: 'active'`. No visit record is invented from that flag, because it contains no visit timestamp or other visit fact.
