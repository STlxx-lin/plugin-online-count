import { Context, Next } from '@nocobase/actions';
import { OnlineTrackerService } from '../services/online-tracker.service';
import { SessionControlService } from '../services/session-control.service';
import { OnlineConfigService } from '../services/online-config.service';
import { extractClientIp } from '../utils/device-parser';
import { BroadcastService } from '../services/broadcast.service';
import { AuditLogService } from '../services/audit-log.service';
import { CONFIG_KEYS } from '../constants';

function parseJwtPayload(token: string): any {
  try {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '').trim();
    const parts = cleanToken.split('.');
    if (parts.length >= 2) {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) {
        b64 += '=';
      }
      const payloadStr = Buffer.from(b64, 'base64').toString('utf-8');
      return JSON.parse(payloadStr);
    }
  } catch {}
  return null;
}

function getParams(ctx: Context): Record<string, any> {
  const query = ctx.query || ctx.request?.query || {};
  const actionParams = ctx.action?.params || {};
  const values = actionParams.values || {};
  const body = (typeof ctx.request?.body === 'object' && ctx.request.body) ? (ctx.request.body as Record<string, any>) : {};

  return {
    ...query,
    ...actionParams,
    ...values,
    ...body,
  };
}

export function createOnlineCountResource(
  trackerService: OnlineTrackerService,
  sessionControlService: SessionControlService,
  configService: OnlineConfigService,
) {
  const broadcastService = BroadcastService.getInstance();
  const auditLogService = AuditLogService.getInstance();

  return {
    name: 'onlineCount',
    actions: {
      /**
       * 客户端心跳上报
       */
      heartbeat: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        let currentUser = ctx.state?.currentUser;

        // 提取 Token
        let token = params.token;
        if (!token) {
          const authHeader = ctx.headers['authorization'] || ctx.headers['Authorization'];
          if (authHeader && typeof authHeader === 'string') {
            token = authHeader.replace(/^Bearer\s+/i, '').trim();
          }
        }
        if (!token && ctx.cookies) {
          token = ctx.cookies.get('token') || ctx.cookies.get('SESSION') || '';
        }

        let resolvedUserId = currentUser?.id || params.userId;

        // 1. 如果没有 resolvedUserId，通过原生 Base64 解码 JWT Payload 获取 userId
        if (!resolvedUserId && token) {
          const payload = parseJwtPayload(token);
          if (payload) {
            resolvedUserId = payload.userId || payload.id || payload.sub;
          }
        }

        // 2. 如果有了 userId 但还没有完整 user 对象，从数据库 users 表快速查出真实用户名与昵称
        if (resolvedUserId && (!currentUser || !currentUser.username)) {
          try {
            const userRepo = ctx.db.getRepository('users');
            if (userRepo) {
              currentUser = await userRepo.findOne({
                filter: { id: resolvedUserId },
              });
            }
          } catch {}
        }

        const ip = extractClientIp(ctx);
        const userAgent = ctx.headers['user-agent'] || params.userAgent || '';
        const currentPath = params.currentPath || '/';

        if (!token) {
          if (currentUser?.id) {
            token = `user_${currentUser.id}_${ip}`;
          } else if (params.userId) {
            token = `user_${params.userId}_${ip}`;
          } else {
            token = `anonymous_${ip}`;
          }
        }

        const finalUserId = currentUser?.id || params.userId || null;
        const finalUsername = currentUser?.username || currentUser?.email || params.username || (finalUserId ? `User_${finalUserId}` : null);
        const finalNickname = currentUser?.nickname || currentUser?.username || params.nickname || finalUsername || null;

        const result = await trackerService.recordHeartbeat({
          token,
          userId: finalUserId,
          username: finalUsername,
          nickname: finalNickname,
          ip,
          userAgent,
          currentPath,
        });

        // 检查是否有给当前客户端/用户的即时广播或通知
        const seenMessageIds = Array.isArray(params.seenMessageIds) ? params.seenMessageIds : [];
        const pendingBroadcasts = broadcastService.getPendingForClient({
          sessionId: token,
          userId: finalUserId,
          seenMessageIds,
        });

        const idleTimeoutMinutes = configService.getNumber(CONFIG_KEYS.IDLE_TIMEOUT_MINUTES, 30);

        ctx.body = {
          ...result,
          idleTimeoutMinutes,
          broadcasts: pendingBroadcasts,
        };
        await next();
      },

      /**
       * 实时概览数据看板
       */
      getStats: async (ctx: Context, next: Next) => {
        const stats = await trackerService.getOverviewStats();
        ctx.body = stats;
        await next();
      },

      /**
       * 在线会话列表
       */
      listSessions: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const result = await trackerService.listSessions({
          page: params.page ? Number(params.page) : 1,
          pageSize: params.pageSize ? Number(params.pageSize) : 20,
          keyword: params.keyword ? String(params.keyword) : '',
          device: params.device ? String(params.device) : '',
        });
        ctx.body = result;
        await next();
      },

      /**
       * 强制下线（踢出会话）
       */
      kickout: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const { token, userId, reason = '已被系统管理员强制下线' } = params;

        if (!token && !userId) {
          ctx.throw(400, 'token or userId is required for kickout');
        }

        let success = false;
        if (token) {
          const sessionInfo = trackerService.getSession(String(token));
          success = await sessionControlService.kickoutToken(String(token), String(reason));
          if (sessionInfo) {
            auditLogService.recordSessionEnd(ctx.db, {
              sessionId: sessionInfo.token,
              userId: sessionInfo.userId ? Number(sessionInfo.userId) : null,
              username: sessionInfo.username,
              nickname: sessionInfo.nickname,
              ip: sessionInfo.ip,
              device: sessionInfo.device,
              os: sessionInfo.os,
              browser: sessionInfo.browser,
              loginAt: sessionInfo.loginAt,
              lastActiveAt: sessionInfo.lastActiveAt,
              terminationReason: 'kickout',
              detail: `管理员强制下线：${reason}`,
            });
          }
        } else if (userId) {
          const count = await sessionControlService.kickoutUser(userId, undefined, String(reason));
          success = count > 0;
        }

        ctx.body = { success, message: success ? '已成功强制下线' : '操作失败' };
        await next();
      },

      /**
       * 发送广播通知（支持全员或定向）
       */
      sendBroadcast: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const { title, content, mode, scope, targetUserId, targetSessionId, type, ttlMinutes } = params;
        if (!content) {
          ctx.throw(400, 'content is required');
        }

        const msg = broadcastService.publish({
          title: title || '系统广播',
          content: String(content),
          mode: mode || 'notification',
          scope: scope || 'all',
          targetUserId: targetUserId ? Number(targetUserId) : null,
          targetSessionId: targetSessionId || null,
          type: type || 'info',
          ttlMinutes: ttlMinutes ? Number(ttlMinutes) : 15,
        });

        ctx.body = { success: true, message: msg };
        await next();
      },

      /**
       * 查询会话审计日志
       */
      getAuditLogs: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const result = await auditLogService.getAuditLogs(ctx.db, {
          page: params.page ? Number(params.page) : 1,
          pageSize: params.pageSize ? Number(params.pageSize) : 20,
          username: params.username ? String(params.username) : undefined,
          terminationReason: params.terminationReason ? String(params.terminationReason) : undefined,
        });
        ctx.body = result;
        await next();
      },

      /**
       * 客户端主动上报空闲挂机超时下线
       */
      reportIdle: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const { token } = params;
        if (token) {
          const sessionInfo = trackerService.getSession(String(token));
          await sessionControlService.kickoutToken(String(token), '挂机空闲超时，系统已自动登出');
          if (sessionInfo) {
            auditLogService.recordSessionEnd(ctx.db, {
              sessionId: sessionInfo.token,
              userId: sessionInfo.userId ? Number(sessionInfo.userId) : null,
              username: sessionInfo.username,
              nickname: sessionInfo.nickname,
              ip: sessionInfo.ip,
              device: sessionInfo.device,
              os: sessionInfo.os,
              browser: sessionInfo.browser,
              loginAt: sessionInfo.loginAt,
              lastActiveAt: sessionInfo.lastActiveAt,
              terminationReason: 'idle_timeout',
              detail: '长时间未检测到键鼠操作，触发挂机保护自动下线',
            });
          }
        }
        ctx.body = { success: true };
        await next();
      },

      /**
       * 获取历史在线走势图
       */
      getTrend: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const range = (params.range as 'today' | '7days') || 'today';
        const trend = await trackerService.getTrendData(range);
        ctx.body = trend;
        await next();
      },

      /**
       * 获取插件配置
       */
      getConfigs: async (ctx: Context, next: Next) => {
        const configs = await configService.getAllConfigs();
        ctx.body = configs;
        await next();
      },

      /**
       * 更新插件配置
       */
      updateConfigs: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        for (const [k, v] of Object.entries(params)) {
          if (k.startsWith('online_')) {
            await configService.set(k, v);
          }
        }
        ctx.body = { success: true, configs: await configService.getAllConfigs() };
        await next();
      },
    },
  };
}
