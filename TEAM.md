# Secure team delivery

Run the self-hosted HTTPS service with Node.js 24 or newer, FFmpeg 7.1+ and FFprobe on the host. Give the service account an access-controlled data directory. The SQLite catalog and imported MP4 objects live there. Back up the entire directory together. This profile supports a single running server process and multiple workspaces. An administrator may import a file from a mounted NAS. Each import copies the verified online file into the service's private object directory.

## Configure a workspace

Set these environment variables using your shell or service manager:

| Variable | Example or purpose |
| --- | --- |
| AFM_ORIGIN | Absolute HTTPS origin, e.g. https://media.example.org:8443 |
| AFM_CERT | Path to a PEM certificate chain trusted by team devices |
| AFM_KEY | Path to its private PEM key |
| AFM_DATA | Private persistent directory; defaults to .afm-team |
| AFM_BIND | Listening interface, default 127.0.0.1. Set to the server LAN address for direct team access. |

```sh
node team.mjs init Editorial Alice
node prepare.mjs encode master.mp4 480 28 shot.afm shot-001 v1 https://media.example.org:8443/v1/resolve
node team.mjs import Editorial shot.afm master.mp4
node team.mjs serve
```

Store the administrator's generated access key in a password manager. Visit the configured origin, sign in, and create individual keys in **Team members**. Share each key privately. Editors can pause and resume media delivery and leave review notes. Viewers can read the workspace and play its available assets. Administrators can also add and revoke members. Refresh the dashboard to see colleagues' changes. Open **Open player** on the same origin, choose the matching AFM, and enable remote playback.

## Security model

TLS 1.2 or newer encrypts the connection and authenticates the service with its certificate. Sign-in exchanges a random 256-bit personal key for a Secure, HttpOnly, SameSite cookie. Only key hashes are persisted. Workspace membership is checked server-side. The service resolves exact catalog identifiers within that workspace, then issues a random five-minute playback ticket bound to the current session and media object. Each range request requires both. Changing an asset ID or copying a ticket to another account cannot grant access to a different workspace. All members of a workspace can read its available media. Use separate workspaces for separate audiences.

Signing out invalidates the session. Revoking a member denies subsequent requests. Pausing an asset invalidates its issued tickets. Restarting the service clears sessions and tickets. Bytes already delivered remain on the recipient's device. This is transport encryption and access control; storage encryption is managed by the host. Keep the data directory outside public web roots. The loopback demo server is a separate unauthenticated example.

## Verification

Run `node --test test.mjs` for the packer. To include TLS integration, set AFM_TEST_CERT and AFM_TEST_KEY to a disposable test certificate and private key. The certificate must be valid for IP 127.0.0.1. Run `node --test test.mjs team.test.mjs`. The test trusts only the supplied certificate, generates synthetic media, tests a one-frame mismatch, exercises cross-workspace isolation, and checks media ranges, collaboration and revocation. It uses port 18443 by default; override with AFM_TEST_PORT.
