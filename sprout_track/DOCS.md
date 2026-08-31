# Sprout Track

Baby tracking for Home Assistant — feeds, sleep, diapers, pumping, milestones, medicine, and growth charts.

This add-on packages the upstream [Sprout Track](https://github.com/Oak-and-Sprout/sprout-track) application, built by Oak and Sprout.

## Installation

1. **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add this repository's URL.
3. Install **Sprout Track**.
4. Set your timezone in the **Configuration** tab.
5. Start the add-on, then click **Sprout Track** in the sidebar or **Open Web UI**.

First start takes a minute — the add-on runs database migrations and seeds initial data.

## First run — the default PIN

The app asks for a **family security PIN** before running its setup wizard.

| | |
| --- | --- |
| **Default PIN** | `111222` |
| **Login ID** (only if prompted) | `00` |
| **Default family** | "My Family", at `/my-family` |

The wizard then walks you through naming your family, choosing your own PIN (or adding individual caretakers with their own PINs), and adding your baby.

> **Change the PIN immediately** — `111222` is a published default. In the app: **Settings gear → Change PIN**. PINs are 6–10 digits, numbers only.
>
> **Three wrong attempts locks your IP out for 5 minutes.** Wait it out; it clears on its own.

The PIN is stored in the app's own database, so it is not a Home Assistant add-on option and does not appear in the **Configuration** tab.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `timezone` | *(HA system TZ)* | Timezone for log timestamps, e.g. `America/New_York`. Getting this right matters — entries are recorded in local time. |
| `enable_notifications` | `false` | Enables push notifications and the background reminder cron job. Requires `app_url`. |
| `app_url` | *(empty)* | Full URL the app is reachable at, e.g. `http://192.168.1.50:3000`. Only needed for notifications. |
| `enable_log` | `false` | Verbose API request logging. Diagnostics only; increases disk usage. |

## Accessing the app

Open the web UI at `http://<home-assistant-ip>:3000`, or use the **Open Web UI** button on the add-on page.

### The sidebar entry

The add-on adds a **Sprout Track** entry to the sidebar, controlled by the **Show in sidebar** toggle on the Info page. It opens the app inside Home Assistant.

The app is served over HTTPS on port 3000 using Home Assistant's own certificate from `/ssl`, and the sidebar page embeds it. Where that works:

| How you're connected | Result |
| --- | --- |
| Home network, same hostname you use for Home Assistant | Opens inside Home Assistant |
| Home network, bare IP address | Certificate won't match — shows a link instead |
| Remote, port 3000 not forwarded | Not reachable — shows an explanatory page |

The app is not proxied through ingress. Next.js fixes its URL prefix (`basePath`) at compile time, and rewriting URLs in a proxy cannot work either: the client router reads `location.pathname`, which a browser will not let anything override, and the app assigns `window.location.href` directly during logout and navigation. Embedding the app at its own origin avoids all of this, because every absolute URL then resolves correctly on its own.

> Port 3000 is intentionally not exposed to the internet. For remote access use a VPN or your own reverse proxy — do not port-forward it, as that would publish the login page.

## Accounts and security

Sprout Track has its own login (account email/password, or a per-caretaker PIN). It does **not** use your Home Assistant login, so you will sign in separately.

Because this add-on is reached over a plain port rather than through Ingress, **anyone on your local network can reach the login page**. Set a strong PIN or password. Do not forward port 3000 through your router to the internet.

## Data and backups

Everything lives in the add-on's `/data` directory and is included automatically in Home Assistant backups:

| Path | Contents |
| --- | --- |
| `/data/db` | SQLite databases (all tracked data) |
| `/data/env` | Generated encryption and signing secrets |
| `/data/files` | Uploaded photos and documents |

The secrets in `/data/env` are generated once on first start and reused afterwards. They are what make existing logins and encrypted data readable, so keep your backups.

> **Restoring a backup:** restore it into the same add-on version it was taken from. Restoring an old backup into a newer version can fail during the database migration step.

## Port conflicts

If something else on your Home Assistant machine already uses port 3000, change the host port under the add-on's **Network** section. The `app_url` option (if set) must be updated to match.

## Troubleshooting

**Add-on won't start / stuck on first run.** Check the **Log** tab. First start runs migrations and seeding, which is slow on low-powered hardware — give it a few minutes.

**It asks for a PIN.** The default is `111222` — change it under **Settings → Change PIN**.

**Locked out.** Three wrong PIN attempts locks your IP for 5 minutes; it clears by itself.

**The sidebar shows "cannot be shown here".** Your browser can't reach port 3000 from where you are — expected outside your home network. At home, reach Home Assistant by the hostname its certificate is issued for, not a bare IP.

**Timestamps are wrong.** Set `timezone` to your local timezone and restart.

**Notifications aren't arriving.** Confirm `enable_notifications` is on and `app_url` is set to the exact URL you use to reach the app, including the port.

**Starting over.** Uninstalling the add-on deletes `/data`, including all tracked data. Take a backup first.

## Architecture support

Builds for `amd64` and `aarch64` (64-bit). 32-bit `armv7` devices such as the Raspberry Pi 3 are not supported — the app's native database module needs a 64-bit build.

## Credits

Sprout Track is developed by [Oak and Sprout](https://github.com/Oak-and-Sprout/sprout-track). This repository only provides Home Assistant add-on packaging.
