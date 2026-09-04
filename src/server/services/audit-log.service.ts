import type { Database } from '@nocobase/database';
import { Op } from 'sequelize';

export interface RecordSessionEndParams {
  sessionId?: string;
  userId?: number | null;
  username?: string | null;
  nickname?: string | null;
  ip?: string | null;
  device?: string | null;
  os?: string | null;
  browser?: string | null;
  loginAt?: Date | string | null;
  lastActiveAt?: Date | string | null;
  terminationReason: 'kickout' | 'mutex_kickout' | 'heartbeat_timeout' | 'idle_timeout' | 'manual_logout' | string;
  detail?: string;
}

export class AuditLogService {
  private static instance: AuditLogService;

  public static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService();
    }
    return AuditLogService.instance;
  }

  /**
   * 归档记录会话结束审计日志
   */
  async recordSessionEnd(db: Database, params: RecordSessionEndParams): Promise<void> {
    try {
      const repo = db.getRepository('online_audit_logs');
      if (!repo) return;

      const now = new Date();
      let loginDate = params.loginAt ? new Date(params.loginAt) : (params.lastActiveAt ? new Date(params.lastActiveAt) : now);
      if (isNaN(loginDate.getTime())) {
        loginDate = now;
      }

      const durationSeconds = Math.max(0, Math.round((now.getTime() - loginDate.getTime()) / 1000));

      await repo.create({
        values: {
          sessionId: params.sessionId || '',
          userId: params.userId || null,
          username: params.username || (params.userId ? `User #${params.userId}` : '访客 (Guest)'),
          nickname: params.nickname || (params.userId ? '' : '访客'),
          ip: params.ip || '127.0.0.1',
          device: params.device || 'Desktop',
          os: params.os || 'Unknown',
          browser: params.browser || 'Unknown',
          loginAt: loginDate,
          logoutAt: now,
          durationSeconds,
          terminationReason: params.terminationReason,
          detail: params.detail || '',
        },
      });
    } catch (err: any) {
      // 避免审计写入影响主业务流程
      console.error('[OnlineCount AuditLog] Failed to record session end:', err?.message || err);
    }
  }

  /**
   * 分页获取审计日志
   */
  async getAuditLogs(
    db: Database,
    options: {
      page?: number;
      pageSize?: number;
      username?: string;
      terminationReason?: string;
    } = {}
  ) {
    const repo = db.getRepository('online_audit_logs');
    if (!repo) return { rows: [], count: 0, page: 1, pageSize: 20 };

    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));

    const filter: any = {};
    if (options.username && options.username.trim()) {
      filter[Op.or] = [
        { username: { [Op.like]: `%${options.username.trim()}%` } },
        { nickname: { [Op.like]: `%${options.username.trim()}%` } },
      ];
    }
    if (options.terminationReason && options.terminationReason.trim()) {
      filter.terminationReason = options.terminationReason.trim();
    }

    const [rows, count] = await repo.findAndCount({
      filter,
      offset: (page - 1) * pageSize,
      limit: pageSize,
      sort: ['-logoutAt'],
    });

    return {
      rows,
      count,
      page,
      pageSize,
    };
  }

  /**
   * 清理超过保留天数的历史审计日志
   */
  async cleanupOldLogs(db: Database, retentionDays = 30): Promise<number> {
    try {
      const repo = db.getRepository('online_audit_logs');
      if (!repo) return 0;

      const expireThreshold = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const deletedCount = await repo.destroy({
        filter: {
          logoutAt: {
            [Op.lt]: expireThreshold,
          },
        },
      });
      return typeof deletedCount === 'number' ? deletedCount : 0;
    } catch (err: any) {
      console.error('[OnlineCount AuditLog] Cleanup failed:', err?.message || err);
      return 0;
    }
  }
}
