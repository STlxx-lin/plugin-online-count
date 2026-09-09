import React from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Tooltip,
  Typography,
  Avatar,
  Badge,
  Popconfirm,
} from 'antd';
import {
  UserOutlined,
  DesktopOutlined,
  MobileOutlined,
  TabletOutlined,
  ReloadOutlined,
  SearchOutlined,
  LogoutOutlined,
  GlobalOutlined,
  LinkOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { getClientAuthInfo } from '../../hooks/useOnlineHeartbeat';

const { Text } = Typography;

export interface SessionsTabProps {
  api: any;
  sessions: any[];
  totalCount: number;
  loading: boolean;
  page: number;
  pageSize: number;
  keyword: string;
  deviceFilter: string;
  onPageChange: (page: number, pageSize: number) => void;
  onSearchChange: (keyword: string, device: string) => void;
  onRefresh: () => void;
  onKickout: (record: any) => void;
  onDirectMessage: (record: any) => void;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  api,
  sessions,
  totalCount,
  loading,
  page,
  pageSize,
  keyword,
  deviceFilter,
  onPageChange,
  onSearchChange,
  onRefresh,
  onKickout,
  onDirectMessage,
}) => {
  const [localKw, setLocalKw] = React.useState(keyword);
  const [localDev, setLocalDev] = React.useState(deviceFilter);

  React.useEffect(() => {
    setLocalKw(keyword);
  }, [keyword]);

  React.useEffect(() => {
    setLocalDev(deviceFilter);
  }, [deviceFilter]);

  const renderDeviceIcon = (dev: string) => {
    if (dev === 'Mobile') return <MobileOutlined style={{ color: '#1677ff' }} />;
    if (dev === 'Tablet') return <TabletOutlined style={{ color: '#722ed1' }} />;
    return <DesktopOutlined style={{ color: '#52c41a' }} />;
  };

  const currentAuth = getClientAuthInfo(api);

  const columns = [
    {
      title: '用户身份',
      key: 'user',
      width: 210,
      render: (_: any, record: any) => {
        const isGuest = !record.userId;
        const isCurrent = Boolean(
          (record.token && currentAuth.token && record.token === currentAuth.token) ||
          (record.userId && currentAuth.user?.id && Number(record.userId) === Number(currentAuth.user.id))
        );
        return (
          <Space>
            <Avatar
              style={{
                backgroundColor: isGuest ? '#d9d9d9' : isCurrent ? '#52c41a' : '#1677ff',
                verticalAlign: 'middle',
              }}
              icon={<UserOutlined />}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: isGuest ? '#8c8c8c' : '#1f1f1f' }}>
                  {record.nickname || record.username || (isGuest ? '访客 (Guest)' : `User #${record.userId}`)}
                </span>
                {isCurrent && (
                  <Tag color="success" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>
                    当前会话 (您)
                  </Tag>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {isGuest ? '匿名访问' : `@${record.username || record.userId}`}
              </Text>
            </div>
          </Space>
        );
      },
    },
    {
      title: '客户端 IP / 网络环境',
      key: 'ip',
      width: 170,
      render: (_: any, record: any) => {
        const hasDual = record.isDualStack || (record.ipv4 && record.ipv6);
        const displayIp = record.ip || record.ipv4 || record.ipv6 || '127.0.0.1';

        if (hasDual) {
          return (
            <Tooltip
              title={
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>双栈网络环境识别</div>
                  <div>• IPv4: {record.ipv4 || '未捕获'}</div>
                  <div>• IPv6: {record.ipv6 || '未捕获'}</div>
                </div>
              }
            >
              <Space direction="vertical" size={2}>
                <Tag icon={<GlobalOutlined />} color="cyan" style={{ cursor: 'pointer', margin: 0 }}>
                  {displayIp}
                </Tag>
                <Tag color="geekblue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                  IPv4 / IPv6 双栈
                </Tag>
              </Space>
            </Tooltip>
          );
        }

        return (
          <Tag icon={<GlobalOutlined />} color="blue">
            {displayIp}
          </Tag>
        );
      },
    },
    {
      title: '终端环境',
      key: 'environment',
      width: 170,
      render: (_: any, record: any) => (
        <Space direction="vertical" size={2}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {renderDeviceIcon(record.device)}
            <span style={{ fontWeight: 500 }}>{record.os || 'Unknown OS'}</span>
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.browser || 'Unknown Browser'}
          </Text>
        </Space>
      ),
    },
    {
      title: '当前访问页面',
      dataIndex: 'currentPath',
      key: 'currentPath',
      width: 220,
      ellipsis: true,
      render: (path: string) => {
        const targetPath = path || '/';
        return (
          <Tooltip title={`点击在新窗口打开此页面：${targetPath}`}>
            <a
              href={targetPath}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                maxWidth: '100%',
                background: '#f0f5ff',
                color: '#1677ff',
                border: '1px solid #adc6ff',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 12,
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#d6e4ff';
                e.currentTarget.style.borderColor = '#85a5ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f0f5ff';
                e.currentTarget.style.borderColor = '#adc6ff';
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'monospace',
                }}
              >
                {targetPath}
              </span>
              <LinkOutlined style={{ fontSize: 11, flexShrink: 0 }} />
            </a>
          </Tooltip>
        );
      },
    },
    {
      title: '活跃状态',
      key: 'activity',
      width: 160,
      render: (_: any, record: any) => {
        const isVeryActive = record.idleSeconds < 30;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Badge status={isVeryActive ? 'processing' : 'default'} color={isVeryActive ? '#52c41a' : '#faad14'} />
              <span style={{ fontSize: 12, fontWeight: 500, color: isVeryActive ? '#389e0d' : '#d48806' }}>
                {record.idleSeconds < 60 ? `${record.idleSeconds} 秒前活跃` : `${Math.round(record.idleSeconds / 60)} 分钟前活跃`}
              </span>
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              已在线 {record.durationMinutes} 分钟
            </Text>
          </div>
        );
      },
    },
    {
      title: '上线时间',
      dataIndex: 'loginAt',
      key: 'loginAt',
      width: 140,
      render: (time: any) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {new Date(time).toLocaleTimeString()}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: any) => {
        const isCurrent = Boolean(
          (record.token && currentAuth.token && record.token === currentAuth.token) ||
          (record.userId && currentAuth.user?.id && Number(record.userId) === Number(currentAuth.user.id))
        );
        return (
          <Space size={8}>
            <Button
              size="small"
              type="link"
              icon={<MessageOutlined />}
              style={{ padding: 0 }}
              onClick={() => onDirectMessage(record)}
            >
              发消息
            </Button>
            <Popconfirm
              title={isCurrent ? '⚠️ 确定要下线当前管理员会话吗？' : '确定要将该用户强制下线吗？'}
              description={
                isCurrent
                  ? '这是您当前正在使用的登录会话！确认后将立即安全注销并退出系统，需要重新登录。'
                  : '下线后该用户的终端将立即失去访问权限并返回登录页。'
              }
              onConfirm={() => onKickout(record)}
              okText={isCurrent ? '确认退出登录' : '确认下线'}
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                size="small"
                danger
                icon={<LogoutOutlined />}
                type="link"
                style={{ padding: 0 }}
              >
                {isCurrent ? '下线自身' : '强制下线'}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {/* 搜索与过滤工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          background: '#fafafa',
          padding: '10px 14px',
          borderRadius: 6,
        }}
      >
        <Space size={12}>
          <Input
            placeholder="搜索用户名 / 昵称 / IP / 页面..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={localKw}
            onChange={(e) => setLocalKw(e.target.value)}
            onPressEnter={() => {
              onSearchChange(localKw, localDev);
            }}
            allowClear
            style={{ width: 260 }}
          />
          <Select
            placeholder="所有设备类型"
            value={localDev || undefined}
            onChange={(val) => {
              setLocalDev(val || '');
              onSearchChange(localKw, val || '');
            }}
            allowClear
            style={{ width: 140 }}
          >
            <Select.Option value="Desktop">PC 桌面端</Select.Option>
            <Select.Option value="Mobile">手机移动端</Select.Option>
            <Select.Option value="Tablet">平板端</Select.Option>
          </Select>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => {
              onSearchChange(localKw, localDev);
            }}
          >
            查询
          </Button>
        </Space>

        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新列表
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={sessions}
        rowKey="token"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total: totalCount,
          showTotal: (total) => `共 ${total} 条在线会话`,
          onChange: onPageChange,
        }}
      />
    </div>
  );
};
