import React from 'react';
import { Plugin } from '@nocobase/client-v2';
import { OnlineCountPage } from '../client/pages/OnlineCountPage';
import { useAPIClient as useV2APIClient } from './hooks/useAPIClient';
import { startOnlineHeartbeatWatchdog } from '../client/hooks/useOnlineHeartbeat';
import { mountOnlineNavBadgeV2, GlobalHeartbeatProviderV2 } from './providers/GlobalHeartbeatProvider';

export { GlobalHeartbeatProviderV2 };

const V2OnlineCountPageWrapper: React.FC = () => {
  const api = useV2APIClient();
  return React.createElement(OnlineCountPage, { api });
};

export class PluginOnlineCountClientV2 extends Plugin {
  async load() {
    // 1. 启动纯 JS 单例心跳看门狗（无侵入、无全树重渲染）
    startOnlineHeartbeatWatchdog(this.app.apiClient);

    // 2. 独立挂载顶部导航徽章单例
    mountOnlineNavBadgeV2(this.app.apiClient);

    const manager = this.app.pluginSettingsManager as any;
    if (!manager) return;

    const title = this.app.i18n?.t ? this.app.i18n.t('Online Users & Sessions') : '在线用户与会话';
    const icon = 'TeamOutlined';
    const menuKey = 'online-count';
    const pageName = `${menuKey}.index`;

    if (typeof manager.addMenuItem === 'function' && typeof manager.addPageTabItem === 'function') {
      manager.addMenuItem({
        key: menuKey,
        title,
        icon,
        aclSnippet: 'pm',
      });

      manager.addPageTabItem({
        menuKey,
        key: 'index',
        title,
        icon,
        aclSnippet: 'pm',
        Component: V2OnlineCountPageWrapper,
      });

      const pluginNames = [
        this.options?.name,
        this.options?.packageName,
        'online-count',
        '@nocobase/plugin-online-count',
      ].filter(Boolean);

      [...new Set(pluginNames)].forEach((pluginName) => {
        manager.setPluginSettingsLink?.(pluginName, pageName);
      });
      return;
    }

    if (typeof manager.add === 'function') {
      manager.add(menuKey, {
        title,
        icon,
        aclSnippet: 'pm',
        Component: V2OnlineCountPageWrapper,
      });
    }
  }
}

export default PluginOnlineCountClientV2;
