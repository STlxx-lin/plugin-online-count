import { Context, Next } from '@nocobase/actions';
import { OnlineTrackerService } from '../services/online-tracker.service';
import { SessionControlService } from '../services/session-control.service';
import { OnlineConfigService } from '../services/online-config.service';
import { extractClientIp } from '../utils/device-parser';
import { BroadcastService } from '../services/broadcast.service';
import { AuditLogService } from '../services/audit-log.service';
import { CONFIG_KEYS } from '../constants';

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
        let currentUser = ctx.state?.currentUser || (ctx.state as any)?.user || ctx.auth?.user;

        // 提取 Token（全面覆盖请求体、请求头 Bearer、Context 方法与多格式 Cookie）
        let token = params.token;
        if (!token) {
          const authHeader = ctx.headers['authorization'] || ctx.headers['Authorization'] || ctx.get?.('Authorization');
          if (authHeader && typeof authHeader === 'string') {
            token = authHeader.replace(/^Bearer\s+/i, '').trim();
          }
        }
        if (!token && typeof (ctx as any).getBearerToken === 'function') {
          try {
            token = (ctx as any).getBearerToken();
          } catch {}
        }
        if (!token && ctx.cookies) {
          token =
            ctx.cookies.get('token') ||
            ctx.cookies.get('main_authToken') ||
            ctx.cookies.get('authToken') ||
            ctx.cookies.get('SESSION') ||
            '';
        }

        // 核心安全修复：心跳接口在 ACL 中被注册为 public（以便同时统计匿名访客在线人数），
        // NocoBase 的 BaseAuth.skipCheck() 会判定 isPublic: true 并直接跳过鉴权中间件，
        // 导致 ctx.state.currentUser 恒为空。
        // 若客户端携带了 Token，通过 NocoBase 官方加密签名体系（防伪造与越权）进行安全验签与身份解析：
        if (!currentUser && token) {
          // 1. 尝试直接调用 ctx.auth.check() 进行标准官方鉴权校验
          if (typeof ctx.auth?.check === 'function') {
            try {
              const checkResult = await ctx.auth.check();
              if (checkResult?.user) {
                currentUser = checkResult.user;
              } else if (checkResult?.id) {
                currentUser = checkResult;
              }
            } catch (e) {
              // 忽略校验错误（如 public 请求下上下文未完全初始化）
            }
          }

          // 2. 若 ctx.auth.check() 未能识别，调用官方 JwtService 进行密钥签名校验（防客户端伪造）
          if (!currentUser) {
            const jwtService = ctx.app?.authManager?.jwt || (ctx.auth as any)?.jwt;
            if (jwtService && typeof jwtService.decode === 'function') {
              try {
                // jwtService.decode 内部使用 jsonwebtoken.verify(token, secret) 强校验签名
                const payload: any = await jwtService.decode(token);
                if (payload?.userId) {
                  const userRepo = ctx.db.getRepository('users');
                  if (userRepo) {
                    currentUser = await userRepo.findOne({
                      filter: { id: payload.userId },
                      raw: true,
                    });
                  }
                }
              } catch (e) {
                // Token 验签失败（非法伪造或已过期），安全忽略，保留访客判定
              }
            }
          }
        }

        if (currentUser) {
          ctx.state.currentUser = currentUser;
        }

        // 严格以官方认证通过的用户为准，提取身份信息
        let finalUserId: number | null = null;
        let finalUsername: string | null = null;
        let finalNickname: string | null = null;

        if (currentUser?.id) {
          finalUserId = Number(currentUser.id) || null;
          finalUsername = currentUser.username || currentUser.email || `User_${currentUser.id}`;
          finalNickname = currentUser.nickname || currentUser.username || finalUsername;
        }

        const ip = extractClientIp(ctx);
        const userAgent = ctx.headers['user-agent'] || params.userAgent || '';
        const currentPath = params.currentPath || '/';

        if (!token) {
          if (finalUserId) {
            // 稳定 Token 生成策略：基于用户 ID 与浏览器 UA 特征指纹，杜绝因双栈网络 IPv4/IPv6 切换引发 Token 突变
            const uaHash = Buffer.from(userAgent || 'client').toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
            token = `user_${finalUserId}_${uaHash || 'stable'}`;
          } else {
            token = `anonymous_${ip}`;
          }
        }

        // 如果是有效鉴权合法的超级管理员心跳，自动解除误踢状态，防止自杀式锁死
        if (currentUser?.id === 1 && token) {
          sessionControlService.unmarkKicked(token);
        }

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
        if (seenMessageIds.length > 0) {
          void broadcastService
            .recordRead(
              seenMessageIds,
              {
                userId: finalUserId,
                username: finalUsername,
                nickname: finalNickname,
                ip,
                sessionId: token,
              },
              ctx.db
            )
            .catch(() => {});
        }

        const pendingBroadcasts = broadcastService.getPendingForClient({
          sessionId: token,
          userId: finalUserId,
          username: finalUsername,
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
        const rawKw = params.keyword;
        const cleanKw = (rawKw && rawKw !== 'undefined' && rawKw !== 'null') ? String(rawKw).trim() : '';
        const rawDev = params.device;
        const cleanDev = (rawDev && rawDev !== 'undefined' && rawDev !== 'null') ? String(rawDev).trim() : '';

        const result = await trackerService.listSessions({
          page: params.page ? Math.max(1, Number(params.page)) : 1,
          pageSize: params.pageSize ? Math.max(1, Number(params.pageSize)) : 20,
          keyword: cleanKw,
          device: cleanDev,
        });
        ctx.body = {
          ...result,
          data: result.rows,
          meta: {
            count: result.count,
            page: result.page,
            pageSize: result.pageSize,
          },
        };
        await next();
      },

      /**
       * 强制下线（踢出会话）
       */
      kickout: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const { token, userId, reason = '已被系统管理员强制下线' } = params;
        const relatedTokens = Array.isArray(params.relatedTokens) ? params.relatedTokens : [];

        if (!token && !userId) {
          ctx.throw(400, 'token or userId is required for kickout');
        }

        let success = false;
        if (token) {
          const sessionInfo = trackerService.getSession(String(token));
          success = await sessionControlService.kickoutToken(String(token), String(reason));

          // 级联踢出关联的双栈 Token，确保同终端彻底下线
          const allTokensToKick = new Set<string>([String(token), ...relatedTokens]);
          if (sessionInfo?.relatedTokens) {
            sessionInfo.relatedTokens.forEach((t) => allTokensToKick.add(t));
          }
          for (const t of allTokensToKick) {
            if (t !== String(token)) {
              await sessionControlService.kickoutToken(t, String(reason));
            }
          }

          await trackerService.removeSession(String(token));

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

        let currentReqToken = '';
        const authHeader = ctx.headers['authorization'] || ctx.headers['Authorization'];
        if (authHeader && typeof authHeader === 'string') {
          currentReqToken = authHeader.replace(/^Bearer\s+/i, '').trim();
        }
        const isSelf = Boolean(
          (token && currentReqToken && (token === currentReqToken || relatedTokens.includes(currentReqToken))) ||
          (userId && ctx.state.currentUser?.id && Number(userId) === Number(ctx.state.currentUser.id))
        );

        ctx.body = { success, isSelf, message: success ? '已成功强制下线' : '操作失败' };
        await next();
      },

      /**
       * 发送广播通知（支持全员或定向）
       */
      sendBroadcast: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const { title, content, mode, scope, type, ttlMinutes } = params;
        let targetUserId = params.targetUserId ? Number(params.targetUserId) : null;
        let targetUsername = params.targetUsername ? String(params.targetUsername).trim() : null;
        const targetSessionId = params.targetSessionId ? String(params.targetSessionId).trim() : null;

        if (!content) {
          ctx.throw(400, '通知内容不能为空 (content is required)');
        }

        if (scope === 'user') {
          if (!targetUserId && !targetUsername) {
            ctx.throw(400, '指定用户通知必须提供目标用户标识（用户名或 UID）');
          }

          // 如果没有 targetUserId，尝试根据 targetUsername (或可能输入的 UID) 反查 users 表
          if (!targetUserId && targetUsername) {
            try {
              const userRepo = ctx.db.getRepository('users');
              if (userRepo) {
                const isNum = /^\d+$/.test(targetUsername);
                const userRecord = await userRepo.findOne({
                  filter: {
                    $or: [
                      { username: targetUsername },
                      ...(isNum ? [{ id: Number(targetUsername) }] : []),
                    ],
                  },
                });
                if (userRecord) {
                  targetUserId = Number(userRecord.id);
                  targetUsername = userRecord.username || targetUsername;
                }
              }
            } catch (err) {
              console.warn('[OnlineCount] 通过 users 表反查 targetUser 异常:', err);
            }

            // 若数据库没有匹配到，再尝试从 trackerService 在线用户列表中匹配
            if (!targetUserId) {
              try {
                const onlineUsers = await trackerService.getOnlineUsersList();
                const matched = onlineUsers.find(
                  (u: any) =>
                    String(u.username).toLowerCase() === targetUsername?.toLowerCase() ||
                    String(u.userId) === targetUsername ||
                    String(u.nickname).toLowerCase() === targetUsername?.toLowerCase()
                );
                if (matched) {
                  targetUserId = Number(matched.userId);
                  targetUsername = matched.username || targetUsername;
                }
              } catch (err) {
                console.warn('[OnlineCount] 通过在线列表反查 targetUser 异常:', err);
              }
            }
          }

          // 如果有 targetUserId 但缺少 targetUsername，尝试补全 targetUsername
          if (targetUserId && !targetUsername) {
            try {
              const userRepo = ctx.db.getRepository('users');
              if (userRepo) {
                const userRecord = await userRepo.findOne({ filterByTk: targetUserId });
                if (userRecord && userRecord.username) {
                  targetUsername = userRecord.username;
                }
              }
            } catch (err) {
              console.warn('[OnlineCount] 通过 UID 反查 username 异常:', err);
            }
          }
        }

        if (scope === 'session' && !targetSessionId) {
          ctx.throw(400, '指定会话通知必须提供目标会话 Token');
        }

        const msg = await broadcastService.publish(
          {
            title: title || '系统通知',
            content: String(content),
            mode: mode || 'notification',
            scope: scope || 'all',
            targetUserId,
            targetUsername,
            targetSessionId,
            type: type || 'info',
            ttlMinutes: ttlMinutes ? Number(ttlMinutes) : 15,
          },
          ctx.db
        );

        ctx.body = { success: true, message: msg };
        await next();
      },

      /**
       * 分页查询历史广播列表
       */
      listBroadcasts: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const result = await broadcastService.listBroadcasts(
          {
            page: params.page ? Number(params.page) : 1,
            pageSize: params.pageSize ? Number(params.pageSize) : 10,
            status: params.status ? String(params.status) : 'all',
            keyword: params.keyword ? String(params.keyword) : undefined,
          },
          ctx.db
        );

        ctx.body = {
          ...result,
          data: result.rows,
          meta: {
            count: result.count,
            page: result.page,
            pageSize: result.pageSize,
          },
        };
        await next();
      },

      /**
       * 提前撤回广播
       */
      revokeBroadcast: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const targetId = params.broadcastId || params.id;
        if (!targetId) {
          ctx.throw(400, 'broadcastId is required');
        }

        const success = await broadcastService.revoke(targetId, ctx.db);
        ctx.body = { success, message: success ? '广播通知已提前撤回' : '撤回失败' };
        await next();
      },

      /**
       * 获取广播已读人员明细
       */
      getBroadcastReaders: async (ctx: Context, next: Next) => {
        const params = getParams(ctx);
        const targetId = params.broadcastId || params.id;
        if (!targetId) {
          ctx.throw(400, 'broadcastId is required');
        }

        const repo = ctx.db.getRepository('online_broadcasts');
        let record = await repo?.findOne({ filter: { broadcastId: String(targetId) } });
        if (!record && !isNaN(Number(targetId))) {
          record = await repo?.findOne({ filterByTk: Number(targetId) });
        }
        let rawUsers = record?.readUsers;
        let readUsers: any[] = [];
        if (Array.isArray(rawUsers)) {
          readUsers = rawUsers;
        } else if (typeof rawUsers === 'string') {
          try {
            const parsed = JSON.parse(rawUsers);
            if (Array.isArray(parsed)) readUsers = parsed;
          } catch {}
        }

        ctx.body = {
          data: {
            broadcastId: record?.broadcastId || targetId,
            title: record?.title,
            readUsers,
          },
        };
        await next();
      },

      /**
       * 获取当前在线的所有已认证用户及系统用户列表（供定向下拉选择，在线用户置顶）
       */
      getOnlineUsersList: async (ctx: Context, next: Next) => {
        const onlineList = trackerService.getOnlineUsersList();
        const onlineUserIdSet = new Set(onlineList.map((u) => Number(u.userId)));

        // 从数据库加载系统用户作为完整候选
        let allUsers: any[] = [];
        try {
          const userModel = ctx.db.getModel('users');
          if (userModel) {
            allUsers = await userModel.findAll({
              attributes: ['id', 'username', 'nickname', 'email'],
              limit: 200,
              order: [['id', 'ASC']],
            });
          }
        } catch {}

        const resultList: any[] = [];

        // 1. 在线活跃用户优先置顶
        for (const item of onlineList) {
          resultList.push({
            userId: item.userId,
            username: item.username,
            nickname: item.nickname,
            ip: item.ip,
            isOnline: true,
          });
        }

        // 2. 补充离线的系统用户
        for (const u of allUsers) {
          const uid = Number(u.id);
          if (!onlineUserIdSet.has(uid)) {
            resultList.push({
              userId: uid,
              username: u.username || u.email || `User_${uid}`,
              nickname: u.nickname || u.username || `User_${uid}`,
              ip: '',
              isOnline: false,
            });
          }
        }

        ctx.body = resultList;
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
        ctx.body = {
          ...result,
          data: result.rows,
          meta: {
            count: result.count,
            page: result.page,
            pageSize: result.pageSize,
          },
        };
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
