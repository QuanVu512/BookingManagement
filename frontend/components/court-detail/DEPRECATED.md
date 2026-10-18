# DEPRECATED — static court-detail mockup

This folder is quarantined legacy UI. It is not imported by the live court
route and must not be extended or used as a source of booking behaviour.

The live flow is owned by:

- `frontend/features/courts/` — court model, API, hooks and views
- `frontend/features/booking/` — availability, quote and hold flow
- `frontend/app/courts/[courtId]/booking-screen.tsx` — route composition

Sibling legacy artefacts (`frontend/lib/court-booking.ts`,
`frontend/hooks/use-court-booking.ts`, `frontend/types/court-booking.ts` and
`frontend/data/court-booking.json`) are part of the same quarantine. Keep their
internal imports intact while the artefacts remain; do not import them from new
code.
