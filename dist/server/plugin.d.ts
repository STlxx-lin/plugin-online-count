/// <reference types="node" />
import { Cache } from '@nocobase/cache';
import { Database } from '@nocobase/database';
import { Plugin } from '@nocobase/server';
/** 用户会话：userId 为键，clientIds 为当前所有 WS 连接，单设备模式下最多 1 个 */
interface UserSession {
    userId: string;
    nickname: string;
    clientIds: Set<string>;
    clientIps: Map<string, string>;
    loginTime: number;
    status: 'ACTIVE' | 'AWAY';
    /** 用户角色名，用于前端判断是否显示强制下线按钮（root 不显示） */
    roleName: string;
    /** 是否被管理员拉黑（禁用），用于前端显示禁用/恢复按钮 */
    blacklisted: boolean;
    /** 客户端 User-Agent，供会话日志使用 */
    userAgent: string;
}
/**
 * 会话日志记录（用于异步批量写入 SessionLogs 表）
 */
interface SessionLogEntry {
    userId: string;
    loginTime: Date;
    logoutTime: Date;
    duration: number;
    logoutReason: string;
    ip: string;
    userAgent: string;
    status: string;
}
interface UserRole {
    name: string;
}
interface ActionParams {
    values?: Record<string, unknown>;
    resourceName?: string;
    actionName?: string;
    broadcastId?: unknown;
    ids?: unknown[];
    id?: unknown;
}
/** 插件方法中使用的 Koa 上下文最小接口 */
interface PluginContext {
    db?: Database;
    auth?: {
        user?: {
            id?: string | number;
            roles?: UserRole[];
        };
    };
    state?: {
        currentRole?: string;
        currentRoles?: Array<string | UserRole>;
    };
    request?: {
        path?: string;
        body?: Record<string, unknown>;
    };
    action?: {
        resourceName?: string;
        actionName?: string;
        params?: ActionParams;
    };
    body?: unknown;
    get?: (key: string) => string;
    query?: Record<string, unknown>;
    throw: (code: number, message: string) => void;
    req?: {
        readableEnded?: boolean;
        on?: (event: string, listener: (...args: unknown[]) => void) => void;
    };
}
export declare class PluginOnlineCountServer extends Plugin {
    /** 用户会话 Map，key = userId */
    userSessions: Map<string, UserSession>;
    /** clientId -> userId 反向映射 */
    clientIdToUserId: Map<string, string>;
    /** clientId -> 最后心跳时间戳 */
    clientPingTimes: Map<string, number>;
    /** clientId -> 设备指纹（同浏览器多标签页共享同一 deviceId，不同浏览器/设备各自独立） */
    clientDeviceId: Map<string, string>;
    /** 会话日志缓冲队列，每 60 秒批量写入数据库 */
    bufferQueue: SessionLogEntry[];
    /** 缓冲区连续写入失败次数，成功时重置，超过上限后清空队列 */
    private bufferRetryCount;
    /** 插件配置（内存存储） */
    config: {
        visibleToAll: boolean;
        singleSession: boolean;
    };
    /** 上次 listOnlineUsers 输出的 userId 签名，用于变化时才打印调试日志（避免轮询刷屏） */
    private lastListSignature;
    /** 按 userId 串行化 onWsSetTag 执行，防止并发竞态（互斥登录的核心保障） */
    private userSetTagLocks;
    /** Cache 实例，用于 JWT 黑名单存储 */
    tokenBlacklist: Cache;
    /**
     * 广播节流器（逻辑三·后端 Throttle）：所有 broadcastOnlineUsers() 调用都经过它，
     * 最高 2000ms/次（leading 立即执行 + trailing 兜底），防止状态高频变化导致广播风暴。
     */
    private throttledBroadcast;
    private lastBroadcastSnapshot;
    heartbeatTimer: NodeJS.Timeout | null;
    cleanupTimer: NodeJS.Timeout | null;
    flushTimer: NodeJS.Timeout | null;
    retentionTimer: NodeJS.Timeout | null;
    load(): Promise<void>;
    afterEnable(): Promise<void>;
    /**
     * 确保本插件持久化表存在：配置表 onlineCountConfig 与会话日志表 sessionLogs。
     * 这两张表由 collections/ 目录定义，经核心 loadCollections + db.sync 创建；
     * 若因历史异常启动漏建，这里通过一次兜底 db.sync 补建（幂等、安全）。
     */
    private ensureTablesExist;
    afterDisable(): Promise<void>;
    /**
     * 每小时检查一次，若当前小时为凌晨 3 点则自动清理超过 30 天的 SessionLogs 数据。
     * 使用 setInterval 替代递归 setTimeout，更简洁且不会因极端延迟值溢出。
     */
    scheduleDataRetention(): void;
    /**
     * 删除超过 30 天的会话日志
     */
    cleanOldSessionLogs(): Promise<void>;
    private isAdminRequest;
    private loadConfig;
    getConfig(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    setConfig(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 逻辑一·登录触发更新：用户登录认证成功，设置 userId 标签
     * 核心逻辑：
     * 1. 检查黑名单
     * 2. 互斥登录：如果启用了 singleSession，向旧 clientId 发送 LOGGED_IN_ELSEWHERE 信令，
     *    并在延迟 100ms 后强制断开旧连接
     * 3. 在内存 userSessions Map 中分配会话，并触发全网广播（经过节流器）
     */
    onWsSetTag({ clientId, tagKey, tagValue }: {
        clientId: string;
        tagKey: string;
        tagValue: string;
    }): Promise<void>;
    /**
     * 执行 setTag 的核心逻辑（在 per-userId 锁内串行执行）。
     * 从 onWsSetTag 中拆分出来，确保同一用户的并发 setTag 调用不会互相干扰。
     */
    private processSetTag;
    /**
     * 从数据库查询用户信息（含角色），用户不存在时返回 null。
     */
    private resolveUser;
    /**
     * 检查用户是否被拉黑。若被拉黑且非 root，发送 FORCE_LOGOUT 并在 100ms 后断开连接，
     * 同时清理 clientId 映射。返回 true 表示已拦截（调用方应 return）。
     */
    private handleBlacklistedUser;
    /**
     * 确保用户在当前 clientId 下存在会话记录。
     * - user 为 null 时创建最小化会话（用户不存在于 DB 的兜底）
     * - 已有会话则追加 clientId
     * - 新用户则创建完整会话
     */
    private ensureSession;
    /**
     * 客户端建连时上报设备指纹（online_device 消息）。
     * 记录 clientId -> deviceId，并在网关侧打 `deviceId#` 标签便于按设备聚合/排查；
     * 随后若单会话模式已开启，立即对所属用户重新执行单设备互斥判定（收敛消息乱序竞态）。
     */
    private onWsDeviceTag;
    private enforceSingleDevice;
    /**
     * 单会话模式下的踢人：仅踢出 deviceId 与 newDeviceId 不同的旧连接，
     * 保留同浏览器多标签页（同 deviceId）。新连接本身始终保留并计入会话。
     * 纯判定逻辑见 ./device-logic.ts（computeKickOnNewConnection），此处仅套用副作用。
     */
    private kickOtherDevices;
    /**
     * 统一踢出一批连接：发送 LOGGED_IN_ELSEWHERE 信令、延迟断开、清理映射，
     * 并记一条会话日志（被踢设备下线）。被踢连接之间视为同一设备事件，合并为一条日志。
     */
    private kickClientIds;
    /**
     * 重新计算会话 loginTime：取剩余连接中最早的 clientPingTimes。
     * 单设备互斥把旧设备踢光、只留新设备时，让 loginTime 反映留存设备的首次登录。
     */
    private recomputeLoginTime;
    /**
     * 用户下线或 WebSocket 断开，移除 userId 标签
     */
    onWsRemoveTag({ clientId, tagKey }: {
        clientId: string;
        tagKey: string;
    }): void;
    /**
     * 客户端主动上报退出登录（正常登出 / 强制下线 / 异地登录）
     * 由 ws:message:LOGOUT_NOTIFY 触发，立即移除该 clientId 对应的会话
     */
    onLogoutNotify({ clientId }: {
        clientId: string;
    }): void;
    /**
     * 移除某个 clientId 对应的会话；当该用户所有连接都断开时删除会话并广播
     */
    private removeClientSession;
    /**
     * 移除某用户的所有会话（登出 / 被踢），清理其全部 clientId 映射并广播。
     * 供 auth:signOut 拦截器与 kickUser 共用，是"逻辑二·后端 API 截杀"的落点。
     * @returns 是否存在可移除的会话
     */
    private removeUserSessions;
    /**
     * 心跳响应 Pong
     */
    onPong({ clientId }: {
        clientId: string;
    }): void;
    /**
     * 用户进入离开状态（15 分钟无操作）
     */
    onStatusAway({ clientId }: {
        clientId: string;
    }): void;
    /**
     * 用户恢复活跃状态（仅当客户端真正从 AWAY 变回 ACTIVE 时上报，前端已做防抖）
     */
    onStatusActive({ clientId }: {
        clientId: string;
    }): void;
    /**
     * 向所有客户端发送心跳 Ping
     */
    sendHeartbeat(): void;
    /**
     * 清理超过 90 秒未响应的过期连接（兜底：浏览器直接关闭标签页等场景）
     */
    cleanupStaleConnections(): void;
    /**
     * 将会话日志缓冲队列批量写入数据库
     */
    flushBufferQueue(): Promise<void>;
    /**
     * 向缓冲队列追加会话日志，超过容量上限时丢弃旧日志。
     */
    private pushToBufferQueue;
    /** 获取在线用户列表，根据 visibleToAll 配置决定是否所有登录用户可见 */
    private extractIpFromGatewayClient;
    /** 按 clientId 从网关取真实客户端 IP（供 onWsSetTag 写入 clientIps） */
    private getClientIpFromGateway;
    /** 按 clientId 从网关取客户端 User-Agent */
    private getClientUserAgentFromGateway;
    private getGatewayOnlineUsers;
    /**
     * 合并在线名单：权威名单来自网关真实 WS 连接（getGatewayOnlineUsers），
     * 富化字段（nickname / status / roleName / loginTime）来自本插件 `userSessions`。
     * 若某 userId 在网关中存在但 `userSessions` 缺失（极端漂移场景），用最小默认值兜底，
     * 保证不漏计，且 status 默认 ACTIVE。
     */
    private buildOnlineUsers;
    /**
     * 取某 userId 在当前 app 下的全部真实 WS clientId：
     * 优先来自网关权威连接，再补充本插件 userSessions 中记录的 clientIds（防漂移遗漏）。
     * 供 kickUser 使用，确保"列表显示在线即可被踢"。
     */
    private getClientIdsByUserId;
    listOnlineUsers(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 强制下线用户（附加约束：踢出不等于永久封禁）
     * 1. 向目标发送 FORCE_LOGOUT 消息
     * 2. 断开 WebSocket 连接
     * 3. 销毁当前 Token 缓存（JWT 黑名单，TTL = token 剩余有效期）
     * 4. 从内存中移除该用户全部会话并广播
     * ⚠️ 绝对禁止修改数据库 users 表的 blacklisted 字段 —— 踢出是临时下线，重新登录应正常放行
     */
    kickUser(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 解除用户黑名单
     * 同时清除该用户的黑名单缓存（Fix #4：避免解封后仍被缓存拦截 60s）
     */
    unblacklistUser(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 禁用（拉黑）用户：
     * 1. 将 users.blacklisted 置为 true
     * 2. 立即强制下线其全部在线连接（FORCE_LOGOUT + WS 断开 + 内存移除）
     * 3. 写入 JWT 黑名单缓存，使其当前 Token 立即失效（重新登录也会被拦截）
     * 与 kickUser 的区别：kick 是临时下线（不写 blacklisted），禁用是持久封禁。
     * root 用户禁止被禁用。
     */
    blacklistUser(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 已禁用（黑名单）用户列表
     * 从 users 表查 blacklisted=true 的记录（与在线状态无关——被禁用的用户已被强制下线，
     * 不会出现在在线列表中，必须从数据库查才能让管理员看到并恢复）。
     * 返回：userId、nickname、username、当前是否在线、是否 root（root 不应被禁用，兜底过滤）。
     */
    listBlacklistedUsers(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 管理员发送全站广播消息
     * 1. 保存广播到 systemBroadcasts 表，获取生成的 id
     * 2. 通过 WS 向所有在线客户端推送 SYSTEM_BROADCAST 消息（含 broadcastId）
     */
    broadcastMessage(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 用户标记广播已读（幂等：userId + broadcastId 唯一索引防止重复记录）
     */
    markBroadcastRead(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 计算某用户当前未读的广播列表（未过期且该用户尚未标记已读）。
     * 抽纯后供两处复用：
     * - syncUnreadBroadcasts：登录时经 WS 推送给客户端（SYSTEM_BROADCAST_SYNC）
     * - listUnreadBroadcasts：客户端在 WS 鉴权成功后主动拉取（online_users:list_broadcasts），
     *   作为推送的兜底，彻底解决「登录后收不到历史广播」的竞态（推送早于前端监听器就绪）。
     */
    private getUnreadBroadcasts;
    /**
     * 同步未读系统广播给新连接的客户端（在 onWsSetTag 中调用）
     * 查询所有未过期且该用户未读的广播，通过 SYSTEM_BROADCAST_SYNC 消息发送给指定客户端
     * 此方法由 onWsSetTag 调用，失败时由调用方 catch 处理，不影响主流程
     */
    private syncUnreadBroadcasts;
    /**
     * 当前登录用户主动拉取未读广播（online_users:list_broadcasts）。
     * 作为 WS 推送的兜底，确保登录后稳定收到已发送但未读的广播。
     */
    listUnreadBroadcasts(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 管理员查看全部系统广播及其已读统计（online_users:broadcasts）。
     * 返回每条广播的内容、级别、发送人、过期时间，以及已读人数与系统用户总数，
     * 供管理端「广播管理」页面展示「哪些人已读」的概览。
     */
    listBroadcasts(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 管理员查看某条广播的已读用户明细（online_users:broadcast_reads）。
     * 返回已读用户列表（userId / nickname / readAt）与已读人数、系统用户总数。
     */
    broadcastReads(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 管理员删除广播（支持单条与批量）：POST { ids: number[] } 或 { id: number }。
     * 同时级联删除对应的已读记录（userBroadcastReads）。
     * 注意：已通过 WS 推送并弹出的通知无法撤回，删除后：
     * - 广播管理列表立即移除；
     * - 其他用户后续拉取未读（list_broadcasts / 登录同步）不再包含该广播。
     */
    deleteBroadcasts(ctx: PluginContext, next: () => Promise<void>): Promise<void>;
    /**
     * 广播在线用户列表给所有客户端（逻辑三·后端 Throttle 入口）
     * 所有调用都经过 throttledBroadcast（2000ms/次，leading + trailing）。
     */
    broadcastOnlineUsers(): void;
    /**
     * 实际执行广播（逻辑三·后端 Diff 拦截）
     * 下发前比对上次快照：Diff 对象只包含 totalCount / userId / status / clientCount，
     * 剔除 duration、loginTime 等随时间自增的动态字段 —— 只有实质状态变化才真正 emit，
     * 杜绝"每秒时长变化导致持续广播"的无效流量。
     */
    private doBroadcastOnlineUsers;
}
export default PluginOnlineCountServer;
