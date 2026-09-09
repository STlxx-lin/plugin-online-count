import React, { useMemo, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Row,
  Col,
  Button,
  Space,
  message,
} from 'antd';
import {
  SendOutlined,
  BulbOutlined,
} from '@ant-design/icons';

// 常用预设模板
export const BROADCAST_TEMPLATES: Record<string, { title: string; content: string; type: string; mode: string; ttlMinutes: number }> = {
  maintenance: {
    title: '系统例行维护公告',
    content: '尊敬的用户：平台将于 10 分钟后进行核心服务维护升级，预计耗时 15 分钟。期间请提前保存当前工作内容，以免数据丢失。',
    type: 'warning',
    mode: 'modal',
    ttlMinutes: 20,
  },
  release: {
    title: '新功能版本发布通知',
    content: '系统已完成最新迭代升级！上线了更强劲的在线协同与管控中心，刷新页面即可体验最新特性。',
    type: 'info',
    mode: 'notification',
    ttlMinutes: 60,
  },
  security: {
    title: '安全协同与登出预警',
    content: '系统检测到敏感环境安全策略调整，请所有在线成员核验当前账号安全，并在完成任务后按规范注销登出。',
    type: 'error',
    mode: 'modal',
    ttlMinutes: 15,
  },
  meeting: {
    title: '全员在线协同提醒',
    content: '各位同事：下午 15:00 的跨部门线上协同评审即将准时开始，请提前进入相应会议空间。',
    type: 'info',
    mode: 'notification',
    ttlMinutes: 30,
  },
};

export interface BroadcastSendModalProps {
  open: boolean;
  form: any;
  loading: boolean;
  onlineUserOptions: { label: string; value: string; userId: any }[];
  onCancel: () => void;
  onSend: (values: any) => void;
  onFetchOnlineUsers: () => void;
}

export const BroadcastSendModal: React.FC<BroadcastSendModalProps> = ({
  open,
  form,
  loading,
  onlineUserOptions,
  onCancel,
  onSend,
  onFetchOnlineUsers,
}) => {
  const [userSearchText, setUserSearchText] = useState('');

  const combinedUserOptions = useMemo(() => {
    const text = userSearchText.trim();
    if (!text) return onlineUserOptions;
    const exists = onlineUserOptions.some(
      (o: any) => o.value.toLowerCase() === text.toLowerCase() || String(o.userId) === text
    );
    if (!exists) {
      return [
        {
          label: `指定输入用户: "${text}" (支持手动指定用户名或 UID)`,
          value: text,
          userId: /^\d+$/.test(text) ? Number(text) : undefined,
        },
        ...onlineUserOptions,
      ];
    }
    return onlineUserOptions;
  }, [onlineUserOptions, userSearchText]);

  const handleApplyTemplate = (key: string) => {
    const tpl = BROADCAST_TEMPLATES[key];
    if (!tpl) return;
    form.setFieldsValue({
      title: tpl.title,
      content: tpl.content,
      type: tpl.type,
      mode: tpl.mode,
      ttlMinutes: tpl.ttlMinutes,
    });
    message.info(`已应用【${tpl.title}】预设模板`);
  };

  return (
    <Modal
      title="📢 发布即时通知与广播"
      open={open}
      onCancel={() => {
        onCancel();
        setUserSearchText('');
      }}
      footer={null}
      destroyOnClose
      width={580}
    >
      {/* 快捷模板填充区 */}
      <div
        style={{
          marginBottom: 16,
          background: '#fafafa',
          padding: '10px 12px',
          borderRadius: 6,
          border: '1px dashed #d9d9d9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <BulbOutlined style={{ color: '#faad14' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#595959' }}>快捷预设模板（一键填入）：</span>
        </div>
        <Space wrap size={[8, 8]}>
          <Button size="small" onClick={() => handleApplyTemplate('maintenance')}>🛠️ 停机维护</Button>
          <Button size="small" onClick={() => handleApplyTemplate('release')}>🚀 版本发布</Button>
          <Button size="small" onClick={() => handleApplyTemplate('security')}>⚠️ 安全排查</Button>
          <Button size="small" onClick={() => handleApplyTemplate('meeting')}>📅 协同会议</Button>
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onSend}
        initialValues={{
          title: '系统通知',
          scope: 'all',
          mode: 'notification',
          type: 'info',
          ttlMinutes: 15,
        }}
      >
        <Form.Item
          label="通知受众范围"
          name="scope"
          rules={[{ required: true }]}
        >
          <Radio.Group>
            <Radio.Button value="all">全员广播 (所有在线人员)</Radio.Button>
            <Radio.Button value="user">指定用户</Radio.Button>
            <Radio.Button value="session">指定会话</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prev, cur) => prev.scope !== cur.scope}
        >
          {({ getFieldValue }) => {
            const scope = getFieldValue('scope');
            if (scope === 'user') {
              return (
                <>
                  <Form.Item name="targetUserId" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    label="选择或输入目标用户名 / UID"
                    name="targetUsername"
                    rules={[{ required: true, message: '请选择或输入目标用户名或 UID' }]}
                    extra="可直接从在线列表中点选，亦可在框内直接输入任意用户的用户名或数字 UID 发送。"
                  >
                    <Select
                      showSearch
                      allowClear
                      placeholder="点选在线/系统用户或直接输入用户名 / UID..."
                      options={combinedUserOptions}
                      onSearch={(val) => setUserSearchText(val)}
                      onFocus={() => {
                        if (onlineUserOptions.length === 0) {
                          onFetchOnlineUsers();
                        }
                      }}
                      onChange={(val, option: any) => {
                        if (option && option.userId) {
                          form.setFieldsValue({ targetUserId: option.userId, targetUsername: option.value });
                        } else {
                          const isNum = /^\d+$/.test(String(val || '').trim());
                          form.setFieldsValue({
                            targetUserId: isNum ? Number(val) : undefined,
                            targetUsername: val,
                          });
                        }
                      }}
                      filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                        String(option?.value ?? '').toLowerCase().includes(input.toLowerCase()) ||
                        String(option?.userId ?? '').includes(input)
                      }
                    />
                  </Form.Item>
                </>
              );
            }
            if (scope === 'session') {
              return (
                <Form.Item
                  label="目标会话 Token"
                  name="targetSessionId"
                  rules={[{ required: true, message: '请输入目标会话 Token' }]}
                >
                  <Input placeholder="输入会话 Token" />
                </Form.Item>
              );
            }
            return null;
          }}
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="呈现方式"
              name="mode"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="notification">右上角浮窗 (Notification)</Select.Option>
                <Select.Option value="modal">强阻断弹窗 (Modal 需确认)</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="消息等级"
              name="type"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="info">常规提示 (Info)</Select.Option>
                <Select.Option value="warning">重要警告 (Warning)</Select.Option>
                <Select.Option value="error">紧急通知 (Error)</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="通知标题"
          name="title"
          rules={[{ required: true, message: '请输入通知标题' }]}
        >
          <Input placeholder="例如: 系统维护公告" />
        </Form.Item>

        <Form.Item
          label="通知内容"
          name="content"
          rules={[{ required: true, message: '请输入通知内容' }]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入要发送的通知详细正文，支持换行..."
          />
        </Form.Item>

        <Form.Item
          label="有效时长 (分钟)"
          name="ttlMinutes"
          extra="在此期间内保持心跳的在线用户均会收到该条广播，超时自动销毁。"
        >
          <InputNumber min={1} max={120} style={{ width: '100%' }} addonAfter="分钟" />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SendOutlined />}
            loading={loading}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
          >
            立即发布广播
          </Button>
        </div>
      </Form>
    </Modal>
  );
};
