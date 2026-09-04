import { Plugin, PluginManager } from '@nocobase/server';
import path from 'path';
import { OnlineConfigService } from './services/online-config.service';
import { SessionControlService } from './services/session-control.service';
import { OnlineTrackerService } from './services/online-tracker.service';
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
      actions: ['onlineCount:*', 'online_sessions:*', 'online_history_stats:*', 'online_configs:*'],
    });

    // 心跳上报允许公开/访客调用
    this.app.acl.allow('onlineCount', 'heartbeat', 'public');
    // 看板统计、会话列表及配置允许已登录用户或管理员访问
    this.app.acl.allow(
      'onlineCount',
      ['getStats', 'listSessions', 'kickout', 'getTrend', 'getConfigs', 'updateConfigs'],
      'loggedIn',
    );

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
