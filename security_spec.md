# Security Specification - Salon Booking System

## Data Invariants
1. A booking cannot be created for a past date or time.
2. A booking's `timeSlot` must correspond to a valid business hour slot.
3. A booking cannot be confirmed without a `paymentId` (if payment is required).
4. `locked_slots` must have an `expiresAt` in the future relative to creation.
5. Only admins can create/delete `blocked_slots`.
6. Users can only read their own bookings (via phone or UID if authenticated).
7. Admins can read/write everything.

## The Dirty Dozen Payloads (Rejection Targets)
1. **Past Date**: Create booking for `2020-01-01`.
2. **Double Booking**: Create booking for a slot already marked `confirmed` in another document.
3. **Invalid ID**: Document ID contains malicious characters.
4. **Size Exhaustion**: Booking name is 1MB string.
5. **Unauthorized Admin Access**: Non-admin trying to write to `services/`.
6. **Self-Elevated Status**: User tries to create booking with `status: 'confirmed'` without payment verification logic check.
7. **Orphaned Lock**: Create `locked_slot` for a date that doesn't exist (negative year).
8. **Expired Lock Write**: Create a lock with `expiresAt` in the past.
9. **Tamper with Registration**: User tries to update `createdAt` of a booking.
10. **State Shortcut**: Update booking status from `pending` to `confirmed` without `paymentId`.
11. **PII Leak**: Read all bookings without being an admin.
12. **System Field Injection**: Include `__internal__` fields in reservation.

## Test Runner (TDD)
I will implement `firestore.rules` to reject these.
