import React from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Tooltip,
  Avatar,
} from 'antd';
import {
  UserOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';

export interface AuditLogsTabProps {
  auditLogs: any[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  username: string;
  reasonFilter: string;
  onPageChange: (page: number, pageSize: number) => void;
  onSearchChange: (username: string, reason: string) => void;
  onRefresh: () => void;
}

export const AuditLogsTab: React.FC<AuditLogsTabProps> = ({
  auditLogs,
  total,
  loading,
  page,
  pageSize,
  username,
  reasonFilter,
  onPageChange,
  onSearchChange,
  onRefresh,
}) => {
  const [localUser, setLocalUser] = React.useState(username);
  const [localReason, setLocalReason] = React.useState(reasonFilter);

  React.useEffect(() => {
    setLocalUser(username);
  }, [username]);

  React.useEffect(() => {
    setLocalReason(reasonFilter);
  }, [reasonFilter]);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '< 1 秒';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} 小时`);
    if (minutes > 0) parts.push(`${minutes} 分`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} 秒`);
    return parts.join(' ');
  };

  const auditColumns = [
    {
      title: '用户身份',
      key: 'user',
      width: 170,
      render: (_: any, record: any) => (
        <Space>
          <Avatar
            size="small"
            style={{ backgroundColor: record.userId ? '#1677ff' : '#bfbfbf' }}
            icon={<UserOutlined />}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {record.nickname || record.username || '访客'}
            </span>
            <span style={{ fontSize: 11, color: '#8c8c8c' }}>
              {record.userId ? `@${record.username}` : '匿名会话'}
            </span>
          </div>
        </Space>
      ),
    },
    {
      title: 'IP 地址',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (ip: string) => <Tag color="geekblue">{ip || '127.0.0.1'}</Tag>,
    },
    {
      title: '终端环境',
      key: 'env',
      width: 150,
      render: (_: any, record: any) => (
        <span style={{ fontSize: 12 }}>
          {record.os} / {record.browser}
        </span>
      ),
    },
    {
      title: '上线时间',
      dataIndex: 'loginAt',
      key: 'loginAt',
      width: 150,
      render: (time: any) => (
        <span style={{ fontSize: 12 }}>{new Date(time).toLocaleString()}</span>
      ),
    },
    {
      title: '下线时间',
      dataIndex: 'logoutAt',
      key: 'logoutAt',
      width: 150,
      render: (time: any) => (
        <span style={{ fontSize: 12, color: '#595959' }}>{new Date(time).toLocaleString()}</span>
      ),
    },
    {
      title: '总在线时长',
      dataIndex: 'durationSeconds',
      key: 'durationSeconds',
      width: 130,
      render: (sec: number) => (
        <Tag color="purple" style={{ fontWeight: 500 }}>
          {formatDuration(sec)}
        </Tag>
      ),
    },
    {
      title: '下线原因',
      dataIndex: 'terminationReason',
      key: 'terminationReason',
      width: 160,
      render: (reason: string) => {
        if (reason === 'kickout') return <Tag color="error">管理员强制下线</Tag>;
        if (reason === 'mutex_kickout') return <Tag color="warning">单点互斥踢出</Tag>;
        if (reason === 'idle_timeout') return <Tag color="gold">挂机空闲超时</Tag>;
        if (reason === 'heartbeat_timeout') return <Tag color="default">心跳断开超时</Tag>;
        if (reason === 'manual_logout') return <Tag color="blue">主动退出登录</Tag>;
        return <Tag color="default">{reason || '离线'}</Tag>;
      },
    },
    {
      title: '详细说明',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{text || '-'}</span>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      {/* 审计日志搜索栏 */}
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
            placeholder="搜索用户名 / 昵称..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={localUser}
            onChange={(e) => setLocalUser(e.target.value)}
            onPressEnter={() => {
              onSearchChange(localUser, localReason);
            }}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            placeholder="所有下线原因"
            value={localReason || undefined}
            onChange={(val) => {
              setLocalReason(val || '');
              onSearchChange(localUser, val || '');
            }}
            allowClear
            style={{ width: 170 }}
          >
            <Select.Option value="kickout">管理员强制下线</Select.Option>
            <Select.Option value="mutex_kickout">单点互斥踢出</Select.Option>
            <Select.Option value="idle_timeout">挂机空闲超时</Select.Option>
            <Select.Option value="heartbeat_timeout">心跳断开超时</Select.Option>
            <Select.Option value="manual_logout">主动退出登录</Select.Option>
          </Select>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => {
              onSearchChange(localUser, localReason);
            }}
          >
            查询
          </Button>
        </Space>

        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新审计日志
        </Button>
      </div>

      <Table
        columns={auditColumns}
        dataSource={auditLogs}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条历史审计记录`,
          onChange: onPageChange,
        }}
      />
    </div>
  );
};
