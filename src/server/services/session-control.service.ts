import { Application } from '@nocobase/server';

export interface KickoutRecord {
  token: string;
  userId?: number | string | null;
  reason: string;
  kickedAt: Date;
}

export class SessionControlService {
  private app: Application;
  // 内存黑名单快速查重（Token -> 踢出原因与时间）
  private kickedTokens = new Map<string, KickoutRecord>();

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * 检查某个 Token 是否被强制下线
   */
  isTokenKicked(token: string): { kicked: boolean; reason?: string } {
    if (!token) return { kicked: false };
    const record = this.kickedTokens.get(token);
    if (record) {
      return { kicked: true, reason: record.reason };
    }
    return { kicked: false };
  }

  /**
   * 强制踢出指定会话
   */
  async kickoutToken(token: string, reason = '已被管理员强制下线'): Promise<boolean> {
    if (!token) return false;

    const record: KickoutRecord = {
      token,
      reason,
      kickedAt: new Date(),
    };

    this.kickedTokens.set(token, record);

    // 同步更新数据库中的会话记录
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (repo) {
        await repo.update({
          filter: { token },
          values: { isKicked: true, kickReason: reason },
        });
      }
    } catch {}

    return true;
  }

  /**
   * 强制踢出某个用户的所有在线会话（例如单点登录互斥踢出旧会话，或封禁用户）
   */
  async kickoutUser(userId: number | string, excludeToken?: string, reason = '账号在另一台设备登录，您已被迫下线'): Promise<number> {
    if (!userId) return 0;

    let count = 0;
    try {
      const repo = this.app.db.getRepository('online_sessions');
      if (repo) {
        const sessions = await repo.find({
          filter: { userId, isKicked: false },
        });

        for (const s of sessions) {
          if (excludeToken && s.token === excludeToken) {
            continue;
          }
          this.kickedTokens.set(s.token, {
            token: s.token,
            userId,
            reason,
            kickedAt: new Date(),
          });
          await repo.update({
            filterByTk: s.id,
            values: { isKicked: true, kickReason: reason },
          });
          count++;
        }
      }
    } catch {}

    return count;
  }

  /**
   * 定期清理黑名单中超过 24 小时的过期 Token，防止内存泄漏
   */
  cleanupExpiredKicks(maxAgeMs = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [token, item] of this.kickedTokens.entries()) {
      if (now - item.kickedAt.getTime() > maxAgeMs) {
        this.kickedTokens.delete(token);
      }
    }
  }
}
