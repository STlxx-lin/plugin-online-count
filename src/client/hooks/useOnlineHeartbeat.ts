import React, { useEffect, useRef } from 'react';
import { Modal, notification } from 'antd';

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

export function useOnlineHeartbeat(api: any) {
  const isKickedRef = useRef(false);
  const seenMessageIdsRef = useRef<string[]>([]);
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimeoutMinutesRef = useRef<number>(30);
  const isIdlePromptingRef = useRef(false);
  const idleCountdownTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!api) return;

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
        await api.request({
          url: 'onlineCount:reportIdle',
          method: 'POST',
          data: { token },
        });
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
        onOk: () => {
          window.location.href = '/signin';
        },
      });
    };

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
            seenMessageIds: seenMessageIdsRef.current,
          },
        });

        const data = res?.data?.data || res?.data;

        // 1. 下线阻断检测
        if (data?.kicked && !isKickedRef.current) {
          isKickedRef.current = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (idleCheckTimer) clearInterval(idleCheckTimer);

          Modal.error({
            title: '会话已终止',
            content: data.reason || '您的账号已被管理员强制下线，请重新登录。',
            okText: '重新登录',
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

        // 3. 消费即时广播或定向消息
        if (Array.isArray(data?.broadcasts) && data.broadcasts.length > 0) {
          for (const bc of data.broadcasts) {
            if (seenMessageIdsRef.current.includes(bc.id)) continue;
            seenMessageIdsRef.current.push(bc.id);

            if (bc.mode === 'modal') {
              Modal.info({
                title: bc.title || '📢 系统广播通知',
                content: React.createElement(
                  'div',
                  { style: { whiteSpace: 'pre-wrap', lineHeight: 1.6 } },
                  bc.content,
                ),
                okText: '我已知晓',
                width: 480,
              });
            } else {
              notification.info({
                message: bc.title || '系统广播通知',
                description: React.createElement(
                  'div',
                  { style: { whiteSpace: 'pre-wrap' } },
                  bc.content,
                ),
                duration: 10,
                placement: 'topRight',
              });
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
            onOk: () => {
              window.location.href = '/signin';
            },
          });
        }
      }
    };

    // 空闲超时巡检（每 5 秒检查一次活跃时间戳）
    const checkIdle = () => {
      const idleMinutes = idleTimeoutMinutesRef.current;
      if (!idleMinutes || idleMinutes <= 0 || isKickedRef.current) return;

      const idleMs = Date.now() - lastActivityRef.current;
      const timeoutMs = idleMinutes * 60 * 1000;
      const warnThresholdMs = Math.max(0, timeoutMs - 60 * 1000);

      // 仅对已登录用户启用空闲保护
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

    // 监听用户活跃事件
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
