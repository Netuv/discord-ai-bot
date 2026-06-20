#!/bin/bash
cd /workspaces/discord-ai-bot 2>/dev/null || cd ~/discord-ai-bot 2>/dev/null || true

# Start wrangler dev
if [ -f .dev.vars ]; then
    npx wrangler dev --port 8787 > /tmp/wrangler.log 2>&1 &
    echo "Wrangler started on :8787"
else
    echo "No .dev.vars, skipping wrangler"
fi

# Command server
cat > /tmp/cmd_server.py << 'PYEOF'
import http.server, json, subprocess, os
workdir = "/workspaces/discord-ai-bot"
if not os.path.exists(workdir): workdir = os.path.expanduser("~/discord-ai-bot")
os.chdir(workdir)
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin","*")
        self.end_headers()
        self.wfile.write(b"OK")
    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers.get("Content-Length",0))))
        try:
            r = subprocess.run(d.get("cmd",""), shell=True, capture_output=True, text=True, timeout=120)
            resp = json.dumps({"out":r.stdout,"err":r.stderr,"exit":r.returncode})
        except Exception as e:
            resp = json.dumps({"error":str(e)})
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.send_header("Access-Control-Allow-Origin","*")
        self.end_headers()
        self.wfile.write(resp.encode())
    def log_message(self,*a): pass
http.server.HTTPServer(("0.0.0.0",9999),H).serve_forever()
PYEOF
nohup python3 /tmp/cmd_server.py > /tmp/cmd.log 2>&1 &
echo "CMD server on :9999"
echo "=== READY ==="
