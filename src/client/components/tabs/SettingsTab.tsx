import React from 'react';
import {
  Form,
  InputNumber,
  Radio,
  Switch,
  Button,
  Space,
} from 'antd';

export interface SettingsTabProps {
  form: any;
  loading: boolean;
  saving: boolean;
  onSave: (values: any) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  form,
  loading,
  saving,
  onSave,
}) => {
  return (
    <div style={{ maxWidth: 650, padding: '16px 0' }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
        disabled={loading}
      >
        <Form.Item
          label="心跳上报间隔 (秒)"
          name="online_heartbeat_interval"
          extra="前端浏览器静默向服务器发送心跳保持活跃状态的间隔时间，建议 30 秒。"
        >
          <InputNumber min={10} max={300} style={{ width: 220 }} />
        </Form.Item>

        <Form.Item
          label="离线超时判定阈值 (秒)"
          name="online_offline_threshold"
          extra="超过该时间未收到心跳包，系统将自动判定该用户已断开离线并记录审计日志，建议 90 秒。"
        >
          <InputNumber min={30} max={600} style={{ width: 220 }} />
        </Form.Item>

        <Form.Item
          label="挂机空闲超时自动登出 (分钟)"
          name="online_idle_timeout_minutes"
          extra="用户在浏览器中无任何键盘、鼠标或交互操作达到设定时长后，将弹出 60 秒倒计时预警，到期未响应自动注销登出。填 0 表示禁用挂机保护。"
        >
          <InputNumber min={0} max={1440} style={{ width: 220 }} addonAfter="分钟 (0为禁用)" />
        </Form.Item>

        <Form.Item
          label="会话审计日志保留周期 (天)"
          name="online_audit_log_retention_days"
          extra="系统自动清理超过指定天数的历史下线审计记录，避免数据库存储膨胀，建议 30 天。"
        >
          <InputNumber min={1} max={365} style={{ width: 220 }} addonAfter="天" />
        </Form.Item>

        <Form.Item
          label="多端并发登录策略"
          name="online_concurrent_policy"
          extra="单端互斥模式下，同一账号在另一台设备登录时，前一个会话将被自动强制下线。"
        >
          <Radio.Group>
            <Radio value="allow_multiple">
              <Space direction="vertical" align="start">
                <span style={{ fontWeight: 600 }}>允许多端同时在线</span>
                <span style={{ color: '#8c8c8c', fontSize: 12 }}>同一账号可在手机、电脑等多处同时登录使用。</span>
              </Space>
            </Radio>
            <Radio value="single_kick_previous" style={{ marginTop: 12 }}>
              <Space direction="vertical" align="start">
                <span style={{ fontWeight: 600 }}>单端互斥（后登录踢出先登录）</span>
                <span style={{ color: '#8c8c8c', fontSize: 12 }}>新设备登录成功后，旧设备的会话立即失效被踢出。</span>
              </Space>
            </Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label="是否统计未登录访客"
          name="online_track_guests"
          valuePropName="checked"
          extra="开启后将对未登录的匿名访客也建立临时会话并计入在线总数。"
        >
          <Switch />
        </Form.Item>

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" loading={saving} size="large">
            保存策略配置
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};
