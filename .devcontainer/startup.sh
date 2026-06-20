#!/bin/bash
cd /workspaces/discord-ai-bot 2>/dev/null || cd ~/discord-ai-bot 2>/dev/null

# Decode credentials
echo "RElTQ09SRF9BUFBfSUQ9MTE5MjQ2NTAwNzIyMTQxMTkyMQpESVNDT1JEX0JPVF9UT0tFTj1NVEU1TWpRMk5UQXdOekl5TVRReE1Ua3lNUS5Ha2E4aEEuR1hZUmdrMWJtdkRGQm1VSlFwS1ZWYTh4QzRuN01FbDJjN2pnSVkKQ0xPVURGTEFSRV9BUElfVE9LRU49Y2Z1dF9xcGM4ZXhtWGZ3RmVrclM3eEhLS0JBNmlvQzlKdGhMRmZNbk9DRXlRMjJmMjk4NWUK" | base64 -d > .dev.vars
echo "Creds OK"

# Make ports public via gh CLI
gh codespace ports visibility 8787:public --codespace $CODESPACE_NAME 2>/dev/null
gh codespace ports visibility 9999:public --codespace $CODESPACE_NAME 2>/dev/null

# Start wrangler dev
npx wrangler dev --port 8787 > /tmp/wrangler.log 2>&1 &
echo "Wrangler on :8787"

# Command server for remote control
cat > /tmp/cmd.py << 'PY'
import http.server,json,subprocess,os
os.chdir("/workspaces/discord-ai-bot" if os.path.exists("/workspaces/discord-ai-bot") else os.path.expanduser("~/discord-ai-bot"))
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("Access-Control-Allow-Origin","*"); self.end_headers()
        self.wfile.write(b"OK")
    def do_POST(self):
        d=json.loads(self.rfile.read(int(self.headers.get("Content-Length",0))))
        try:
            r=subprocess.run(d.get("cmd",""),shell=True,capture_output=True,text=True,timeout=120)
            self.wfile.write(json.dumps({"out":r.stdout,"err":r.stderr,"exit":r.returncode}).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error":str(e)}).encode())
    def log_message(self,*a): pass
http.server.HTTPServer(("0.0.0.0",9999),H).serve_forever()
PY
nohup python3 /tmp/cmd.py > /tmp/cmd.log 2>&1 &
echo "CMD on :9999"
echo "=== READY ==="
