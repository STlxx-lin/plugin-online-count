# NocoBase 在线人数统计与会话管理插件 (`@nocobase/plugin-online-count`)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![NocoBase](https://img.shields.io/badge/nocobase-v2.0+-green.svg)

## 📌 功能特性

- 👥 **实时在线看板**：
  - 实时统计全站总在线人数、登录用户数、访客数、今日最高在线及平均在线时长。
- 🖥️ **活跃会话管理与一键踢下线 (Kickout)**：
  - 查看当前所有活跃会话的用户名、昵称、角色、IP、浏览器、操作系统、登录时间与最后活跃时间。
  - 支持管理员一键强制踢出指定会话。
  - 被踢端在下一次任意请求时立即阻断，并弹出友好提示并强制跳转至登录页。
- 🛡️ **多端并发登录策略管控**：
  - **允许多端同时在线**：同一账号可在多个设备/浏览器同时登录。
  - **单端登录（互斥踢出先登录）**：同一账号在新端登录后，旧端自动失效被踢下线。
- 📈 **历史走势与时序采样**：
  - 支持 24 小时 / 7 天历史在线趋势采样。
  - 纯前端自适应 SVG 走势图表与平滑曲线渲染，悬浮展示每小时在线详情。
- 🔔 **顶部导航快捷徽章**：
  - 顶部导航栏直观显示当前在线人数，点击弹出快捷抽屉看板。
- ⚙️ **灵活可配与零外部依赖**：
  - 支持配置心跳间隔（默认 30 秒）、会话超时阈值（默认 120 秒）、走势采样间隔及并发策略。
  - 自带内存缓存与轻量数据库持久化，不依赖外部 Redis 等复杂中间件。
  - 完美适配 NocoBase v2.0+ 客户端及 Client-v2 架构。

---

## 🚀 安装与使用

### 方式 1：使用 npm / yarn 安装

```bash
# 在 NocoBase 项目根目录运行
yarn nocobase pm add @nocobase/plugin-online-count
yarn nocobase pm enable @nocobase/plugin-online-count
```

### 方式 2：手动从 release 下载 .tgz 安装

```bash
yarn nocobase pm add /path/to/@nocobase-plugin-online-count-0.1.0.tgz
yarn nocobase pm enable @nocobase/plugin-online-count
```

---

## 🛠️ 后端 API 说明

| 端点 (Endpoint) | 方法 | 说明 |
| :--- | :--- | :--- |
| `/api/onlineCount:heartbeat` | `POST` | 客户端定期上报心跳 |
| `/api/onlineCount:getStats` | `GET` | 获取实时在线概览数据 |
| `/api/onlineCount:listSessions` | `GET` | 获取活跃会话列表（分页、搜索） |
| `/api/onlineCount:kickout` | `POST` | 强制踢下线指定会话（参数：`sessionId`） |
| `/api/onlineCount:getTrend` | `GET` | 获取在线历史走势（参数：`range=24h/7d`） |
| `/api/onlineCount:getConfigs` | `GET` | 获取插件配置项 |
| `/api/onlineCount:updateConfigs` | `POST` | 更新插件配置项 |

---

## 📄 许可证

MIT License
