# Exact exchange repair

This offline tool repairs only explicitly selected header/line pairs in decrypted
main/shared/workspace exports. It never opens a live OPFS installation and never
modifies the source directory. Python 3.11+ with SQLite serialize/deserialize
support is required. All arithmetic used for verification uses integer units of
10^-18, avoiding floating-point conversion.

A private manifest records original file hashes, full database/schema signatures,
exact header/line/context/note/counterparty evidence, selected retained and removed
IDs, and expected balance effects. Any unrelated data change, partial prior repair,
or mismatched dependency refuses the entire operation. A verified repaired state
is a no-op. Existing unrelated foreign-key violations are reported and must remain
identical; the tool cannot introduce new violations.

For the reviewed September 28 exports, the local manifest and reports live under
`data/2026-09-28/`. Those files contain financial data and must stay untracked.
The repaired copy is `data/2026-09-28/repaired-exchanges/`.

Dry-run:

```sh
python3 tools/exchange-repair/exchange_repair.py \
  --source data/2026-09-28 \
  --manifest data/2026-09-28/exchange-repair-manifest.json
```

To create another copy, add `--output <new-directory>`. The destination must not
exist. The tool backs up all three source files, validates again inside one
attached-database transaction, deletes the specified surplus lines and empty
headers using normal balance/deletion triggers, maintains shared counters, and
verifies the result before committing. The output directory contains a report.
A failed run may leave an unmodified copy directory for inspection; do not treat
it as repaired without a successful report.

`build_manifest(source, explicit_targets)` is a maintenance API, not a discovery
algorithm. A target specifies `header`, `empty`, `keep` and `remove` IDs, with each
retained line paired positionally to its removed counterpart. Review the complete
dependent data before selecting IDs. Never generate targets by matching amounts
alone. The synthetic regression runs through Vitest, or directly with
`python3 tools/exchange-repair/test_exchange_repair.py`.

## Controlled live repair

The delivered copy is diagnostic evidence. Do not replace a live database with
this historical snapshot: doing so could erase later transactions.

1. Identify the intended live installation and workspace explicitly. Deploy the
   atomic-mutation fix to every linked device before repair. Stop editing and
   pause synchronization on all peers, then take fresh decrypted exports of all
   three live databases and retain the encrypted backup/recovery material.
2. Compare the affected headers, all four financial lines per exchange, contexts,
   notes, counterparties and empty companions against the reviewed evidence. If
   any differ, stop and investigate. Missing tags and other empty headers are
   outside this repair. Build a fresh reviewed manifest against these live exports,
   run a dry-run, and verify a new repaired copy before touching the installation.
3. In a maintenance session for that identified workspace, use the application's
   `withTransaction` and `createTransactionRepository(executor)` to perform the
   repair. Recheck every expected header/line/relation inside that same scope
   before the first mutation. Compare SQLite integer/fraction fields as decimal
   text, so JavaScript cannot round manifest values. Delete each selected surplus
   line with the scoped repository's `deleteLine`, and each verified empty header
   with its `delete`. Never call the unscoped public repository from inside the
   callback. Explicitly advance surviving headers' `updated_at` beyond their old
   values and the repair start time; validate exact balance/counter deltas before
   returning so a mismatch rolls back. This is a developer maintenance procedure,
   not a pasted console command or an automatic migration.
4. Take a fresh post-repair export and verify retained IDs, two lines per exchange,
   exact balances, counters, original metadata, fresh surviving-header timestamps,
   and workspace-local tombstones. Reconcile raw lines against account balances.
   Check integrity and confirm unrelated anomalies are unchanged.
5. Resume sync first on the repaired device so the fresh updates and deletion
   markers are pushed. Bring peers back one at a time without edits; verify each
   receives two lines per repaired exchange and the expected balances before
   resuming ordinary use. Unchanged last-write-wins conflict resolution cannot
   prevent an old peer with a newer stale edit from restoring bad data.

Code rollback does not undo repair. If recovery is needed, stop sync across peers
again and assess subsequent transactions before restoring any backup. Runtime
rollback across attached files is tested; this change makes no additional claim
about power-loss atomicity of separate OPFS files.
