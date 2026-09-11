# NocoBase Real-time Online Counter & Session Management Plugin (`@nocobase/plugin-online-count`)

<p align="left">
  <b>English</b> | <a href="./README.md">简体中文</a>
</p>

[![Views](https://komarev.com/ghpvc/?username=nocobase-plugin-online-count&color=007ec6&style=flat-square&label=Views)](https://github.com/STlxx-lin/nocobase-plugin-online-count)
[![Version](https://img.shields.io/badge/version-v0.2.15-blue.svg)](https://github.com/STlxx-lin/nocobase-plugin-online-count/releases)
[![NocoBase Version](https://img.shields.io/badge/NocoBase-2.x-brightgreen.svg)](https://www.nocobase.com)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

A powerful session management and online user counting plugin for NocoBase. It tracks concurrent online users in real-time, displays active session lists, provides single-session mutual exclusion (device fingerprinting), forced session termination (kick-out), user blacklist, and system broadcast notifications.

---

## 📌 Key Features

- 👥 **Real-time Online Dashboard**:
  - Live statistics on total online users, logged-in accounts, anonymous visitors, peak online count today, and average online duration.
- 🖥️ **Active Session Management & One-Click Kick-Out**:
  - View all active sessions with username, nickname, role, IP address, browser, OS, login time, and last heartbeat.
  - Administrators can terminate any session with one click.
  - The kicked client is instantly blocked on the next request, displaying a prompt and redirecting to the login screen.
- 🛡️ **Concurrent Login Policy Control**:
  - **Multi-Device Allowed**: The same user account can stay logged in across multiple devices/browsers simultaneously.
  - **Single-Device Mutual Exclusion**: When the same account logs in from a new device, older sessions are automatically invalidated and kicked offline.
- 📈 **Historical Trend & Time-Series Sampling**:
  - Supports 24-hour and 7-day historical online sampling.
  - Client-side responsive SVG chart with smooth curves and hover tooltips showing hourly breakdown.
- 🔔 **Header Bar Quick Badge**:
  - Displays real-time online user count directly in the top navigation bar. Clicking the badge opens a quick drawer dashboard.
- ⚙️ **Configurable & Zero External Dependencies**:
  - Easily adjust heartbeat intervals (default 30s), session expiration thresholds (default 120s), and sampling frequency.
  - Built-in memory cache with lightweight database persistence; no external Redis or complex middleware required.
  - Fully compatible with NocoBase v2.0+ and Client-v2 modern architecture.

---

## 🚀 Installation & Usage

### Method 1: Using npm / yarn

```bash
# Run in NocoBase root directory
yarn nocobase pm add @nocobase/plugin-online-count
yarn nocobase pm enable @nocobase/plugin-online-count
```

### Method 2: Manual Installation from Release Archive

```bash
yarn nocobase pm add /path/to/@nocobase-plugin-online-count-0.2.15.tgz
yarn nocobase pm enable @nocobase/plugin-online-count
```

---

## 🛠️ Backend API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/onlineCount:heartbeat` | `POST` | Periodic heartbeat from active client sessions |
| `/api/onlineCount:getStats` | `GET` | Fetch real-time online dashboard metrics |
| `/api/onlineCount:listSessions` | `GET` | List active sessions with pagination and search |
| `/api/onlineCount:kickout` | `POST` | Forcefully terminate a session (params: `sessionId`) |
| `/api/onlineCount:getTrend` | `GET` | Fetch historical trend data (params: `range=24h/7d`) |
| `/api/onlineCount:getConfigs` | `GET` | Retrieve plugin settings |
| `/api/onlineCount:updateConfigs` | `POST` | Update plugin settings |

---

## 📬 Feedback & Support

For issues, feature requests, or custom assistance:
- **Feedback QQ**: `1414794992`
- **GitHub Issues**: [Open an issue](https://github.com/STlxx-lin/nocobase-plugin-online-count/issues)

---

## 📄 License

AGPL-3.0 License