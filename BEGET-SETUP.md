# GPRO Command Center — Beget

This is a deliberately simple first version, NOT suitable for confidential data over HTTP.

1. Create a Beget FTP user restricted to `/command.d900325z.beget.tech/public_html`.
2. Set GitHub Actions secrets `BEGET_FTP_HOST`, `BEGET_FTP_USER`, `BEGET_FTP_PASSWORD`. The deployment uses certificate-verified FTPS.
3. In Beget File Manager create `/command.d900325z.beget.tech/gpro-command-config.php` **outside** `public_html`. Copy the example and set a long random admin key (24+ chars).
4. Set PHP 8.x for the site. Ensure `public_html/api/state.php` is available.
5. Trigger the `Deploy GPRO Command to Beget` workflow manually.
6. Open the Beget site, download a JSON backup on the existing home computer, click Cloud Sync and enter the key. Confirm importing local data to the server.
7. On another device, click Cloud Sync and enter the same key; load server data.
8. Edits are debounced and saved with revision checks. If another device edited simultaneously, a conflict stops upload instead of silently overwriting. Reload and reconcile from backup.

Limitations: no HTTPS on the site means the admin key and data can be intercepted on the network. Do not enter confidential information. A shared key is minimal access control, not full authentication. Sync runs on page load and on edits, not realtime. No file uploads. Do not store real keys in this repository.
