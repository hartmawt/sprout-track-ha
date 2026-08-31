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
4. Click **Sprout Track** in the sidebar, **Open Web UI**, or browse to `http://<your-home-assistant-ip>:3000`

### 5. First run — the default PIN

On first visit the app asks for a **family security PIN** before running its setup wizard.

| | |
| --- | --- |
| **Default PIN** | `111222` |
| **Login ID** (only if prompted) | `00` |
| **Default family** | "My Family", at `/my-family` |

The setup wizard then walks you through naming your family, choosing your own PIN (or adding individual caretakers with their own PINs), and adding your baby.

> **Change the PIN immediately** — `111222` is a published default. In the app: **Settings gear → Change PIN**. PINs are 6–10 digits, numbers only.
>
> **Three wrong attempts locks your IP out for 5 minutes**, so don't guess.

### 6. Sidebar entry

The add-on registers a **Sprout Track** entry in the sidebar, controlled by the **Show in sidebar** toggle on the add-on's Info page. It opens the app inside Home Assistant.

The app is served over HTTPS on port 3000 using Home Assistant's own certificate, and the sidebar page embeds it. Where that works:

| How you're connected | Result |
| --- | --- |
| On your home network, using the same hostname you use for Home Assistant | Opens inside Home Assistant |
| On your home network, using a bare IP address (`192.168.x.x`) | Certificate won't match the address — shows a link instead |
| Remotely, without port 3000 forwarded | Not reachable — shows an explanatory page |

Port 3000 is deliberately **not** exposed to the internet, so remote access needs a VPN (Tailscale, WireGuard) or your own reverse proxy. Don't port-forward 3000 — it would put the login page on the public internet behind only a 6-digit PIN.

If you have no certificate in `/ssl`, the app is served over plain HTTP instead. That still works on a local-only Home Assistant, but it cannot be embedded in an HTTPS dashboard.

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

**It asks for a PIN and I don't have one.** The default is `111222`. Change it right away under **Settings → Change PIN**.

**I'm locked out.** Three wrong PIN attempts locks your IP for 5 minutes. Wait it out — the lockout clears on its own.

**The sidebar entry shows "cannot be shown here".** Your browser can't reach the app on port 3000 from where you are. That's expected when connecting from outside your home network. On your home network, make sure you're reaching Home Assistant by the same hostname its certificate is issued for, not by a bare IP address.

**Add-on won't start, or first run seems stuck.** Check the **Log** tab. The first start runs migrations and seeding, which is slow on low-powered hardware.

**Timestamps are wrong.** Set `timezone` and restart.

**Notifications aren't arriving.** Confirm `enable_notifications` is on and `app_url` exactly matches the URL you use, including the port.

**Port 3000 is already in use.** Change the host port under the add-on's **Network** section, then update `app_url` to match.

**Installation fails on a Raspberry Pi 3 or similar.** Those are 32-bit (`armv7`) and are not supported; a 64-bit machine is required.

## Why the app is not proxied through Ingress

Ingress serves add-ons from a URL prefix. Sprout Track is a Next.js application, and Next.js requires its URL prefix (`basePath`) to be fixed when the app is **compiled**, inlining it into the client bundles.

Rewriting the app's URLs in a proxy instead does not work either. Next.js's client router reads `location.pathname` to decide which route to show, and `Location.prototype.pathname` cannot be overridden in a browser — so browser back/forward would break. The app also assigns `window.location.href` directly in core flows such as logout and returning home, and those assignments cannot be intercepted at all. A proxy would produce an app that looks fine until it silently breaks.

So the app is served on its own port, and the sidebar page embeds it there. Because the frame loads the app at its own origin root, every absolute URL in the app resolves correctly with no rewriting. To make that embeddable on an HTTPS dashboard, the add-on serves the app over HTTPS using Home Assistant's existing certificate from `/ssl`, reloading it when it is renewed.

If upstream ever adds runtime `basePath` support, true Ingress proxying becomes straightforward and this can be simplified.

## How it works

The add-on builds **on top of the official `sprouttrack/sprout-track` image** rather than rebuilding from source. Upstream application code is not modified or forked.

`run.sh` does two things before handing off to the upstream entrypoint:

1. **Applies add-on options.** Upstream's `docker-startup.sh` sources its persisted `.env` with `set -a`, which overrides exported environment variables. Options are therefore written into that file rather than exported, while leaving the auto-generated `ENC_HASH` and `JWT_SECRET` untouched so logins and encrypted data survive restarts.
2. **Redirects storage to `/data`.** `/db`, `/app/env` and `/app/Files` are `VOLUME` mount points in the upstream image, so those directories cannot be replaced — attempting it fails with `Resource busy`. Instead the databases are pointed at `/data` through environment variables, and files and subdirectories *inside* the mounts are linked out to `/data`, the volume Home Assistant persists and backs up.
3. **Serves the app over HTTPS.** Next.js is moved to an internal port and a small TLS terminator using Home Assistant's certificate takes the published one, so the sidebar can embed the app on an HTTPS dashboard.

## Repository layout

```
repository.yaml          Add-on repository manifest
sprout_track/
├── config.yaml          Add-on manifest (options, ports)
├── build.yaml           Base image per architecture
├── Dockerfile           Layers the HA entrypoint onto the upstream image
├── run.sh               Applies HA options, maps storage to /data
├── tls-proxy.js         Serves the app over HTTPS using Home Assistant's cert
├── ingress-page.js      Sidebar page that embeds the app
└── DOCS.md              Documentation shown in the add-on's Documentation tab
```

## Updating to a new Sprout Track release

Bump the image tag in `sprout_track/build.yaml` and the matching `version` in `sprout_track/config.yaml`, then commit. Home Assistant will offer the update.

## Credits

Sprout Track is developed by [Oak and Sprout](https://github.com/Oak-and-Sprout/sprout-track) and licensed under its own terms. This repository provides only the Home Assistant packaging.
