import React from 'react';
import { Plugin } from '@nocobase/client-v2';
import { OnlineCountPage } from '../client/pages/OnlineCountPage';
import { useAPIClient as useV2APIClient } from './hooks/useAPIClient';
import { GlobalHeartbeatProviderV2 } from './providers/GlobalHeartbeatProvider';

const V2OnlineCountPageWrapper: React.FC = () => {
  const api = useV2APIClient();
  return React.createElement(OnlineCountPage, { api });
};

export class PluginOnlineCountClientV2 extends Plugin {
  async load() {
    if (typeof window !== 'undefined' && this.app?.apiClient) {
      (window as any).__nocobase_api_client__ = this.app.apiClient;
    }

    this.app.addProvider(GlobalHeartbeatProviderV2, { api: this.app.apiClient });

    const manager = this.app.pluginSettingsManager as any;
    if (!manager) return;

    const title = '在线用户与会话';
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
