import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Modal,
  Tabs,
  Form,
  InputNumber,
  Radio,
  Switch,
  message,
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
  FireOutlined,
  ClockCircleOutlined,
  LogoutOutlined,
  SettingOutlined,
  LineChartOutlined,
  TeamOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { OnlineTrendChart } from './OnlineTrendChart';

const { Text } = Typography;

export const OnlineCountDashboard: React.FC<{ api: any }> = ({ api }) => {
  const [activeTab, setActiveTab] = useState('sessions');
  const [stats, setStats] = useState({
    totalOnline: 0,
    userOnline: 0,
    guestOnline: 0,
    todayPeak: 0,
    avgDurationMinutes: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // 会话列表数据
  const [sessions, setSessions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 趋势图数据
  const [trendData, setTrendData] = useState<{
    times: string[];
    total: number[];
    users: number[];
    guests: number[];
  }>({ times: [], total: [], users: [], guests: [] });
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendRange, setTrendRange] = useState<'today' | '7days'>('today');

  // 配置表单
  const [configForm] = Form.useForm();
  const [configsLoading, setConfigsLoading] = useState(false);
  const [savingConfigs, setSavingConfigs] = useState(false);

  // 获取指标概览
  const fetchStats = async () => {
    if (!api) return;
    try {
      setStatsLoading(true);
      const res = await api.request({ url: 'onlineCount:getStats' });
      const data = res?.data?.data || res?.data;
      if (data) setStats(data);
    } catch {}
    finally {
      setStatsLoading(false);
    }
  };

  // 获取会话列表
  const fetchSessions = async (p = page, ps = pageSize, kw = keyword, dev = deviceFilter) => {
    if (!api) return;
    try {
      setSessionsLoading(true);
      const res = await api.request({
        url: 'onlineCount:listSessions',
        params: { page: p, pageSize: ps, keyword: kw, device: dev },
      });
      const data = res?.data?.data || res?.data;
      if (data) {
        setSessions(data.rows || []);
        setTotalCount(data.count || 0);
      }
    } catch {}
    finally {
      setSessionsLoading(false);
    }
  };

  // 获取趋势数据
  const fetchTrend = async (range = trendRange) => {
    if (!api) return;
    try {
      setTrendLoading(true);
      const res = await api.request({
        url: 'onlineCount:getTrend',
        params: { range },
      });
      const data = res?.data?.data || res?.data;
      if (data) setTrendData(data);
    } catch {}
    finally {
      setTrendLoading(false);
    }
  };

  // 获取配置
  const fetchConfigs = async () => {
    if (!api) return;
    try {
      setConfigsLoading(true);
      const res = await api.request({ url: 'onlineCount:getConfigs' });
      const data = res?.data?.data || res?.data;
      if (data) {
        configForm.setFieldsValue(data);
      }
    } catch {}
    finally {
      setConfigsLoading(false);
    }
  };

  // 强制踢出会话
  const handleKickout = async (record: any) => {
    try {
      const res = await api.request({
        url: 'onlineCount:kickout',
        method: 'POST',
        data: {
          token: record.token,
          userId: record.userId,
          reason: `管理员操作强制下线 (${record.username || record.ip})`,
        },
      });
      message.success(`已成功踢出会话：${record.username || record.ip}`);
      fetchSessions();
      fetchStats();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '强制下线操作失败');
    }
  };

  // 保存配置
  const handleSaveConfigs = async (values: any) => {
    try {
      setSavingConfigs(true);
      await api.request({
        url: 'onlineCount:updateConfigs',
        method: 'POST',
        data: values,
      });
      message.success('插件配置已成功保存并实时生效！');
      fetchConfigs();
    } catch {
      message.error('保存配置失败');
    } finally {
      setSavingConfigs(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSessions();
  }, [api]);

  useEffect(() => {
    if (activeTab === 'trend') {
      fetchTrend(trendRange);
    } else if (activeTab === 'settings') {
      fetchConfigs();
    }
  }, [activeTab, trendRange]);

  // 自动轮询刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchStats();
      if (activeTab === 'sessions') {
        fetchSessions(page, pageSize, keyword, deviceFilter);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, page, pageSize, keyword, deviceFilter, activeTab]);

  const deviceTag = (dev: string) => {
    if (dev === 'Mobile') return <Tag icon={<MobileOutlined />} color="purple">手机端</Tag>;
    if (dev === 'Tablet') return <Tag icon={<TabletOutlined />} color="cyan">平板</Tag>;
    return <Tag icon={<DesktopOutlined />} color="blue">PC桌面</Tag>;
  };

  const columns = [
    {
      title: '在线用户',
      key: 'user',
      width: 180,
      render: (_: any, record: any) => (
        <Space size={10}>
          <Avatar
            style={{
              backgroundColor: record.userId ? '#1677ff' : '#8c8c8c',
              verticalAlign: 'middle',
            }}
            icon={<UserOutlined />}
          >
            {record.nickname ? record.nickname.charAt(0).toUpperCase() : 'U'}
          </Avatar>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, color: '#262626' }}>
              {record.nickname || record.username || '访客'}
            </span>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.userId ? `@${record.username}` : '未登录访客'}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '客户端环境',
      key: 'client',
      width: 200,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {deviceTag(record.device)}
            <Tag color="geekblue" style={{ margin: 0 }}>{record.browser || 'Browser'}</Tag>
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.os || 'OS'} | IP: <code style={{ fontSize: 11 }}>{record.ip}</code>
          </Text>
        </div>
      ),
    },
    {
      title: '当前访问页面',
      dataIndex: 'currentPath',
      key: 'currentPath',
      width: 180,
      ellipsis: true,
      render: (path: string) => (
        <Tooltip title={path}>
          <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
            {path || '/'}
          </code>
        </Tooltip>
      ),
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
      title: '首次上线时间',
      dataIndex: 'loginAt',
      key: 'loginAt',
      width: 150,
      render: (time: any) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {new Date(time).toLocaleTimeString()}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: any) => (
        <Popconfirm
          title="确定要将该用户强制下线吗？"
          description="下线后该用户的终端将立即失去访问权限并返回登录页。"
          onConfirm={() => handleKickout(record)}
          okText="确认下线"
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
            强制下线
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22, color: '#1f1f1f' }}>
            👥 在线人数与会话管控中心
          </h2>
          <Text type="secondary" style={{ fontSize: 13 }}>
            实时监控全平台在线用户、掌握系统并发负载与高峰时段、支持多端会话安全管控与一键强制下线。
          </Text>
        </div>

        <Space>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            自动刷新 ({autoRefresh ? '开启' : '关闭'})
          </span>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} size="small" />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchStats();
              fetchSessions();
            }}
            loading={statsLoading || sessionsLoading}
          >
            刷新数据
          </Button>
        </Space>
      </div>

      {/* 4 张统计指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontWeight: 500 }}>🟢 当前实时在线</span>}
              value={stats.totalOnline}
              suffix="人"
              valueStyle={{ color: '#1677ff', fontWeight: 700, fontSize: 28 }}
              prefix={<TeamOutlined style={{ marginRight: 6 }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              认证用户: <strong style={{ color: '#52c41a' }}>{stats.userOnline}</strong> | 访客: <strong>{stats.guestOnline}</strong>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontWeight: 500 }}>🔥 今日最高并发峰值</span>}
              value={stats.todayPeak}
              suffix="人"
              valueStyle={{ color: '#fa541c', fontWeight: 700, fontSize: 28 }}
              prefix={<FireOutlined style={{ marginRight: 6 }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              今日系统承载最高在线记录
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontWeight: 500 }}>⏱️ 平均在线停留时长</span>}
              value={stats.avgDurationMinutes}
              suffix="分钟"
              valueStyle={{ color: '#722ed1', fontWeight: 700, fontSize: 28 }}
              prefix={<ClockCircleOutlined style={{ marginRight: 6 }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              当前在线人员平均活跃周期
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <Statistic
              title={<span style={{ color: '#8c8c8c', fontWeight: 500 }}>🛡️ 会话安全防护状态</span>}
              value="正常运行"
              valueStyle={{ color: '#52c41a', fontWeight: 700, fontSize: 20 }}
              prefix={<SafetyCertificateOutlined style={{ marginRight: 6 }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              心跳活跃检测与踢出拦截就绪
            </div>
          </Card>
        </Col>
      </Row>

      {/* 主工作区 Tabs */}
      <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'sessions',
              label: (
                <span>
                  <TeamOutlined style={{ marginRight: 6 }} />
                  实时在线会话 ({totalCount})
                </span>
              ),
              children: (
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
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        onPressEnter={() => {
                          setPage(1);
                          fetchSessions(1, pageSize, keyword, deviceFilter);
                        }}
                        allowClear
                        style={{ width: 260 }}
                      />
                      <Select
                        placeholder="所有设备类型"
                        value={deviceFilter || undefined}
                        onChange={(val) => {
                          setDeviceFilter(val || '');
                          setPage(1);
                          fetchSessions(1, pageSize, keyword, val || '');
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
                          setPage(1);
                          fetchSessions(1, pageSize, keyword, deviceFilter);
                        }}
                      >
                        查询
                      </Button>
                    </Space>

                    <Button icon={<ReloadOutlined />} onClick={() => fetchSessions()}>
                      刷新列表
                    </Button>
                  </div>

                  <Table
                    columns={columns}
                    dataSource={sessions}
                    rowKey="token"
                    loading={sessionsLoading}
                    pagination={{
                      current: page,
                      pageSize,
                      total: totalCount,
                      showTotal: (total) => `共 ${total} 条在线会话`,
                      onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                        fetchSessions(p, ps, keyword, deviceFilter);
                      },
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'trend',
              label: (
                <span>
                  <LineChartOutlined style={{ marginRight: 6 }} />
                  在线走势与时序分析
                </span>
              ),
              children: (
                <div>
                  <OnlineTrendChart
                    times={trendData.times}
                    total={trendData.total}
                    users={trendData.users}
                    guests={trendData.guests}
                    loading={trendLoading}
                    onRangeChange={(range) => {
                      setTrendRange(range);
                      fetchTrend(range);
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'settings',
              label: (
                <span>
                  <SettingOutlined style={{ marginRight: 6 }} />
                  策略与参数配置
                </span>
              ),
              children: (
                <div style={{ maxWidth: 650, padding: '16px 0' }}>
                  <Form
                    form={configForm}
                    layout="vertical"
                    onFinish={handleSaveConfigs}
                    disabled={configsLoading}
                  >
                    <Form.Item
                      label="心跳上报间隔 (秒)"
                      name="online_heartbeat_interval"
                      extra="前端浏览器静默向服务器发送心跳保持活跃状态的间隔时间，建议 30 秒。"
                    >
                      <InputNumber min={10} max={300} style={{ width: 200 }} />
                    </Form.Item>

                    <Form.Item
                      label="离线超时判定阈值 (秒)"
                      name="online_offline_threshold"
                      extra="超过该时间未收到心跳包，系统将自动判定该用户已断开离线，建议 90 秒。"
                    >
                      <InputNumber min={30} max={600} style={{ width: 200 }} />
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
                      <Button type="primary" htmlType="submit" loading={savingConfigs} size="large">
                        保存策略配置
                      </Button>
                    </Form.Item>
                  </Form>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
