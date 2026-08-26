// SQL for recomputing the three application-maintained `shared`-schema counters from their
// workspace-scoped source-of-truth tables. Needed because `sortOrder.ts`/`tagReferences.ts`
// (the normal increment/decrement call sites) are never invoked by syncImport.ts, which
// writes the same rows directly via raw SQL for performance — see proposal.md.
//
// Deliberately exports plain SQL strings, not a function that calls execSQL itself: both
// syncImport.ts and workspaceMigrations.ts run this SQL through their OWN already-imported
// execSQL, rather than through a shared runner here. A shared runner would import
// `./connection` at this module's load time — and since this module is also reachable
// through workspaceMigrations.ts (itself imported eagerly by the sql.js test fixture,
// `tests/integration/setup.ts`), that import would resolve against whatever `./connection`
// happens to be in the module cache *at that point* (the real, Worker-backed
// implementation, since fixture setup runs before any test mocks it out) — permanently,
// since ES module bindings don't get re-resolved later just because a test calls
// `vi.doMock('.../connection', ...)` afterward. Plain data has no such binding to go stale.

// shared.trg_tag_sort_order_new_tag eagerly creates a tag_sort_order row for every tag,
// so a plain correlated-subquery UPDATE (not an upsert) covers every tag, including one
// that now has zero references — mirrors migrations.ts's pre-split tag_sort_order recompute.
export const RECOMPUTE_TAG_SORT_ORDER_SQL = `
  UPDATE shared.tag_sort_order
  SET count = (
    SELECT COUNT(*) FROM workspace.trx_base WHERE workspace.trx_base.tag_id = shared.tag_sort_order.tag_id
  );
`

// Same shape as above, for counterparty_sort_order (shared.trg_counterparty_sort_order_new_counterparty
// eagerly creates the row).
export const RECOMPUTE_COUNTERPARTY_SORT_ORDER_SQL = `
  UPDATE shared.counterparty_sort_order
  SET count = (
    SELECT COUNT(*) FROM workspace.trx_to_counterparty
    WHERE workspace.trx_to_counterparty.counterparty_id = shared.counterparty_sort_order.counterparty_id
  );
`

// Same shape as legacyMigration.ts's TAG_REFERENCES_BACKFILL_SQL: only touches tag ids
// that currently appear in the union of referencing tables, so — unlike the two statements
// above — it never zeroes out a tag_references row for a tag that lost its last reference.
// Accepted per design.md: this bug only ever produces under-counts, never over-counts.
export const RECOMPUTE_TAG_REFERENCES_SQL = `
  INSERT INTO shared.tag_references (tag_id, count)
  SELECT tag_id, COUNT(*) FROM (
    SELECT tag_id FROM workspace.trx_base
    UNION ALL SELECT tag_id FROM workspace.budget
    UNION ALL SELECT tag_id FROM workspace.wallet_to_tags
    UNION ALL SELECT tag_id FROM workspace.account_to_tags
    UNION ALL SELECT tag_id FROM workspace.budget_tag_context
    UNION ALL SELECT tag_id FROM workspace.trx_base_tag_context
  )
  GROUP BY tag_id
  ON CONFLICT(tag_id) DO UPDATE SET count = excluded.count;
`

export const RECOMPUTE_SHARED_COUNTERS_SQL = [
  RECOMPUTE_TAG_SORT_ORDER_SQL,
  RECOMPUTE_COUNTERPARTY_SORT_ORDER_SQL,
  RECOMPUTE_TAG_REFERENCES_SQL,
].join('\n')
