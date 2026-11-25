# Cloudflare Zero-Cost Security & WAF Architecture Guide
**Target System**: DownMyVid (`downmyvid.com`)  
**Cost Target**: $0.00 / month (100% Free Cloudflare Plan + Free Firebase Spark + Free Worker Limits)  
**Objective**: Impenetrable shield against black-hat automated scanners, botnets, scraper swarms, and Layer 7 DDoS attacks.

---

## 1. Cloudflare WAF Custom Rules (Web Application Firewall)

Cloudflare's Free tier grants **5 Free WAF Custom Rules**. Configure these exact rules under:  
**Cloudflare Dashboard** → Select **downmyvid.com** → **Security** → **WAF** → **Custom rules** → **Create rule**.

---

### Rule 1: Block Known Malicious Botnets & Automated CLI Scrapers
* **Rule Name**: `Block Scrapers, Empty UA, and Malicious Bots`
* **When incoming requests match**:
```text
(cf.client.bot and not cf.verified_bot_category in {"Search Engine Crawler" "Monitoring and Analytics"}) or (http.user_agent eq "") or (http.user_agent matches "(?i)(curl|wget|python|scrapy|aiohttp|httpclient|postman|insomnia|go-http-client|apache-httpclient|zgrab|nmap|nikto|sqlmap)")
```
* **Action**: **Block**
* **Why**: Stops automated crawlers, scanning scripts, and CLI tools before they ever reach your server or worker, saving 100% of bandwidth and compute costs. Legitimate search engines (Googlebot, Bingbot) remain permitted.

---

### Rule 2: Managed Challenge on Tor Exit Nodes, Anonymous Proxies & High Threat Scores
* **Rule Name**: `Challenge Tor & High Threat Traffic`
* **When incoming requests match**:
```text
(ip.geoip.is_tor) or (cf.threat_score ge 30) or (ip.geoip.asnum eq 0)
```
* **Action**: **Managed Challenge**
* **Why**: Cloudflare's Managed Challenge serves a silent, zero-friction cryptographic test to legitimate visitors, while completely stopping automated bots and malicious actors operating from Tor exit nodes and suspicious IP ranges.

---

### Rule 3: Geo-Challenge Traffic Outside Primary Audience
* **Rule Name**: `Geo Challenge Non-Target Countries`
* **When incoming requests match**:
```text
not ip.geoip.country in {"US" "CA" "GB" "DE" "FR" "ES" "IT" "NL" "SE" "NO" "DK" "AU" "NZ" "BR" "MX" "AR" "JP" "KR" "IN" "SA" "AE" "EG" "MA" "DZ" "TN" "IQ" "JO" "KW" "QA" "OM" "BH"}
```
* **Action**: **Managed Challenge** (or **Interactive Challenge**)
* **Why**: Over 90% of automated credential-stuffing and DDoS botnet traffic originates from scanning farms in specific data-center heavy regions outside your user base. Challenging non-primary regions ensures legitimate users can still access the site while bot attacks are halted at Cloudflare's edge at zero cost.

---

### Rule 4: Protect API Endpoints Against Brute Force & Parameter Probing
* **Rule Name**: `API Route Shield`
* **When incoming requests match**:
```text
(http.request.uri.path contains "/api/" and not http.request.uri.path in {"/api/health" "/api/extract" "/api/comments" "/api/verify-turnstile" "/api/stream-media" "/api/proxy-download" "/api/hls-proxy" "/api/hls-download"}) and (http.request.method in {"POST" "PUT" "DELETE" "PATCH"})
```
* **Action**: **Block**
* **Why**: Immediately drops probes attempting to find hidden endpoints, admin backdoors, or unexposed API paths without forwarding traffic to your origin.

---

## 2. Cloudflare Turnstile (Free Invisible Bot Protection)

Cloudflare Turnstile is a completely free, privacy-preserving alternative to reCAPTCHA with unlimited verifications on all Cloudflare plans.

### Step 1: Create Turnstile Widget
1. In the Cloudflare Dashboard, click **Turnstile** from the left navigation.
2. Click **Add widget**.
3. Fill out the widget settings:
   - **Widget name**: `DownMyVid Guest Forms`
   - **Domains**:
     - `downmyvid.com`
     - `www.downmyvid.com`
     - `downmyvid.web.app`
     - `downmyvid.firebaseapp.com`
     - `localhost` *(for development testing)*
   - **Widget Mode**:
     - **Managed** *(Recommended)*: Cloudflare analyzes browser telemetry and only presents an interactive checkbox if the visitor is deemed suspicious. Real users experience 0 friction.
     - **Invisible**: Completely hidden with no UI widget displayed.
4. Click **Create**.
5. Copy your **Site Key** and **Secret Key**.

### Step 2: Configure Environment Variables
Add the keys to your project environment files:

#### Frontend (`.env` or Cloudflare Pages / Firebase build):
```ini
VITE_TURNSTILE_SITE_KEY=0x4AAAAAA...your_site_key_here
```

#### Backend Server (Cloud Run, Docker, or `.env`):
```ini
TURNSTILE_SECRET_KEY=0x4AAAAAA...your_secret_key_here
```

> **Testing / Staging Keys (Always Pass)**:
> If you want to test before setting up your Cloudflare account:
> - Site Key: `1x00000000000000000000AA`
> - Secret Key: `1x0000000000000000000000000000000AA`

---

## 3. Emergency "Under Attack Mode" Activation

When an aggressive Layer 7 flood is detected or server CPU spikes toward 100%, activate **Under Attack Mode** to force all visitors to solve a JavaScript computational challenge at Cloudflare's edge before reaching your origin.

### Method A: One-Click in Dashboard
1. Go to **Cloudflare Dashboard** → **downmyvid.com**.
2. On the Overview page, locate **Quick Actions** in the right sidebar.
3. Toggle **Under Attack Mode** to **ON**.

---

### Method B: Automated Emergency Shell Script (API v4)

You can trigger Under Attack Mode programmatically via the Cloudflare API.

#### Requirements:
* `CF_ZONE_ID`: Found on the **Overview** tab of your domain in Cloudflare.
* `CF_API_TOKEN`: Created under **My Profile** → **API Tokens** → **Create Token** with `Zone.Zone Settings:Edit` permissions.

#### Linux / macOS / Cloud Shell (`trigger-under-attack.sh`):
```bash
#!/usr/bin/env bash
# Usage: ./trigger-under-attack.sh [on|off]

STATE="${1:-on}"
CF_ZONE_ID="YOUR_CLOUDFLARE_ZONE_ID"
CF_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"

if [ "$STATE" = "on" ]; then
  LEVEL="under_attack"
  echo "🚨 ACTIVATING CLOUDFLARE UNDER ATTACK MODE..."
else
  LEVEL="medium"
  echo "✅ RESTORING STANDARD SECURITY LEVEL..."
fi

curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/security_level" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"value\":\"${LEVEL}\"}" | grep -q '"success":true' && echo "Success: Security level updated to ${LEVEL}." || echo "Error updating security level."
```

#### Windows PowerShell (`Trigger-UnderAttack.ps1`):
```powershell
param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("on", "off")]
    [string]$State = "on"
)

$ZoneId = "YOUR_CLOUDFLARE_ZONE_ID"
$ApiToken = "YOUR_CLOUDFLARE_API_TOKEN"
$Level = if ($State -eq "on") { "under_attack" } else { "medium" }

Write-Host "Setting Cloudflare Security Level to: $Level" -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $ApiToken"
    "Content-Type"  = "application/json"
}

$body = @{ value = $Level } | ConvertTo-Json

$response = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/settings/security_level" `
    -Method Patch `
    -Headers $headers `
    -Body $body

if ($response.success) {
    Write-Host "Successfully changed security level to $Level" -ForegroundColor Green
} else {
    Write-Host "Failed to update security level." -ForegroundColor Red
}
```

---

## 4. Zero-Cost Caching & Bandwidth Reduction Rules

To guarantee $0 origin server costs:
1. Go to **Caching** → **Cache Rules** → **Create rule**.
2. **Rule Name**: `Cache Static Assets Forever`
3. **Condition**: `(http.request.uri.path matches "\.(js|css|svg|png|jpg|jpeg|webp|ico|woff|woff2|ttf)$")`
4. **Cache eligibility**: Eligible for cache
5. **Edge Cache TTL**: 1 Month
6. **Browser Cache TTL**: 1 Month
7. This serves 95%+ of all page requests directly from Cloudflare's global edge points of presence, consuming zero backend resources.

---

## 5. Security Architecture Summary

| Layer | Component | Defense Mechanism | Cost |
| :--- | :--- | :--- | :--- |
| **Edge WAF** | Cloudflare Custom Rules | Blocks scrapers, empty user agents, and Tor botnets | **$0** (Free Tier) |
| **Edge CAPTCHA** | Cloudflare Turnstile | Protects guest forms & API endpoints without UX friction | **$0** (Free Tier) |
| **Application** | Security Headers & Helmet | Blocks XSS, MIME sniffing, Clickjacking, and framing | **$0** (In-app) |
| **Application** | Strict CORS & Sanitization | Limits origin to `downmyvid.com`, sanitizes SQLi/NoSQL | **$0** (In-app) |
| **Rate Limiter** | Scoped IP Rate Limiting | 429 Too Many Requests on flooding & scraping attempts | **$0** (In-memory) |
