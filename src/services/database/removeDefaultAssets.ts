import { execSQL } from './connection'

// Default starter tag content (Tips/VAT) is seeded unconditionally by the
// migration chain (v16) so every fresh install gets identical autoincrement
// ids for the structural tags seeded around it (add-on, savings, credits,
// recurent) — matching any pre-existing real install that ran the same
// chain. A new linked device doesn't want the content itself (it's about to
// receive the parent account's own Tips/VAT via its first sync pull), so
// this removes it right after migrations finish, before any sync can run.
// See openspec/changes/fresh-install-tag-seeding.
const sql = `
BEGIN TRANSACTION;
DELETE FROM tag_to_tag WHERE child_id IN (SELECT id FROM tag WHERE name IN ('Tips', 'VAT'))
                           OR parent_id IN (SELECT id FROM tag WHERE name IN ('Tips', 'VAT'));
DELETE FROM tag_icon WHERE tag_id IN (SELECT id FROM tag WHERE name IN ('Tips', 'VAT'));
DELETE FROM tag WHERE name IN ('Tips', 'VAT');
COMMIT;
`

export async function removeDefaultAssets(): Promise<void> {
  await execSQL(sql)
}
