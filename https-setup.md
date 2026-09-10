# HTTPS/SSL Configuration Guide

## Overview
This guide provides instructions for setting up HTTPS with SSL certificates for the Blue Jet Holidays website.

## Production SSL Setup

### Option 1: Let's Encrypt (Free SSL)

#### Using Certbot (Recommended)

1. **Install Certbot**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install certbot python3-certbot-nginx

   # CentOS/RHEL
   sudo yum install certbot python3-certbot-nginx
   ```

2. **Obtain SSL Certificate**
   ```bash
   sudo certbot --nginx -d bluejetholidays.com -d www.bluejetholidays.com
   ```

3. **Auto-renewal**
   ```bash
   sudo certbot renew --dry-run
   ```

#### Using Certbot with Standalone

1. **Obtain Certificate**
   ```bash
   sudo certbot certonly --standalone -d bluejetholidays.com -d www.bluejetholidays.com
   ```

2. **Configure Nginx/Apache** to use the certificates
   ```nginx
   server {
       listen 443 ssl;
       server_name bluejetholidays.com www.bluejetholidays.com;

       ssl_certificate /etc/letsencrypt/live/bluejetholidays.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/bluejetholidays.com/privkey.pem;

       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers HIGH:!aNULL:!MD5;
   }
   ```

### Option 2: Commercial SSL Certificates

#### Steps:

1. **Purchase SSL Certificate** from providers like:
   - DigiCert
   - Comodo
   - GlobalSign
   - SSL.com

2. **Generate CSR (Certificate Signing Request)**
   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout bluejetholidays.key -out bluejetholidays.csr
   ```

3. **Submit CSR** to SSL provider for validation

4. **Install Certificate** on your server

### Option 3: Cloudflare SSL (Easy Setup)

1. **Sign up for Cloudflare**
2. **Add your domain** to Cloudflare
3. **Update nameservers** to Cloudflare's nameservers
4. **Enable SSL/TLS** in Cloudflare dashboard
5. **Set SSL mode to "Full" or "Full (Strict)"**

## Application Configuration

### Update .env for HTTPS

```env
# Production environment
NODE_ENV=production
FRONTEND_URL=https://bluejetholidays.com
API_URL=https://api.bluejetholidays.com
```

### Update server.js for HTTPS

```javascript
const https = require('https');
const fs = require('fs');

// SSL configuration
const sslOptions = {
  key: fs.readFileSync('/path/to/private.key'),
  cert: fs.readFileSync('/path/to/certificate.crt'),
  ca: fs.readFileSync('/path/to/ca_bundle.crt')
};

// Create HTTPS server
https.createServer(sslOptions, app).listen(443, () => {
  console.log('HTTPS Server running on port 443');
});

// Redirect HTTP to HTTPS
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
  res.end();
}).listen(80);
```

## Security Headers Configuration

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name bluejetholidays.com www.bluejetholidays.com;

    ssl_certificate /etc/letsencrypt/live/bluejetholidays.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bluejetholidays.com/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://assets.mixkit.co; font-src 'self' https://fonts.gstatic.com;" always;

    # Other headers
    add_header X-Robots-Tag "index, follow" always;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name bluejetholidays.com www.bluejetholidays.com;
    return 301 https://$server_name$request_uri;
}
```

### Apache Configuration

```apache
<VirtualHost *:443>
    ServerName bluejetholidays.com
    ServerAlias www.bluejetholidays.com

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/bluejetholidays.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/bluejetholidays.com/privkey.pem

    SSLProtocol all -SSLv2 -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5
    SSLHonorCipherOrder on

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"

    ProxyPreserveHost On
    ProxyPass / http://localhost:8080/
    ProxyPassReverse / http://localhost:8080/
</VirtualHost>

<VirtualHost *:80>
    ServerName bluejetholidays.com
    ServerAlias www.bluejetholidays.com
    Redirect permanent / https://bluejetholidays.com/
</VirtualHost>
```

## Testing SSL Configuration

### Online SSL Testers
- SSL Labs: https://www.ssllabs.com/ssltest/
- SSL Checker: https://www.sslshopper.com/ssl-checker.html

### Command Line Testing
```bash
# Test SSL certificate
openssl s_client -connect bluejetholidays.com:443 -servername bluejetholidays.com

# Check certificate details
curl -vI https://bluejetholidays.com

# Test SSL configuration
nmap --script ssl-enum-ciphers -p 443 bluejetholidays.com
```

## Maintenance

### Certificate Renewal
```bash
# Let's Encrypt auto-renewal
sudo certbot renew

# Check renewal status
sudo certbot certificates
```

### SSL Monitoring
- Set up monitoring for certificate expiration
- Monitor SSL configuration compliance
- Regular security audits

## Troubleshooting

### Common Issues

1. **Mixed Content Errors**
   - Ensure all resources use HTTPS
   - Update hardcoded HTTP URLs to HTTPS

2. **Certificate Chain Issues**
   - Include intermediate certificates
   - Use full chain from Let's Encrypt

3. **HSTS Preload Issues**
   - Remove domain from preload list if needed
   - Ensure proper HSTS configuration

4. **Performance Issues**
   - Enable HTTP/2
   - Implement SSL session caching
   - Use OCSP stapling

## Security Best Practices

1. **Always use HTTPS in production**
2. **Keep SSL certificates updated**
3. **Use strong SSL/TLS ciphers**
4. **Enable HSTS with preload**
5. **Implement proper security headers**
6. **Regular SSL configuration audits**
7. **Monitor certificate expiration**
8. **Use certificate pinning for mobile apps**

## Compliance

Ensure SSL configuration meets:
- PCI DSS requirements (if processing payments)
- GDPR requirements (for EU customers)
- Industry-specific compliance standards

---

**Note**: SSL configuration should be tested thoroughly before production deployment. Always backup current configurations before making changes.


## Note on the app's own redirect

`server.js` already redirects HTTP to HTTPS when `NODE_ENV=production`,
using the `x-forwarded-proto` header, and sets `trust proxy`. Terminate TLS
at nginx or the platform in front of Node and forward that header; do not
add a second redirect in the proxy or requests will loop.
