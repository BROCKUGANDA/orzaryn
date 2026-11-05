# DEPLOY.md — ORZARYN on `orzaryn.svalley.tech` (VPS)

> **Subdomain:** `orzaryn.svalley.tech`
> **Stack:** Next.js 16 standalone + Bun + Caddy (auto-TLS) + systemd on your VPS
> **License:** Apache-2.0 (not MIT)

This is the single runbook for putting ORZARYN live at **https://orzaryn.svalley.tech**.
Follow it top-to-bottom on a fresh VPS.

---

## 1. At a glance

```
Internet ──HTTPS──▶ Caddy (:443, auto-TLS) ──▶ Next.js standalone (localhost:3000)
                                                   │
                                                   ├─ SQLite  /opt/orzaryn/db/custom.db
                                                   ├─ Alchemy Solana Devnet RPC (USDC)
                                                   └─ /api/health reflects real status
```

- **Public URL:** `https://orzaryn.svalley.tech`
- **Health gate (CI + deploy):** `curl https://orzaryn.svalley.tech/api/health`
- **App dir on VPS:** `/opt/orzaryn` · **service:** `orzaryn` (systemd) · **logs:** `journalctl -u orzaryn -f`
- **DB:** SQLite file at `/opt/orzaryn/db/custom.db` (backed up daily — see §7)

---

## 2. DNS (one record)

In your `svalley.tech` zone (Cloudflare / registrar / wherever you manage DNS):

| Type | Name | Value | Notes |
| --- | --- | --- | --- |
| A | `orzaryn` | `<VPS-IPv4>` | Proxied (orange cloud) is fine, but set **SSL mode Full (Strict)** if proxied. If you use Let's Encrypt origin certs, keep the origin record grey-cloud. |

Verify:

```bash
dig +short orzaryn.svalley.tech
curl -I https://orzaryn.svalley.tech   # 200 once Caddy is live
```

> Optional extras: `www.orzaryn.svalley.tech` → CNAME to `orzaryn.svalley.tech` (Caddyfile already redirects).

---

## 3. VPS bootstrap (Ubuntu 22.04 / 24.04, 2 GB RAM min, 10 GB disk)

Run as root once:

```bash
apt update && apt install -y curl git ufw fail2ban unattended-upgrades
ufw allow OpenSSH && ufw allow 'Nginx Full'   # Caddy needs 80+443:
ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Bun
curl -fsSL https://bun.sh/install | bash
# make bun available to the service user:
sudo -u orzaryn bash -lc 'source ~/.bashrc; bun --version'   # (create user first, below)

# System user + dirs
id orzaryn || useradd -m -s /bin/bash orzaryn
mkdir -p /opt/orzaryn/db /opt/orzaryn/logs
chown -R orzaryn:orzaryn /opt/orzaryn
chmod 750 /opt/orzaryn
```

Install Caddy (official repo):

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

---

## 4. App definition (first deploy — manual)

```bash
sudo -u orzaryn bash
cd /opt/orzaryn
git clone <your-repo-url> app && cd app
git checkout main
cp .env.example .env && nano .env        # fill §6 values, chmod 640
bun install --frozen-lockfile
bunx prisma db push
bunx prisma generate
bun run build                             # standalone output in .next/standalone
```

> `bun run build` already copies `/.next/static` and `/public` into the standalone dir (see `package.json`).

### systemd unit — `/etc/systemd/system/orzaryn.service`

```ini
[Unit]
Description=ORZARYN (orzaryn.svalley.tech)
After=network.target

[Service]
Type=simple
User=orzaryn
Group=orzaryn
WorkingDirectory=/opt/orzaryn/app
EnvironmentFile=/opt/orzaryn/app/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/local/bin/bun .next/standalone/server.js
Restart=on-failure
RestartSec=5
# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/orzaryn/db /opt/orzaryn/logs /opt/orzaryn/app
StandardOutput=append:/opt/orzaryn/logs/server.log
StandardError=append:/opt/orzaryn/logs/server.log

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now orzaryn
systemctl status orzaryn && curl -s http://127.0.0.1:3000/api/health | head -c 400
```

### Caddy — `/etc/caddy/Caddyfile`

```caddy
orzaryn.svalley.tech {
    encode gzip
    log { output file /var/log/caddy/orzaryn.log format json }

    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }

    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Real-IP {remote_host}
    }
}

www.orzaryn.svalley.tech {
    redir https://orzaryn.svalley.tech{uri} permanent
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy   # or: caddy reload
curl -s https://orzaryn.svalley.tech/api/health
```

Caddy auto-provisions Let's Encrypt certs on first hit. Keep ports 80/443 open.

> **Sandbox split-port dev:** the repo-root `Caddyfile` also keeps the legacy `:81` handler used by the sandbox gateway (`XTransformPort`). That block is harmless in prod — Caddy ignores it when the hostname sites exist — but you can delete it on the VPS if you want a minimal file. The full prod file above is what `/etc/caddy/Caddyfile` should contain.

---

## 5. Environment (`.env` on the VPS — never commit)

```bash
cp .env.example .env
nano .env
chmod 640 .env && chown orzaryn:orzaryn .env
```

| Key | Example | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:../db/custom.db` | Relative to `prisma/` → `/opt/orzaryn/app/db/custom.db`. Keep as-is or point at `/opt/orzaryn/db/custom.db` for shared volume. |
| `SESSION_SECRET` | `<64-char random>` | `openssl rand -hex 32`. **Rotate the sandbox placeholder before prod.** |
| `APP_ENV` | `production` | Set to `production` so cookies are `Secure`. |
| `APP_URL` | `https://orzaryn.svalley.tech` | Public URL of this subdomain. |
| `NETWORK` | `solana-devnet` | Solana Devnet (staging). Validator `testnet` has no Alchemy endpoint. |
| `USDC_MINT_TESTNET` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Circle's **Devnet** USDC (faucet, no real value). |
| `ALCHEMY_RPC_HOST` | `https://solana-devnet.g.alchemy.com/v2` | Your Alchemy Solana endpoint (key in path or separate header per your plan). |
| `ALCHEMY_APP_ID` | `q15y93g86sfgd0rb` | From your Alchemy app. |
| `ALCHEMY_API_KEY` | `alch_…` | Rotate the sandbox value. |
| `ALCHEMY_WEBHOOK_SECRET` | `<secret>` | **Required** — without it webhooks dead-letter as unverified (SF-4). |
| `PLATFORM_FEE_BPS` | `0` | Keep `0` until pricing is validated. |

---

## 6. CI/CD — GitHub Actions

Two workflows ship with the repo (`.github/workflows/`):

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | every `push` / `pr` | `bun install → lint → tsc --noEmit → build → bun test` |
| `deploy.yml` | `push` to `main` | build → rsync to VPS (`/opt/orzaryn/app`) → `prisma db push` → `systemctl restart orzaryn` → `/api/health` gate. Fails the pipeline if health is `degraded`. |
| `security.yml` | weekly + `push` | `bun audit` + secret-scan (gitleaks) |

**Repo secrets to set** (GitHub → Settings → Secrets → Actions):

| Secret | Value |
| --- | --- |
| `VPS_HOST` | `orzaryn.svalley.tech` (or VPS IPv4) |
| `VPS_USER` | `orzaryn` |
| `VPS_SSH_KEY` | private key for that user (no passphrase) |
| `VPS_PORT` | `22` (or your custom port) |

Deploy excludes `.env`, `node_modules`, `.next`, `db/*.db` — your VPS `.env` and SQLite DB survive redeploys.

**First-connection SSH:** add the VPS host key to `known_hosts` in `deploy.yml` (the workflow already runs `ssh-keyscan`).

---

## 7. Backups, updates, rollback

```bash
# DB backup (run daily via cron: 0 3 * * * /opt/orzaryn/scripts/backup-db.sh)
sqlite3 /opt/orzaryn/db/custom.db ".backup /opt/orzaryn/db/custom-$(date +%F).db"

# Manual redeploy (same as CI):
cd /opt/orzaryn/app && git pull && bun install --frozen-lockfile && bun run build \
  && bunx prisma db push && systemctl restart orzaryn

# Rollback:
git log --oneline -5   # pick previous SHA
git checkout <sha> && bun install --frozen-lockfile && bun run build \
  && systemctl restart orzaryn

# Logs / status:
systemctl status orzaryn
journalctl -u orzaryn -f
curl -s https://orzaryn.svalley.tech/api/health | jq .
```

---

## 8. Verification checklist

- [ ] `dig +short orzaryn.svalley.tech` returns the VPS IPv4
- [ ] `curl -s https://orzaryn.svalley.tech/api/health` → `{"status":"healthy"}` or `healthy-demo`
- [ ] Signup → create org → create agent → set mandate → fund treasury (testnet) works in the UI
- [ ] `curl -s https://orzaryn.svalley.tech/api/mcp -H "x-orz-key: ozk_…" -d '{"tool":"inspect_mandate"}'`
- [ ] TLS on `https://orzaryn.svalley.tech` shows a valid Let's Encrypt cert
- [ ] `systemctl status orzaryn` is `active (running)` after reboot

---

## 9. Hardening before any real money

- [ ] Rotate `SESSION_SECRET` and `ALCHEMY_API_KEY` (sandbox placeholders are in git history).
- [ ] Set `ALCHEMY_WEBHOOK_SECRET`; confirm a test webhook hits `POST /api/webhooks/alchemy` with `200`.
- [ ] `APP_ENV=production` + `APP_URL=https://orzaryn.svalley.tech` (Secure cookies).
- [ ] Compile + audit the Anchor program (`program/orzaryn-escrow/`) — **do not deploy it** until `anchor build`, localnet tests, and review pass.
- [ ] Legal review of escrow classification (`docs/status/RELEASE_READINESS.md`).
- [ ] Postgres migration (ADR-005) when SQLite WAL contention shows up.

---

*Questions? Health is the source of truth: `GET /api/health`. If it says `degraded`, start with the `checks` payload — it tells you exactly which dependency is down.*
