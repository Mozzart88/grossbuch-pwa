import { execSQL, queryOne, getLastInsertId } from '../database/connection'
import type { WorkspaceIcon, WorkspaceTag, WorkspaceCurrency, WorkspaceCounterparty } from './workspaceTypes'

/**
 * Find-or-create reconciliation by natural key, for importing a
 * WorkspacePackage into a (possibly unrelated) installation — see
 * workspaceTypes.ts. Unlike sync's tag conflict resolution (which assumes a
 * shared id space between paired devices and resolves genuine id
 * collisions), this never trusts any incoming id: every reference travels by
 * natural key and gets a fresh local id, reused if one already exists.
 */

export async function reconcileIcons(icons: WorkspaceIcon[]): Promise<Map<string, number>> {
  const idByValue = new Map<string, number>()
  for (const icon of icons) {
    const existing = await queryOne<{ id: number }>(`SELECT id FROM shared.icon WHERE value = ?`, [icon.value])
    if (existing) {
      idByValue.set(icon.value, existing.id)
      continue
    }
    await execSQL(`INSERT INTO shared.icon (value) VALUES (?)`, [icon.value])
    idByValue.set(icon.value, await getLastInsertId())
  }
  return idByValue
}

/**
 * Two-pass: first find-or-create every tag by name (so every name in the
 * batch has a local id, including cross-references between tags in the same
 * batch), then wire up parent/child hierarchy and icon links using the now-
 * complete map.
 */
export async function reconcileTags(tags: WorkspaceTag[], iconIdByValue: Map<string, number>): Promise<Map<string, number>> {
  const idByName = new Map<string, number>()

  for (const tag of tags) {
    const existing = await queryOne<{ id: number }>(`SELECT id FROM shared.tag WHERE name = ?`, [tag.name])
    if (existing) {
      idByName.set(tag.name, existing.id)
    } else {
      await execSQL(`INSERT INTO shared.tag (name) VALUES (?)`, [tag.name])
      idByName.set(tag.name, await getLastInsertId())
    }
  }

  for (const tag of tags) {
    const tagId = idByName.get(tag.name)
    if (tagId === undefined) continue

    for (const parentName of tag.parents) {
      const parentId = idByName.get(parentName)
      if (parentId === undefined) continue
      await execSQL(
        `INSERT INTO shared.tag_to_tag (child_id, parent_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM shared.tag_to_tag WHERE child_id = ? AND parent_id = ?)`,
        [tagId, parentId, tagId, parentId]
      )
    }

    if (tag.icon !== null) {
      const iconId = iconIdByValue.get(tag.icon)
      if (iconId !== undefined) {
        await execSQL(
          `INSERT INTO shared.tag_icon (tag_id, icon_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM shared.tag_icon WHERE tag_id = ? AND icon_id = ?)`,
          [tagId, iconId, tagId, iconId]
        )
      }
    }
  }

  return idByName
}

export async function reconcileCurrencies(currencies: WorkspaceCurrency[]): Promise<Map<string, number>> {
  const idByCode = new Map<string, number>()
  for (const currency of currencies) {
    const existing = await queryOne<{ id: number }>(`SELECT id FROM shared.currency WHERE code = ?`, [currency.code])
    if (existing) {
      idByCode.set(currency.code, existing.id)
      continue
    }
    await execSQL(
      `INSERT INTO shared.currency (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)`,
      [currency.code, currency.name, currency.symbol, currency.decimal_places]
    )
    idByCode.set(currency.code, await getLastInsertId())
  }
  return idByCode
}

export async function reconcileCounterparties(
  counterparties: WorkspaceCounterparty[],
  tagIdByName: Map<string, number>
): Promise<Map<string, number>> {
  const idByName = new Map<string, number>()
  for (const cp of counterparties) {
    const existing = await queryOne<{ id: number }>(`SELECT id FROM shared.counterparty WHERE name = ?`, [cp.name])
    if (existing) {
      idByName.set(cp.name, existing.id)
      continue
    }

    await execSQL(`INSERT INTO shared.counterparty (name) VALUES (?)`, [cp.name])
    const id = await getLastInsertId()
    idByName.set(cp.name, id)

    if (cp.note) {
      await execSQL(`INSERT INTO shared.counterparty_note (counterparty_id, note) VALUES (?, ?)`, [id, cp.note])
    }
    for (const tagName of cp.tags) {
      const tagId = tagIdByName.get(tagName)
      if (tagId !== undefined) {
        await execSQL(`INSERT OR IGNORE INTO shared.counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)`, [id, tagId])
      }
    }
  }
  return idByName
}
