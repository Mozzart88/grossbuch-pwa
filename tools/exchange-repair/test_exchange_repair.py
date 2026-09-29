"""Synthetic-only executable tests for the offline manifest repair."""
import tempfile
import sqlite3
from pathlib import Path
import exchange_repair as repair


def fixture(root):
    for filename in repair.FILES.values():
        sqlite3.connect(root / filename).close()
    db = repair.connect(root)
    db.executescript('''
      CREATE TABLE workspace.trx(id BLOB PRIMARY KEY, timestamp INTEGER, updated_at INTEGER);
      CREATE TABLE workspace.account(id INTEGER PRIMARY KEY, balance_int INTEGER, balance_frac INTEGER, updated_at INTEGER);
      CREATE TABLE workspace.trx_base(id BLOB PRIMARY KEY, trx_id BLOB REFERENCES trx(id) ON DELETE CASCADE, account_id INTEGER, tag_id INTEGER, sign TEXT, amount_int INTEGER, amount_frac INTEGER, rate_int INTEGER, rate_frac INTEGER);
      CREATE TABLE workspace.trx_base_tag_context(trx_base_id BLOB REFERENCES trx_base(id) ON DELETE CASCADE, tag_id INTEGER);
      CREATE TABLE workspace.trx_note(trx_id BLOB REFERENCES trx(id) ON DELETE CASCADE, note TEXT);
      CREATE TABLE workspace.trx_to_counterparty(trx_id BLOB REFERENCES trx(id) ON DELETE CASCADE, counterparty_id INTEGER);
      CREATE TABLE workspace.sync_deletions(table_name TEXT,entity_id TEXT,deleted_at INTEGER);
      CREATE TABLE shared.tag(id INTEGER PRIMARY KEY);
      CREATE TABLE shared.orphan(tag_id INTEGER REFERENCES tag(id));
      CREATE TABLE shared.tag_references(tag_id INTEGER PRIMARY KEY,count INTEGER);
      CREATE TABLE shared.tag_sort_order(tag_id INTEGER PRIMARY KEY,count INTEGER);
      CREATE TRIGGER workspace.reverse_line AFTER DELETE ON trx_base BEGIN UPDATE account SET balance_int=balance_int - CASE OLD.sign WHEN '+' THEN OLD.amount_int ELSE -OLD.amount_int END WHERE id=OLD.account_id; END;
      CREATE TRIGGER workspace.delete_trx AFTER DELETE ON trx BEGIN INSERT INTO sync_deletions VALUES('trx',hex(OLD.id),unixepoch()); END;
      INSERT INTO workspace.account VALUES(1,-80,0,1),(2,72,0,1);
      INSERT INTO shared.tag VALUES(7);
      INSERT INTO shared.tag_references VALUES(7,8);
      INSERT INTO shared.tag_sort_order VALUES(7,8);
      INSERT INTO workspace.trx VALUES(x'01',1000,1),(x'02',1000,1),(x'03',999,1),(x'04',1000,1),(x'05',1000,1);
      INSERT INTO workspace.trx_base VALUES(x'11',x'01',1,7,'-',20,0,1,0),(x'12',x'01',1,7,'-',20,0,1,0),(x'13',x'01',2,7,'+',18,0,1,0),(x'14',x'01',2,7,'+',18,0,1,0),
      (x'21',x'04',1,7,'-',20,0,1,0),(x'22',x'04',1,7,'-',20,0,1,0),(x'23',x'04',2,7,'+',18,0,1,0),(x'24',x'04',2,7,'+',18,0,1,0);
    ''')
    db.execute('PRAGMA foreign_keys=OFF')
    db.execute('INSERT INTO shared.orphan VALUES(999)')
    db.commit()
    db.close()
    return [{'header': '01', 'empty': '02', 'keep': ['11','13'], 'remove': ['12','14']}, {'header': '04', 'empty': '05', 'keep': ['21','23'], 'remove': ['22','24']}]


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    targets = fixture(root)
    hashes = repair.hashes(root)
    manifest = repair.build_manifest(root, targets)
    assert repair.run(root, manifest)['status'] == 'dry-run'
    assert repair.hashes(root) == hashes
    output = root / 'repaired'
    report = repair.run(root, manifest, output)
    assert report['status'] == 'repaired'
    assert repair.hashes(root) == hashes
    assert repair.run(output, manifest)['status'] == 'already-repaired'
    db = repair.connect(output)
    assert [tuple(r) for r in db.execute('SELECT balance_int FROM workspace.account ORDER BY id')] == [(-40,), (36,)]
    assert db.execute('SELECT count(*) FROM workspace.trx').fetchone()[0] == 3  # unrelated empty survives
    assert db.execute('SELECT count FROM shared.tag_references').fetchone()[0] == 4
    db.close()
    # Disable statement caching so SQLite's authorizer can reject the second
    # header deletion, after the first exchange has been completely repaired.
    db = sqlite3.connect(root / repair.FILES['main'], cached_statements=0)
    db.row_factory = sqlite3.Row
    for schema in ('shared', 'workspace'):
        db.execute(f'ATTACH DATABASE ? AS {schema}', (str(root / repair.FILES[schema]),))
    db.execute('PRAGMA foreign_keys=ON')
    before = repair.signature(db)
    header_deletes = [0]
    def deny_delete(action, table, column, schema, source):
        if action == sqlite3.SQLITE_DELETE and table == 'trx':
            header_deletes[0] += 1
            if header_deletes[0] == 2:
                return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK
    db.set_authorizer(deny_delete)
    try:
        repair.apply_manifest(db, manifest)
        raise AssertionError('failure was not raised')
    except sqlite3.DatabaseError:
        pass
    db.set_authorizer(None)
    assert header_deletes[0] == 2
    assert repair.signature(db) == before
    db.execute("DELETE FROM workspace.trx_base WHERE id=x'12'")
    db.commit()
    db.close()
    try:
        repair.run(root, manifest)
        raise AssertionError('partial repair accepted')
    except ValueError:
        pass
print('repair checks passed')
