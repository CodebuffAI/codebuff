# macOS code signing + notarization

How the Freebuff Desktop macOS build gets a Developer ID signature and Apple
notarization, and what a human has to do to turn it on.

## TL;DR

The release workflow (`.github/workflows/freebuff-desktop-release.yml`) is
**auto-gating**: it signs + notarizes the macOS build **iff** the six `APPLE_*`
secrets exist. Until then it falls back to the ad-hoc-unsigned path. The wiring
is **identity-agnostic** — an individual cert and an organization cert use the
exact same six secrets, so switching identities is a secrets swap, no code
change.

Recommended rollout: enroll as an **individual** first (usually same-day) to
ship signed builds immediately, while the **organization** enrollment
(D-U-N-S + verification) proceeds in parallel. When the org account is ready,
regenerate the cert + notary key under it and overwrite the same six secrets.

## The six secrets

Set these in the repo → Settings → Secrets and variables → Actions:

| Secret | What it is | How to produce |
| --- | --- | --- |
| `APPLE_CERT_P12_BASE64` | Developer ID Application cert + private key | `base64 -i DeveloperID.p12 \| pbcopy` |
| `APPLE_CERT_PASSWORD` | password you set when exporting the `.p12` | — |
| `APPLE_API_KEY_P8_BASE64` | App Store Connect API key for notarization | `base64 -i AuthKey_XXXX.p8 \| pbcopy` |
| `APPLE_API_KEY_ID` | Key ID of that API key | App Store Connect → Integrations |
| `APPLE_API_ISSUER_ID` | Issuer ID of the API key | App Store Connect → Integrations |
| `APPLE_TEAM_ID` | 10-char Team ID | App Store Connect → Membership |

## One-time setup

### 1. Enrollment

- **Individual (fast):** enroll at https://developer.apple.com/programs/enroll/
  with your Apple ID. Usually approved same-day. $99/yr.
- **Organization (Freebuff, Inc.):** needs a **D-U-N-S number** for the legal
  entity (check https://developer.apple.com/enroll/duns-lookup/, request from
  Dun & Bradstreet if missing — can take days to ~2 weeks) plus an Apple
  verification call. Use a company-owned Apple ID as the Account Holder, not a
  personal address you might lose. $99/yr.

### 2. Developer ID Application certificate → `.p12`

1. Keychain Access → Certificate Assistant → **Request a Certificate from a
   Certificate Authority** → email = account holder, CA email blank, **Saved to
   disk** → produces a `.certSigningRequest`.
2. https://developer.apple.com/account/resources/certificates/list → **+** →
   **Developer ID Application** → upload the CSR → download the `.cer`.
3. Double-click the `.cer` to import → in Keychain under **My Certificates**,
   right-click → **Export** as `.p12`, set a strong password.
4. `base64 -i DeveloperID.p12 | pbcopy` → `APPLE_CERT_P12_BASE64`; the export
   password → `APPLE_CERT_PASSWORD`.

### 3. Notarization API key (App Store Connect)

1. https://appstoreconnect.apple.com/access/integrations/api → **+** → role
   **Developer** → download the `.p8` (**one-time download**).
2. `base64 -i AuthKey_XXXX.p8 | pbcopy` → `APPLE_API_KEY_P8_BASE64`; note Key ID
   → `APPLE_API_KEY_ID`, Issuer ID → `APPLE_API_ISSUER_ID`.

### 4. Team ID

App Store Connect → Membership → copy the 10-char Team ID → `APPLE_TEAM_ID`.

Once all six are set, the next release run signs + notarizes automatically.

## How the pipeline uses them

- `package.json` → `build.mac`: `hardenedRuntime: true`, `gatekeeperAssess:
  false`, and `entitlements`/`entitlementsInherit` → `build/entitlements.mac.plist`
  (JIT + library-validation entitlements Electron needs under hardened runtime).
- Workflow step **Configure macOS signing** decodes the `.p12` and `.p8` into
  `$RUNNER_TEMP` and exports `CSC_LINK`, `CSC_KEY_PASSWORD`,
  `CSC_IDENTITY_AUTO_DISCOVERY=true`, `APPLE_API_KEY*`, `APPLE_TEAM_ID`, and
  `FREEBUFF_NOTARIZE=true`. If the secrets are absent it sets
  `CSC_IDENTITY_AUTO_DISCOVERY=false` and does nothing else.
- **Package installer** runs `pack:ci -c.mac.notarize=true` when
  `FREEBUFF_NOTARIZE=true`, else plain `pack:ci`.
- `scripts/ad-hoc-sign.cjs` no-ops when `CSC_LINK`/`FREEBUFF_NOTARIZE` is set, so
  the ad-hoc signature never clobbers the real one.

## Switching individual → organization later

Regenerate steps 2–4 under the org account and **overwrite** the same six
secrets. No code change. The next release is signed by the org. The in-app
updater does a full-bundle swap and each build is independently notarized, so
there is no signature-pinning issue across the identity change (we are not using
Sparkle EdDSA).

## Follow-ups / not done yet

- **Verify on the first real signed run.** Notarization can reject an app whose
  nested executables aren't correctly signed with hardened runtime + a secure
  timestamp. We bundle a `bun` binary and the orchestrator under
  `Contents/Resources` (see `build.extraResources`); electron-builder re-signs
  binaries it walks, but confirm the notary log is clean on the first run and
  adjust entitlements / `signIgnore` if the notary flags them.
- **Remove the quarantine-strip hack.** `electron/updater.cjs` (~line 193) runs
  `xattr -dr com.apple.quarantine` so the *unsigned* self-updated app can
  relaunch. Once signed+notarized builds are confirmed, delete that strip (and
  its test in `electron/updater.test.ts`) — a notarized bundle relaunches
  cleanly without it, and the strip is the risky part of that path.
- **Windows Authenticode** signing is a separate effort (different cert /
  provider) and is out of scope here; Windows builds remain unsigned.
