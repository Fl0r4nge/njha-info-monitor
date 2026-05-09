# One-Click Docker Deployment

This is the shortest server deployment path:

1. Upload this project to the CentOS server.
2. Run `sudo bash scripts/quick-deploy-centos.sh`.
3. Put a valid `data/storage_state.json` in `/opt/gongxin-monitor/data/`.
4. Let cron run the Docker monitor every 10 minutes.

The server does not need Node.js installed on the host. It can also provide a temporary noVNC browser for manual login.

## Login State Option A: Server noVNC Login

Run:

```bash
cd /opt/gongxin-monitor
docker compose up login
```

Open:

```text
http://SERVER_IP:6080/vnc.html
```

Complete the account/password, captcha, and slider login in the browser. The container will save:

```text
/opt/gongxin-monitor/data/storage_state.json
```

Stop the login container after it prints that the login state was saved.

If the page cannot be opened, run:

```bash
cd /opt/gongxin-monitor
bash scripts/diagnose-vnc-centos.sh
```

If the diagnostic says local noVNC is reachable but your browser cannot open `http://SERVER_IP:6080/vnc.html`, open TCP `6080` in both the cloud security group and the server firewall:

```bash
sudo bash scripts/open-vnc-firewall-centos.sh
```

A safer alternative is SSH tunneling, which avoids exposing port `6080` publicly:

```bash
ssh -L 6080:127.0.0.1:6080 root@SERVER_IP
```

Then open:

```text
http://127.0.0.1:6080/vnc.html
```

## Login State Option B: Upload Existing State

Generate `data/storage_state.json` from any machine that can complete login, then upload it to:

```text
/opt/gongxin-monitor/data/storage_state.json
```

## One Command

```bash
sudo FEISHU_WEBHOOK_URL="https://www.feishu.cn/flow/api/trigger-webhook/your-token" bash scripts/quick-deploy-centos.sh
```

## Test

```bash
cd /opt/gongxin-monitor
docker compose run --rm monitor
```

## Logs

```bash
tail -f /opt/gongxin-monitor/monitor.log
```

## Change Interval

```bash
sudo INTERVAL_MINUTES=30 bash scripts/quick-deploy-centos.sh
```
