import React, { useEffect, useRef } from 'react';
import { Modal } from 'antd';
import { useAPIClient } from '../hooks/useAPIClient';

function getClientAuthInfo(api: any) {
  let user = api?.auth?.user || (api as any)?.state?.currentUser;
  let token = api?.auth?.token || (api as any)?.token;

  if (!user && typeof window !== 'undefined') {
    try {
      const storages = [window.localStorage, window.sessionStorage];
      for (const s of storages) {
        if (!s) continue;
        const raw = s.getItem('NOCOBASE_CURRENT_USER') || s.getItem('currentUser') || s.getItem('user');
        if (raw) {
          user = JSON.parse(raw);
          break;
        }
      }
    } catch {}
  }

  if (!token && typeof window !== 'undefined') {
    try {
      const storages = [window.localStorage, window.sessionStorage];
      for (const s of storages) {
        if (!s) continue;
        const t = s.getItem('NOCOBASE_TOKEN') || s.getItem('token') || s.getItem('auth_token');
        if (t) {
          token = t;
          break;
        }
      }
    } catch {}
  }

  return { user, token };
}

export const GlobalHeartbeatProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const api = useAPIClient();
  const isKickedRef = useRef(false);

  useEffect(() => {
    if (!api) return;

    let timer: any = null;
    const intervalSec = 30;

    const sendHeartbeat = async () => {
      if (isKickedRef.current) return;

      const { user, token } = getClientAuthInfo(api);

      try {
        const res = await api.request({
          url: 'onlineCount:heartbeat',
          method: 'POST',
          data: {
            userId: user?.id,
            username: user?.username || user?.email,
            nickname: user?.nickname || user?.username,
            token,
            currentPath: window.location.pathname + window.location.search,
          },
        });

        const data = res?.data?.data || res?.data;
        if (data?.kicked && !isKickedRef.current) {
          isKickedRef.current = true;
          if (timer) clearInterval(timer);

          Modal.error({
            title: '会话已终止',
            content: data.reason || '您的账号已被管理员强制下线，请重新登录。',
            okText: '重新登录',
            onOk: () => {
              window.location.href = '/signin';
            },
          });
        }
      } catch (err: any) {
        if (err?.response?.status === 401 && err?.response?.data?.kicked && !isKickedRef.current) {
          isKickedRef.current = true;
          if (timer) clearInterval(timer);
          Modal.error({
            title: '会话已终止',
            content: err.response.data.message || '您已被管理员强制下线，请重新登录。',
            okText: '重新登录',
            onOk: () => {
              window.location.href = '/signin';
            },
          });
        }
      }
    };

    // 初次加载上报一次
    sendHeartbeat();

    // 开启心跳轮询
    timer = setInterval(sendHeartbeat, intervalSec * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [api]);

  return <>{children}</>;
};
