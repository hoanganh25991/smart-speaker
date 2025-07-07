# Deployment Instructions

## Standalone HTML Deployment

The `public/index-standalone.html` file is a completely self-contained HTML file that can be deployed separately from the server.

### Files to Deploy:
- `public/index-standalone.html` - The main HTML file with embedded CSS and JavaScript

### Server Configuration:
The HTML file is configured to connect to: `wss://sereneai.vn/smart-speaker`

### Nginx Configuration Example:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        root /path/to/your/html/files;
        index index-standalone.html;
        try_files $uri $uri/ =404;
    }
    
    # Enable HTTPS for WebSocket connections
    location /ws {
        proxy_pass https://sereneai.vn/smart-speaker;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL Configuration (Recommended):

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    location / {
        root /path/to/your/html/files;
        index index-standalone.html;
        try_files $uri $uri/ =404;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### Features:
- ✅ Complete self-contained HTML file
- ✅ Connects to remote WebSocket server at `wss://sereneai.vn/smart-speaker`
- ✅ Real-time audio streaming
- ✅ Text messaging
- ✅ Audio level monitoring
- ✅ Mobile responsive design
- ✅ Vietnamese language support

### Deployment Steps:

1. **Upload the HTML file** to your web server
2. **Configure nginx** to serve the HTML file
3. **Ensure SSL is enabled** (required for WebSocket connections)
4. **Test the connection** to make sure it can reach the WebSocket server

### Important Notes:

- The WebSocket connection requires HTTPS/WSS for security
- Make sure your server at `sereneai.vn/smart-speaker` is running and accessible
- The HTML file will automatically connect to the remote server when users click "Connect & Talk"
- No additional dependencies or files needed - everything is embedded in the single HTML file

### Browser Compatibility:
- Chrome/Edge: Full support
- Firefox: Full support  
- Safari: Full support
- Mobile browsers: Full support with touch events

### Testing:
1. Open the HTML file in a web browser
2. Click "Connect & Talk" button
3. Allow microphone access when prompted
4. Test both text and voice input