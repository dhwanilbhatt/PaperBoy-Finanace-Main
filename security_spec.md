# MacroLens Security Specification (Phase 0 TDD)

## Data Invariants
1. `marketInstruments/{instrumentId}` documents contain strictly non-PII market quote data (`isPublic == true`), bounded string lengths matching `firebase-blueprint.json`, valid `signal` enum (`relief` | `watch` | `danger`), and valid document IDs (`^[a-zA-Z0-9_-]+$`).
2. `marketSnapshots/{snapshotId}` documents contain strictly non-PII macro/credit indicators (`isPublic == true`), numeric ranges, and server-enforced `updatedAt == request.time`.
3. Only verified Google-authenticated users (`request.auth != null && request.auth.token.email_verified == true`) may create or update market records, and `updatedByUid` must always equal `request.auth.uid`.
4. Unauthenticated or unverified clients cannot write, delete, or inject shadow fields.

## Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated `setDoc` on `marketInstruments/brent-co1`.
2. Verified user `setDoc` with spoofed `updatedByUid` belonging to another user.
3. Verified user `setDoc` with `email_verified: false`.
4. Shadow field injection (`isAdmin: true` or `shadowTag: "hack"`) on `create`.
5. Shadow field injection (`affectedKeys()` bypass attempt) on `update`.
6. Client-supplied `updatedAt` timestamp not equal to `request.time`.
7. Oversized `interpretation` string (> 240 chars) attempting storage exhaustion.
8. Invalid `signal` enum value (e.g. `"critical"` instead of `"danger"`).
9. Invalid document ID poisoning (`../admin/root` or 200-char ID).
10. Delete attempt on `marketInstruments/brent-co1` or `marketSnapshots/current`.
11. Unauthenticated `list` query without `where('isPublic', '==', true)` filter.
12. Wrong type injection (`numericValue: "92.69"` string instead of number).
