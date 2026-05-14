export const sql = `
-- ============================================
-- MIGRATION 18: Budget direction
-- - Existing budgets were expense-only in the UI
-- - New budgets can be tracked independently for income and expenses
-- ============================================

ALTER TABLE budget
ADD COLUMN type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('income', 'expense'));

DROP VIEW IF EXISTS summary;

CREATE VIEW summary AS
SELECT
  tag.name as tag,
  budget.type as type,
  (budget.amount_int + budget.amount_frac * 1e-18) as amount,
  budget.amount_int as amount_int,
  budget.amount_frac as amount_frac,
  total(
    (tb.amount_int + tb.amount_frac * 1e-18)
    / (tb.rate_int + tb.rate_frac * 1e-18)
  ) as actual
FROM budget
JOIN tag ON budget.tag_id = tag.id
JOIN trx ON trx.timestamp >= budget.start AND trx.timestamp < budget.end
JOIN trx_base tb ON tb.trx_id = trx.id
  AND (tb.tag_id = budget.tag_id OR tb.tag_id IN (SELECT child_id FROM budget_subtags WHERE budget_id = budget.id))
WHERE (tb.rate_int > 0 OR tb.rate_frac > 0)
  AND tb.sign = CASE budget.type WHEN 'income' THEN '+' ELSE '-' END
GROUP BY budget.tag_id, budget.type, budget.end - budget.start;
`
