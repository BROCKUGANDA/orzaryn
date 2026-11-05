# DEPLOY.md — ORZARYN on `orzaryn.svalley.tech` (VPS 57.130.80.158)

> **Subdomain:** `orzaryn.svalley.tech` → `57.130.80.158` (the VPS with 22 GB free; Hetzner `135.181.83.101` was 100% full)
> **Stack:** Next.js 16 standalone + Bun 1.4.2 + Caddy edge (8084/8447) + nginx SNI front door (80/443) + systemd
> **License:** Apache-2.0 (not MIT)
> **Live health:** `curl https://orzaryn.svalley.tech/api/health` → `healthy`

This is the single runbook for the live deployment. It documents exactly what was deployed.

---

## 1. At a glance

```
Internet ──HTTPS :443──▶ nginx edge-router (SNI map) ──▶ Caddy orz-caddy :8447 (TLS) ──▶ bun :3010
         ──HTTP  :80 ──▶ nginx (Host map)            ──▶ Caddy :8084 (ACME HTTP-01) ──▶ bun :3010
                                                                       └─ SQLite /home/ubuntu/orzaryn/db/custom.db
                                                                       └─ Alchemy Solana Devnet RPC (USDC)
```

- **Public URL:** `https://orzaryn.svalley.tech`
- **Health gate:** `curl https://orzaryn.svalley.tech/api/health`
- **App dir:** `/home/ubuntu/orzaryn` · **service:** `orzaryn.service` (`PORT=3010`) · **logs:** `/home/ubuntu/orzaryn/logs/server.log`
- **Edge:** `/home/ubuntu/orzaryn-edge/Caddyfile` · **service:** `orz-caddy.service` (`8084`/`8447`)
- **Front door maps:** `/home/ubuntu/edge/nginx/edge.d/orzaryn.{sni,host}.map` → reload `edge-router-router-1`
- **DNS:** Cloudflare zone `svalley.tech` (`71f3763459258a7f0225056de876f113`), A `orzaryn` → `57.130.80.158`, `proxied=false`, TTL 60

## 2. DNS (already live)

```
A  orzaryn.svalley.tech  -> 57.130.80.158  proxied=false  TTL 60  (id b872b79375a1a400a4d5689dddd8ec94)
```

Verify: `dig +short orzaryn.svalley.tech` → `57.130.80.158`. Record must stay `proxied=false` — Cloudflare proxy breaks SNI forwarding to the edge.

## 3. VPS — which VPS has space

| VPS | Disk | Status |
| --- | --- | --- |
| `57.130.80.158` (Akami, `ubuntu@`, `~/.ssh/akami`) | 96G, **22G avail** | ✅ **Chosen** — hosts `astrolabe/crucible/permitzero` already |
| `135.181.83.101` (Hetzner, `root@`, `~/.ssh/hetzner_hermes`) | 37G, **0 avail (100% full)** | ❌ no space |
| `5.22.215.51` (UpCloud, `root@`) | — | times out (down) |

## 4. App definition (live)

```bash
ssh -i ~/.ssh/akami ubuntu@57.130.80.158
mkdir -p /home/ubuntu/orzaryn/db /home/ubuntu/orzaryn/logs
# source shipped via `git archive HEAD` (README, LICENSE, DEPLOY, workflows included)
cd /home/ubuntu/orzaryn
~/.bun/bin/bun install
~/.bun/bin/bunx prisma db push && ~/.bun/bin/bunx prisma generate
~/.bun/bin/bun run build
```

### systemd — `/etc/systemd/system/orzaryn.service`

```ini
[Unit]
Description=ORZARYN orzaryn.svalley.tech
After=network.target
[Service]
Type=simple
WorkingDirectory=/home/ubuntu/orzaryn
Environment=PORT=3010
Environment=HOSTNAME=127.0.0.1
Environment=NODE_ENV=production
ExecStart=/home/ubuntu/.bun/bin/bun .next/standalone/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/ubuntu/orzaryn/logs/server.log
StandardError=append:/home/ubuntu/orzaryn/logs/server.log
[Install]
WantedBy=multi-user.target
```

`sudo systemctl daemon-reload && sudo systemctl enable --now orzaryn.service`
Health: `curl -s http://127.0.0.1:3010/api/health` → `{"status":"healthy",...}`

> `DATABASE_URL` must be **absolute** in standalone: `file:/home/ubuntu/orzaryn/db/custom.db` (relative `file:../db/custom.db` fails in standalone with `Error code 14: Unable to open the database file`).

## 5. Edge (TLS) — `/home/ubuntu/orzaryn-edge/Caddyfile`

```caddy
{
	email admin@svalley.tech
	admin off
	http_port 8084
	https_port 8447
}
orzaryn.svalley.tech {
	header { Strict-Transport-Security "..." ... }
	encode zstd gzip
	reverse_proxy 127.0.0.1:3010 { header_up X-Forwarded-For {remote_host} ... }
}
```

### systemd — `/etc/systemd/system/orz-caddy.service`

```ini
[Unit]
Description=ORZARYN Edge Caddy (8084/8447)
After=network.target orzaryn.service
[Service]
Type=simple
WorkingDirectory=/home/ubuntu/orzaryn-edge
ExecStart=/usr/bin/caddy run --config /home/ubuntu/orzaryn-edge/Caddyfile --adapter caddyfile
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/ubuntu/orzaryn-edge/caddy.log
StandardError=append:/home/ubuntu/orzaryn-edge/caddy.log
[Install]
WantedBy=multi-user.target
```

If ACME fails with `502` on the HTTP-01 challenge, the SNI/Host maps weren't loaded yet — restart after adding the maps (below).

## 6. Front door (nginx SNI)

Maps live in the bind-mounted dir `/home/ubuntu/edge/nginx/edge.d/` (the container mounts it `:ro`, so edit the host files, not the container):

```
/home/ubuntu/edge/nginx/edge.d/orzaryn.sni.map   :  orzaryn.svalley.tech 127.0.0.1:8447;
/home/ubuntu/edge/nginx/edge.d/orzaryn.host.map  :  orzaryn.svalley.tech 127.0.0.1:8084;
```

```bash
docker exec edge-router-router-1 nginx -t && docker exec edge-router-router-1 nginx -s reload
```

## 7. Environment (`.env` on VPS — never commit)

| Key | Value (live) |
| --- | --- |
| `DATABASE_URL` | `file:/home/ubuntu/orzaryn/db/custom.db` |
| `SESSION_SECRET` | `prod_orzaryn_svalley_9f3a8c1e…` (rotate before real money) |
| `APP_ENV` / `APP_URL` | `production` / `https://orzaryn.svalley.tech` |
| `NETWORK` / `USDC_MINT_TESTNET` | `solana-devnet` / `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| `ALCHEMY_*` | `q15y93g86sfgd0rb` / `alch_CxRl…` (rotate before real money) |
| `PLATFORM_FEE_BPS` | `0` |

## 8. CI/CD — GitHub Actions

`.github/workflows/ci.yml` (lint/typecheck/build/test), `deploy.yml` (rsync → build → `prisma db push` → `systemctl restart orzaryn` → health gate), `security.yml` (audit + gitleaks). For this VPS set secrets: `VPS_HOST=57.130.80.158`, `VPS_USER=ubuntu`, `VPS_SSH_KEY` = `~/.ssh/akami` private key, `VPS_PORT=22`.

## 9. Verification checklist

- [x] `dig +short orzaryn.svalley.tech` → `57.130.80.158`
- [x] `curl https://orzaryn.svalley.tech/api/health` → `healthy` (live-verified 2026-11-05)
- [ ] Signup → org → agent → mandate → treasury (testnet) in UI
- [ ] `POST https://orzaryn.svalley.tech/api/mcp` with `x-orz-key`
- [x] `systemctl status orzaryn.service orz-caddy.service` → `active (running)`

## 10. Rollback

```bash
sudo systemctl restart orzaryn.service orz-caddy.service
curl -s http://127.0.0.1:3010/api/health | jq .
# Logs: /home/ubuntu/orzaryn/logs/server.log  ·  /home/ubuntu/orzaryn-edge/caddy.log
```

*Health is source of truth: `GET /api/health`. If `degraded`, read the `checks` payload.*
