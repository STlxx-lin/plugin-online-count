import { Application } from '@nocobase/server';
import { CronJob } from 'cron';
import { OnlineConfigService } from './online-config.service';
import { SessionControlService } from './session-control.service';
import { CONFIG_KEYS } from '../constants';
import { parseUserAgent } from '../utils/device-parser';

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
    const trackGuests = this.configService.getBoolean(CONFIG_KEYS.TRACK_GUESTS, false);
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
        }
      }
    }

    const now = new Date();
    const { browser, os, device } = parseUserAgent(userAgent);

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
      if (userId && !session.userId) {
        session.userId = userId;
        session.username = username || `User_${userId}`;
        session.nickname = nickname || username || '用户';
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

    let totalOnline = 0;
    let userOnline = 0;
    let guestOnline = 0;
    let totalDurationMs = 0;

    for (const session of this.memorySessions.values()) {
      if (session.isKicked) continue;
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      const loginTime = new Date(session.loginAt).getTime();
      if (now - lastActiveTime <= thresholdSec * 1000) {
        totalOnline++;
        if (session.userId) {
          userOnline++;
        } else {
          guestOnline++;
        }
        totalDurationMs += now - loginTime;
      }
    }

    const avgDurationMinutes = totalOnline > 0 ? Math.round(totalDurationMs / totalOnline / 60000) : 0;

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
    const { page = 1, pageSize = 20, keyword = '', device = '' } = params;

    const activeList: OnlineSessionItem[] = [];
    const kw = keyword.trim().toLowerCase();

    for (const session of this.memorySessions.values()) {
      if (session.isKicked) continue;
      const lastActiveTime = new Date(session.lastActiveAt).getTime();
      // 过滤超时离线的
      if (now - lastActiveTime > thresholdSec * 1000) continue;

      // 关键词过滤
      if (kw) {
        const matchName = session.username?.toLowerCase().includes(kw);
        const matchNick = session.nickname?.toLowerCase().includes(kw);
        const matchIp = session.ip?.toLowerCase().includes(kw);
        const matchPath = session.currentPath?.toLowerCase().includes(kw);
        if (!matchName && !matchNick && !matchIp && !matchPath) continue;
      }

      // 设备过滤
      if (device && session.device !== device) continue;

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
        await repo.create({
          values: {
            totalCount: stats.totalOnline,
            userCount: stats.userOnline,
            guestCount: stats.guestOnline,
            sampleTime: new Date(),
          },
        });
      }
    } catch {}
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
      }
    }

    for (const token of expiredTokens) {
      this.memorySessions.delete(token);
    }

    // 清理数据库中超期较长的记录
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (repo && expiredTokens.length > 0) {
        const expireDate = new Date(now - thresholdSec * 1000 * 2);
        await repo.destroy({
          filter: {
            lastActiveAt: {
              $lt: expireDate,
            },
          },
        });
      }
    } catch {}

    // 清理踢出记录黑名单过期项目
    this.sessionControlService.cleanupExpiredKicks();
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
