import React, { useEffect, useState } from 'react';
import ReactDOM, { createPortal } from 'react-dom';
import { Drawer } from 'antd';
import { useAPIClient } from '../hooks/useAPIClient';
import { useOnlineHeartbeat } from '../hooks/useOnlineHeartbeat';
import { OnlineNavBadge } from '../components/OnlineNavBadge';
import { OnlineCountDashboard } from '../components/OnlineCountDashboard';

export const OnlineNavOverlay: React.FC<{ api?: any }> = (props) => {
  const contextApi = useAPIClient();
  const api = props.api || contextApi;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // 动态探测 NocoBase 头部容器挂载导航徽章
    const findHeader = () => {
      const header =
        document.querySelector('.ant-layout-header') ||
        document.querySelector('.nocobase-admin-header') ||
        document.querySelector('header');
      if (header && header !== headerTarget) {
        setHeaderTarget(header as HTMLElement);
      }
    };

    findHeader();
    const timer = setInterval(findHeader, 2500);
    return () => clearInterval(timer);
  }, [headerTarget]);

  return (
    <>
      {headerTarget &&
        createPortal(
          <div style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 8 }}>
            <OnlineNavBadge api={api} onOpenDashboard={() => setDrawerOpen(true)} />
          </div>,
          headerTarget
        )}
      <Drawer
        title="👥 在线人数与会话管控"
        width={1000}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        styles={{ body: { padding: 0 } }}
      >
        <OnlineCountDashboard api={api} />
      </Drawer>
    </>
  );
};

export function mountOnlineNavBadge(api: any): () => void {
  if (typeof document === 'undefined') return () => {};
  let container = document.getElementById('nb-online-count-badge-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nb-online-count-badge-root';
    document.body.appendChild(container);
  }

  try {
    ReactDOM.render(React.createElement(OnlineNavOverlay, { api }), container);
  } catch {}

  return () => {
    try {
      ReactDOM.unmountComponentAtNode(container!);
      container?.remove();
    } catch {}
  };
}

export const GlobalHeartbeatProvider: React.FC<{ api?: any; children?: React.ReactNode }> = (props) => {
  const contextApi = useAPIClient();
  const api = props.api || contextApi;
  useOnlineHeartbeat(api);

  return (
    <>
      {props.children}
      <OnlineNavOverlay api={api} />
    </>
  );
};

export default GlobalHeartbeatProvider;
