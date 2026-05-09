# 工信平台状态巡检 MVP

这个项目用于在 CentOS 云服务器上定时巡检“南京市中小企业数字化转型城市试点线上一体化公共服务平台”的改造项目流程状态。状态发生变化时，通过飞书自定义机器人 Webhook 推送消息。

## 工作方式

1. 人工完成一次账号密码登录和滑块验证。
2. Playwright 保存登录态到 `data/storage_state.json`。
3. systemd timer 定时运行巡检脚本。
4. 脚本读取项目列表，和上次 `data/projects_snapshot.json` 对比。
5. 只有项目新增、消失或流程状态字段变化时，才推送飞书消息。
6. 如果登录态失效，推送“需要人工重新登录”的异常提醒。

## 本地配置

复制示例配置：

```bash
cp config.example.json config.json
cp .env.example .env
```

需要修改：

- `config.json` 中的 `loginUrl` 和 `projectUrl`
- `config.json` 中 `selectors.projectRows` 和 `selectors.fields`
- `.env` 中的 `FEISHU_WEBHOOK_URL`

选择器需要按真实页面调整。建议在浏览器开发者工具里定位“改造项目管理”的表格行和状态字段。

## 手动登录

在有图形界面的环境中运行：

```bash
npm run login
```

在 CentOS 云服务器上，推荐用 `Xvfb + noVNC`、VNC 桌面，或临时带桌面的 SSH 会话完成首次登录。登录成功后回到终端按 Enter，脚本会保存登录态。

## 手动巡检

```bash
npm run monitor
```

首次巡检会生成快照。之后只有状态变化才会推送飞书。

## CentOS 部署

安装 Node.js 20+ 后，在项目目录执行：

```bash
chmod +x deploy/install-centos.sh
sudo deploy/install-centos.sh
```

然后修改服务器上的配置：

```bash
sudo vi /opt/gongxin-monitor/config.json
sudo vi /opt/gongxin-monitor/.env
```

完成手动登录后启用定时任务：

```bash
sudo systemctl enable --now gongxin-monitor.timer
```

查看运行状态和日志：

```bash
systemctl list-timers gongxin-monitor.timer
journalctl -u gongxin-monitor.service -n 100 --no-pager
```

## 飞书机器人

在飞书群里添加“自定义机器人”，复制 Webhook 地址到 `.env`：

```bash
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

如果机器人开启了签名校验，当前 MVP 暂未实现签名。建议先使用关键词校验或关闭签名，等流程跑通后再补签名支持。

