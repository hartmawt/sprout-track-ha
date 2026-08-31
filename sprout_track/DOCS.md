# Sprout Track

Baby tracking for Home Assistant — feeds, sleep, diapers, pumping, milestones, medicine, and growth charts.

This add-on packages the upstream [Sprout Track](https://github.com/Oak-and-Sprout/sprout-track) application, built by Oak and Sprout.

## Installation

1. **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add this repository's URL.
3. Install **Sprout Track**.
4. Set your timezone in the **Configuration** tab.
5. Start the add-on, then click **Open Web UI**.

First start takes a minute — the add-on runs database migrations and seeds initial data.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `timezone` | *(HA system TZ)* | Timezone for log timestamps, e.g. `America/New_York`. Getting this right matters — entries are recorded in local time. |
| `enable_notifications` | `false` | Enables push notifications and the background reminder cron job. Requires `app_url`. |
| `app_url` | *(empty)* | Full URL the app is reachable at, e.g. `http://192.168.1.50:3000`. Only needed for notifications. |
| `enable_log` | `false` | Verbose API request logging. Diagnostics only; increases disk usage. |

## Accessing the app

Open the web UI at `http://<home-assistant-ip>:3000`, or use the **Open Web UI** button on the add-on page.

### Why there is no sidebar entry

Home Assistant's Ingress feature (which provides the sidebar entry and single sign-on) serves add-ons from a randomly generated URL prefix that changes every session.

Sprout Track is a Next.js application. Next.js requires its URL prefix (`basePath`) to be fixed when the app is **compiled**, and bakes it into the JavaScript bundles. It cannot be told about a prefix that is only known at runtime. Under Ingress, the app's requests for `/_next/...` and `/api/...` would be sent to Home Assistant itself instead of to the add-on, and nothing would load.

Direct port access avoids this entirely and lets the add-on run the official, unmodified Sprout Track image.

Because Home Assistant only offers the **Show in sidebar** toggle for Ingress add-ons, this add-on does not have one. To get something equivalent, add a **Webpage card** pointing at `http://<your-home-assistant-ip>:3000`:

1. Open a dashboard → **Edit** → **Add card** → search for **Webpage**
2. Set the URL and save

For a full sidebar item, create a new dashboard under **Settings → Dashboards**, enable **Show in sidebar**, and give it a single Webpage card in panel mode.

> The older `panel_iframe` integration has been **removed from Home Assistant**; use a Webpage card instead.
>
> If you reach Home Assistant over HTTPS, browsers block embedded `http://` pages as mixed content and the card will render blank. Use the **Open Web UI** button in that case.

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

**There's no "Show in sidebar" toggle.** Expected — that toggle only exists for Ingress add-ons. See [Why there is no sidebar entry](#why-there-is-no-sidebar-entry).

**Timestamps are wrong.** Set `timezone` to your local timezone and restart.

**Notifications aren't arriving.** Confirm `enable_notifications` is on and `app_url` is set to the exact URL you use to reach the app, including the port.

**Starting over.** Uninstalling the add-on deletes `/data`, including all tracked data. Take a backup first.

## Architecture support

Builds for `amd64` and `aarch64` (64-bit). 32-bit `armv7` devices such as the Raspberry Pi 3 are not supported — the app's native database module needs a 64-bit build.

## Credits

Sprout Track is developed by [Oak and Sprout](https://github.com/Oak-and-Sprout/sprout-track). This repository only provides Home Assistant add-on packaging.
