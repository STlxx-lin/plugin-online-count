export interface BroadcastMessage {
  id: string;
  title: string;
  content: string;
  mode: 'modal' | 'notification';
  scope: 'all' | 'user' | 'session';
  targetUserId?: number | null;
  targetSessionId?: string | null;
  type?: 'info' | 'warning' | 'error' | 'success';
  createdAt: number;
  expiresAt: number;
}

export class BroadcastService {
  private static instance: BroadcastService;
  private messages: BroadcastMessage[] = [];

  public static getInstance(): BroadcastService {
    if (!BroadcastService.instance) {
      BroadcastService.instance = new BroadcastService();
    }
    return BroadcastService.instance;
  }

  /**
   * 发布广播消息
   */
  publish(params: {
    title: string;
    content: string;
    mode?: 'modal' | 'notification';
    scope?: 'all' | 'user' | 'session';
    targetUserId?: number | null;
    targetSessionId?: string | null;
    type?: 'info' | 'warning' | 'error' | 'success';
    ttlMinutes?: number;
  }): BroadcastMessage {
    const now = Date.now();
    const ttlMinutes = params.ttlMinutes && params.ttlMinutes > 0 ? params.ttlMinutes : 15;
    const msg: BroadcastMessage = {
      id: `bc_${now}_${Math.random().toString(36).substring(2, 8)}`,
      title: params.title || '系统广播',
      content: params.content,
      mode: params.mode || 'notification',
      scope: params.scope || 'all',
      targetUserId: params.targetUserId ? Number(params.targetUserId) : null,
      targetSessionId: params.targetSessionId || null,
      type: params.type || 'info',
      createdAt: now,
      expiresAt: now + ttlMinutes * 60 * 1000,
    };

    // 清理过期消息
    this.cleanExpired();
    this.messages.push(msg);

    // 内存消息最多保留 100 条
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }

    return msg;
  }

  /**
   * 为指定会话拉取适用的未过期广播消息
   */
  getPendingForClient(params: {
    sessionId: string;
    userId?: number | null;
    seenMessageIds?: string[];
  }): BroadcastMessage[] {
    const now = Date.now();
    const seenSet = new Set(params.seenMessageIds || []);

    return this.messages.filter((msg) => {
      // 检查是否过期
      if (msg.expiresAt < now) return false;

      // 检查是否已消费过
      if (seenSet.has(msg.id)) return false;

      // 全员广播
      if (msg.scope === 'all') return true;

      // 定向用户广播
      if (msg.scope === 'user' && params.userId && msg.targetUserId === params.userId) {
        return true;
      }

      // 定向会话广播
      if (msg.scope === 'session' && params.sessionId && msg.targetSessionId === params.sessionId) {
        return true;
      }

      return false;
    });
  }

  /**
   * 清理过期消息
   */
  private cleanExpired() {
    const now = Date.now();
    this.messages = this.messages.filter((msg) => msg.expiresAt >= now);
  }
}
