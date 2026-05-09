# njha-info-monitor

南京市中小企业数字化转型城市试点线上一体化公共服务平台流程状态监控工具。

## 功能

- 使用 Playwright 复用人工登录态访问平台。
- 定时进入个人中心的“改造项目管理”页面。
- 读取企业名称、项目阶段、流程状态、行业、服务商和时间。
- 与上一次快照对比，仅在状态变化时推送飞书流程 Webhook。
- 登录态失效时推送异常提醒。
- 支持 Docker + cron 一键部署到 CentOS 云服务器。

## 最简部署

上传项目到 CentOS 后执行：

```bash
sudo FEISHU_WEBHOOK_URL="https://www.feishu.cn/flow/api/trigger-webhook/your-token" bash scripts/quick-deploy-centos.sh
```

生成登录态：

```bash
cd /opt/gongxin-monitor
docker compose up login
```

然后打开：

```text
http://服务器IP:6080/vnc.html
```

在浏览器中完成平台账号、验证码和滑块登录。登录成功后会保存：

```text
/opt/gongxin-monitor/data/storage_state.json
```

手动巡检一次：

```bash
cd /opt/gongxin-monitor
docker compose run --rm monitor
```

查看日志：

```bash
tail -f /opt/gongxin-monitor/monitor.log
```

更详细说明见 [docs/ONE_CLICK_DOCKER.md](docs/ONE_CLICK_DOCKER.md)。

## 配置文件

- `.env`：飞书 Webhook 和配置路径，不能提交。
- `config.json`：真实平台配置和企业名称，不能提交。
- `config.example.json`：可提交的示例配置。
- `data/storage_state.json`：登录态，不能提交。
- `data/projects_snapshot.json`：上一次巡检快照，不能提交。

