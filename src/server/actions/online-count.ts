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
        const currentUser = ctx.state?.currentUser;

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
        if (!token && currentUser?.id) {
          token = `user_sess_${currentUser.id}_${ctx.ip || '127.0.0.1'}`;
        }

        const ip = extractClientIp(ctx);
        const userAgent = ctx.headers['user-agent'] || params.userAgent || '';
        const currentPath = params.currentPath || '/';

        const result = await trackerService.recordHeartbeat({
          token: token || `anonymous_${ip}`,
          userId: currentUser?.id || params.userId || null,
          username: currentUser?.username || currentUser?.email || params.username || null,
          nickname: currentUser?.nickname || currentUser?.username || params.nickname || null,
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
