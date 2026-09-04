import React, { useEffect, useRef } from 'react';
import { Modal, notification } from 'antd';

const STORAGE_KEY_READ_BROADCASTS = 'NOCOBASE_READ_BROADCAST_IDS';

function getReadBroadcastIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_READ_BROADCASTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markBroadcastAsRead(id: string) {
  if (typeof window === 'undefined' || !id) return;
  try {
    const list = getReadBroadcastIds();
    if (!list.includes(id)) {
      list.push(id);
      if (list.length > 200) list.splice(0, list.length - 200);
      window.localStorage.setItem(STORAGE_KEY_READ_BROADCASTS, JSON.stringify(list));
    }
  } catch {}
}

export function getClientAuthInfo(api?: any) {
  let user = api?.auth?.user || (api as any)?.state?.currentUser;
  let token = api?.auth?.token || (api as any)?.token;

  if (!token && api?.auth?.getToken && typeof api.auth.getToken === 'function') {
    try {
      token = api.auth.getToken();
    } catch {}
  }

  if (!token && api?.axios?.defaults?.headers?.common?.['Authorization']) {
    const h = api.axios.defaults.headers.common['Authorization'];
    if (typeof h === 'string') token = h.replace(/^Bearer\s+/i, '').trim();
  }

  if (typeof window !== 'undefined') {
    const storages = [window.localStorage, window.sessionStorage].filter(Boolean);

    // 1. 全局扫描所有 Storage Key 寻找 JWT Token (Base64 以 eyJ 开头)
    if (!token) {
      for (const s of storages) {
        try {
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i) || '';
            const v = s.getItem(k) || '';
            if (typeof v === 'string') {
              const clean = v.replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '').trim();
              if (clean.startsWith('eyJ') && clean.split('.').length >= 3) {
                token = clean;
                break;
              }
            }
          }
          if (token) break;
        } catch {}
      }
    }

    // 2. 扫描常用 Token 命名
    if (!token) {
      const commonKeys = ['NOCOBASE_TOKEN', 'NOCOBASE_JWT', 'token', 'auth_token', 'jwt', 'access_token'];
      for (const s of storages) {
        for (const k of commonKeys) {
          const val = s.getItem(k);
          if (val && val !== 'null' && val !== 'undefined') {
            token = val.replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '').trim();
            break;
          }
        }
        if (token) break;
      }
    }

    // 3. 扫描用户信息
    if (!user) {
      for (const s of storages) {
        try {
          for (let i = 0; i < s.length; i++) {
            const k = s.key(i) || '';
            if (/user/i.test(k)) {
              const raw = s.getItem(k);
              if (raw && (raw.startsWith('{') || raw.startsWith('"{\\'))) {
                try {
                  const unescaped = raw.startsWith('"') ? JSON.parse(raw) : raw;
                  const parsed = typeof unescaped === 'string' ? JSON.parse(unescaped) : unescaped;
                  if (parsed && (parsed.id || parsed.userId || parsed.username)) {
                    user = parsed;
                    break;
                  }
                } catch {}
              }
            }
          }
          if (user) break;
        } catch {}
      }
    }
  }

  return { user, token };
}

async function sendHeartbeatRequest(api: any, data: any, token?: string) {
  // 1. 优先使用标准 NocoBase API Client
  if (api && typeof api.request === 'function' && !api.__isDummy) {
    try {
      const res = await api.request({
        url: 'onlineCount:heartbeat',
        method: 'POST',
        data,
      });
      return res?.data?.data || res?.data;
    } catch (err: any) {
      if (err?.response) throw err;
    }
  }

  // 2. 检查全局注入的 APIClient
  if (typeof window !== 'undefined' && (window as any).__nocobase_api_client__) {
    try {
      const res = await (window as any).__nocobase_api_client__.request({
        url: 'onlineCount:heartbeat',
        method: 'POST',
        data,
      });
      return res?.data?.data || res?.data;
    } catch (err: any) {
      if (err?.response) throw err;
    }
  }

  // 3. 原生 fetch 强力兜底
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const resp = await window.fetch('/api/onlineCount:heartbeat', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const error: any = new Error(errData?.message || `HTTP ${resp.status}`);
      error.response = { status: resp.status, data: errData };
      throw error;
    }
    const json = await resp.json();
    return json?.data || json;
  }

  return null;
}

export function useOnlineHeartbeat(api: any) {
  const isKickedRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimeoutMinutesRef = useRef<number>(30);
  const isIdlePromptingRef = useRef(false);
  const idleCountdownTimerRef = useRef<any>(null);

  useEffect(() => {
    let heartbeatTimer: any = null;
    let idleCheckTimer: any = null;
    const intervalSec = 30;

    const performLogout = async (reason: string) => {
      if (isKickedRef.current) return;
      isKickedRef.current = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (idleCheckTimer) clearInterval(idleCheckTimer);

      const { token } = getClientAuthInfo(api);
      try {
        if (api && typeof api.request === 'function' && !api.__isDummy) {
          await api.request({
            url: 'onlineCount:reportIdle',
            method: 'POST',
            data: { token },
          });
        } else if (typeof window !== 'undefined') {
          await window.fetch('/api/onlineCount:reportIdle', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ token }),
          });
        }
      } catch {}

      try {
        if (typeof window !== 'undefined') {
          window.localStorage?.removeItem('NOCOBASE_TOKEN');
          window.localStorage?.removeItem('token');
          window.sessionStorage?.removeItem('NOCOBASE_TOKEN');
          window.sessionStorage?.removeItem('token');
        }
      } catch {}

      Modal.warning({
        title: '会话已过期',
        content: reason,
        okText: '重新登录',
        zIndex: 100000,
        centered: true,
        onOk: () => {
          window.location.href = '/signin';
        },
      });
    };

    const sendHeartbeat = async () => {
      if (isKickedRef.current) return;

      const { user, token } = getClientAuthInfo(api);
      const readMessageIds = getReadBroadcastIds();

      try {
        const data = await sendHeartbeatRequest(
          api,
          {
            userId: user?.id,
            username: user?.username || user?.email,
            nickname: user?.nickname || user?.username,
            token,
            currentPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
            seenMessageIds: readMessageIds,
          },
          token
        );

        // 1. 强制下线拦截
        if (data?.kicked && !isKickedRef.current) {
          isKickedRef.current = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (idleCheckTimer) clearInterval(idleCheckTimer);

          Modal.error({
            title: '会话已终止',
            content: data.reason || '您的账号已被管理员强制下线，请重新登录。',
            okText: '重新登录',
            zIndex: 100000,
            centered: true,
            onOk: () => {
              window.location.href = '/signin';
            },
          });
          return;
        }

        // 2. 更新超时阈值配置
        if (typeof data?.idleTimeoutMinutes === 'number') {
          idleTimeoutMinutesRef.current = data.idleTimeoutMinutes;
        }

        // 3. 消费即时广播通知
        if (Array.isArray(data?.broadcasts) && data.broadcasts.length > 0) {
          const currentReadList = getReadBroadcastIds();

          for (const bc of data.broadcasts) {
            if (currentReadList.includes(bc.id)) continue;

            if (bc.mode === 'modal') {
              Modal.info({
                title: bc.title || '📢 系统广播通知',
                content: React.createElement(
                  'div',
                  {
                    style: {
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                      fontSize: 14,
                      color: '#262626',
                      maxHeight: 400,
                      overflowY: 'auto',
                    },
                  },
                  bc.content
                ),
                okText: '我已知晓',
                width: 520,
                centered: true,
                zIndex: 100000,
                onOk: () => {
                  markBroadcastAsRead(bc.id);
                },
                onCancel: () => {
                  markBroadcastAsRead(bc.id);
                },
              });
              currentReadList.push(bc.id);
            } else {
              notification.open({
                key: bc.id,
                message: bc.title || '系统广播通知',
                description: React.createElement(
                  'div',
                  { style: { whiteSpace: 'pre-wrap', fontSize: 13, color: '#595959' } },
                  bc.content
                ),
                type: (bc.type as any) || 'info',
                duration: 12,
                placement: 'topRight',
                onClose: () => {
                  markBroadcastAsRead(bc.id);
                },
              });
              markBroadcastAsRead(bc.id);
            }
          }
        }
      } catch (err: any) {
        if (err?.response?.status === 401 && err?.response?.data?.kicked && !isKickedRef.current) {
          isKickedRef.current = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (idleCheckTimer) clearInterval(idleCheckTimer);
          Modal.error({
            title: '会话已终止',
            content: err.response.data.message || '您已被管理员强制下线，请重新登录。',
            okText: '重新登录',
            zIndex: 100000,
            centered: true,
            onOk: () => {
              window.location.href = '/signin';
            },
          });
        }
      }
    };

    // 空闲超时检查
    const checkIdle = () => {
      const idleMinutes = idleTimeoutMinutesRef.current;
      if (!idleMinutes || idleMinutes <= 0 || isKickedRef.current) return;

      const idleMs = Date.now() - lastActivityRef.current;
      const timeoutMs = idleMinutes * 60 * 1000;
      const warnThresholdMs = Math.max(0, timeoutMs - 60 * 1000);

      const { user } = getClientAuthInfo(api);
      if (!user?.id) return;

      if (idleMs >= warnThresholdMs && !isIdlePromptingRef.current) {
        isIdlePromptingRef.current = true;
        let remainingSec = Math.max(1, Math.round((timeoutMs - idleMs) / 1000));

        const modal = Modal.confirm({
          title: '⚠️ 挂机空闲超时提示',
          content: React.createElement(
            'div',
            null,
            React.createElement('p', null, `您已较长时间无任何操作，系统将在 ${remainingSec} 秒后自动退出登录。`),
            React.createElement('p', { style: { color: '#8c8c8c', fontSize: 12 } }, '点击“保持在线”即可继续使用。')
          ),
          okText: '保持在线',
          cancelText: '立即退出',
          zIndex: 100000,
          centered: true,
          onOk: () => {
            lastActivityRef.current = Date.now();
            isIdlePromptingRef.current = false;
            if (idleCountdownTimerRef.current) clearInterval(idleCountdownTimerRef.current);
            sendHeartbeat();
          },
          onCancel: () => {
            performLogout('挂机空闲超时，用户选择退出');
          },
        });

        idleCountdownTimerRef.current = setInterval(() => {
          remainingSec--;
          if (remainingSec <= 0) {
            clearInterval(idleCountdownTimerRef.current);
            modal.destroy();
            isIdlePromptingRef.current = false;
            performLogout('长时间未响应操作，系统已自动登出');
          } else {
            modal.update({
              content: React.createElement(
                'div',
                null,
                React.createElement('p', null, `您已较长时间无任何操作，系统将在 ${remainingSec} 秒后自动退出登录。`),
                React.createElement('p', { style: { color: '#8c8c8c', fontSize: 12 } }, '点击“保持在线”即可继续使用。')
              ),
            });
          }
        }, 1000);
      }
    };

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > 1000) {
        lastActivityRef.current = now;
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // 挂载时立即执行一次心跳上报
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, intervalSec * 1000);
    idleCheckTimer = setInterval(checkIdle, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (idleCheckTimer) clearInterval(idleCheckTimer);
      if (idleCountdownTimerRef.current) clearInterval(idleCountdownTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [api]);
}
