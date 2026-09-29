#!/usr/bin/env python3
"""Offline, exact-manifest exchange repair. Originals are always opened read-only.

Create a private manifest with build_manifest(source, explicit_targets). The CLI
only consumes a manifest: dry-run by default; --output creates a repaired copy.
No automatic discovery or deduplication is performed.
"""
import argparse
import hashlib
import json
import sqlite3
import time
from pathlib import Path

FILES = {'main': 'main-decrypted.db', 'shared': 'shared-decrypted.db', 'workspace': 'workspace-1-decrypted.db'}
SCALE = 10**18


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def encode(value):
    return {'blob': value.hex().upper()} if isinstance(value, bytes) else value


def rows(db, sql, args=()):
    return [{k: encode(row[k]) for k in row.keys()} for row in db.execute(sql, args)]


def connect(root, readonly=False):
    root = Path(root).resolve()
    mode = 'ro' if readonly else 'rw'
    db = sqlite3.connect(f'{(root / FILES["main"]).as_uri()}?mode={mode}', uri=True)
    db.row_factory = sqlite3.Row
    for schema in ('shared', 'workspace'):
        db.execute(f'ATTACH DATABASE ? AS {schema}', (f'{(root / FILES[schema]).as_uri()}?mode={mode}',))
    db.execute('PRAGMA foreign_keys=ON')
    return db


def hashes(root):
    return {name: hashlib.sha256((Path(root) / name).read_bytes()).hexdigest() for name in FILES.values()}


def memory_copy(root):
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    for schema, name in FILES.items():
        if schema != 'main':
            db.execute(f"ATTACH DATABASE ':memory:' AS {schema}")
        with sqlite3.connect(f'{(Path(root).resolve() / name).as_uri()}?mode=ro', uri=True) as source:
            # deserialize allows preserving each attached schema and its triggers exactly.
            if source.execute('PRAGMA page_count').fetchone()[0]:
                db.deserialize(source.serialize(), name=schema)
    db.execute('PRAGMA foreign_keys=ON')
    return db


def signature(db, manifest=None):
    content = []
    headers = {p['header'] for p in manifest['targets']} if manifest else set()
    empties = {p['empty'] for p in manifest['targets']} if manifest else set()
    accounts = set(manifest['account_deltas']) if manifest else set()
    for schema in FILES:
        definitions = rows(db, f"SELECT type,name,tbl_name,sql FROM {schema}.sqlite_master ORDER BY type,name")
        tables = []
        for definition in definitions:
            if definition['type'] != 'table':
                continue
            name = definition['name']
            values = rows(db, f'SELECT * FROM {schema}."{name.replace(chr(34), chr(34)*2)}"')
            for row in values:
                if schema == 'workspace':
                    if name == 'trx' and row['id']['blob'] in headers:
                        row['updated_at'] = '<repair-time>'
                    if name == 'account' and str(row['id']) in accounts and 'updated_at' in row:
                        row['updated_at'] = '<repair-time>'
                    if name == 'sync_deletions' and row['table_name'] == 'trx' and row['entity_id'] in empties:
                        row['deleted_at'] = '<repair-time>'
            tables.append([name, sorted(values, key=canonical)])
        content.append([schema, definitions, tables, db.execute(f'PRAGMA {schema}.user_version').fetchone()[0], db.execute(f'PRAGMA {schema}.application_id').fetchone()[0]])
    return hashlib.sha256(canonical(content).encode()).hexdigest()


def balances(db):
    return {str(r['id']): str(r['balance_int'] * SCALE + r['balance_frac']) for r in db.execute('SELECT * FROM workspace.account')}


def summary(db):
    return {
        'balances_scaled': balances(db),
        'headers': db.execute('SELECT count(*) FROM workspace.trx').fetchone()[0],
        'lines': db.execute('SELECT count(*) FROM workspace.trx_base').fetchone()[0],
        'empty_headers': db.execute('SELECT count(*) FROM workspace.trx t WHERE NOT EXISTS(SELECT 1 FROM workspace.trx_base b WHERE b.trx_id=t.id)').fetchone()[0],
        'missing_tag_lines': db.execute('SELECT count(*) FROM workspace.trx_base b LEFT JOIN shared.tag t ON t.id=b.tag_id WHERE t.id IS NULL').fetchone()[0],
        'integrity': {s: db.execute(f'PRAGMA {s}.integrity_check').fetchone()[0] for s in FILES},
        'foreign_key_violations': {s: rows(db, f'PRAGMA {s}.foreign_key_check') for s in FILES},
    }


def describe_target(db, target):
    header = bytes.fromhex(target['header'])
    empty = bytes.fromhex(target['empty'])
    result = {'header': rows(db, 'SELECT * FROM workspace.trx WHERE id=?', (header,)), 'empty': rows(db, 'SELECT * FROM workspace.trx WHERE id=?', (empty,))}
    if len(result['header']) != 1 or len(result['empty']) != 1:
        raise ValueError('Expected both exact headers')
    for table in ('trx_base', 'trx_note', 'trx_to_counterparty'):
        if rows(db, f'SELECT * FROM workspace.{table} WHERE trx_id=?', (empty,)):
            raise ValueError('Companion header is not empty')
        result[table] = rows(db, f'SELECT * FROM workspace.{table} WHERE trx_id=?', (header,))
    lines = {r['id']['blob']: r for r in result['trx_base']}
    if len(target['keep']) != 2 or len(target['remove']) != 2 or set(lines) != set(target['keep'] + target['remove']) or len(lines) != 4:
        raise ValueError('Manifest must explicitly retain two lines and remove two lines')
    result['contexts'] = rows(db, 'SELECT * FROM workspace.trx_base_tag_context WHERE trx_base_id IN (SELECT id FROM workspace.trx_base WHERE trx_id=?)', (header,))
    for keep, remove in zip(target['keep'], target['remove']):
        if {k: v for k, v in lines[keep].items() if k != 'id'} != {k: v for k, v in lines[remove].items() if k != 'id'}:
            raise ValueError('Retained and removed lines differ')
        contexts = lambda identifier: sorted(r['tag_id'] for r in result['contexts'] if r['trx_base_id']['blob'] == identifier)
        if contexts(keep) != contexts(remove):
            raise ValueError('Line contexts differ')
    if sorted(lines[k]['sign'] for k in target['keep']) != ['+', '-']:
        raise ValueError('Expected one debit and one credit')
    if result['header'][0]['timestamp'] != result['empty'][0]['timestamp'] or result['header'][0]['updated_at'] != result['empty'][0]['updated_at']:
        raise ValueError('Companion metadata differs')
    return result


def mutate(db, manifest):
    for target, evidence in zip(manifest['targets'], manifest['evidence']):
        for line_id in target['remove']:
            line = next(r for r in evidence['trx_base'] if r['id']['blob'] == line_id)
            tags = [line['tag_id']] + [c['tag_id'] for c in evidence['contexts'] if c['trx_base_id']['blob'] == line_id]
            for tag in tags:
                db.execute('INSERT INTO shared.tag_references(tag_id,count) VALUES(?,0) ON CONFLICT(tag_id) DO UPDATE SET count=count-1', (tag,))
            db.execute('UPDATE shared.tag_sort_order SET count=count-1 WHERE tag_id=?', (line['tag_id'],))
            db.execute('DELETE FROM workspace.trx_base WHERE id=?', (bytes.fromhex(line_id),))
        db.execute('DELETE FROM workspace.trx WHERE id=?', (bytes.fromhex(target['empty']),))
        # A fresh version must win against the original snapshot, even with clock skew.
        updated = max(int(time.time()), evidence['header'][0]['updated_at'] + 1)
        db.execute('UPDATE workspace.trx SET updated_at=? WHERE id=?', (updated, bytes.fromhex(target['header'])))
    actual = balances(db)
    for account, before in manifest['before']['balances_scaled'].items():
        expected = int(before) + int(manifest['account_deltas'].get(account, '0'))
        if int(actual[account]) != expected:
            raise ValueError(f'Unexpected exact balance effect for account {account}')


def build_manifest(root, targets):
    if not targets:
        raise ValueError('Explicit targets required')
    ids = [p[k] for p in targets for k in ('header', 'empty')]
    if len(ids) != len(set(ids)):
        raise ValueError('Overlapping targets')
    db = memory_copy(root)
    try:
        evidence = [describe_target(db, p) for p in targets]
        manifest = {'version': 1, 'files': FILES, 'source_hashes': hashes(root), 'targets': targets, 'evidence': evidence, 'before_signature': signature(db), 'before': summary(db), 'account_deltas': {}}
        for target, records in zip(targets, evidence):
            for line in records['trx_base']:
                if line['id']['blob'] in target['remove']:
                    key = str(line['account_id'])
                    delta = (line['amount_int'] * SCALE + line['amount_frac']) * (-1 if line['sign'] == '+' else 1)
                    manifest['account_deltas'][key] = str(int(manifest['account_deltas'].get(key, '0')) + delta)
        db.execute('BEGIN IMMEDIATE')
        mutate(db, manifest)
        manifest['after_signature'] = signature(db, manifest)
        manifest['after'] = summary(db)
        db.rollback()
        return manifest
    finally:
        db.close()


def classify(db, manifest):
    if manifest['version'] != 1 or manifest['files'] != FILES:
        raise ValueError('Unsupported manifest')
    if signature(db) == manifest['before_signature']:
        for target, expected in zip(manifest['targets'], manifest['evidence']):
            if describe_target(db, target) != expected:
                raise ValueError('Target evidence differs')
        return 'original'
    if signature(db, manifest) == manifest['after_signature']:
        for target, evidence in zip(manifest['targets'], manifest['evidence']):
            timestamp = db.execute('SELECT updated_at FROM workspace.trx WHERE id=?', (bytes.fromhex(target['header']),)).fetchone()[0]
            marker = db.execute("SELECT deleted_at FROM workspace.sync_deletions WHERE table_name='trx' AND entity_id=?", (target['empty'],)).fetchone()
            if timestamp <= evidence['header'][0]['updated_at'] or not marker or marker[0] <= 0:
                raise ValueError('Repair timestamps are invalid')
        return 'already-repaired'
    raise ValueError('Database differs from both the exact original and verified repaired state; no writes allowed')


def apply_manifest(db, manifest):
    db.execute('BEGIN IMMEDIATE')
    try:
        status = classify(db, manifest)
        if status == 'original':
            mutate(db, manifest)
            if classify(db, manifest) != 'already-repaired':
                raise ValueError('Post-repair verification failed')
            checks = summary(db)
            if any(v != 'ok' for v in checks['integrity'].values()) or checks['foreign_key_violations'] != manifest['before']['foreign_key_violations']:
                raise ValueError('Database integrity check failed')
        db.commit()
        return status
    except BaseException:
        db.rollback()
        raise


def repair_metadata(db, manifest):
    ids = [bytes.fromhex(p['header']) for p in manifest['targets']]
    tags = sorted({r['tag_id'] for e in manifest['evidence'] for r in e['trx_base']} | {r['tag_id'] for e in manifest['evidence'] for r in e['contexts']})
    return {
        'headers': [rows(db, 'SELECT hex(id) AS id,updated_at FROM workspace.trx WHERE id=?', (identifier,))[0] for identifier in ids],
        'deletion_markers': [rows(db, "SELECT * FROM workspace.sync_deletions WHERE table_name='trx' AND entity_id=?", (p['empty'],)) for p in manifest['targets']],
        'tag_references': [rows(db, 'SELECT * FROM shared.tag_references WHERE tag_id=?', (tag,)) for tag in tags],
        'tag_sort_order': [rows(db, 'SELECT * FROM shared.tag_sort_order WHERE tag_id=?', (tag,)) for tag in tags],
    }


def run(root, manifest, output=None):
    source_hashes = hashes(root)
    db = connect(root, readonly=True)
    try:
        status = classify(db, manifest)
        before = summary(db)
        metadata_before = repair_metadata(db, manifest)
    finally:
        db.close()
    if status == 'already-repaired' or output is None:
        return {'status': status if status == 'already-repaired' else 'dry-run', 'before': before, 'expected_after': manifest['after'], 'account_deltas': manifest['account_deltas'], 'source_hashes': source_hashes}
    if source_hashes != manifest['source_hashes']:
        raise ValueError('Original file hashes differ')
    output = Path(output)
    output.mkdir(parents=False, exist_ok=False)
    for name in FILES.values():
        with sqlite3.connect(f'{(Path(root).resolve() / name).as_uri()}?mode=ro', uri=True) as source, sqlite3.connect(output / name) as destination:
            source.backup(destination)
    db = connect(output)
    try:
        apply_manifest(db, manifest)
        after = summary(db)
        metadata_after = repair_metadata(db, manifest)
    finally:
        db.close()
    if hashes(root) != source_hashes:
        raise ValueError('Source changed during repair')
    report = {'status': 'repaired', 'metadata_before': metadata_before, 'metadata_after': metadata_after, 'verification': ['exact original manifest', 'exact repaired signature', 'exact balance deltas', 'unchanged original hashes', 'unchanged preexisting foreign-key violations', 'fresh header timestamps and deletion markers'], 'before': before, 'after': after, 'account_deltas': manifest['account_deltas'], 'source_hashes': source_hashes, 'output_hashes': hashes(output)}
    (output / 'repair-report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', type=Path, help='Create a new repaired directory; omitted means read-only dry-run')
    args = parser.parse_args()
    print(json.dumps(run(args.source, json.loads(args.manifest.read_text()), args.output), indent=2))
