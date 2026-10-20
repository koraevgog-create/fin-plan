# GPRO Command Center — production safety and recovery

## Current production
- URL: http://command.d900325z.beget.tech/
- Repository: koraevgog-create/fin-plan
- Production entry: command.d900325z.beget.tech/public_html/index.html
- Required JS: portfolio.js, bootstrap.js, server-sync.js, backup.js
- State storage: sibling gpro-command-storage directory OUTSIDE public_html.
- Configuration: sibling gpro-command-config PHP file OUTSIDE public_html.
- Never copy, publish, delete or reset state storage or config as part of a code release.

## Incident 2026-10-20
An older GitHub Actions workflow used lftp mirror --reverse --transfer-all, removing existing production files before replacement. FTPS upload of portfolio.js repeatedly failed (lftp max-retries exceeded, independent curl upload returned FTP 426). The production portfolio.js was missing and the UI could not import it. Manual upload using Beget file manager restored the site. Root cause of the interrupted FTPS data transfer is still unknown.

## Immediate protection
The deploy-beget.yml workflow is MANUAL, READ-ONLY preflight. No push can overwrite production. Do not restore an automatic FTP mirror or a per-file live overwrite strategy.

## Before building an automated deployment
1. Verify the live site is usable, projects and tasks load, data persists after reload, and authenticated API revision increments correctly. Never disclose or log admin keys.
2. Set up HTTPS and confirm no mixed-content errors. HTTP currently exposes admin key traffic.
3. Identify correct FTP user's chroot and correct site's public_html, distinguishing 'comand' from 'command' directories.
4. Diagnose FTPS 426 with Beget support: server FTP logs, passive data ports, connection timeouts, file ownership/permissions, and account-specific restrictions.
5. Prepare a staging domain or separate staging directory. Upload a complete release under an immutable release identifier. Validate every file with SHA256 and test the staging app. Never place a PHP source file with an unsafe temporary extension under the public web root.
6. After verified staging, implement a server-side atomic pointer/symlink release switch with rollback to a previous known-good release. Only deploy code, never storage. The switch mechanism must be proven supported on Beget before enabling.
7. Test forced transfer failure and rollback on staging before any production deployment.
8. Add a live smoke test for index.html, JS MIME type, import availability and API GET authorization behavior, and alert on failure.
9. Maintain a documented manual restore path: GitHub raw portfolio.js -> Beget file manager -> public_html/portfolio.js -> hard reload.

## Operator checklist
- Run manual preflight in GitHub Actions. A green result is NOT equivalent to a full browser-based or authenticated sync test.
- Export a JSON backup from the UI before any maintenance.
- Verify remote state backup independently.
- Preserve production until an atomic replacement path is validated.
