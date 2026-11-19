# Ticket accounting safety release · 2026-11-19

Authorized priority: correct deductions/refunds. No historical balance or booking rewrite. Frontend based on origin/master563a40a; Employee and member mobile clients are included. The scoped employee mobile calendar layout fix is included; it passed320/390/430px isolated rendering and month/card interactions. No separate mobile accounting rules.

Server: zero-value links do not count as charges; nonstandard/negative ledgers stop for manual review. Booking-before-ticket locks and cancellation guards; refund exactly once; expiry cancellation stops if refund fails. Member group cancellation uses atomic preview revision and explicit seat, refuses stale intent/rejoined-seat ABA; old API requires refresh. New endpoints auth-only, internal accounting helper not public.

Evidence: real HTTP assertions23 passed; sole original report failure is incomplete two-role desktop/mobile UI declaration, retained unchanged. Four exact-txid concurrency pairs and member ABA passed. Actual desktop private and group cancellation matched exact deduct/refund ledger. Actual390px member group cancellation also matched deduct-1/refund+1 and balance3/3. Mobile desk private cancellation has not been completed. Offline frontend guards29, cancel46, desk15, seat28, refund29, hold64, installment111 passed. Harness61 and independent replay17 expected observations pass. Minified build self-check passes.

Full release apply/postcondition/rollback/original-body checks rehearsed in test inside forced outer rollback. An initial rehearsal correctly stopped on test dependency ACL mismatch; bootstrap parity corrected and complete rehearsal passed. Test baseline then matches all original stable hashes.

Known pre-existing limitation: full create-booking route12-versus11 RPC parameter compatibility is not certified or changed by this release. No claim that all booking creation paths are now fully tested. Actual mobile desk private cancellation remains unverified; actual mobile member group cancellation is verified.

Deploy order: server guarded transaction and verify, then frontend normal fast-forward push, then online version/hash check. Existing open member group pages must refresh; old cancellation endpoint intentionally refuses writes. Frontend rollback retains new server functions. Full database rollback requires explicit incident authorization and handling open new pages; rollback flag alone is not authorization.
