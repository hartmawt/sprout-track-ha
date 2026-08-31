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

The add-on adds a **Sprout Track** entry to the sidebar, controlled by the **Show in sidebar** toggle on the Info page. Clicking it sends you to the app on port 3000.

The app is not proxied through Home Assistant. Ingress serves add-ons from a randomly generated URL prefix that changes every session, and Next.js requires its URL prefix (`basePath`) to be fixed when the app is compiled — it bakes it into the JavaScript bundles. Served through Ingress, requests for `/_next/...` and `/api/...` would go to Home Assistant instead of the add-on and nothing would load.

Home Assistant only offers the sidebar toggle to Ingress add-ons, so the add-on enables Ingress and serves a small page on the Ingress port that hands the browser off to port 3000. It navigates the top-level window instead of embedding the app, because browsers refuse to load an `http://` page inside an iframe on an `https://` dashboard but will follow a top-level link to one.

> The sidebar entry points at `http://<your-home-assistant-host>:3000`, which your browser must be able to reach. That holds on your local network, but not over a Nabu Casa remote connection — remote access needs your own reverse proxy or a VPN.

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

**The sidebar entry doesn't load.** It hands off to `http://<ha-host>:3000`, which must be reachable from your browser. That won't work over a Nabu Casa remote connection.

**Timestamps are wrong.** Set `timezone` to your local timezone and restart.

**Notifications aren't arriving.** Confirm `enable_notifications` is on and `app_url` is set to the exact URL you use to reach the app, including the port.

**Starting over.** Uninstalling the add-on deletes `/data`, including all tracked data. Take a backup first.

## Architecture support

Builds for `amd64` and `aarch64` (64-bit). 32-bit `armv7` devices such as the Raspberry Pi 3 are not supported — the app's native database module needs a 64-bit build.

## Credits

Sprout Track is developed by [Oak and Sprout](https://github.com/Oak-and-Sprout/sprout-track). This repository only provides Home Assistant add-on packaging.
