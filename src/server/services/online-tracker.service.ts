import { Application } from '@nocobase/server';
import { CronJob } from 'cron';
import { Op } from 'sequelize';
import { OnlineConfigService } from './online-config.service';
import { SessionControlService } from './session-control.service';
import { CONFIG_KEYS } from '../constants';
import { parseUserAgent, isIPv4, isIPv6, normalizeIp } from '../utils/device-parser';
import { AuditLogService } from './audit-log.service';

export interface HeartbeatPayload {
  token: string;
  userId?: number | string | null;
  username?: string | null;
  nickname?: string | null;
  ip: string;
  userAgent?: string;
  currentPath?: string;
}

export interface OnlineSessionItem {
  id?: number | string;
  token: string;
  userId: number | string | null;
  username: string;
  nickname: string;
  ip: string;
  ipv4?: string;
  ipv6?: string;
  isDualStack?: boolean;
  relatedTokens?: string[];
  userAgent: string;
  device: string;
  os: string;
  browser: string;
  currentPath: string;
  loginAt: Date;
  lastActiveAt: Date;
  isKicked: boolean;
  kickReason?: string;
  lastDbSync?: number;
}

export class OnlineTrackerService {
  private app: Application;
  private configService: OnlineConfigService;
  private sessionControlService: SessionControlService;

  // 内存会话快速缓存 (Token -> OnlineSessionItem)
  private memorySessions = new Map<string, OnlineSessionItem>();
  // 用户维度与访客 IP 维度索引缓存，将心跳去重由 O(N) 降低至 O(1)
  private userTokensIndex = new Map<string, Set<string>>();
  private guestIpTokensIndex = new Map<string, Set<string>>();

  private cleanupJob: CronJob | null = null;
  private sampleJob: CronJob | null = null;

  constructor(
    app: Application,
    configService: OnlineConfigService,
    sessionControlService: SessionControlService,
  ) {
    this.app = app;
    this.configService = configService;
    this.sessionControlService = sessionControlService;
  }

  private addSessionToIndexes(session: OnlineSessionItem) {
    if (session.userId) {
      const uKey = String(session.userId);
      let set = this.userTokensIndex.get(uKey);
      if (!set) {
        set = new Set();
        this.userTokensIndex.set(uKey, set);
      }
      set.add(session.token);
    } else if (session.ip) {
      let set = this.guestIpTokensIndex.get(session.ip);
      if (!set) {
        set = new Set();
        this.guestIpTokensIndex.set(session.ip, set);
      }
      set.add(session.token);
    }
  }

  private removeTokenFromIndexes(token: string, session?: OnlineSessionItem) {
    const s = session || this.memorySessions.get(token);
    if (!s) return;
    if (s.userId) {
      const uKey = String(s.userId);
      const set = this.userTokensIndex.get(uKey);
      if (set) {
        set.delete(token);
        if (set.size === 0) this.userTokensIndex.delete(uKey);
      }
    } else if (s.ip) {
      const set = this.guestIpTokensIndex.get(s.ip);
      if (set) {
        set.delete(token);
        if (set.size === 0) this.guestIpTokensIndex.delete(s.ip);
      }
    }
  }

  /**
   * 初始化定时任务与预热数据
   */
  async init(): Promise<void> {
    await this.configService.loadConfigs();
    await this.loadActiveSessionsFromDb();

    // 1. 每 30 秒自动清理离线超时的会话
    this.cleanupJob = new CronJob('*/30 * * * * *', async () => {
      await this.cleanupExpiredSessions();
    });
    this.cleanupJob.start();

    // 2. 每 5 分钟采样一次在线人数走势
    this.sampleJob = new CronJob('0 */5 * * * *', async () => {
      await this.sampleHistoryStats();
    });
    this.sampleJob.start();
  }

  destroy(): void {
    if (this.cleanupJob) this.cleanupJob.stop();
    if (this.sampleJob) this.sampleJob.stop();
  }

  /**
   * 记录/刷新会话心跳
   */
  async recordHeartbeat(payload: HeartbeatPayload): Promise<{ success: boolean; kicked: boolean; reason?: string }> {
    const { token, userId, username, nickname, ip, userAgent = '', currentPath = '/' } = payload;
    if (!token) {
      return { success: false, kicked: false };
    }

    // 1. 检查当前会话是否已被管理员强制下线
    const kickCheck = this.sessionControlService.isTokenKicked(token);
    if (kickCheck.kicked) {
      return { success: false, kicked: true, reason: kickCheck.reason };
    }

    // 2. 若不统计访客且未登录，直接放行不入库
    const trackGuests = this.configService.getBoolean(CONFIG_KEYS.TRACK_GUESTS, true);
    if (!userId && !trackGuests) {
      return { success: true, kicked: false };
    }

    // 3. 检查单点登录并发策略（基于用户索引 O(1) 精确查找该用户已有会话）
    const concurrentPolicy = this.configService.getString(CONFIG_KEYS.CONCURRENT_POLICY, 'allow_multiple');
    if (userId && concurrentPolicy === 'single_kick_previous') {
      const userTokens = this.userTokensIndex.get(String(userId));
      if (userTokens) {
        for (const otherToken of userTokens) {
          if (otherToken !== token) {
            const s = this.memorySessions.get(otherToken);
            if (s && !s.isKicked) {
              await this.sessionControlService.kickoutToken(otherToken, '账号已在另一台设备登录，您已被迫下线');
              AuditLogService.getInstance().recordSessionEnd(this.app.db, {
                sessionId: s.token,
                userId: s.userId ? Number(s.userId) : null,
                username: s.username,
                nickname: s.nickname,
                ip: s.ip,
                device: s.device,
                os: s.os,
                browser: s.browser,
                loginAt: s.loginAt,
                lastActiveAt: s.lastActiveAt,
                terminationReason: 'mutex_kickout',
                detail: '单点登录互斥踢出：账号在另一台设备登录',
              });
            }
          }
        }
      }
    }

    const now = new Date();
    const { browser, os, device } = parseUserAgent(userAgent);
    const cleanIp = normalizeIp(ip);
    const ipIsV4 = isIPv4(cleanIp);
    const ipIsV6 = isIPv6(cleanIp);

    // 同设备旧会话与登录前访客会话自动接替淘汰 / 双栈继承
    let inheritedIpv4: string | undefined = ipIsV4 ? cleanIp : undefined;
    let inheritedIpv6: string | undefined = ipIsV6 ? cleanIp : undefined;
    const accumulatedTokens = new Set<string>();

    if (userId) {
      const userTokens = this.userTokensIndex.get(String(userId));
      if (userTokens) {
        for (const otherToken of userTokens) {
          if (otherToken !== token) {
            const s = this.memorySessions.get(otherToken);
            if (s && !s.isKicked) {
              // 同一认证用户在相同终端设备下，判定为同一设备（包括 IPv4 与 IPv6 双栈或 IP 漂移切换）
              const isSameUserDevice =
                s.device === device &&
                (s.os === os || s.browser === browser || !s.os || !os);

              if (isSameUserDevice) {
                if (s.ipv4) inheritedIpv4 = inheritedIpv4 || s.ipv4;
                else if (isIPv4(s.ip)) inheritedIpv4 = inheritedIpv4 || s.ip;

                if (s.ipv6) inheritedIpv6 = inheritedIpv6 || s.ipv6;
                else if (isIPv6(s.ip)) inheritedIpv6 = inheritedIpv6 || s.ip;

                accumulatedTokens.add(otherToken);
                if (Array.isArray(s.relatedTokens)) {
                  s.relatedTokens.forEach((t) => accumulatedTokens.add(t));
                }

                // 清理已被新会话接替的旧重复 token，避免在内存中分裂为两个并存会话
                this.removeTokenFromIndexes(otherToken, s);
                this.memorySessions.delete(otherToken);
              }
            }
          }
        }
      }

      // 清理当前 IP 上的未登录访客残留（基于访客 IP 索引 O(1) 定位）
      const guestTokens = this.guestIpTokensIndex.get(cleanIp);
      if (guestTokens) {
        for (const gToken of guestTokens) {
          const gs = this.memorySessions.get(gToken);
          this.removeTokenFromIndexes(gToken, gs);
          this.memorySessions.delete(gToken);
        }
      }
    }

    let session = this.memorySessions.get(token);
    if (!session) {
      const isDual = Boolean(inheritedIpv4 && inheritedIpv6);
      session = {
        token,
        userId: userId || null,
        username: username || (userId ? `User_${userId}` : '访客'),
        nickname: nickname || username || '访客',
        ip: cleanIp,
        ipv4: inheritedIpv4,
        ipv6: inheritedIpv6,
        isDualStack: isDual,
        relatedTokens: Array.from(accumulatedTokens),
        userAgent,
        device,
        os,
        browser,
        currentPath,
        loginAt: now,
        lastActiveAt: now,
        isKicked: false,
        lastDbSync: now.getTime(),
      };
      this.memorySessions.set(token, session);
      this.addSessionToIndexes(session);

      // 异步持久化到数据库
      this.persistSessionToDb(session);
    } else {
      session.lastActiveAt = now;
      session.currentPath = currentPath;
      session.ip = cleanIp;
      if (ipIsV4) session.ipv4 = cleanIp;
      if (ipIsV6) session.ipv6 = cleanIp;
      session.isDualStack = Boolean(session.ipv4 && session.ipv6);

      if (accumulatedTokens.size > 0) {
        const mergedTokens = new Set([...(session.relatedTokens || []), ...accumulatedTokens]);
        session.relatedTokens = Array.from(mergedTokens);
      }

      if (userId) {
        session.userId = userId;
        if (username && username !== '访客') {
          session.username = username;
        }
        if (nickname && nickname !== '访客') {
          session.nickname = nickname;
        }
      }

      // 只有超过 60 秒才异步刷新一次数据库活跃时间，彻底避免高频心跳导致 SQLite/MySQL 锁表
      if (now.getTime() - (session.lastDbSync || 0) > 60000) {
        session.lastDbSync = now.getTime();
        this.updateSessionActiveTimeInDb(token, now, currentPath);
      }
    }

    return { success: true, kicked: false };
  }

  /**
   * 获取当前实时统计概览
   */
  async getOverviewStats(): Promise<{
    totalOnline: number;
    userOnline: number;
    guestOnline: number;
    todayPeak: number;
    avgDurationMinutes: number;
  }> {
    const thresholdSec = this.configService.getNumber(CONFIG_KEYS.OFFLINE_THRESHOLD, 90);
    const now = Date.now();

    const activeUsers = new Set<string>();
    const activeGuestDevices = new Set<string>();
    const userIps = new Set<string>();
    let totalDurationMs = 0;
    let validSessionCount = 0;

    for (const session of this.memorySessions.values()) {
      if (session.isKicked) continue;
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      const loginTime = new Date(session.loginAt).getTime();
      if (now - lastActiveTime <= thresholdSec * 1000) {
        if (session.userId) {
          activeUsers.add(String(session.userId));
          if (session.ip) userIps.add(session.ip);
          if (session.ipv4) userIps.add(session.ipv4);
          if (session.ipv6) userIps.add(session.ipv6);
        } else {
          // 访客如果具有双栈 IP，以主 IP 或终端环境作为唯一聚合键，避免双栈访客被计算为 2 人
          const guestKey = (session.ipv4 || session.ipv6 || session.ip) + `_${session.device}`;
          activeGuestDevices.add(guestKey);
        }
        totalDurationMs += now - loginTime;
        validSessionCount++;
      }
    }

    // 过滤掉同 IP 已登录用户的访客残留
    for (const uip of userIps) {
      for (const gKey of activeGuestDevices) {
        if (gKey.startsWith(uip)) {
          activeGuestDevices.delete(gKey);
        }
      }
    }

    const userOnline = activeUsers.size;
    const guestOnline = activeGuestDevices.size;
    const totalOnline = userOnline + guestOnline;
    const avgDurationMinutes = validSessionCount > 0 ? Math.round(totalDurationMs / validSessionCount / 60000) : 0;

    // 获取今日最高在线人数（结合历史采样与当前实时）
    let todayPeak = totalOnline;
    try {
      const repo = this.app.db.getRepository('online_history_stats');
      if (repo) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const historyMax = await repo.find({
          filter: {
            sampleTime: {
              $gte: startOfDay,
            },
          },
          sort: ['-totalCount'],
          limit: 1,
        });

        if (historyMax.length > 0 && historyMax[0].totalCount > todayPeak) {
          todayPeak = historyMax[0].totalCount;
        }
      }
    } catch {}

    return {
      totalOnline,
      userOnline,
      guestOnline,
      todayPeak,
      avgDurationMinutes,
    };
  }

  /**
   * 获取在线会话列表（按用户与终端智能去重并聚合双栈 IPv4 / IPv6）
   */
  async listSessions(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    device?: string;
  }): Promise<{
    rows: any[];
    count: number;
    page: number;
    pageSize: number;
  }> {
    const thresholdSec = this.configService.getNumber(CONFIG_KEYS.OFFLINE_THRESHOLD, 90);
    const now = Date.now();
    const { page = 1, pageSize = 20 } = params;

    const rawKw = params.keyword;
    const kw = (rawKw && rawKw !== 'undefined' && rawKw !== 'null') ? String(rawKw).trim().toLowerCase() : '';
    const rawDev = params.device;
    const filterDev = (rawDev && rawDev !== 'undefined' && rawDev !== 'null') ? String(rawDev).trim() : '';

    // 1. 收集当前有效的认证用户 IP 集合（包含双栈 IP）
    const authenticatedIps = new Set<string>();
    for (const s of this.memorySessions.values()) {
      if (s.isKicked) continue;
      const lastActive = new Date(s.lastActiveAt).getTime();
      if (now - lastActive <= thresholdSec * 1000 && s.userId) {
        if (s.ip) authenticatedIps.add(s.ip);
        if (s.ipv4) authenticatedIps.add(s.ipv4);
        if (s.ipv6) authenticatedIps.add(s.ipv6);
      }
    }

    // 2. 按用户与终端维度去重，解决双栈网络同用户分裂成两条记录的问题
    const dedupMap = new Map<string, any>();
    for (const session of this.memorySessions.values()) {
      if (session.isKicked) continue;
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      // 过滤超时离线的
      if (now - lastActiveTime > thresholdSec * 1000) continue;

      // 如果是匿名访客，且该 IP 已经存在认证用户在线，说明是登录前残留，自动合并排除
      if (
        !session.userId &&
        (authenticatedIps.has(session.ip) ||
          (session.ipv4 && authenticatedIps.has(session.ipv4)) ||
          (session.ipv6 && authenticatedIps.has(session.ipv6)))
      ) {
        continue;
      }

      // 同一认证用户在相同终端设备下聚合为唯一一条展示记录
      const dedupKey = session.userId
        ? `user_${session.userId}_${session.device || 'Desktop'}`
        : `guest_${session.ipv4 || session.ipv6 || session.ip || ''}_${session.device || ''}`;

      const existing = dedupMap.get(dedupKey);
      if (!existing) {
        dedupMap.set(dedupKey, {
          ...session,
          relatedTokens: Array.from(new Set([session.token, ...(session.relatedTokens || [])])),
        });
      } else {
        // 合并双栈 IP 与关联 Token，并以最新活跃时间为准
        const newer =
          new Date(session.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()
            ? session
            : existing;
        const older = newer === session ? existing : session;

        const mergedIpv4 =
          newer.ipv4 || older.ipv4 || (isIPv4(newer.ip) ? newer.ip : (isIPv4(older.ip) ? older.ip : undefined));
        const mergedIpv6 =
          newer.ipv6 || older.ipv6 || (isIPv6(newer.ip) ? newer.ip : (isIPv6(older.ip) ? older.ip : undefined));

        const allTokens = Array.from(
          new Set([
            newer.token,
            older.token,
            ...(newer.relatedTokens || []),
            ...(older.relatedTokens || []),
          ])
        );

        dedupMap.set(dedupKey, {
          ...newer,
          ipv4: mergedIpv4,
          ipv6: mergedIpv6,
          isDualStack: Boolean(mergedIpv4 && mergedIpv6),
          relatedTokens: allTokens,
        });
      }
    }

    const activeList: any[] = [];
    for (const session of dedupMap.values()) {
      // 关键词过滤（支持根据用户名、昵称、主 IP、IPv4、IPv6 及当前路径检索）
      if (kw) {
        const matchName = String(session.username || '').toLowerCase().includes(kw);
        const matchNick = String(session.nickname || '').toLowerCase().includes(kw);
        const matchIp = String(session.ip || '').toLowerCase().includes(kw);
        const matchIpv4 = String(session.ipv4 || '').toLowerCase().includes(kw);
        const matchIpv6 = String(session.ipv6 || '').toLowerCase().includes(kw);
        const matchPath = String(session.currentPath || '').toLowerCase().includes(kw);
        if (!matchName && !matchNick && !matchIp && !matchIpv4 && !matchIpv6 && !matchPath) continue;
      }

      // 设备过滤
      if (filterDev && session.device !== filterDev) continue;

      activeList.push(session);
    }

    // 按最后活跃时间降序排序
    activeList.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());

    const total = activeList.length;
    const start = (page - 1) * pageSize;
    const rows = activeList.slice(start, start + pageSize).map((s) => ({
      ...s,
      isDualStack: Boolean(s.ipv4 && s.ipv6),
      durationMinutes: Math.max(1, Math.round((now - new Date(s.loginAt).getTime()) / 60000)),
      idleSeconds: Math.max(0, Math.round((now - new Date(s.lastActiveAt).getTime()) / 1000)),
    }));

    return {
      rows,
      count: total,
      page,
      pageSize,
    };
  }

  /**
   * 获取当前在线的所有认证用户列表（供定向广播下拉选择，带双栈信息）
   */
  getOnlineUsersList(): Array<{
    userId: number;
    username: string;
    nickname: string;
    ip: string;
    ipv4?: string;
    ipv6?: string;
    isDualStack?: boolean;
    device: string;
    token: string;
    relatedTokens?: string[];
    lastActiveAt: Date;
  }> {
    const thresholdSec = this.configService.getNumber(CONFIG_KEYS.OFFLINE_THRESHOLD, 90);
    const now = Date.now();
    const userMap = new Map<string | number, any>();

    for (const session of this.memorySessions.values()) {
      if (session.isKicked || !session.userId) continue;
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      if (now - lastActiveTime <= thresholdSec * 1000) {
        const existing = userMap.get(session.userId);
        if (!existing || new Date(session.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()) {
          const mergedIpv4 = session.ipv4 || existing?.ipv4 || (isIPv4(session.ip) ? session.ip : existing?.ip && isIPv4(existing.ip) ? existing.ip : undefined);
          const mergedIpv6 = session.ipv6 || existing?.ipv6 || (isIPv6(session.ip) ? session.ip : existing?.ip && isIPv6(existing.ip) ? existing.ip : undefined);
          const allTokens = Array.from(new Set([
            session.token,
            ...(session.relatedTokens || []),
            ...(existing?.relatedTokens || []),
            ...(existing?.token ? [existing.token] : []),
          ]));

          userMap.set(session.userId, {
            userId: Number(session.userId),
            username: session.username,
            nickname: session.nickname || session.username,
            ip: session.ip,
            ipv4: mergedIpv4,
            ipv6: mergedIpv6,
            isDualStack: Boolean(mergedIpv4 && mergedIpv6),
            device: session.device,
            token: session.token,
            relatedTokens: allTokens,
            lastActiveAt: session.lastActiveAt,
          });
        }
      }
    }

    return Array.from(userMap.values());
  }

  /**
   * 获取在线趋势走势图数据 (24小时或近7天)
   */
  async getTrendData(range: 'today' | '7days' = 'today'): Promise<{
    times: string[];
    total: number[];
    users: number[];
    guests: number[];
  }> {
    const times: string[] = [];
    const total: number[] = [];
    const users: number[] = [];
    const guests: number[] = [];

    try {
      const repo = this.app.db.getRepository('online_history_stats');
      if (!repo) return { times, total, users, guests };

      const now = new Date();
      let startTime = new Date();

      if (range === 'today') {
        startTime.setHours(0, 0, 0, 0);
      } else {
        startTime.setDate(now.getDate() - 7);
      }

      const records = await repo.find({
        filter: {
          sampleTime: {
            $gte: startTime,
          },
        },
        sort: ['sampleTime'],
        limit: 1000,
      });

      for (const r of records) {
        const d = new Date(r.sampleTime);
        const timeStr =
          range === 'today'
            ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
            : `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`;

        times.push(timeStr);
        total.push(r.totalCount || 0);
        users.push(r.userCount || 0);
        guests.push(r.guestCount || 0);
      }

      // 若历史数据不足，补充当前时间点的实时数据
      if (times.length === 0) {
        const stats = await this.getOverviewStats();
        const curTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        times.push(curTimeStr);
        total.push(stats.totalOnline);
        users.push(stats.userOnline);
        guests.push(stats.guestOnline);
      }
    } catch {}

    return { times, total, users, guests };
  }

  /**
   * 采样当前在线人数写入历史时序表
   */
  async sampleHistoryStats(): Promise<void> {
    try {
      const stats = await this.getOverviewStats();
      const repo = this.app.db.getRepository('online_history_stats');
      if (repo) {
        await repo
          .create({
            values: {
              totalCount: stats.totalOnline,
              userCount: stats.userOnline,
              guestCount: stats.guestOnline,
              sampleTime: new Date(),
            },
          })
          .catch(() => {});
      }
    } catch {}
  }

  /**
   * 获取指定 Token 的会话信息
   */
  getSession(token: string): OnlineSessionItem | undefined {
    return this.memorySessions.get(token);
  }

  /**
   * 移除并彻底清理指定 Token 及其级联的关联双栈 Token
   */
  async removeSession(token: string): Promise<string[]> {
    const session = this.memorySessions.get(token);
    const tokensToRemove = new Set<string>([token]);
    if (session?.relatedTokens) {
      session.relatedTokens.forEach((t) => tokensToRemove.add(t));
    }

    for (const t of tokensToRemove) {
      this.removeTokenFromIndexes(t);
      this.memorySessions.delete(t);
    }

    return Array.from(tokensToRemove);
  }

  /**
   * 清理过期超时的离线会话
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const thresholdSec = this.configService.getNumber(CONFIG_KEYS.OFFLINE_THRESHOLD, 90);
    const now = Date.now();
    const expiredTokens: string[] = [];

    for (const [token, session] of this.memorySessions.entries()) {
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      if (now - lastActiveTime > thresholdSec * 1000 * 2) {
        expiredTokens.push(token);

        // 归档超时离线会话（已踢出的由于在踢出动作时已直接记录，此处仅归档自然超时者）
        if (!session.isKicked) {
          AuditLogService.getInstance().recordSessionEnd(this.app.db, {
            sessionId: session.token,
            userId: session.userId ? Number(session.userId) : null,
            username: session.username,
            nickname: session.nickname,
            ip: session.ip,
            device: session.device,
            os: session.os,
            browser: session.browser,
            loginAt: session.loginAt,
            lastActiveAt: session.lastActiveAt,
            terminationReason: 'heartbeat_timeout',
            detail: '心跳中断超时，系统自动判定离线',
          });
        }
      }
    }

    for (const token of expiredTokens) {
      this.removeTokenFromIndexes(token);
      this.memorySessions.delete(token);
    }

    // 清理数据库中超期较长的记录及审计日志（每 10 分钟最多执行一次，避免频繁操作 SQLite 引发锁定）
    const nowSec = Math.floor(now / 1000);
    if (nowSec % 600 < 30) {
      try {
        const sessionModel = this.app.db.getModel('online_sessions');
        if (sessionModel && expiredTokens.length > 0) {
          const expireDate = new Date(now - thresholdSec * 1000 * 4);
          await sessionModel
            .destroy({
              where: {
                lastActiveAt: {
                  [Op.lt]: expireDate,
                },
              },
            })
            .catch(() => {});
        }

        // 清理过期历史审计日志
        const retentionDays = this.configService.getNumber(CONFIG_KEYS.AUDIT_LOG_RETENTION_DAYS, 30);
        await AuditLogService.getInstance().cleanupOldLogs(this.app.db, retentionDays);

        // 清理超过 30 天的过时历史时序采样数据，防止表无限膨胀
        const historyModel = this.app.db.getModel('online_history_stats');
        if (historyModel) {
          const expireHistoryDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          await historyModel
            .destroy({
              where: {
                sampleTime: {
                  [Op.lt]: expireHistoryDate,
                },
              },
            })
            .catch(() => {});
        }
      } catch {}
    }

    // 清理踢出记录黑名单过期项目
    try {
      this.sessionControlService.cleanupExpiredKicks();
    } catch {}
  }

  private async loadActiveSessionsFromDb(): Promise<void> {
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (!repo) return;

      const thresholdSec = this.configService.getNumber(CONFIG_KEYS.OFFLINE_THRESHOLD, 90);
      const activeSince = new Date(Date.now() - thresholdSec * 1000);

      const dbSessions = await repo.find({
        filter: {
          lastActiveAt: {
            $gte: activeSince,
          },
          isKicked: false,
        },
      });

      for (const s of dbSessions) {
        const sessionItem: OnlineSessionItem = {
          id: s.id,
          token: s.token,
          userId: s.userId,
          username: s.username,
          nickname: s.nickname,
          ip: s.ip,
          userAgent: s.userAgent,
          device: s.device,
          os: s.os,
          browser: s.browser,
          currentPath: s.currentPath || '/',
          loginAt: new Date(s.loginAt || s.createdAt),
          lastActiveAt: new Date(s.lastActiveAt || s.updatedAt),
          isKicked: Boolean(s.isKicked),
          kickReason: s.kickReason,
        };
        this.memorySessions.set(s.token, sessionItem);
        this.addSessionToIndexes(sessionItem);
      }
    } catch {}
  }

  private async persistSessionToDb(session: OnlineSessionItem): Promise<void> {
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (!repo) return;

      const existing = await repo.findOne({
        filter: { token: session.token },
      });

      if (existing) {
        session.id = existing.id;
        await repo.update({
          filterByTk: existing.id,
          values: {
            lastActiveAt: session.lastActiveAt,
            currentPath: session.currentPath,
            isKicked: false,
          },
        }).catch(() => {});
        return;
      }

      const created = await repo.create({
        values: {
          token: session.token,
          userId: session.userId,
          username: session.username,
          nickname: session.nickname,
          ip: session.ip,
          userAgent: session.userAgent,
          device: session.device,
          os: session.os,
          browser: session.browser,
          currentPath: session.currentPath,
          loginAt: session.loginAt,
          lastActiveAt: session.lastActiveAt,
          isKicked: false,
        },
      }).catch(() => {});

      if (created) {
        session.id = created.id;
      }
    } catch {}
  }

  private async updateSessionActiveTimeInDb(token: string, lastActiveAt: Date, currentPath: string): Promise<void> {
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (!repo) return;

      await repo.update({
        filter: { token },
        values: { lastActiveAt, currentPath },
      }).catch(() => {});
    } catch {}
  }
}
