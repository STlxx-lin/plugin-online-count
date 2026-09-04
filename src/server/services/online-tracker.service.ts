import { Application } from '@nocobase/server';
import { CronJob } from 'cron';
import { OnlineConfigService } from './online-config.service';
import { SessionControlService } from './session-control.service';
import { CONFIG_KEYS } from '../constants';
import { parseUserAgent } from '../utils/device-parser';
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

    // 3. 检查单点登录并发策略
    const concurrentPolicy = this.configService.getString(CONFIG_KEYS.CONCURRENT_POLICY, 'allow_multiple');
    if (userId && concurrentPolicy === 'single_kick_previous') {
      // 踢出该用户的其它活跃会话
      for (const [otherToken, s] of this.memorySessions.entries()) {
        if (s.userId === userId && otherToken !== token && !s.isKicked) {
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

    const now = new Date();
    const { browser, os, device } = parseUserAgent(userAgent);

    // 同设备旧会话与登录前访客会话自动接替淘汰
    if (userId) {
      for (const [otherToken, s] of this.memorySessions.entries()) {
        if (otherToken !== token && !s.isKicked) {
          // 同一用户在相同 IP 和终端类型下，旧 token 视为已被新会话接替，自动清理
          const isSameUserDevice = String(s.userId) === String(userId) && s.ip === ip && s.device === device;
          if (isSameUserDevice) {
            this.memorySessions.delete(otherToken);
          }
          // 同一 IP 下的未登录访客（如 /signin 登录页），在认证用户上线后自动合并清理
          const isGuestOnSameIp = !s.userId && s.ip === ip;
          if (isGuestOnSameIp) {
            this.memorySessions.delete(otherToken);
          }
        }
      }
    }

    let session = this.memorySessions.get(token);
    if (!session) {
      session = {
        token,
        userId: userId || null,
        username: username || (userId ? `User_${userId}` : '访客'),
        nickname: nickname || username || '访客',
        ip,
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

      // 异步持久化到数据库
      this.persistSessionToDb(session);
    } else {
      session.lastActiveAt = now;
      session.currentPath = currentPath;
      session.ip = ip;
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
    const activeGuestIps = new Set<string>();
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
        } else {
          if (session.ip) activeGuestIps.add(session.ip);
        }
        totalDurationMs += now - loginTime;
        validSessionCount++;
      }
    }

    // 已登录的 IP 自动从访客集合剔除（同一自然人登录前后的接替）
    for (const uip of userIps) {
      activeGuestIps.delete(uip);
    }

    const userOnline = activeUsers.size;
    const guestOnline = activeGuestIps.size;
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
   * 获取在线会话列表
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

    // 1. 收集当前有效的认证用户 IP 集合
    const authenticatedIps = new Set<string>();
    for (const s of this.memorySessions.values()) {
      if (s.isKicked) continue;
      const lastActive = new Date(s.lastActiveAt).getTime();
      if (now - lastActive <= thresholdSec * 1000 && s.userId && s.ip) {
        authenticatedIps.add(s.ip);
      }
    }

    // 2. 按用户/访客与终端维度去重，只保留最新活跃的一条
    const dedupMap = new Map<string, any>();
    for (const session of this.memorySessions.values()) {
      if (session.isKicked) continue;
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      // 过滤超时离线的
      if (now - lastActiveTime > thresholdSec * 1000) continue;

      // 如果是匿名访客，且该 IP 已经存在认证用户在线，说明是登录前残留，自动合并排除
      if (!session.userId && session.ip && authenticatedIps.has(session.ip)) {
        continue;
      }

      // 同一用户在相同 IP 和终端类型下，只保留最后活跃时间最新的一条会话
      const dedupKey = session.userId
        ? `user_${session.userId}_${session.ip || ''}_${session.device || ''}`
        : `guest_${session.ip || ''}_${session.device || ''}`;

      const existing = dedupMap.get(dedupKey);
      if (!existing || new Date(session.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()) {
        dedupMap.set(dedupKey, session);
      }
    }

    const activeList: any[] = [];
    for (const session of dedupMap.values()) {
      // 关键词过滤
      if (kw) {
        const matchName = String(session.username || '').toLowerCase().includes(kw);
        const matchNick = String(session.nickname || '').toLowerCase().includes(kw);
        const matchIp = String(session.ip || '').toLowerCase().includes(kw);
        const matchPath = String(session.currentPath || '').toLowerCase().includes(kw);
        if (!matchName && !matchNick && !matchIp && !matchPath) continue;
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
   * 获取当前在线的所有认证用户列表（供定向广播下拉选择）
   */
  getOnlineUsersList(): Array<{
    userId: number;
    username: string;
    nickname: string;
    ip: string;
    device: string;
    token: string;
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
          userMap.set(session.userId, {
            userId: Number(session.userId),
            username: session.username,
            nickname: session.nickname || session.username,
            ip: session.ip,
            device: session.device,
            token: session.token,
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
      this.memorySessions.delete(token);
    }

    // 清理数据库中超期较长的记录及审计日志（每 10 分钟最多执行一次，避免频繁操作 SQLite 引发锁定）
    const nowSec = Math.floor(now / 1000);
    if (nowSec % 600 < 30) {
      try {
        const repo = this.app.db.getRepository('online_sessions');
        if (repo && expiredTokens.length > 0) {
          const expireDate = new Date(now - thresholdSec * 1000 * 4);
          await repo
            .destroy({
              filter: {
                lastActiveAt: {
                  $lt: expireDate,
                },
              },
            })
            .catch(() => {});
        }

        // 清理过期历史审计日志
        const retentionDays = this.configService.getNumber(CONFIG_KEYS.AUDIT_LOG_RETENTION_DAYS, 30);
        await AuditLogService.getInstance().cleanupOldLogs(this.app.db, retentionDays);
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
        this.memorySessions.set(s.token, {
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
        });
      }
    } catch {}
  }

  private async persistSessionToDb(session: OnlineSessionItem): Promise<void> {
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (!repo) return;

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
      });
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
