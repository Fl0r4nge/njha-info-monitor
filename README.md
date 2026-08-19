# njha-info-monitor

南京市中小企业数字化转型城市试点线上一体化公共服务平台流程状态监控工具。

## 功能

- 可从环境变量自动填写账号密码；平台图片验证码仍由运维人员当次确认。
- 使用 Playwright 复用人工登录态访问平台。
- 定时进入个人中心的“改造项目管理”页面。
- 读取企业名称、项目阶段、流程状态、行业、服务商和时间。
- 支持不配置飞书、直接输出 JSON 的单次查询。
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

## 自动填写登录信息

账号密码只通过环境变量传入，不要写入 `config.json` 或提交到 Git：

```bash
export GONGXIN_USERNAME='你的账号'
export GONGXIN_PASSWORD='你的密码'
export GONGXIN_CONFIG='./config.hongguang.json'
export LOGIN_AUTO_SAVE=1
npm run login
```

Windows PowerShell：

```powershell
$env:GONGXIN_USERNAME='你的账号'
$env:GONGXIN_PASSWORD='你的密码'
$env:GONGXIN_CONFIG='./config.hongguang.json'
$env:LOGIN_AUTO_SAVE='1'
npm run login
```

工具会自动填写账号密码。由于平台使用动态图片验证码，需要在打开的浏览器中填写验证码并点击“登录”；成功后登录态会自动保存，后续定时查询不再需要账号密码，直至该登录态失效。

若验证码由运维人员在本次运行时读取，也可临时传入 `GONGXIN_CAPTCHA`，工具会填写验证码并提交登录表单。不要把验证码保存到 `.env`。

企业侧登录使用滑块拼图。运维人员确认处理本次验证码后，可在本次运行前临时设置：

```powershell
$env:GONGXIN_SOLVE_SLIDER='CONFIRMED'
npm run login
```

程序会自动计算拼图位置并拖动滑块。此变量代表对当次验证码的确认，不应长期写入 `.env`；验证失败并刷新验证码时，需要再次确认后重新运行。

## 单次查询项目状态

登录态生成后运行：

```bash
npm run query
```

命令会将“改造项目管理”中的当前项目状态以 JSON 输出到终端，不要求配置飞书 Webhook。

## 配置文件

- `.env`：飞书 Webhook 和配置路径，不能提交。
- `config.json`：真实平台配置和企业名称，不能提交。
- `config.example.json`：可提交的示例配置。
- `data/storage_state.json`：登录态，不能提交。
- `data/projects_snapshot.json`：上一次巡检快照，不能提交。

## 平台采集与回灌佐证材料收集系统

在原有"项目状态巡检"之外，新增了与佐证材料收集系统的双向对接。

### 完整操作顺序

```bash
# 1. 人工登录一次（图形验证码 + 滑块只能人来）
GONGXIN_USERNAME='账号' GONGXIN_PASSWORD='密码' \
GONGXIN_CONFIG='./config.hongguang.json' LOGIN_AUTO_SAVE=1 npm run login

# 2. 采集平台数据（企业档案 / 试点申报 / 改造项目 / 服务商备案）
npm run platform:collect      # → data/collected-*.json、data/raw-responses.json

# 3. 下载平台附件
npm run platform:files        # → data/attachments/、data/attachments.json

# 4. 生成回灌计划（只生成，不写入）
npm run bridge:plan           # → data/import-plan.json

# 5. 人工核对 data/import-plan.json（尤其是 conflicts 段）

# 6. 真正写入佐证材料收集系统
npm run bridge:apply -- --apply

# 7. 反向推送文件到平台（默认只演练）
npm run platform:push -- --file ./某个文件.pdf --confirm I-UNDERSTAND
```

回灌目标由环境变量指定，见 `.env.example` 的 COLLECT_* 段。

### 设计上的几条硬规矩

- **字段名尚未用真实返回体验证**。`src/bridge/field-map.js` 里每条映射都有多个候选路径与
  confidence，取不到只记 note 不整体失败。**首次跑通后请用 `data/raw-responses.json`
  里的真实字段名回来校正，并把 confidence 提到 high。**
- **回灌默认不覆盖**本系统已有内容，冲突项只报告不写入。
- **写平台默认演练**。`platform:push` 与 `submitToPlatform` 必须同时满足
  `dryRun:false` 与 `confirm: 'I-UNDERSTAND'` 才会真发；启动流程、删除附件、备案申报
  等不可逆接口**不在白名单内，工具直接拒绝调用**。
- 更稳妥的写回方式是 `src/platform/fill-form.js`：把值填进平台页面但**不点提交**，
  人工核对后自己点。
- 上传到佐证材料收集系统时，>11.5MB 自动分片（平台网关单次请求体上限 12MB，
  超限会返回 HTTP 200 + 错误 JSON），且以"回读清单能查到该文件"为成功判据。

### 已知前提

- 平台上**目前还没有改造前/后自评测报告 PDF**（见接口盘点第 5.3 节），
  但改造前/后成效的结构化数据可采，用于回填 B0 与核对验收申报的改造后六项。
- 一个企业账号只能看自己一家，多家企业需各自登录。
