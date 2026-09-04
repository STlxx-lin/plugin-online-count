import { useEffect, useRef } from 'react';
import { Modal, message } from 'antd';

export function useOnlineHeartbeat(api: any) {
  const isKickedRef = useRef(false);

  useEffect(() => {
    if (!api) return;

    let timer: any = null;
    let intervalSec = 30;

    const sendHeartbeat = async () => {
      if (isKickedRef.current) return;

      try {
        const res = await api.request({
          url: 'onlineCount:heartbeat',
          method: 'POST',
          data: {
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

    // 页面初次加载发送一次心跳
    sendHeartbeat();

    // 启动定时器
    timer = setInterval(sendHeartbeat, intervalSec * 1000);

    // 监听页面可见性变化，切换回前台时立即同步一次心跳
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
}
