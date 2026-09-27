# Transit Lab Deployment Runbook (Proxmox LXC + Cloudflare Tunnel)

This guide documents deploying Transit Lab to an unprivileged Debian 12 LXC container on a Proxmox VE host behind a Cloudflare Tunnel.

Transit Lab is entirely static: every transit simulation runs client-side inside the visitor's browser. The 4 GB server only serves static files. Do not size the container for the simulation.

The example hostname used in this runbook is `transit.example.com`.

---

## 1. Create Debian 12 LXC on Proxmox VE

1. In Proxmox VE web interface, click **Create CT**.
2. **General**:
   - Node: Select your Proxmox node.
   - CT ID: e.g. `105`.
   - Hostname: `transit-lab`.
   - Uncheck "Privileged container" (must be an **unprivileged container**).
   - Set root password or add SSH public keys.
3. **Template**:
   - Choose `debian-12-standard` (Bookworm).
4. **Disks**:
   - Storage: local-lvm (or preferred storage pool).
   - Disk size: `4` GB (no Docker needed, lighter than a VM).
5. **CPU**:
   - Cores: `1` vCPU.
6. **Memory**:
   - Memory: `512` MB.
   - Swap: `512` MB.
7. **Network**:
   - Bridge: `vmbr0`.
   - IPv4: DHCP or static IP on your LAN.
   - IPv6: SLAAC or DHCP.
8. Finish and start the container.

---

## 2. Install Dependencies, Caddy, and cloudflared

Enter the container shell (`pct enter <CT_ID>` or SSH) and run:

```bash
apt update && apt install -y curl gnupg debian-keyring debian-archive-keyring apt-transport-https git brotli gzip
```

### Install Caddy (Official APT Repository)

```bash
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

### Install cloudflared (Official Cloudflare APT Repository)

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /etc/apt/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bookworm main' | tee /etc/apt/sources.list.d/cloudflared.list
apt update && apt install -y cloudflared
```

---

## 3. Clone Repository and Initial Publish

Clone the repository to `/srv/transit-lab`:

```bash
git clone https://github.com/zipos/transit-lab.git /srv/transit-lab
cd /srv/transit-lab
```

Run `publish.sh` to stage static files into `/srv/transit-lab/public`:

```bash
/srv/transit-lab/deploy/publish.sh
```

---

## 4. Configure Caddy

Copy the provided `Caddyfile` into place:

```bash
cp /srv/transit-lab/deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl restart caddy
systemctl enable caddy
```

Caddy listens strictly on `localhost:8080` (`127.0.0.1` and `::1`), serving files from `/srv/transit-lab/public` with precompressed `.br` and `.gz` fallbacks, origin Cache-Control headers, and a strict Content Security Policy.

---

## 5. Configure Cloudflare Tunnel

Do not open any inbound ports on your home or office router. The Cloudflare Tunnel connects outbound from the container to Cloudflare's Edge.

1. Navigate to the **Cloudflare Zero Trust Dashboard** (`https://one.dash.cloudflare.com`).
2. Go to **Networks** → **Tunnels**.
3. Click **Create a tunnel**, choose `cloudflared`, and name it (e.g. `transit-lab`).
4. Select Debian under the install command, copy the connector installation token, and run the command in your LXC:
   ```bash
   cloudflared service install <TUNNEL_TOKEN>
   systemctl start cloudflared
   systemctl enable cloudflared
   ```
5. In the tunnel's **Public Hostname** tab:
   - Subdomain / Domain: `transit.example.com`
   - Service Type: `HTTP`
   - URL: `localhost:8080`
6. Save the hostname.

---

## 6. Cloudflare Caching & Edge Configuration

In the Cloudflare dashboard for your domain:

1. **Cache Rules**:
   - Go to **Caching** → **Cache Rules** → **Create rule**.
   - Expression: `(http.host eq "transit.example.com")`
   - Settings:
     - **Cache Eligibility**: Eligible for cache
     - **Edge TTL**: Respect origin (Caddy serves `no-cache` for HTML, `max-age=31536000` for versioned/vendor assets, and `max-age=86400` for `/data/**`)
     - **Browser TTL**: Respect origin
2. **Speed / Compression**:
   - Enable **Brotli** compression under **Speed** → **Optimization** (enabled by default).
3. **Plan & External Assets**:
   - The free plan is completely sufficient.
   - OpenFreeMap vector tiles, sprites, and fonts are requested directly by visitors' browsers from `https://tiles.openfreemap.org`, not through your origin server.
   - If OpenFreeMap experiences downtime, Transit Lab files remain cached and accessible, showing an OpenFreeMap connection notice in the map area.

---

## 7. Automatic Deployment via Systemd Timer

To automatically pull updates from the public git branch and publish updated assets every 15 minutes:

```bash
cp /srv/transit-lab/deploy/transit-lab-publish.service /etc/systemd/system/
cp /srv/transit-lab/deploy/transit-lab-publish.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now transit-lab-publish.timer
```

Verify that the timer is active:

```bash
systemctl list-timers transit-lab-publish.timer
```

---

## 8. Acceptance Verification

1. Verify precompressed Brotli serving and cache header on static data:
   ```bash
   curl -sI -H 'Accept-Encoding: br' https://transit.example.com/data/network.js
   ```
   Expected response headers include:
   - `content-encoding: br`
   - `cache-control: public, max-age=86400`

2. Verify Cloudflare edge cache HIT:
   ```bash
   curl -sI -H 'Accept-Encoding: br' https://transit.example.com/data/network.js | grep -i cf-cache-status
   ```
   Subsequent request should return `cf-cache-status: HIT`.

3. Verify HTML is not stale:
   ```bash
   curl -sI https://transit.example.com/ | grep -i cache-control
   ```
   Should return `cache-control: no-cache`.

4. Check browser developer console:
   - Load `https://transit.example.com`.
   - Confirm there are zero console errors and no CSP violations.
