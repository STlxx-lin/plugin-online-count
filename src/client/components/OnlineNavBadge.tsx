import React, { useState, useEffect } from 'react';
import { Badge, Popover, Button, Space, Typography, Tag, Spin } from 'antd';
import { UserOutlined, DashboardOutlined, ReloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

export const OnlineNavBadge: React.FC<{ api: any; onOpenDashboard?: () => void }> = ({
  api,
  onOpenDashboard,
}) => {
  const [stats, setStats] = useState<{
    totalOnline: number;
    userOnline: number;
    guestOnline: number;
    todayPeak: number;
  }>({ totalOnline: 1, userOnline: 1, guestOnline: 0, todayPeak: 1 });
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    if (!api) return;
    try {
      setLoading(true);
      const res = await api.request({ url: 'onlineCount:getStats' });
      const data = res?.data?.data || res?.data;
      if (data) {
        setStats(data);
      }
    } catch {}
    finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000); // 15秒自动轮询一次简要概况
    return () => clearInterval(interval);
  }, [api]);

  const popoverContent = (
    <div style={{ width: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>🟢 实时在线状况</span>
        <Button size="small" type="text" icon={<ReloadOutlined />} onClick={fetchStats} loading={loading} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">当前在线总数:</Text>
          <Text strong style={{ color: '#1677ff' }}>{stats.totalOnline} 人</Text>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">已登录用户:</Text>
          <Text strong style={{ color: '#52c41a' }}>{stats.userOnline} 人</Text>
        </div>
        {stats.guestOnline > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">未登录访客:</Text>
            <Text>{stats.guestOnline} 人</Text>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text type="secondary">今日最高峰值:</Text>
          <Tag color="volcano" style={{ margin: 0 }}>{stats.todayPeak} 人</Tag>
        </div>
      </div>

      {onOpenDashboard && (
        <Button
          type="primary"
          size="small"
          block
          icon={<DashboardOutlined />}
          onClick={onOpenDashboard}
        >
          进入在线管理控制台
        </Button>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="hover" placement="bottomRight">
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          background: 'rgba(0, 0, 0, 0.04)',
          borderRadius: 14,
          cursor: 'pointer',
          fontSize: 12,
          margin: '0 4px',
        }}
        onClick={onOpenDashboard}
      >
        <Badge status="processing" color="#52c41a" />
        <span style={{ color: '#595959', fontWeight: 500 }}>
          在线 <strong style={{ color: '#1677ff' }}>{stats.totalOnline}</strong>
        </span>
      </div>
    </Popover>
  );
};
