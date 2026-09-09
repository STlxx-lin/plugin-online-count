import { Plugin, PluginManager } from '@nocobase/server';
import path from 'path';
import { OnlineConfigService } from './services/online-config.service';
import { SessionControlService } from './services/session-control.service';
import { OnlineTrackerService } from './services/online-tracker.service';
import { BroadcastService } from './services/broadcast.service';
import { createOnlineCountResource } from './actions/online-count';
import { createKickoutInterceptor } from './middlewares/kickout-interceptor';

function ensurePluginEnvironment() {
  if (!process.env.NODE_MODULES_PATH) {
    process.env.NODE_MODULES_PATH = path.resolve(process.cwd(), 'node_modules');
  }
  if (PluginManager) {
    const parsedNames = (PluginManager as any).parsedNames || ((PluginManager as any).parsedNames = {});
    parsedNames['online-count'] = {
      name: 'online-count',
      packageName: '@nocobase/plugin-online-count',
    };
    parsedNames['@nocobase/plugin-online-count'] = {
      name: 'online-count',
      packageName: '@nocobase/plugin-online-count',
    };
  }
}

ensurePluginEnvironment();

export class PluginOnlineCountServer extends Plugin {
  public configService!: OnlineConfigService;
  public sessionControlService!: SessionControlService;
  public trackerService!: OnlineTrackerService;

  static async staticImport() {
    ensurePluginEnvironment();
  }

  async beforeLoad() {
    this.db.import({
      directory: path.resolve(__dirname, 'collections'),
    });
  }

  async load() {
    // 1. 初始化各业务服务
    this.configService = new OnlineConfigService(this.app);
    this.sessionControlService = new SessionControlService(this.app);
    this.trackerService = new OnlineTrackerService(
      this.app,
      this.configService,
      this.sessionControlService,
    );

    // 绑定 BroadcastService 数据库
    BroadcastService.getInstance().setDb(this.app.db);

    // 2. 注册踢出拦截中间件到全局
    this.app.use(createKickoutInterceptor(this.sessionControlService));

    // 3. 注册资源接口
    this.app.resource(
      createOnlineCountResource(
        this.trackerService,
        this.sessionControlService,
        this.configService,
      ),
    );

    // 4. 注册 ACL 权限片段与访问控制
    this.app.acl.registerSnippet({
      name: `pm.${this.name}.onlineCount`,
      actions: [
        'onlineCount:*',
        'online_sessions:*',
        'online_history_stats:*',
        'online_configs:*',
        'online_broadcasts:*',
        'online_audit_logs:*',
      ],
    });

    // 心跳上报允许公开/访客调用
    this.app.acl.allow('onlineCount', 'heartbeat', 'public');

    // 基础统计查看、在线用户列表与客户端空闲超时挂机上报，允许常规已登录用户调用
    this.app.acl.allow(
      'onlineCount',
      [
        'getStats',
        'getTrend',
        'getOnlineUsersList',
        'reportIdle',
      ],
      'loggedIn',
    );

    // 核心管理接口（会话踢出、参数配置、广播推送与撤回、审计日志查询等）仅允许系统管理员/具备配置权限的角色访问
    this.app.acl.allow(
      'onlineCount',
      [
        'listSessions',
        'kickout',
        'getConfigs',
        'updateConfigs',
        'sendBroadcast',
        'listBroadcasts',
        'revokeBroadcast',
        'getBroadcastReaders',
        'getAuditLogs',
      ],
      (ctx: any) => {
        const user = ctx.state?.currentUser;
        if (!user) return false;
        // 1. 超级管理员拥有最高权限（id === 1）
        if (user.id === 1) return true;
        // 2. 支持 NocoBase 官方动态权限判定（支持企业角色分配 pm.plugin-name.onlineCount 或 onlineCount 权限）
        if (
          ctx.can?.(`pm.${this.name}.onlineCount`) ||
          ctx.can?.('onlineCount:listSessions') ||
          ctx.can?.('onlineCount:*')
        ) {
          return true;
        }
        // 3. 内置管理员角色兜底
        const roles = user.roles || ctx.state?.currentRoles || [];
        return roles.some((r: any) => {
          const roleName = typeof r === 'string' ? r : r.name || r.roleName;
          return roleName === 'root' || roleName === 'admin' || roleName === 'superAdmin';
        });
      },
    );

    // 预热加载数据库中近 24 小时未过期的被踢出黑名单记录，避免服务重启遗忘
    await this.sessionControlService.loadActiveKicksFromDb();

    await this.trackerService.init();
    this.app.logger.info('[OnlineCountPlugin] Online Count & Session Management loaded.');
  }

  async destroy() {
    if (this.trackerService) {
      this.trackerService.destroy();
    }
  }
}

export default PluginOnlineCountServer;
