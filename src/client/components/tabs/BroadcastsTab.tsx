import React from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Select,
  Tooltip,
  Typography,
  Badge,
  Popconfirm,
} from 'antd';
import {
  NotificationOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  EyeOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface BroadcastsTabProps {
  broadcastList: any[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  statusFilter: string;
  onPageChange: (page: number, pageSize: number) => void;
  onFilterChange: (status: string) => void;
  onRefresh: () => void;
  onOpenSendModal: () => void;
  onRevoke: (record: any) => void;
  onViewReaders: (record: any) => void;
}

export const BroadcastsTab: React.FC<BroadcastsTabProps> = ({
  broadcastList,
  total,
  loading,
  page,
  pageSize,
  statusFilter,
  onPageChange,
  onFilterChange,
  onRefresh,
  onOpenSendModal,
  onRevoke,
  onViewReaders,
}) => {
  const [localStatus, setLocalStatus] = React.useState(statusFilter);

  React.useEffect(() => {
    setLocalStatus(statusFilter);
  }, [statusFilter]);

  const broadcastColumns = [
    {
      title: '通知标题与内容',
      key: 'content',
      width: 280,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: '#1f1f1f' }}>{record.title}</span>
            {record.type === 'error' && <Tag color="error">紧急</Tag>}
            {record.type === 'warning' && <Tag color="warning">警告</Tag>}
            {record.type === 'info' && <Tag color="blue">常规</Tag>}
            <Tag color="default">{record.mode === 'modal' ? '阻断弹窗' : '气泡浮窗'}</Tag>
          </div>
          <Tooltip title={record.content}>
            <Text type="secondary" ellipsis style={{ maxWidth: 260, fontSize: 12 }}>
              {record.content}
            </Text>
          </Tooltip>
        </div>
      ),
    },
    {
      title: '受众目标',
      key: 'target',
      width: 150,
      render: (_: any, record: any) => {
        if (record.scope === 'all') {
          return <Tag color="purple">全员在线广播</Tag>;
        }
        if (record.scope === 'user') {
          return (
            <Space direction="vertical" size={2}>
              <Tag color="cyan">指定用户</Tag>
              <span style={{ fontSize: 11, color: '#595959' }}>
                {record.targetUsername ? `@${record.targetUsername}` : ''}
                {record.targetUserId ? ` (UID: ${record.targetUserId})` : ''}
                {!record.targetUsername && !record.targetUserId ? '未知目标' : ''}
              </span>
            </Space>
          );
        }
        return (
          <Space direction="vertical" size={2}>
            <Tag color="orange">指定会话</Tag>
            <Tooltip title={record.targetSessionId}>
              <span style={{ fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>
                {record.targetSessionId ? record.targetSessionId.slice(0, 10) + '...' : '-'}
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: '阅读情况',
      key: 'readStatus',
      width: 140,
      render: (_: any, record: any) => (
        <Space size={6} align="center">
          <Badge
            count={record.readCount || 0}
            overflowCount={9999}
            style={{ backgroundColor: record.readCount > 0 ? '#52c41a' : '#d9d9d9' }}
          />
          <Button
            size="small"
            type="link"
            icon={<EyeOutlined />}
            style={{ padding: 0, fontSize: 12 }}
            onClick={() => onViewReaders(record)}
          >
            明细 ({record.readCount || 0}人)
          </Button>
        </Space>
      ),
    },
    {
      title: '发布人',
      key: 'publisher',
      width: 120,
      render: (_: any, record: any) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {record.createdByUsername || '管理员'}
        </span>
      ),
    },
    {
      title: '时间与有效周期',
      key: 'time',
      width: 200,
      render: (_: any, record: any) => {
        const expiresTime = new Date(record.expiresAt).getTime();
        const isExpired = !isNaN(expiresTime) && Date.now() > expiresTime;
        const remainSec = isExpired || isNaN(expiresTime) ? 0 : Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
        const remainMinutes = Math.max(1, Math.ceil(remainSec / 60));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12 }}>
              {new Date(record.createdAt).toLocaleTimeString()} 发布
            </span>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {isExpired ? (
                <span style={{ color: '#bfbfbf' }}>已于 {new Date(expiresTime).toLocaleTimeString()} 过期</span>
              ) : (
                <span style={{ color: '#52c41a' }}>生效中 (剩余 {remainMinutes} 分钟)</span>
              )}
            </Text>
          </div>
        );
      },
    },
    {
      title: '当前状态',
      key: 'status',
      width: 110,
      render: (_: any, record: any) => {
        if (record.isRevoked) {
          return <Tag color="default">已撤回</Tag>;
        }
        const expiresTime = new Date(record.expiresAt).getTime();
        if (!isNaN(expiresTime) && Date.now() > expiresTime) {
          return <Tag color="gold">已过期</Tag>;
        }
        return <Tag color="success">正在生效中</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => {
        const expiresTime = new Date(record.expiresAt).getTime();
        const canRevoke = !record.isRevoked && (isNaN(expiresTime) || Date.now() <= expiresTime);
        if (!canRevoke) {
          return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>;
        }
        return (
          <Popconfirm
            title="确定要撤回该条广播通知吗？"
            description="撤回后所有客户端将不再展示该条广播，未读用户也不会再收到提示。"
            onConfirm={() => onRevoke(record)}
            okText="确认撤回"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              type="link"
              style={{ padding: 0 }}
            >
              提前撤回
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <div>
      {/* 广播管理操作栏 */}
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
          <Select
            placeholder="按通知状态筛选"
            value={localStatus || undefined}
            onChange={(val) => {
              setLocalStatus(val || '');
              onFilterChange(val || '');
            }}
            allowClear
            style={{ width: 160 }}
          >
            <Select.Option value="active">正在生效中</Select.Option>
            <Select.Option value="revoked">已提前撤回</Select.Option>
            <Select.Option value="expired">已自然过期</Select.Option>
          </Select>

          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => {
              onFilterChange(localStatus);
            }}
          >
            筛选
          </Button>
        </Space>

        <Space size={10}>
          <Button
            type="primary"
            icon={<NotificationOutlined />}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
            onClick={onOpenSendModal}
          >
            发布新广播
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onRefresh}>
            刷新列表
          </Button>
        </Space>
      </div>

      <Table
        columns={broadcastColumns}
        dataSource={broadcastList}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条历史广播记录`,
          onChange: onPageChange,
        }}
      />
    </div>
  );
};
