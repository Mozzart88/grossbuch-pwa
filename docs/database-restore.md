# Restoring decrypted split databases

Use **Restore decrypted databases** on the database download page. It is also available from the PIN setup/unlock screen through **Restore databases**.

Select files from a backup of this installation. Canonical names (`main.db`, `shared.db`, `workspace-1.db`) and decrypted-export names (`main-decrypted.db`, `shared-decrypted.db`, `workspace-1-decrypted.db`) are accepted. Files must be decrypted SQLite databases from the currently supported split schema. Encrypted backups and legacy single-file databases do not belong in this restore flow; legacy setup/migration remains separate.

## Full restore

Include main, shared, and every workspace listed in that shared database. The preview identifies missing files. Choose and confirm a new PIN (6–12 digits), review the replacement list and integrity findings, then confirm restore.

Full restore generates fresh app/shared encryption keys and updates the local PIN salt, PIN verifier, wrapped shared key, and session signing material. It preserves other source main records, including installation identity and linked devices. Existing session and biometric unlock credentials are cleared. Unlock with the new PIN afterward; biometrics can then be enabled again.

This operation restores the same installation. It does not create a new device identity or reconcile an old backup with remote peers. Keep other devices from editing/syncing during a coordinated repair, and review peer synchronization separately.

## Partial restore

Unlock the installed app first. Select shared and/or one or more workspace files without main. Their encrypted replacements use the existing shared data key. Main, the PIN, its wrapped key, and files outside the selection are retained.

The resulting workspace registry must resolve to supplied or existing readable files, and the active workspace must remain registered. If replacing shared adds a workspace whose file is absent, include that workspace file. A workspace absent from the resulting registry is rejected.

## Validation and recovery

Review the selected mode, replacements, retained files, and historical reference findings before confirming. Missing registered files, unsupported schemas, absent required schema objects, corrupt SQLite contents, and failed encryption verification prevent installation. Existing orphan references are reported and preserved; restore does not automatically repair financial data or tags.

The app stages encrypted copies, reopens them, and verifies exact logical contents before replacing installed files. It retains encrypted backups and a recovery journal until installation completes. If interrupted, reload: recovery runs before normal database startup and restores the previous complete set or finishes cleanup of the committed new set. If recovery cannot finish, leave OPFS files in place, free storage if necessary, and retry startup. Do not manually delete restore journals or backups.

Only one tab can own the installation. Close another open app tab when prompted. Restore requires a browser with Web Locks and OPFS support. Staging and backups require additional storage; quota failures before replacement leave the original files unchanged, and failures during replacement are recoverable through the journal.

## Applying repaired exchange copies

The repair tool's outputs in `data/2026-09-28/repaired-exchanges` are debugging artifacts, not an automatic migration. Back up the current live state and confirm the repair copy is the intended version before selecting it. Select the complete set for full restore, or only the repaired workspace(s) for partial restore when the installed shared data and encryption context are the intended ones. Historical missing-tag findings can remain visible after repair and are not silently removed by restore.

No live database is replaced by building or deploying this feature. Installation happens only after file selection, preview, and explicit restore confirmation.

## Developer verification

Run `npm run test:run` and `npm run build`. For real OPFS testing, run `node src/tests/browser/serveSplitRestoreProbe.mjs`, then open the printed localhost URL in Safari. The probe refuses nonempty OPFS and uses synthetic data. Use a fresh port via `PROBE_PORT` for another run. It verifies full/partial restore and an actual reload after an injected interrupted write. Open the same URL with `?competitor` in a second tab while the first stays open to check exclusion. Reports are saved outside the repository in the printed temporary directory.
