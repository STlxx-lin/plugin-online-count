import { Plugin, Application } from '@nocobase/client-v2';
export declare class PluginOnlineCountClientV2 extends Plugin<Record<string, unknown>, Application> {
    private authTokenChangeHandler;
    private deviceId;
    /** 缓存的插件配置，避免多个组件重复请求 online_count_config:get */
    private cachedConfig;
    private configPromise;
    /**
     * 获取插件配置（带缓存）。首次调用时从服务端获取并缓存，后续调用直接返回缓存值。
     */
    getConfig(): Promise<{
        visibleToAll: boolean;
        singleSession: boolean;
    }>;
    load(): Promise<void>;
    /**
     * 获取稳定的设备指纹：优先读取 localStorage（同浏览器所有标签页共享），
     * 不存在则生成 UUID 并持久化。不同浏览器/隐私窗口有各自独立的存储，天然视为不同设备。
     */
    private getDeviceId;
    /**
     * 通过 WebSocket 把本浏览器 deviceId 上报给后端。
     * 后端据此把「同一浏览器的多个标签页」归并为同一设备，单会话模式下不会互相踢下线。
     */
    private sendDeviceId;
    handlePing(): void;
    /**
     * 强制下线 / 异地登录后的跳转目标。
     * 部署在 /v 子路径下（pathname 为 /v 或以 /v/ 开头）时跳转到 /v/signin，
     * 其余场景跳转到 /signin。
     */
    private getSigninUrl;
    handleForceLogout(event: Event): Promise<void>;
    handleLoggedInElsewhere(_event: Event): void;
    handleServerRestart(_event: Event): void;
    /**
     * 转发系统广播消息到 eventBus，供 HeaderOnlineIcon 组件消费
     */
    handleSystemBroadcastForward(event: Event): void;
    /**
     * 转发系统广播同步消息到 eventBus，供 HeaderOnlineIcon 组件消费
     */
    handleSystemBroadcastSyncForward(event: Event): void;
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
    setupLogoutDetection(): void;
    /**
     * 通过 WebSocket 主动上报退出登录，让服务器立即移除当前 clientId 的会话
     */
    notifyLogout(): void;
    afterDisable(): Promise<void>;
}
export default PluginOnlineCountClientV2;
