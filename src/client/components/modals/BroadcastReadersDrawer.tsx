import React from 'react';
import {
  Drawer,
  Table,
  Tag,
  Space,
  Avatar,
  Typography,
} from 'antd';
import {
  UserOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface BroadcastReadersDrawerProps {
  open: boolean;
  title: string;
  readers: any[];
  loading: boolean;
  onClose: () => void;
}

export const BroadcastReadersDrawer: React.FC<BroadcastReadersDrawerProps> = ({
  open,
  title,
  readers,
  loading,
  onClose,
}) => {
  return (
    <Drawer
      title={`📋「${title}」已读人员明细`}
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
    >
      <div style={{ marginBottom: 16 }}>
        <Tag color="success" icon={<CheckCircleOutlined />}>
          已阅读确认人数：{readers.length} 人
        </Tag>
      </div>
      <Table
        dataSource={readers}
        rowKey={(r) => `${r.userId || r.username}_${r.readAt}`}
        loading={loading}
        pagination={false}
        size="small"
        columns={[
          {
            title: '用户',
            key: 'user',
            render: (_: any, r: any) => (
              <Space>
                <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#1677ff' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.nickname || r.username}</span>
                  <Text type="secondary" style={{ fontSize: 11 }}>@{r.username}</Text>
                </div>
              </Space>
            ),
          },
          {
            title: '确认时间',
            dataIndex: 'readAt',
            key: 'readAt',
            render: (time: any) => (
              <span style={{ fontSize: 12, color: '#595959' }}>
                {new Date(time).toLocaleTimeString()}
              </span>
            ),
          },
        ]}
      />
    </Drawer>
  );
};
