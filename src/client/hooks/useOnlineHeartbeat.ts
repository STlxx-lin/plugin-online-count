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
    // 快速读取标准 Key，杜绝遍历整个 Storage 的反模式
    if (!token) {
      const commonKeys = ['NOCOBASE_TOKEN', 'token', 'auth_token', 'NOCOBASE_JWT'];
      for (const k of commonKeys) {
        try {
          const val = window.localStorage?.getItem(k) || window.sessionStorage?.getItem(k);
          if (val && val !== 'null' && val !== 'undefined') {
            token = val.replace(/^"|"$/g, '').replace(/^Bearer\s+/i, '').trim();
            break;
          }
        } catch {}
      }
    }

    if (!user) {
      try {
        const raw = window.localStorage?.getItem('NOCOBASE_USER') || window.sessionStorage?.getItem('NOCOBASE_USER');
        if (raw) {
          user = JSON.parse(raw);
        }
      } catch {}
    }
  }

  return { user, token };
}

export function safeRedirectToLogin(api?: any, reasonText?: string) {
  try {
    if (api?.auth?.signOut && typeof api.auth.signOut === 'function') {
      api.auth.signOut();
      return;
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

  if (typeof window !== 'undefined') {
    const publicPath = (window as any).__nocobase_public_path__ || '/';
    const prefix = publicPath.endsWith('/') ? publicPath : `${publicPath}/`;
    window.location.href = `${prefix}signin`;
  }
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

  // 2. 原生 fetch 强力兜底
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

// 模块级单例看门狗，确保全局无论被挂载多少次，仅维持单一心跳定时器
let activeHeartbeatSubscribers = 0;
let globalHeartbeatTimer: any = null;
let globalIdleCheckTimer: any = null;
let globalCountdownTimer: any = null;
let globalIsKicked = false;
let globalIsIdlePrompting = false;
let globalLastActivity = Date.now();
let globalIdleTimeoutMinutes = 30;

export function useOnlineHeartbeat(api: any) {
  useEffect(() => {
    activeHeartbeatSubscribers++;
    if (activeHeartbeatSubscribers > 1) {
      // 已有全局心跳看门狗在运行，直接复用，不重复创建定时器与监听
      return () => {
        activeHeartbeatSubscribers = Math.max(0, activeHeartbeatSubscribers - 1);
      };
    }

    const intervalSec = 30;

    const performLogout = async (reason: string) => {
      if (globalIsKicked) return;
      globalIsKicked = true;
      if (globalHeartbeatTimer) clearInterval(globalHeartbeatTimer);
      if (globalIdleCheckTimer) clearInterval(globalIdleCheckTimer);
      if (globalCountdownTimer) clearInterval(globalCountdownTimer);

      const { token } = getClientAuthInfo(api);
      try {
        if (api && typeof api.request === 'function' && !api.__isDummy) {
          await api.request({
            url: 'onlineCount:reportIdle',
            method: 'POST',
            data: { token },
          });
        }
      } catch {}

      Modal.warning({
        title: '会话已过期',
        content: reason,
        okText: '重新登录',
        zIndex: 100000,
        centered: true,
        onOk: () => {
          safeRedirectToLogin(api, reason);
        },
      });
    };

    const sendHeartbeat = async () => {
      if (globalIsKicked) return;

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
        if (data?.kicked && !globalIsKicked) {
          globalIsKicked = true;
          if (globalHeartbeatTimer) clearInterval(globalHeartbeatTimer);
          if (globalIdleCheckTimer) clearInterval(globalIdleCheckTimer);
          if (globalCountdownTimer) clearInterval(globalCountdownTimer);

          Modal.error({
            title: '会话已终止',
            content: data.reason || '您的账号已被管理员强制下线，请重新登录。',
            okText: '重新登录',
            zIndex: 100000,
            centered: true,
            onOk: () => {
              safeRedirectToLogin(api, data.reason);
            },
          });
          return;
        }

        // 2. 更新超时阈值配置
        if (typeof data?.idleTimeoutMinutes === 'number') {
          globalIdleTimeoutMinutes = data.idleTimeoutMinutes;
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
        if (err?.response?.status === 401 && err?.response?.data?.kicked && !globalIsKicked) {
          globalIsKicked = true;
          if (globalHeartbeatTimer) clearInterval(globalHeartbeatTimer);
          if (globalIdleCheckTimer) clearInterval(globalIdleCheckTimer);
          if (globalCountdownTimer) clearInterval(globalCountdownTimer);
          Modal.error({
            title: '会话已终止',
            content: err.response.data.message || '您已被管理员强制下线，请重新登录。',
            okText: '重新登录',
            zIndex: 100000,
            centered: true,
            onOk: () => {
              safeRedirectToLogin(api, err.response.data.message);
            },
          });
        }
      }
    };

    // 空闲超时检查
    const checkIdle = () => {
      const idleMinutes = globalIdleTimeoutMinutes;
      if (!idleMinutes || idleMinutes <= 0 || globalIsKicked) return;

      const idleMs = Date.now() - globalLastActivity;
      const timeoutMs = idleMinutes * 60 * 1000;
      const warnThresholdMs = Math.max(0, timeoutMs - 60 * 1000);

      const { user } = getClientAuthInfo(api);
      if (!user?.id) return;

      if (idleMs >= warnThresholdMs && !globalIsIdlePrompting) {
        globalIsIdlePrompting = true;
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
            globalLastActivity = Date.now();
            globalIsIdlePrompting = false;
            if (globalCountdownTimer) clearInterval(globalCountdownTimer);
            sendHeartbeat();
          },
          onCancel: () => {
            performLogout('挂机空闲超时，用户选择退出');
          },
        });

        globalCountdownTimer = setInterval(() => {
          remainingSec--;
          if (remainingSec <= 0) {
            clearInterval(globalCountdownTimer);
            modal.destroy();
            globalIsIdlePrompting = false;
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
      if (now - globalLastActivity > 5000) {
        globalLastActivity = now;
      }
    };

    const activityEvents = ['pointerdown', 'keydown'];
    activityEvents.forEach((event) => {
      try {
        window.addEventListener(event, handleActivity, { passive: true, capture: false });
      } catch {}
    });

    sendHeartbeat();
    globalHeartbeatTimer = setInterval(sendHeartbeat, intervalSec * 1000);
    globalIdleCheckTimer = setInterval(checkIdle, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        globalLastActivity = Date.now();
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      activeHeartbeatSubscribers = Math.max(0, activeHeartbeatSubscribers - 1);
      if (activeHeartbeatSubscribers === 0) {
        if (globalHeartbeatTimer) clearInterval(globalHeartbeatTimer);
        if (globalIdleCheckTimer) clearInterval(globalIdleCheckTimer);
        if (globalCountdownTimer) clearInterval(globalCountdownTimer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        activityEvents.forEach((event) => {
          window.removeEventListener(event, handleActivity);
        });
      }
    };
  }, [api]);
}
