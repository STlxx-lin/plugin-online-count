import type { Database } from '@nocobase/database';
import { Op } from 'sequelize';

export interface ReadUserItem {
  userId?: number | null;
  username?: string | null;
  nickname?: string | null;
  ip?: string | null;
  readAt: string;
}

export interface BroadcastMessage {
  id: string; // broadcastId
  title: string;
  content: string;
  mode: 'modal' | 'notification';
  scope: 'all' | 'user' | 'session';
  targetUserId?: number | null;
  targetUsername?: string | null;
  targetSessionId?: string | null;
  type?: 'info' | 'warning' | 'error' | 'success';
  status?: 'active' | 'revoked' | 'expired';
  createdAt: number;
  expiresAt: number;
  readCount?: number;
  readUsers?: ReadUserItem[];
}

export class BroadcastService {
  private static instance: BroadcastService;
  private messages: BroadcastMessage[] = [];
  private db?: Database;

  public static getInstance(): BroadcastService {
    if (!BroadcastService.instance) {
      BroadcastService.instance = new BroadcastService();
    }
    return BroadcastService.instance;
  }

  public setDb(db: Database) {
    this.db = db;
    this.loadFromDb();
  }

  /**
   * 服务启动时从数据库加载未过期且未撤回的广播
   */
  public async loadFromDb() {
    if (!this.db) return;
    try {
      const repo = this.db.getRepository('online_broadcasts');
      if (!repo) return;
      const now = new Date();
      const records = await repo.find({
        filter: {
          status: 'active',
          expiresAt: {
            $gt: now,
          },
        },
      });

      this.messages = records.map((r: any) => ({
        id: r.broadcastId,
        title: r.title,
        content: r.content,
        mode: r.mode || 'notification',
        scope: r.scope || 'all',
        targetUserId: r.targetUserId ? Number(r.targetUserId) : null,
        targetUsername: r.targetUsername || null,
        targetSessionId: r.targetSessionId || null,
        type: r.type || 'info',
        status: r.status || 'active',
        createdAt: new Date(r.createdAt).getTime(),
        expiresAt: new Date(r.expiresAt).getTime(),
        readCount: r.readCount || 0,
        readUsers: Array.isArray(r.readUsers) ? r.readUsers : [],
      }));
    } catch (err) {
      console.warn('[BroadcastService] loadFromDb failed:', err);
    }
  }

  /**
   * 发布即时广播并持久化
   */
  async publish(
    params: {
      title: string;
      content: string;
      mode?: 'modal' | 'notification';
      scope?: 'all' | 'user' | 'session';
      targetUserId?: number | null;
      targetUsername?: string | null;
      targetSessionId?: string | null;
      type?: 'info' | 'warning' | 'error' | 'success';
      ttlMinutes?: number;
    },
    db?: Database
  ): Promise<BroadcastMessage> {
    const database = db || this.db;
    const now = Date.now();
    const ttlMinutes = params.ttlMinutes && params.ttlMinutes > 0 ? params.ttlMinutes : 15;
    const expiresAt = now + ttlMinutes * 60 * 1000;
    const broadcastId = `bc_${now}_${Math.random().toString(36).substring(2, 8)}`;

    const msg: BroadcastMessage = {
      id: broadcastId,
      title: params.title || '系统通知',
      content: params.content,
      mode: params.mode || 'notification',
      scope: params.scope || 'all',
      targetUserId: params.targetUserId ? Number(params.targetUserId) : null,
      targetUsername: params.targetUsername || null,
      targetSessionId: params.targetSessionId || null,
      type: params.type || 'info',
      status: 'active',
      createdAt: now,
      expiresAt,
      readCount: 0,
      readUsers: [],
    };

    // 内存快速池
    this.cleanExpired();
    this.messages.push(msg);
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }

    // 数据库持久化
    if (database) {
      try {
        const repo = database.getRepository('online_broadcasts');
        if (repo) {
          await repo.create({
            values: {
              broadcastId: msg.id,
              title: msg.title,
              content: msg.content,
              mode: msg.mode,
              scope: msg.scope,
              type: msg.type,
              targetUserId: msg.targetUserId,
              targetUsername: msg.targetUsername,
              targetSessionId: msg.targetSessionId,
              status: 'active',
              expiresAt: new Date(expiresAt),
              readCount: 0,
              readUsers: [],
              createdAt: new Date(now),
              updatedAt: new Date(now),
            },
          });
        }
      } catch (err) {
        console.warn('[BroadcastService] persist to DB failed:', err);
      }
    }

    return msg;
  }

  /**
   * 提前撤回广播
   */
  async revoke(targetId: string | number, db?: Database): Promise<boolean> {
    if (!targetId) return false;
    const database = db || this.db;
    const idStr = String(targetId);

    // 1. 从内存初筛
    this.messages = this.messages.filter((m) => m.id !== idStr);

    // 2. 数据库更新为 revoked
    if (database) {
      try {
        const repo = database.getRepository('online_broadcasts');
        if (repo) {
          let record = await repo.findOne({ filter: { broadcastId: idStr } });
          if (!record && !isNaN(Number(targetId))) {
            record = await repo.findOne({ filterByTk: Number(targetId) });
          }
          if (record) {
            await repo.update({
              filterByTk: record.id,
              values: { status: 'revoked' },
            });
            this.messages = this.messages.filter((m) => m.id !== record.broadcastId && m.id !== idStr);
            return true;
          }
        }
      } catch (err) {
        console.warn('[BroadcastService] revoke failed:', err);
      }
    }
    return true;
  }

  /**
   * 客户端已读回执追踪
   */
  async recordRead(
    messageIds: string[],
    clientInfo: {
      userId?: number | null;
      username?: string | null;
      nickname?: string | null;
      ip?: string | null;
      sessionId?: string | null;
    },
    db?: Database
  ): Promise<void> {
    if (!messageIds || messageIds.length === 0) return;
    const database = db || this.db;
    const nowStr = new Date().toISOString();

    for (const id of messageIds) {
      // 更新内存
      const memMsg = this.messages.find((m) => m.id === id);
      if (memMsg) {
        if (!memMsg.readUsers) memMsg.readUsers = [];
        const already = memMsg.readUsers.some(
          (u) =>
            (clientInfo.userId && u.userId === clientInfo.userId) ||
            (clientInfo.sessionId && u.ip === clientInfo.ip)
        );
        if (!already) {
          memMsg.readUsers.push({
            userId: clientInfo.userId || null,
            username: clientInfo.username || (clientInfo.userId ? `User #${clientInfo.userId}` : '访客'),
            nickname: clientInfo.nickname || clientInfo.username || '访客',
            ip: clientInfo.ip || null,
            readAt: nowStr,
          });
          memMsg.readCount = memMsg.readUsers.length;
        }
      }

      // 更新数据库
      if (database) {
        try {
          const repo = database.getRepository('online_broadcasts');
          if (repo) {
            const record = await repo.findOne({ filter: { broadcastId: id } });
            if (record) {
              let readUsers: any[] = [];
              if (Array.isArray(record.readUsers)) {
                readUsers = [...record.readUsers];
              } else if (typeof record.readUsers === 'string') {
                try {
                  const p = JSON.parse(record.readUsers);
                  if (Array.isArray(p)) readUsers = [...p];
                } catch {}
              }
              const already = readUsers.some(
                (u: any) =>
                  (clientInfo.userId && u.userId === clientInfo.userId) ||
                  (clientInfo.sessionId && u.ip === clientInfo.ip)
              );
              if (!already) {
                readUsers.push({
                  userId: clientInfo.userId || null,
                  username: clientInfo.username || (clientInfo.userId ? `User #${clientInfo.userId}` : '访客'),
                  nickname: clientInfo.nickname || clientInfo.username || '访客',
                  ip: clientInfo.ip || null,
                  readAt: nowStr,
                });
                await repo.update({
                  filterByTk: record.id,
                  values: {
                    readCount: readUsers.length,
                    readUsers,
                  },
                });
              }
            }
          }
        } catch {}
      }
    }
  }

  /**
   * 为指定会话拉取未过期广播
   */
  getPendingForClient(params: {
    sessionId: string;
    userId?: number | null;
    seenMessageIds?: string[];
  }): BroadcastMessage[] {
    const now = Date.now();
    const seenSet = new Set(params.seenMessageIds || []);

    return this.messages.filter((msg) => {
      if (msg.status && msg.status !== 'active') return false;
      if (msg.expiresAt < now) return false;
      if (seenSet.has(msg.id)) return false;

      if (msg.scope === 'all') return true;
      if (msg.scope === 'user' && params.userId && msg.targetUserId === params.userId) {
        return true;
      }
      if (msg.scope === 'session' && params.sessionId && msg.targetSessionId === params.sessionId) {
        return true;
      }
      return false;
    });
  }

  /**
   * 分页查询历史广播列表
   */
  async listBroadcasts(
    params: {
      page?: number;
      pageSize?: number;
      status?: string;
      keyword?: string;
    },
    db?: Database
  ): Promise<{ rows: any[]; count: number; page: number; pageSize: number }> {
    const database = db || this.db;
    const page = params.page ? Math.max(1, Number(params.page)) : 1;
    const pageSize = params.pageSize ? Math.max(1, Number(params.pageSize)) : 10;
    const now = new Date();

    if (!database) {
      return { rows: [], count: 0, page, pageSize };
    }

    try {
      const repo = database.getRepository('online_broadcasts');
      if (!repo) return { rows: [], count: 0, page, pageSize };

      const filter: any = {};
      const status = params.status;
      if (status && status !== 'all') {
        if (status === 'active') {
          filter.status = 'active';
          filter.expiresAt = { $gt: now };
        } else if (status === 'expired') {
          filter[Op.or] = [{ status: 'expired' }, { status: 'active', expiresAt: { $lte: now } }];
        } else if (status === 'revoked') {
          filter.status = 'revoked';
        }
      }

      if (params.keyword && String(params.keyword).trim()) {
        const kw = String(params.keyword).trim();
        filter[Op.or] = [
          { title: { [Op.like]: `%${kw}%` } },
          { content: { [Op.like]: `%${kw}%` } },
        ];
      }

      const [records, count] = await repo.findAndCount({
        filter,
        sort: ['-createdAt'],
        offset: (page - 1) * pageSize,
        limit: pageSize,
      });

      const rows = records.map((r: any) => {
        let displayStatus = r.status || 'active';
        if (displayStatus === 'active' && new Date(r.expiresAt).getTime() <= now.getTime()) {
          displayStatus = 'expired';
        }
        let rowReadUsers: any[] = [];
        if (Array.isArray(r.readUsers)) {
          rowReadUsers = r.readUsers;
        } else if (typeof r.readUsers === 'string') {
          try {
            const p = JSON.parse(r.readUsers);
            if (Array.isArray(p)) rowReadUsers = p;
          } catch {}
        }

        return {
          id: r.id,
          broadcastId: r.broadcastId,
          title: r.title,
          content: r.content,
          mode: r.mode,
          scope: r.scope,
          type: r.type,
          targetUserId: r.targetUserId,
          targetUsername: r.targetUsername,
          targetSessionId: r.targetSessionId,
          status: displayStatus,
          expiresAt: new Date(r.expiresAt).getTime(),
          readCount: r.readCount || rowReadUsers.length,
          readUsers: rowReadUsers,
          createdAt: new Date(r.createdAt).getTime(),
        };
      });

      return { rows, count, page, pageSize };
    } catch (err) {
      console.warn('[BroadcastService] listBroadcasts error:', err);
      return { rows: [], count: 0, page, pageSize };
    }
  }

  /**
   * 清理过期消息
   */
  private cleanExpired() {
    const now = Date.now();
    this.messages = this.messages.filter((msg) => msg.expiresAt >= now && msg.status === 'active');
  }
}
