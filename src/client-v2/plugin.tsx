import { Plugin, Application } from '@nocobase/client-v2';
import { notification } from 'antd';

// WebSocket 连接地址固定使用 '/ws'；网关已剥离 APP_PUBLIC_PATH，不需自行拼接子路径

export class PluginOnlineCountClientV2 extends Plugin<Record<string, unknown>, Application> {
  private authTokenChangeHandler: ((event: Event) => void) | null = null;

  // 设备指纹：同浏览器共享 localStorage，用于服务端区分同浏览器多标签 vs 不同设备
  private deviceId: string | null = null;

  /** 缓存的插件配置，避免多个组件重复请求 online_count_config:get */
  private cachedConfig: { visibleToAll: boolean; singleSession: boolean } | null = null;
  private configPromise: Promise<{ visibleToAll: boolean; singleSession: boolean }> | null = null;

  /**
   * 获取插件配置（带缓存）。首次调用时从服务端获取并缓存，后续调用直接返回缓存值。
   */
  async getConfig(): Promise<{ visibleToAll: boolean; singleSession: boolean }> {
    if (this.cachedConfig) return this.cachedConfig;

    if (!this.configPromise) {
      this.configPromise = this.app.apiClient
        .request({ url: 'online_count_config:get' })
        .then((res) => {
          const data = res?.data?.data ?? res?.data ?? {};
          this.cachedConfig = {
            visibleToAll: data.visibleToAll !== false,
            singleSession: data.singleSession === true,
          };
          return this.cachedConfig;
        })
        .catch(() => {
          this.configPromise = null;
          return { visibleToAll: true, singleSession: false };
        });
    }

    return this.configPromise;
  }

  async load() {
    this.flowEngine.registerModelLoaders({
      HeaderOnlineTopbarActionModel: {
        extends: 'TopbarActionModel',
        loader: () => import('./models/HeaderOnlineTopbarActionModel'),
      },
    });

    // ===== 监听 WebSocket 消息 =====
    if (this.app?.eventBus) {
      this.app.eventBus.addEventListener('ws:message:ping', this.handlePing.bind(this));
      this.app.eventBus.addEventListener('ws:message:FORCE_LOGOUT', this.handleForceLogout.bind(this));
      this.app.eventBus.addEventListener('ws:message:LOGGED_IN_ELSEWHERE', this.handleLoggedInElsewhere.bind(this));
      this.app.eventBus.addEventListener('ws:message:SERVER_RESTART', this.handleServerRestart.bind(this));
      // 系统广播消息：转发到 eventBus 供 HeaderOnlineIcon 消费
      this.app.eventBus.addEventListener('ws:message:SYSTEM_BROADCAST', this.handleSystemBroadcastForward.bind(this));
      this.app.eventBus.addEventListener(
        'ws:message:SYSTEM_BROADCAST_SYNC',
        this.handleSystemBroadcastSyncForward.bind(this),
      );
    }

    // ===== 注册设置页面 =====
    this.pluginSettingsManager.addMenuItem({
      key: 'online-count',
      title: this.t('Online Count'),
      icon: 'TeamOutlined',
    });
    // 标签页顺序固定为：设置 → 在线 → 广播管理（sort 越小越靠前）
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'online-count',
      key: 'index',
      title: this.t('Settings'),
      sort: 1,
      componentLoader: () => import('./pages/SettingsPage'),
    });
    // 在线用户管理（完整表格：含 Disable/Restore/Kick Out、IP、Account Status、时长等列）
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'online-count',
      key: 'online-users',
      title: this.t('Online Users'),
      icon: 'TeamOutlined',
      sort: 2,
      componentLoader: () => import('./pages/OnlineUsersPage'),
    });
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'online-count',
      key: 'broadcasts',
      title: this.t('Broadcast Management'),
      sort: 3,
      componentLoader: () => import('./pages/BroadcastsPage'),
    });

    // ===== 启动登出检测：用户退出登录时立即通知服务器移除会话 =====
    // （空闲检测已移至 HeaderOnlineIcon.tsx：15min 无操作发 STATUS_AWAY，
    //   仅 AWAY→ACTIVE 转变经 500ms 防抖才发一次 STATUS_ACTIVE）
    this.setupLogoutDetection();

    // ===== 设备指纹：连接建立时把 deviceId 发给后端，用于区分同浏览器多标签 vs 异设备 =====
    // 注册于 load()（早于顶栏挂载），与核心 auth:token 一样在 WS open 时发送；
    // 重连（reconnect）后同样会触发 open，故单设备互斥判定在每次建连后都有效。
    if (this.app?.ws) {
      this.app.ws.on('open', this.sendDeviceId);
      // 若此时连接已就绪（热加载/HMR 场景），立即补发一次
      if (this.app.ws.connected) {
        this.sendDeviceId();
      }
    }
  }

  /**
   * 获取稳定的设备指纹：优先读取 localStorage（同浏览器所有标签页共享），
   * 不存在则生成 UUID 并持久化。不同浏览器/隐私窗口有各自独立的存储，天然视为不同设备。
   */
  private getDeviceId(): string {
    if (this.deviceId) return this.deviceId;
    const STORAGE_KEY = 'nocobase:online-count:deviceId';
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) {
        this.deviceId = existing;
        return existing;
      }
      const generated =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(STORAGE_KEY, generated);
      this.deviceId = generated;
      return generated;
    } catch {
      // localStorage 不可用（隐私模式禁用等）时降级为内存随机值：本标签页内稳定，
      // 但跨标签不共享——此时多开窗口会被误判为不同设备（保守但不致误踢同标签）。
      if (!this.deviceId) {
        this.deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      return this.deviceId;
    }
  }

  /**
   * 通过 WebSocket 把本浏览器 deviceId 上报给后端。
   * 后端据此把「同一浏览器的多个标签页」归并为同一设备，单会话模式下不会互相踢下线。
   */
  private sendDeviceId = () => {
    try {
      if (this.app.ws?.connected) {
        this.app.ws.send(JSON.stringify({ type: 'online_device', payload: { deviceId: this.getDeviceId() } }));
      }
    } catch {
      // WS 不可用时忽略，open / reconnect 会再次触发补发
    }
  };

  // ===== WebSocket 消息处理器 =====

  handlePing() {
    this.app.ws.send(JSON.stringify({ type: 'pong' }));
  }

  /**
   * 强制下线 / 异地登录后的跳转目标。
   * 部署在 /v 子路径下（pathname 为 /v 或以 /v/ 开头）时跳转到 /v/signin，
   * 其余场景跳转到 /signin。
   */
  private getSigninUrl(): string {
    const { pathname } = window.location;
    if (pathname === '/v' || pathname.startsWith('/v/')) {
      return '/v/signin';
    }
    return '/signin';
  }

  async handleForceLogout(event: Event) {
    const payload = (event as CustomEvent).detail;
    const reason = payload?.reason || 'unknown';

    // 在清空 token 前通知服务器移除本会话（此时 WS 仍在线，可立即减员）
    this.notifyLogout();

    try {
      await this.app.apiClient.auth.signOut();
    } catch {
      this.app.apiClient.auth.setToken('');
      this.app.apiClient.auth.setRole('');
      this.app.apiClient.auth.setAuthenticator('');
    }

    notification.error({
      message: String(this.t('You have been kicked out')),
      description:
        reason === 'blacklisted'
          ? String(this.t('Your account has been blacklisted by the administrator.'))
          : String(this.t('You have been forcibly logged out by the administrator.')),
      duration: 5,
      onClose: () => {
        window.location.href = this.getSigninUrl();
      },
    });

    setTimeout(() => {
      window.location.href = this.getSigninUrl();
    }, 5000);
  }

  handleLoggedInElsewhere(_event: Event) {
    // 在清空 token 前通知服务器移除本会话（此时 WS 仍在线，可立即减员）
    this.notifyLogout();

    this.app.apiClient.auth.setToken('');
    this.app.apiClient.auth.setRole('');
    this.app.apiClient.auth.setAuthenticator('');

    notification.warning({
      message: String(this.t('Logged in elsewhere')),
      description: String(this.t('Logged in elsewhere')),
      duration: 5,
      onClose: () => {
        window.location.href = this.getSigninUrl();
      },
    });

    setTimeout(() => {
      window.location.href = this.getSigninUrl();
    }, 5000);
  }

  handleServerRestart(_event: Event) {
    notification.warning({
      message: String(this.t('Server is restarting')),
      description: String(this.t('The server is restarting, some features may be temporarily unavailable.')),
      duration: 5,
    });
  }

  /**
   * 转发系统广播消息到 eventBus，供 HeaderOnlineIcon 组件消费
   */
  handleSystemBroadcastForward(event: Event) {
    this.app.eventBus.dispatchEvent(
      new CustomEvent('plugin:online_count:system_broadcast', { detail: (event as CustomEvent).detail }),
    );
  }

  /**
   * 转发系统广播同步消息到 eventBus，供 HeaderOnlineIcon 组件消费
   */
  handleSystemBroadcastSyncForward(event: Event) {
    this.app.eventBus.dispatchEvent(
      new CustomEvent('plugin:online_count:system_broadcast_sync', { detail: (event as CustomEvent).detail }),
    );
  }

  // ===== 登出检测 =====

  /**
   * 登出检测：观测当前登录用户 token，一旦从「已登录」变为「未登录」
   * （正常退出 / 强制下线 / 异地登录），立即通过仍在线的 WebSocket 通知
   * 服务器移除本会话，避免在线人数长时间不准确。
   *
   * 说明：NocoBase 核心在 WebSocket 断连时不会 emit ws:removeTag，且登出时
   * 连接常保持并重连心跳，仅靠 90s 的 stale 清理不可靠；主动上报是最及时的方案。
   * 注意：本监听器先于 HeaderOnlineIcon 中 app.ws.close() 注册执行，
   * 保证 LOGOUT_NOTIFY 报文在长连接销毁前发出。
   */
  setupLogoutDetection() {
    // NocoBase Auth.setToken() 会通过 app.eventBus 派发 'auth:tokenChanged' 事件
    // （见 core/sdk/src/Auth.ts:128），detail = { token, authenticator }
    // 当 token 变为 falsy（null/空字符串）即为登出。
    this.authTokenChangeHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.token) {
        // token 被清空 → 用户登出：先通知服务器移除会话，再销毁 WS 长连接防止幽灵重连
        this.notifyLogout();
        try {
          this.app.ws?.close();
        } catch {
          // WS 已不可用则忽略
        }
      } else {
        // token 重新有值（登录 / 换 token）：
        // 必须主动救活长连接 —— 这是「新登录不更新在线数」的真正根因。
        //
        // 未登录时（如 /v/signin 页）WebSocketClient 不建立连接（无 token）；
        // SPA 登录是客户端路由跳转、不整页刷新，NocoBase 核心不会自动为「从无到有的 token」
        // 拉起 WS。若只依赖 HeaderOnlineIcon 里的 reconnect（它要等顶栏出现后才挂载），
        // 登录那一刻的 auth:tokenChanged 事件早已错过，reconnect() 永远不被调用 →
        // 服务端收不到 auth:token → 不 ws:setTag → 不广播 → 新登录用户在线数恒为 0/旧值，
        // 必须手动整页刷新（WS 在 bootstrap 阶段带 token 建连）才正确。
        //
        // 本监听器注册于 load()（永远早于顶栏挂载），因此一定能捕获登录事件并建连；
        // 建连后核心会重发 auth:token → 服务端 setTag → 节流广播 → 各端 handleOnlineUsers 纠正计数。
        // 若连接本就存活，reconnect() 内部有 readyState === OPEN 检查，是安全的 no-op。
        try {
          this.app.ws?.reconnect?.();
        } catch {
          // WS 不可用则忽略，focus / 连接事件自愈会兜底
        }
      }
    };
    this.app.eventBus.addEventListener('auth:tokenChanged', this.authTokenChangeHandler);
  }

  /**
   * 通过 WebSocket 主动上报退出登录，让服务器立即移除当前 clientId 的会话
   */
  notifyLogout() {
    try {
      if (this.app.ws?.connected) {
        this.app.ws.send(JSON.stringify({ type: 'LOGOUT_NOTIFY' }));
      }
    } catch {
      // WS 已不可用时忽略，stale 清理会作为兜底
    }
  }

  async afterDisable() {
    if (this.authTokenChangeHandler) {
      this.app.eventBus.removeEventListener('auth:tokenChanged', this.authTokenChangeHandler);
      this.authTokenChangeHandler = null;
    }
    try {
      this.app.ws?.off?.('open', this.sendDeviceId);
    } catch {
      // WS 不可用时忽略
    }
  }
}

export default PluginOnlineCountClientV2;
