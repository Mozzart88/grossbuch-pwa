export const sql = `
COMMIT;

PRAGMA foreign_keys = OFF;
-- ======= ICON ======
CREATE TEMP TABLE _tmp (id INTEGER, value TEXT);

INSERT INTO _tmp 
SELECT id, value from icon;

DROP TABLE icon;
CREATE TABLE icon (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  value TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
) STRICT;

INSERT INTO icon (id, value)
SELECT id, value from _tmp;

DROP TABLE _tmp;

CREATE TRIGGER trg_icon_update
AFTER UPDATE ON icon
FOR EACH ROW
BEGIN
  UPDATE icon SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE icon.id = NEW.id;
END;
-- ======= ICON ======

-- ======= TAG ======
CREATE TEMP TABLE _tmp (id INTEGER, value TEXT);

INSERT INTO _tmp 
SELECT id, name from tag;

DROP TABLE tag;
CREATE TABLE tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    ) STRICT;

INSERT INTO tag (id, name)
SELECT * from _tmp;

DROP TABLE _tmp;

CREATE TRIGGER trg_tag_update
AFTER UPDATE ON tag
FOR EACH ROW
WHEN NEW.id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.id;
END;

-- ======= tag_to_tag ======
CREATE TRIGGER trg_tag_to_tag_insert
AFTER INSERT ON tag_to_tag
FOR EACH ROW
WHEN NEW.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (NEW.parent_id, NEW.child_id);
END;

CREATE TRIGGER trg_tag_to_tag_update
AFTER UPDATE ON tag_to_tag
FOR EACH ROW
WHEN NEW.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (NEW.parent_id, NEW.child_id);
END;

CREATE TRIGGER trg_tag_to_tag_delete
AFTER DELETE ON tag_to_tag
FOR EACH ROW
WHEN OLD.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (OLD.parent_id, OLD.child_id);
END;
-- ======= tag_to_tag ======

-- ======= tag_icon ======
CREATE TRIGGER trg_tag_icon_insert
AFTER INSERT ON tag_icon
FOR EACH ROW
WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.tag_id;
END;

CREATE TRIGGER trg_tag_icon_update
AFTER UPDATE ON tag_icon
FOR EACH ROW
WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.tag_id;
END;

CREATE TRIGGER trg_tag_icon_delete
AFTER DELETE ON tag_icon
FOR EACH ROW
WHEN OLD.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = OLD.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = OLD.tag_id;
END;
-- ======= tag_icon ======
-- ======= TAG ======

-- ======= WALLET ======
CREATE TEMP TABLE _tmp (id INTEGER, name TEXT, color TEXT);

INSERT INTO _tmp 
SELECT * from wallet;

DROP TABLE wallet;
CREATE TABLE wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );

INSERT INTO wallet (id, name, color)
SELECT * from _tmp;

DROP TABLE _tmp;

CREATE TRIGGER trg_wallet_update
AFTER UPDATE ON wallet
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.id;
END;

-- ======= wallet_to_tags ======
CREATE TRIGGER trg_wallet_to_tags_insert
AFTER INSERT ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.wallet_id;
END;

CREATE TRIGGER trg_wallet_to_tags_update
AFTER UPDATE ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.wallet_id;
END;

CREATE TRIGGER trg_wallet_to_tags_delete
AFTER DELETE ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = OLD.wallet_id;
END;
-- ======= wallet_to_tags ======
-- ======= WALLET ======

-- ======= ACCOUNT ======
-- ALTER TABLE account ADD COLUMN  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP));

CREATE TRIGGER trg_account_update
AFTER UPDATE OF balance ON account
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.id;
END;

-- ======= account_to_tags ======
CREATE TRIGGER trg_account_to_tags_insert
AFTER INSERT ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END;

CREATE TRIGGER trg_account_to_tags_update
AFTER UPDATE ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END;

CREATE TRIGGER trg_account_to_tags_delete
AFTER DELETE ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = OLD.account_id;
END;
-- ======= account_to_tags ======
-- ======= ACCOUNT ======

-- ======= COUNTERPARTY ======
CREATE TEMP TABLE _tmp (id INTEGER, name TEXT);

INSERT INTO _tmp 
SELECT * from counterparty;

DROP TABLE counterparty;
CREATE TABLE counterparty (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );

INSERT INTO counterparty (id, name)
SELECT * from _tmp;

DROP TABLE _tmp;

CREATE TRIGGER trg_counterparty_update
AFTER UPDATE ON counterparty
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.id;
END;

-- ======= counterparty_to_tags ======
CREATE TRIGGER trg_counterparty_to_tags_insert
AFTER INSERT ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END;

CREATE TRIGGER trg_counterparty_to_tags_update
AFTER UPDATE ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END;

CREATE TRIGGER trg_counterparty_to_tags_delete
AFTER DELETE ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = OLD.counterparty_id;
END;
-- ======= counterparty_to_tags ======

-- ======= counterparty_note ======
CREATE TRIGGER trg_counterparty_note_insert
AFTER INSERT ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END;

CREATE TRIGGER trg_counterparty_note_update
AFTER UPDATE ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END;

CREATE TRIGGER trg_counterparty_note_delete
AFTER DELETE ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = OLD.counterparty_id;
END;
-- ======= counterparty_note ======
-- ======= COUNTERPARTY ======

-- ======= TRX ======
CREATE TEMP TABLE _tmp (id BLOB, timestamp INTEGER);

INSERT INTO _tmp 
SELECT * from trx;

DROP TABLE trx;
CREATE TABLE trx (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      timestamp INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );

INSERT INTO trx (id, timestamp)
SELECT * from _tmp;

DROP TABLE _tmp;

CREATE TRIGGER trg_trx_update
AFTER UPDATE ON trx
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.id;
END;

-- ======= trx_to_counterparty ======
CREATE TRIGGER trg_trx_to_counterparty_insert
AFTER INSERT ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END;

CREATE TRIGGER trg_trx_to_counterparty_update
AFTER UPDATE ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END;

CREATE TRIGGER trg_trx_to_counterparty_delete
AFTER DELETE ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END;
-- ======= trx_to_counterparty ======

-- ======= trx_note ======
CREATE TRIGGER trg_trx_note_insert
AFTER INSERT ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END;

CREATE TRIGGER trg_trx_note_update
AFTER UPDATE ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END;

CREATE TRIGGER trg_trx_note_delete
AFTER DELETE ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END;
-- ======= trx_note ======

-- ======= trx_base ======
CREATE TRIGGER trg_trx_base_insert
AFTER INSERT ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END;

CREATE TRIGGER trg_trx_base_update
AFTER UPDATE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END;

CREATE TRIGGER trg_trx_base_delete
AFTER DELETE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END;
-- ======= trx_base ======
-- ======= TRX ======

-- ======= BUDGET ======
CREATE TEMP TABLE _tmp (id BLOB, start INTEGER, end INTEGER, tag_id INTEGER, amount INTEGER);

INSERT INTO _tmp 
SELECT * from budget;

DROP TABLE budget;
CREATE TABLE budget (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      start INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month'))),
      end INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month', '+1 month'))),
      tag_id INTEGER NOT NULL REFERENCES tag(id),
      amount INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );

INSERT INTO budget (id, start, end, tag_id, amount)
SELECT * from _tmp;

DROP TABLE _tmp;

CREATE TRIGGER trg_budget_update
AFTER UPDATE ON budget
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE budget.id = NEW.id;
END;
-- ======= BUDGET ======

-- ======= CURRENCY ======
CREATE TEMP TABLE _tmp (id INTEGER, code TEXT, name TEXT, symbol TEXT, decimal_places INTEGER);

INSERT INTO _tmp 
SELECT * from currency;

DROP TABLE currency;
CREATE TABLE currency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimal_places INTEGER DEFAULT 2,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );

INSERT INTO currency (id, code, name, symbol, decimal_places)
SELECT * from _tmp;

DROP TABLE _tmp;

-- ======= currency_to_tags ======
CREATE TRIGGER trg_currency_to_tags_insert
AFTER INSERT ON currency_to_tags
FOR EACH ROW
WHEN NEW.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = NEW.currency_id;
END;

CREATE TRIGGER trg_currency_to_tags_update
AFTER UPDATE ON currency_to_tags
FOR EACH ROW
WHEN NEW.tag_id = 2 OR OLD.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = NEW.currency_id;
END;

CREATE TRIGGER trg_currency_to_tags_delete
AFTER DELETE ON currency_to_tags
FOR EACH ROW
WHEN OLD.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = OLD.currency_id;
END;
-- ======= currency_to_tags ======
-- ======= CURRENCY ======


-- ======= RECREATE TRIGGERS ======

CREATE TRIGGER IF NOT EXISTS trg_delete_system_tag
    BEFORE DELETE ON tag
    FOR EACH ROW
    WHEN OLD.id = 1 OR EXISTS (SELECT 1 FROM tag_to_tag WHERE OLD.id = child_id AND parent_id = 1)
    BEGIN
      SELECT RAISE(IGNORE);
    END;
CREATE TRIGGER IF NOT EXISTS trg_default_wallet
    BEFORE INSERT ON wallet_to_tags
    WHEN NEW.tag_id = 2
    BEGIN
      DELETE FROM wallet_to_tags
      WHERE tag_id = 2 AND wallet_id != NEW.wallet_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_default_wallet_on_delete
    BEFORE DELETE ON wallet
    WHEN 2 IN (SELECT tag_id FROM wallet_to_tags WHERE wallet_id = OLD.id)
      AND (SELECT count(id) FROM wallet WHERE id != old.id) > 0
    BEGIN
      INSERT INTO wallet_to_tags VALUES ((SELECT id FROM wallet WHERE id != OLD.id LIMIT 1), 2);
    END;
CREATE TRIGGER IF NOT EXISTS trg_add_first_account
    AFTER INSERT ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = NEW.wallet_id)
    BEGIN
      INSERT INTO account_to_tags VALUES (NEW.id, 2);
    END;
CREATE TRIGGER IF NOT EXISTS trg_set_default_account
    BEFORE INSERT ON account_to_tags
    WHEN NEW.tag_id = 2
    AND NOT EXISTS (SELECT 1 FROM account_to_tags WHERE account_id = NEW.account_id AND tag_id = 2)
    AND 1 < (
      SELECT count(id)
      FROM account
      WHERE wallet_id IN (
        SELECT wallet_id FROM account WHERE id = NEW.account_id
      )
    )
    BEGIN
      DELETE FROM account_to_tags
      WHERE tag_id = 2 AND account_id IN (
        SELECT id FROM account
        WHERE wallet_id = (SELECT wallet_id FROM account WHERE id = NEW.account_id)
      );
    END;
CREATE TRIGGER IF NOT EXISTS trg_del_default_account
    AFTER DELETE ON account
    WHEN EXISTS (
      SELECT 1 FROM account_to_tags WHERE account_id = OLD.id AND tag_id = 2
    )
    AND EXISTS (
      SELECT 1 FROM account WHERE wallet_id = OLD.wallet_id
    )
    BEGIN
      UPDATE account_to_tags SET
      account_id = (SELECT id FROM account WHERE wallet_id = OLD.wallet_id LIMIT 1)
      WHERE account_id = OLD.id;
      DELETE FROM account_to_tags WHERE account_id = OLD.id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_del_last_in_wallet_account
    BEFORE DELETE ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = OLD.wallet_id)
    BEGIN
      DELETE FROM wallet WHERE id = OLD.wallet_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_del_trx_base
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET balance = (
        CASE
          WHEN OLD.sign = '+' THEN balance - OLD.amount
          ELSE balance + OLD.amount
        END
      )
      WHERE id = OLD.account_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_update_trx_base
    AFTER UPDATE OF sign, amount ON trx_base
    WHEN 0 != NEW.amount
    BEGIN
      UPDATE account
      SET balance = (
        CASE
        WHEN OLD.sign != NEW.sign
        THEN (
          CASE
          WHEN NEW.sign = '+' THEN balance + OLD.amount + NEW.amount
          ELSE balance - OLD.amount - NEW.amount
          END
        )
        ELSE (
          CASE
          WHEN NEW.sign = '+' THEN balance - OLD.amount + NEW.amount
          ELSE balance + OLD.amount - NEW.amount
          END
        )
        END
      )
      WHERE id = NEW.account_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_trx_add_counterparty
    INSTEAD OF UPDATE OF counterparty ON transaction_view
    BEGIN
      INSERT INTO counterparty (name)
      SELECT NEW.counterparty
      WHERE NOT EXISTS (
        SELECT 1 FROM counterparty WHERE name = NEW.counterparty
      );
      INSERT INTO trx_to_counterparty (trx_id, counterparty_id)
      VALUES (
        NEW.id,
        (SELECT id FROM counterparty WHERE name = NEW.counterparty)
      );
    END;
CREATE TRIGGER IF NOT EXISTS trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET balance = (
        CASE
          WHEN NEW.sign = '-' THEN balance - NEW.amount
          ELSE balance + NEW.amount
        END
      )
      WHERE id = NEW.account_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_tag_sort_order_increment
    AFTER INSERT ON trx_base
    BEGIN
      UPDATE tag_sort_order
      SET count = count + 1
      WHERE NEW.tag_id = tag_sort_order.tag_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_tag_sort_order_decrement
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE tag_sort_order
      SET count = count - 1
      WHERE tag_sort_order.tag_id = OLD.tag_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_tag_sort_roder_update_trx_base_tag
    AFTER UPDATE OF tag_id ON trx_base
    BEGIN
      UPDATE tag_sort_order
      SET count = count + 1
      WHERE tag_sort_order.tag_id = NEW.tag_id;
      UPDATE tag_sort_order
      SET count = count - 1
      WHERE tag_sort_order.tag_id = OLD.tag_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_tag_sort_order_new_tag
    AFTER INSERT ON tag
    FOR EACH ROW
    BEGIN
      INSERT INTO tag_sort_order
      (tag_id) VALUES (new.id);
    END;
CREATE TRIGGER IF NOT EXISTS trg_counterparty_sort_order_increment
    AFTER INSERT ON trx_to_counterparty
    BEGIN
      UPDATE counterparty_sort_order
      SET count = count + 1
      WHERE NEW.counterparty_id = counterparty_sort_order.counterparty_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_counterparty_sort_order_decrement
    AFTER DELETE ON trx_to_counterparty
    FOR EACH ROW
    BEGIN
      UPDATE counterparty_sort_order
      SET count = count - 1
      WHERE counterparty_sort_order.counterparty_id = OLD.counterparty_id;
    END;
CREATE TRIGGER IF NOT EXISTS trg_counterparty_sort_order_new_counterparty
    AFTER INSERT ON counterparty
    FOR EACH ROW
    BEGIN
      INSERT INTO counterparty_sort_order
      (counterparty_id) VALUES (new.id);
    END;
-- ======= RECREATE TRIGGERS ======
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;`

