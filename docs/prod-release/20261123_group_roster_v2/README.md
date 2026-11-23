# Group roster and check-in reward safety release

Base: cf3142c. Version: 261123.1713.
Scope: roster v2 with required revision and operation replay, shared-ticket add/refund, explicit cancellation scope wording, atomic undo-checkin and exact reward revocation with duplicate reward guard.

The legacy roster RPC rejects ALL saves and asks clients to refresh. No member repair or HR permission revocation is included. No production test bookings are created.

Release files preserve the reviewed accounting bodies and add strict dependency/ACL checks and pre-commit exact body hashes. Environment placeholders are pinned to production. Precheck is also embedded in the roster apply transaction. Original source checksums are recorded in SOURCE_FINGERPRINTS.json.

Order: reward apply + verify, then roster apply + verify, then frontend deploy. If an installed feature is unsafe, revoke authenticated EXECUTE on the affected RPC and preserve logs. Do not drop group_op_log or restore known-unsafe legacy code. Any data repair, permission restoration or database rollback needs separate authorization.

Validation: reviewed test-database scenarios, concurrency and browser evidence are documented in the private handoff; final release regression checks run against the actual release worktree and clean master. Existing baseline failures remain documented separately. No background monitoring is installed.
