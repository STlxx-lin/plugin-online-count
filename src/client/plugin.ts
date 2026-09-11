import React from 'react';
import { Plugin } from '@nocobase/client';
import { OnlineCountPage } from './pages/OnlineCountPage';
import { useAPIClient as useV1APIClient } from './hooks/useAPIClient';
import { startOnlineHeartbeatWatchdog } from './hooks/useOnlineHeartbeat';
import { mountOnlineNavBadge, GlobalHeartbeatProvider } from './providers/GlobalHeartbeatProvider';

export { GlobalHeartbeatProvider };

const V1OnlineCountPageWrapper: React.FC = () => {
  const api = useV1APIClient();
  return React.createElement(OnlineCountPage, { api });
};

export class PluginOnlineCountClient extends Plugin {
  async load() {
    // 1. 启动纯 JS 单例心跳看门狗（无侵入、无全树重渲染）
    startOnlineHeartbeatWatchdog(this.app.apiClient);

    // 2. 独立挂载顶部导航徽章单例
    mountOnlineNavBadge(this.app.apiClient);

    const manager = this.app?.pluginSettingsManager as any;
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
        Component: V1OnlineCountPageWrapper,
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
        Component: V1OnlineCountPageWrapper,
      });
    }
  }
}

export default PluginOnlineCountClient;
