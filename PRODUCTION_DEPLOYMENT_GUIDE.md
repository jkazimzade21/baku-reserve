# 🚀 PRODUCTION DEPLOYMENT GUIDE
## Baku Reserve - Enhanced GoMap Integration v2.0

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### ✅ Environment Validation
- [ ] GoMap GUID is valid and not expired
- [ ] All API keys rotated and secured
- [ ] Database backups completed
- [ ] Load balancer health checks configured
- [ ] SSL certificates valid
- [ ] Monitoring alerts configured

### ✅ Code Readiness
- [ ] All tests passing (`pytest backend/app/test_gomap_enhanced.py`)
- [ ] Code review completed
- [ ] Version tagged in git
- [ ] Documentation updated
- [ ] Mobile app version compatible

---

## 🔧 DEPLOYMENT STEPS

### Step 1: Environment Configuration

```bash
# 1.1 Create production environment file
cp .env.example .env.production

# 1.2 Set production values
cat >> .env.production << 'EOF'
# GoMap Configuration
GOMAP_GUID="YOUR_PRODUCTION_GUID"
GOMAP_BASE_URL="https://api.gomap.az/Main.asmx"
GOMAP_DEFAULT_LANGUAGE="az"
GOMAP_TIMEOUT_SECONDS=4.0

# Enhanced Features
GOMAP_CIRCUIT_BREAKER_ENABLED=true
GOMAP_CIRCUIT_BREAKER_THRESHOLD=5
GOMAP_CIRCUIT_BREAKER_COOLDOWN_SECONDS=300
GOMAP_RETRY_ATTEMPTS=3
GOMAP_RETRY_BACKOFF_SECONDS=1.0

# Caching Configuration
GOMAP_CACHE_TTL_SECONDS=900
GOMAP_GEOCODE_CACHE_TTL_SECONDS=1800
GOMAP_TRAFFIC_UPDATE_INTERVAL_SECONDS=300

# Traffic Pattern Database
DATA_DIR="/var/lib/baku-reserve/data"

# Request Batching
AUTOCOMPLETE_BATCH_WINDOW_MS=150
AUTOCOMPLETE_CACHE_TTL_SECONDS=300

# Monitoring
SENTRY_DSN="YOUR_SENTRY_DSN"
SENTRY_ENVIRONMENT="production"
SENTRY_TRACES_SAMPLE_RATE=0.1

# Security (IMPORTANT!)
AUTH0_BYPASS=false
CORS_ALLOW_ORIGINS="https://bakureserve.az,https://app.bakureserve.az"
EOF

# 1.3 Secure the environment file
chmod 600 .env.production
```

### Step 2: Database Initialization

```bash
# 2.1 Create data directory
sudo mkdir -p /var/lib/baku-reserve/data
sudo chown -R www-data:www-data /var/lib/baku-reserve/data

# 2.2 Initialize traffic pattern database
python3 << 'EOF'
from app.traffic_patterns import get_traffic_tracker
tracker = get_traffic_tracker()
print("Traffic database initialized")
EOF

# 2.3 Verify database
sqlite3 /var/lib/baku-reserve/data/traffic_patterns.db ".tables"
# Should show: traffic_observations, traffic_patterns, traffic_anomalies
```

### Step 3: Backend Deployment

```bash
# 3.1 Install dependencies
cd backend
pip install -r requirements.txt
pip install httpx aiofiles asyncio sqlite3

# 3.2 Integrate new endpoints
cat app/main_gomap_endpoints.py >> app/main.py
cat app/autocomplete_endpoint.py >> app/main.py

# 3.3 Run migrations (if any)
alembic upgrade head

# 3.4 Collect static files
python manage.py collectstatic --noinput

# 3.5 Run pre-deployment tests
pytest app/test_gomap_enhanced.py -v --tb=short
```

### Step 4: Service Configuration

#### 4.1 Systemd Service (`/etc/systemd/system/bakureserve.service`)

```ini
[Unit]
Description=Baku Reserve API
After=network.target

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/opt/baku-reserve/backend
Environment="PATH=/opt/baku-reserve/.venv/bin"
EnvironmentFile=/opt/baku-reserve/.env.production
ExecStart=/opt/baku-reserve/.venv/bin/uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4 \
    --loop uvloop \
    --access-log \
    --log-config /opt/baku-reserve/logging.json
ExecReload=/bin/kill -s HUP $MAINPID
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 4.2 Nginx Configuration (`/etc/nginx/sites-available/bakureserve`)

```nginx
upstream bakureserve_backend {
    least_conn;
    server 127.0.0.1:8000 fail_timeout=0;
    server 127.0.0.1:8001 fail_timeout=0;
    server 127.0.0.1:8002 fail_timeout=0;
    server 127.0.0.1:8003 fail_timeout=0;
}

server {
    listen 443 ssl http2;
    server_name api.bakureserve.az;

    ssl_certificate /etc/letsencrypt/live/api.bakureserve.az/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.bakureserve.az/privkey.pem;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=autocomplete:10m rate=50r/s;

    location / {
        proxy_pass http://bakureserve_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Rate limiting
        limit_req zone=api burst=200 nodelay;
    }

    location /api/v1/search/autocomplete {
        proxy_pass http://bakureserve_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Specific rate limit for autocomplete
        limit_req zone=autocomplete burst=100 nodelay;
    }

    location /api/v1/search/autocomplete/ws {
        proxy_pass http://bakureserve_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # WebSocket timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://bakureserve_backend;
        access_log off;
    }
}
```

### Step 5: Deploy Backend

```bash
# 5.1 Stop existing service
sudo systemctl stop bakureserve

# 5.2 Deploy new code
cd /opt/baku-reserve
git pull origin main
source .venv/bin/activate
pip install -r backend/requirements.txt

# 5.3 Validate configuration
python -c "from app.settings import settings; print(settings.dict())"

# 5.4 Start service
sudo systemctl start bakureserve
sudo systemctl enable bakureserve

# 5.5 Check status
sudo systemctl status bakureserve
sudo journalctl -u bakureserve -n 50
```

### Step 6: Deploy Mobile App Updates

```bash
# 6.1 Build mobile app
cd mobile
npm install
expo build:ios --release-channel production
expo build:android --release-channel production

# 6.2 Upload to app stores
# iOS: Upload to App Store Connect
# Android: Upload to Google Play Console

# 6.3 Configure OTA updates
expo publish --release-channel production
```

### Step 7: Database Migrations & Cache Warm-up

```bash
# 7.1 Warm up route cache for popular locations
python3 << 'EOF'
from app.gomap import route_directions_by_type

# Popular locations in Baku
locations = [
    (40.3776, 49.8488),  # Fountain Square
    (40.3594, 49.8265),  # Flame Towers
    (40.3664, 49.8374),  # Maiden Tower
    (40.3745, 49.8438),  # Boulevard
]

for i, start in enumerate(locations):
    for end in locations[i+1:]:
        try:
            route_directions_by_type(
                start[0], start[1], end[0], end[1],
                route_type="fastest"
            )
            print(f"Cached route from {start} to {end}")
        except:
            pass
EOF

# 7.2 Pre-populate search cache
python3 << 'EOF'
from app.gomap import search_objects_smart

common_searches = [
    "Flame Towers", "Maiden Tower", "Fountain Square",
    "Nizami Street", "28 Mall", "Port Baku",
    "Icherisheher", "Highland Park", "Boulevard"
]

for query in common_searches:
    try:
        search_objects_smart(query, limit=10)
        print(f"Cached search: {query}")
    except:
        pass
EOF
```

---

## 🔍 POST-DEPLOYMENT VALIDATION

### API Health Checks

```bash
# Check service health
curl https://api.bakureserve.az/health

# Check GoMap features
curl https://api.bakureserve.az/api/v1/features/gomap

# Test smart search
curl "https://api.bakureserve.az/api/v1/search/smart?q=Flame%20Towers&fuzzy=true"

# Test nearby discovery
curl "https://api.bakureserve.az/api/v1/search/nearby?lat=40.4093&lon=49.8671&radius_km=1"

# Test route calculation
curl "https://api.bakureserve.az/api/v1/route/calculate?origin_lat=40.4093&origin_lon=49.8671&dest_lat=40.3594&dest_lon=49.8265&route_type=fastest"

# Check autocomplete stats
curl https://api.bakureserve.az/api/v1/search/autocomplete/stats
```

### Performance Monitoring

```bash
# Monitor response times
while true; do
    time curl -s https://api.bakureserve.az/health > /dev/null
    sleep 5
done

# Check cache hit rates
curl https://api.bakureserve.az/api/v1/search/autocomplete/stats | jq '.batching.cache_hit_rate'

# Monitor circuit breaker status
tail -f /var/log/bakureserve/app.log | grep "Circuit breaker"

# Check request batching efficiency
curl https://api.bakureserve.az/api/v1/search/autocomplete/stats | jq '.performance.reduction_percentage'
```

---

## 🔄 ROLLBACK PROCEDURE

If issues occur, follow this rollback procedure:

```bash
# 1. Switch to previous version
cd /opt/baku-reserve
git checkout v1.0.0  # Previous stable version

# 2. Restore database backup
cp /backup/traffic_patterns.db.backup /var/lib/baku-reserve/data/traffic_patterns.db

# 3. Restart services
sudo systemctl restart bakureserve
sudo systemctl restart nginx

# 4. Verify rollback
curl https://api.bakureserve.az/health
```

---

## 📊 MONITORING & ALERTS

### Key Metrics to Monitor

1. **API Response Times**
   - Smart search: < 200ms (p95)
   - Route calculation: < 500ms (p95)
   - Autocomplete: < 150ms (p95)

2. **Cache Performance**
   - Hit rate: > 40%
   - Eviction rate: < 10%

3. **Circuit Breaker**
   - Open events: < 5/hour
   - Recovery time: < 5 minutes

4. **Request Batching**
   - Reduction: > 60%
   - Batch size: 3-5 requests

### Alert Configuration

```yaml
# prometheus-alerts.yml
groups:
  - name: bakureserve
    rules:
      - alert: HighResponseTime
        expr: http_request_duration_seconds{job="bakureserve", quantile="0.95"} > 0.5
        for: 5m
        annotations:
          summary: "High API response time"

      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state{name="gomap_api"} == 2
        for: 1m
        annotations:
          summary: "GoMap circuit breaker is open"

      - alert: LowCacheHitRate
        expr: cache_hit_rate{cache="gomap_routes"} < 0.3
        for: 10m
        annotations:
          summary: "Low cache hit rate"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"
```

---

## 🐛 TROUBLESHOOTING

### Common Issues

#### Issue: Circuit breaker keeps opening
```bash
# Check GoMap API status
curl -I https://api.gomap.az/Main.asmx

# Increase threshold temporarily
export GOMAP_CIRCUIT_BREAKER_THRESHOLD=10
sudo systemctl restart bakureserve

# Check logs for specific errors
grep "GoMap.*failed" /var/log/bakureserve/app.log
```

#### Issue: Low cache hit rate
```bash
# Clear corrupted cache
python3 -c "from app.cache import clear_all_caches; clear_all_caches()"

# Increase cache TTL
export GOMAP_CACHE_TTL_SECONDS=1800
sudo systemctl restart bakureserve
```

#### Issue: Autocomplete too slow
```bash
# Check WebSocket connections
ss -tan | grep :8000 | wc -l

# Increase batch window
export AUTOCOMPLETE_BATCH_WINDOW_MS=200

# Check batching stats
curl https://api.bakureserve.az/api/v1/search/autocomplete/stats
```

---

## ✅ DEPLOYMENT VERIFICATION CHECKLIST

After deployment, verify:

- [ ] All API endpoints respond with 200 OK
- [ ] Smart search returns results with distances
- [ ] Fuzzy search handles typos correctly
- [ ] Route polylines are returned
- [ ] Traffic predictions work
- [ ] WebSocket autocomplete connects
- [ ] Request batching shows > 60% reduction
- [ ] Cache hit rate > 30%
- [ ] Circuit breaker is closed
- [ ] Mobile app connects successfully
- [ ] No errors in logs for 10 minutes
- [ ] Response times meet SLA
- [ ] Monitoring alerts configured
- [ ] Backup procedures tested

---

## 📞 SUPPORT CONTACTS

- **DevOps Lead**: devops@bakureserve.az
- **Backend Team**: backend@bakureserve.az
- **Mobile Team**: mobile@bakureserve.az
- **GoMap Support**: support@gomap.az
- **On-Call**: +994 XX XXX XXXX

---

## 📅 MAINTENANCE WINDOWS

- **Regular Maintenance**: Sunday 02:00-04:00 UTC+4
- **GoMap API Maintenance**: Check https://status.gomap.az
- **Database Optimization**: First Sunday of month

---

## 🎉 DEPLOYMENT COMPLETE!

Once all checks pass:
1. Update status page: https://status.bakureserve.az
2. Send notification to team
3. Monitor for 24 hours
4. Document any issues in post-mortem

**Congratulations on deploying the enhanced GoMap integration!** 🚀