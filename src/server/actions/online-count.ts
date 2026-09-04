import { Context, Next } from '@nocobase/actions';
import { OnlineTrackerService } from '../services/online-tracker.service';
import { SessionControlService } from '../services/session-control.service';
import { OnlineConfigService } from '../services/online-config.service';
import { extractClientIp } from '../utils/device-parser';

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

        // 如果没有提取到 currentUser，尝试解析 Token 或通过 userId 还原用户信息
        if (!currentUser && token) {
          try {
            if ((ctx.app as any)?.jwt) {
              const decoded: any = (ctx.app as any).jwt.decode(token);
              if (decoded?.userId) {
                const userRepo = ctx.db.getRepository('users');
                currentUser = await userRepo?.findOne({ filterByTk: decoded.userId });
              }
            }
          } catch {}
        }

        if (!currentUser && params.userId) {
          try {
            const userRepo = ctx.db.getRepository('users');
            currentUser = await userRepo?.findOne({ filterByTk: params.userId });
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

        ctx.body = result;
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
          success = await sessionControlService.kickoutToken(String(token), String(reason));
        } else if (userId) {
          const count = await sessionControlService.kickoutUser(userId, undefined, String(reason));
          success = count > 0;
        }

        ctx.body = { success, message: success ? '已成功强制下线' : '操作失败' };
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
