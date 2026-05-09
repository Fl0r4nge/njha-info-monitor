# Gongxin Monitor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CentOS-deployable MVP that reuses a manual login session, reads project workflow statuses, detects changes, and sends Feishu webhook notifications.

**Architecture:** A Node.js CLI uses Playwright for browser automation and a JSON snapshot store for previous project states. Core logic is split into small modules for diffing, persistence, Feishu payloads, and login/session handling, with systemd units running the monitor on a timer.

**Tech Stack:** Node.js 20+, Playwright, node:test, JSON snapshot storage, systemd timer, Feishu custom bot webhook.

---

### Task 1: Project Skeleton And Tests

**Files:**
- Create: `package.json`
- Create: `src/diff.js`
- Create: `src/store.js`
- Create: `src/feishu.js`
- Create: `test/diff.test.js`
- Create: `test/store.test.js`
- Create: `test/feishu.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for project status diffing, snapshot store round-tripping, and Feishu payload formatting.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL because modules are not implemented yet.

- [ ] **Step 3: Implement minimal modules**

Implement `diffProjects`, `JsonSnapshotStore`, and `buildFeishuMessage`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: PASS.

### Task 2: Playwright Login And Monitor CLI

**Files:**
- Create: `src/config.js`
- Create: `src/browser.js`
- Create: `src/monitor.js`
- Create: `src/login.js`
- Create: `config.example.json`

- [ ] **Step 1: Add configuration loader**

Support platform URL, project page URL, selectors, Feishu webhook, storage state path, snapshot path, and timeout.

- [ ] **Step 2: Add login CLI**

Open a headed browser for manual account/password login and slider verification, then save Playwright storage state.

- [ ] **Step 3: Add monitor CLI**

Reuse saved storage state, navigate to the project page, extract configured fields, compare to the previous snapshot, send Feishu notifications on changes, and save the new snapshot.

### Task 3: CentOS Deployment

**Files:**
- Create: `deploy/install-centos.sh`
- Create: `deploy/gongxin-monitor.service`
- Create: `deploy/gongxin-monitor.timer`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Add deployment script**

Install Node dependencies, Playwright Chromium, create data directories, and copy systemd units.

- [ ] **Step 2: Add systemd timer**

Run the monitor every 10 minutes by default and log through journald.

- [ ] **Step 3: Document setup**

Explain Feishu webhook setup, manual login, selector configuration, timer enablement, and login-expired recovery.

