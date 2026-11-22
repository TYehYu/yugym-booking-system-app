# Installment hold resume: paid quota only

Release version: 261122.2156. Body MD5: ddc9aeb7399d65055d6ee27ae8317e79.
Only the explicitly selected legacy installment hold may consume available PAID quota. Other holds remain untouched. Replay does not debit twice. Default no-show behavior is out of scope.

candidate.sql is the new body; original.sql is the previous production definition.
apply_prod.sql and rollback_prod.sql are single-transaction release scripts with cluster, body, ACL and dependency pins plus pre-commit verification. They contain no historical data updates. verify_readonly.sql checks installation.

cases.sql contains 40 transactional test cases; run only with test fixtures and dependencies and roll back. observer.sql and run_parallel.cjs are TEST DATABASE ONLY and require prior setup. The temporary test environment has been removed; do not run the runner without reinstalling it. Credentials are hidden-input only.

Validation: 112 rollback-only database checks passed (40 new, 40 core, 15 shared-ticket, 17 same-contract). Whole-file apply/rollback rehearsals passed. Real HTTP concurrency passed SAME (replay) and LAST (last paid quota), each exactly one debit, other hold unchanged, distinct connections and observed matching lock. Reports are in evidence/.

The first FAILED report is preserved unchanged: the observer did not refresh PostgreSQL statistics snapshots, causing a holder timeout and rollback; independent checks confirmed zero new debits. Only the observer was fixed, without changing the candidate or relaxing lock evidence. The successful rerun is PARALLEL_COMPLETE.json.

Test cleanup was independently verified: bookings57, tickets26, logs29, Auth6; row hashes and full function definition/ACL hash match baseline; no fixture residue.

Release checks: 14 of 15 relevant frontend/build test files fully pass. The remaining deductrpctest has one failure identical on clean origin/master; no new failure. Slim build self-verification passed. Production member conversion is NOT performed automatically by this deployment.
