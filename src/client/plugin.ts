import React from 'react';
import { Plugin } from '@nocobase/client';
import { OnlineCountPage } from './pages/OnlineCountPage';
import { useAPIClient as useV1APIClient } from './hooks/useAPIClient';

const V1OnlineCountPageWrapper: React.FC = () => {
  const api = useV1APIClient();
  return React.createElement(OnlineCountPage, { api });
};

export class PluginOnlineCountClient extends Plugin {
  async load() {
    const manager = this.app?.pluginSettingsManager as any;
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
