# Sprout Track — Home Assistant Add-on

Run [Sprout Track](https://github.com/Oak-and-Sprout/sprout-track) — a self-hosted baby tracker for feeds, sleep, diapers, pumping, milestones, medicine, and growth charts — as a Home Assistant add-on.

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fhartmawt%2Fsprout-track-ha)

## Requirements

- Home Assistant OS or Supervised (the Add-on Store is required — Home Assistant Container and Core cannot run add-ons)
- A 64-bit machine: `amd64` or `aarch64`

## Installing in Home Assistant

### 1. Add this repository

Click the button above, **or** add it manually:

1. Open **Settings → Add-ons → Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Paste:
   ```
   https://github.com/hartmawt/sprout-track-ha
   ```
4. Click **Add**, then **Close**

### 2. Install the add-on

1. Still in the Add-on Store, refresh the page if needed
2. Find **Sprout Track** (under a "Sprout Track Add-on Repository" heading) and click it
3. Click **Install** — this pulls the application image and takes a few minutes

### 3. Configure

Open the **Configuration** tab and set at minimum your timezone:

```yaml
timezone: America/New_York
enable_notifications: false
app_url: ""
enable_log: false
```

| Option | Default | Description |
| --- | --- | --- |
| `timezone` | *(HA system TZ)* | Timezone for log timestamps, e.g. `America/New_York`. Set this — entries are recorded in local time. |
| `enable_notifications` | `false` | Enables push notifications and the reminder cron job. Requires `app_url`. |
| `app_url` | *(empty)* | Full URL the app is reachable at, e.g. `http://192.168.1.50:3000`. Only needed for notifications. |
| `enable_log` | `false` | Verbose API request logging. Diagnostics only. |

Click **Save**.

### 4. Start

1. Go to the **Info** tab and click **Start**
2. Optionally enable **Start on boot** and **Watchdog**
3. Watch the **Log** tab — first start runs database migrations and seeding, so give it a minute
4. Click **Open Web UI**, or browse to `http://<your-home-assistant-ip>:3000`

Create your family and caretaker accounts on first visit.

### 5. Add a sidebar entry (optional)

This add-on does not use Ingress ([see below](#why-ingress-is-not-used)), so it has no sidebar entry by default. To add one, put this in `configuration.yaml` and restart Home Assistant:

```yaml
panel_iframe:
  sprout_track:
    title: "Sprout Track"
    icon: mdi:baby-carriage
    url: "http://192.168.1.50:3000"
```

Replace the IP with your Home Assistant machine's address.

> If you access Home Assistant over HTTPS, browsers block `http://` iframes as mixed content. Use the **Open Web UI** button instead, which opens in a new tab.

## Accounts and security

Sprout Track has its own login (account email/password, or a per-caretaker PIN). It does **not** use your Home Assistant login, so you sign in separately.

Because the add-on is reached on a plain port rather than through Ingress, **anyone on your local network can reach the login page**. Set a strong PIN or password, and do not forward port 3000 through your router to the internet.

## Data and backups

Everything lives in the add-on's `/data` directory and is included automatically in Home Assistant backups:

| Path | Contents |
| --- | --- |
| `/data/db` | SQLite databases (all tracked data) |
| `/data/env` | Generated encryption and signing secrets |
| `/data/files` | Uploaded photos and documents |

The secrets in `/data/env` are generated once on first start and reused. They are what keep existing logins and encrypted data readable — keep your backups.

> **Restoring:** restore a backup into the same add-on version it was taken from. Restoring an old backup into a newer version can fail during database migration.
>
> **Uninstalling deletes `/data`, including all tracked data.** Take a backup first.

## Troubleshooting

**The add-on doesn't appear after adding the repository.** Refresh the Add-on Store page, or reload the browser. It appears under its own "Sprout Track Add-on Repository" heading, not in the official list.

**Add-on won't start, or first run seems stuck.** Check the **Log** tab. The first start runs migrations and seeding, which is slow on low-powered hardware.

**Timestamps are wrong.** Set `timezone` and restart.

**Notifications aren't arriving.** Confirm `enable_notifications` is on and `app_url` exactly matches the URL you use, including the port.

**Port 3000 is already in use.** Change the host port under the add-on's **Network** section, then update `app_url` to match.

**Installation fails on a Raspberry Pi 3 or similar.** Those are 32-bit (`armv7`) and are not supported; a 64-bit machine is required.

## Why Ingress is not used

Home Assistant's Ingress feature (which provides the sidebar entry and single sign-on) serves add-ons from a randomly generated URL prefix that changes every session.

Sprout Track is a Next.js application. Next.js requires its URL prefix (`basePath`) to be fixed when the app is **compiled** and inlines it into the client bundles, so it cannot adapt to a prefix only known at runtime. Under Ingress, the app's requests for `/_next/...` and `/api/...` would resolve against the Home Assistant root and never reach the add-on. Supporting it would require rewriting roughly 226 fetch calls and 87 redirects across 135+ upstream files and permanently forking the project.

Direct port access avoids all of this and lets the add-on run the official, unmodified Sprout Track image. This becomes straightforward if upstream ever adds `basePath` support.

## How it works

The add-on builds **on top of the official `sprouttrack/sprout-track` image** rather than rebuilding from source. Upstream application code is not modified or forked.

`run.sh` does two things before handing off to the upstream entrypoint:

1. **Applies add-on options.** Upstream's `docker-startup.sh` sources its persisted `.env` with `set -a`, which overrides exported environment variables. Options are therefore written into that file rather than exported, while leaving the auto-generated `ENC_HASH` and `JWT_SECRET` untouched so logins and encrypted data survive restarts.
2. **Redirects storage to `/data`.** The image's `/db`, `/app/env`, and `/app/Files` volumes are symlinked into `/data`, the volume Home Assistant persists and backs up.

## Repository layout

```
repository.yaml          Add-on repository manifest
sprout_track/
├── config.yaml          Add-on manifest (options, ports)
├── build.yaml           Base image per architecture
├── Dockerfile           Layers the HA entrypoint onto the upstream image
├── run.sh               Applies HA options, maps storage to /data
└── DOCS.md              Documentation shown in the add-on's Documentation tab
```

## Updating to a new Sprout Track release

Bump the image tag in `sprout_track/build.yaml` and the matching `version` in `sprout_track/config.yaml`, then commit. Home Assistant will offer the update.

## Credits

Sprout Track is developed by [Oak and Sprout](https://github.com/Oak-and-Sprout/sprout-track) and licensed under its own terms. This repository provides only the Home Assistant packaging.
