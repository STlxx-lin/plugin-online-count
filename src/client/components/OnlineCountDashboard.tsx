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
  LinkOutlined,
  NotificationOutlined,
  HistoryOutlined,
  SendOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { OnlineTrendChart } from './OnlineTrendChart';
import { useOnlineHeartbeat, getClientAuthInfo } from '../hooks/useOnlineHeartbeat';

const { Text } = Typography;

export const OnlineCountDashboard: React.FC<{ api: any }> = ({ api }) => {
  useOnlineHeartbeat(api);
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

  // 审计日志数据
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);
  const [auditUsername, setAuditUsername] = useState('');
  const [auditReasonFilter, setAuditReasonFilter] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

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

  // 广播通知弹窗
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastForm] = Form.useForm();
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

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
      const queryParams: any = {
        page: p,
        pageSize: ps,
      };
      if (kw && String(kw).trim()) queryParams.keyword = String(kw).trim();
      if (dev && String(dev).trim()) queryParams.device = String(dev).trim();

      const res = await api.request({
        url: 'onlineCount:listSessions',
        params: queryParams,
      });
      const data = res?.data?.data || res?.data;
      if (data) {
        setSessions(data.rows || []);
        setTotalCount(data.count || 0);
      }
    } catch (err: any) {
      message.error('获取在线会话失败：' + (err.message || '网络异常'));
    } finally {
      setSessionsLoading(false);
    }
  };

  // 获取会话审计日志
  const fetchAuditLogs = async (p = auditPage, ps = auditPageSize, un = auditUsername, reason = auditReasonFilter) => {
    if (!api) return;
    try {
      setAuditLoading(true);
      const res = await api.request({
        url: 'onlineCount:getAuditLogs',
        params: {
          page: p,
          pageSize: ps,
          username: un || undefined,
          terminationReason: reason || undefined,
        },
      });
      const data = res?.data?.data || res?.data;
      if (data) {
        setAuditLogs(data.rows || []);
        setAuditTotal(data.count || 0);
      }
    } catch (err: any) {
      message.error('获取审计日志失败：' + (err.message || '网络异常'));
    } finally {
      setAuditLoading(false);
    }
  };

  // 获取趋势图数据
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

  // 加载配置参数
  const fetchConfigs = async () => {
    if (!api) return;
    try {
      setConfigsLoading(true);
      const res = await api.request({ url: 'onlineCount:getConfigs' });
      const data = res?.data?.data || res?.data;
      if (data) {
        configForm.setFieldsValue({
          online_heartbeat_interval: data.online_heartbeat_interval ?? 30,
          online_offline_threshold: data.online_offline_threshold ?? 90,
          online_concurrent_policy: data.online_concurrent_policy ?? 'allow_multiple',
          online_track_guests: Boolean(data.online_track_guests ?? true),
          online_idle_timeout_minutes: data.online_idle_timeout_minutes ?? 30,
          online_audit_log_retention_days: data.online_audit_log_retention_days ?? 30,
        });
      }
    } catch {}
    finally {
      setConfigsLoading(false);
    }
  };

  // 保存策略配置
  const handleSaveConfigs = async (values: any) => {
    if (!api) return;
    try {
      setSavingConfigs(true);
      await api.request({
        url: 'onlineCount:updateConfigs',
        method: 'POST',
        data: values,
      });
      message.success('配置已成功更新生效');
    } catch (err: any) {
      message.error('保存失败：' + (err.message || '网络异常'));
    } finally {
      setSavingConfigs(false);
    }
  };

  // 强制踢下线
  const handleKickout = async (record: any) => {
    if (!api) return;
    try {
      await api.request({
        url: 'onlineCount:kickout',
        method: 'POST',
        data: {
          token: record.token,
          userId: record.userId,
          reason: '管理员手动在后台踢出',
        },
      });
      message.success(`已成功强制下线用户：${record.username || record.nickname || '访客'}`);
      fetchSessions();
      fetchStats();
      if (activeTab === 'audit-logs') {
        fetchAuditLogs();
      }
    } catch (err: any) {
      message.error('踢出失败：' + (err.message || '未知原因'));
    }
  };

  // 打开给特定用户的广播弹窗
  const handleOpenDirectMessage = (record: any) => {
    broadcastForm.resetFields();
    broadcastForm.setFieldsValue({
      title: '系统通知',
      scope: record.userId ? 'user' : 'session',
      targetUserId: record.userId || undefined,
      targetSessionId: record.token,
      mode: 'modal',
      type: 'info',
      ttlMinutes: 15,
      content: `您好，${record.nickname || record.username || '用户'}：`,
    });
    setBroadcastModalOpen(true);
  };

  // 提交发送广播
  const handleSendBroadcast = async (values: any) => {
    if (!api) return;
    try {
      setSendingBroadcast(true);
      await api.request({
        url: 'onlineCount:sendBroadcast',
        method: 'POST',
        data: values,
      });
      message.success('通知已成功发布，目标客户端将在下次心跳时收到提醒！');
      setBroadcastModalOpen(false);
      broadcastForm.resetFields();
    } catch (err: any) {
      message.error('发布失败：' + (err.message || '未知错误'));
    } finally {
      setSendingBroadcast(false);
    }
  };

  useEffect(() => {
    const initDashboard = async () => {
      try {
        const { user, token } = getClientAuthInfo(api);
        await api?.request?.({
          url: 'onlineCount:heartbeat',
          method: 'POST',
          data: {
            userId: user?.id,
            username: user?.username || user?.email,
            nickname: user?.nickname || user?.username,
            token,
            currentPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
          },
        });
      } catch {}
      fetchStats();
      fetchSessions(1, pageSize);
    };

    initDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'trend') {
      fetchTrend();
    } else if (activeTab === 'settings') {
      fetchConfigs();
    } else if (activeTab === 'audit-logs') {
      fetchAuditLogs(1, auditPageSize);
    }
  }, [activeTab]);

  // 定时自动刷新会话与指标
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (activeTab === 'sessions') {
        fetchStats();
        fetchSessions();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, activeTab, page, pageSize, keyword, deviceFilter]);

  // 格式化时长显示
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '< 1 秒';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hours > 0) parts.push(`${hours} 小时`);
    if (minutes > 0) parts.push(`${minutes} 分`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} 秒`);
    return parts.join(' ');
  };

  // 渲染设备图标
  const renderDeviceIcon = (dev: string) => {
    if (dev === 'Mobile') return <MobileOutlined style={{ color: '#1677ff' }} />;
    if (dev === 'Tablet') return <TabletOutlined style={{ color: '#722ed1' }} />;
    return <DesktopOutlined style={{ color: '#52c41a' }} />;
  };

  // 会话表格列配置
  const columns = [
    {
      title: '用户身份',
      key: 'user',
      width: 190,
      render: (_: any, record: any) => {
        const isGuest = !record.userId;
        return (
          <Space>
            <Avatar
              style={{
                backgroundColor: isGuest ? '#d9d9d9' : '#1677ff',
                verticalAlign: 'middle',
              }}
              icon={<UserOutlined />}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: isGuest ? '#8c8c8c' : '#1f1f1f' }}>
                {record.nickname || record.username || (isGuest ? '访客 (Guest)' : `User #${record.userId}`)}
              </span>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {isGuest ? '匿名访问' : `@${record.username || record.userId}`}
              </Text>
            </div>
          </Space>
        );
      },
    },
    {
      title: '客户端 IP / 地理',
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
      render: (ip: string) => (
        <Tag icon={<GlobalOutlined />} color="blue">
          {ip || '127.0.0.1'}
        </Tag>
      ),
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
      width: 140,
      render: (_: any, record: any) => (
        <Space size={8}>
          <Button
            size="small"
            type="link"
            icon={<MessageOutlined />}
            style={{ padding: 0 }}
            onClick={() => handleOpenDirectMessage(record)}
          >
            发消息
          </Button>
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
        </Space>
      ),
    },
  ];

  // 审计日志表格列配置
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
        if (reason === 'kickout') {
          return <Tag color="error">管理员强制下线</Tag>;
        }
        if (reason === 'mutex_kickout') {
          return <Tag color="warning">单点互斥踢出</Tag>;
        }
        if (reason === 'idle_timeout') {
          return <Tag color="gold">挂机空闲超时</Tag>;
        }
        if (reason === 'heartbeat_timeout') {
          return <Tag color="default">心跳断开超时</Tag>;
        }
        if (reason === 'manual_logout') {
          return <Tag color="blue">主动退出登录</Tag>;
        }
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
    <div style={{ padding: '20px 24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 顶部标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22, color: '#1f1f1f' }}>
            👥 在线人数与会话管控中心
          </h2>
          <Text type="secondary" style={{ fontSize: 13 }}>
            实时监控全平台在线用户、掌握系统并发负载与高峰时段、支持多端会话安全管控、即时广播与审计日志。
          </Text>
        </div>

        <Space size={12}>
          <Button
            type="primary"
            icon={<NotificationOutlined />}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
            onClick={() => {
              broadcastForm.resetFields();
              broadcastForm.setFieldsValue({
                title: '系统通知',
                scope: 'all',
                mode: 'notification',
                type: 'info',
                ttlMinutes: 15,
              });
              setBroadcastModalOpen(true);
            }}
          >
            📢 发送即时广播
          </Button>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            自动刷新 ({autoRefresh ? '开启' : '关闭'})
          </span>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} size="small" />
          <Button
            icon={<ReloadOutlined />}
            onClick={async () => {
              try {
                const { user, token } = getClientAuthInfo(api);
                await api?.request?.({
                  url: 'onlineCount:heartbeat',
                  method: 'POST',
                  data: {
                    userId: user?.id,
                    username: user?.username || user?.email,
                    nickname: user?.nickname || user?.username,
                    token,
                    currentPath: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/',
                  },
                });
              } catch {}
              fetchStats();
              if (activeTab === 'sessions') fetchSessions();
              if (activeTab === 'audit-logs') fetchAuditLogs();
              if (activeTab === 'trend') fetchTrend();
            }}
            loading={statsLoading || sessionsLoading || auditLoading}
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
              key: 'audit-logs',
              label: (
                <span>
                  <HistoryOutlined style={{ marginRight: 6 }} />
                  会话审计日志 ({auditTotal})
                </span>
              ),
              children: (
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
                        value={auditUsername}
                        onChange={(e) => setAuditUsername(e.target.value)}
                        onPressEnter={() => {
                          setAuditPage(1);
                          fetchAuditLogs(1, auditPageSize, auditUsername, auditReasonFilter);
                        }}
                        allowClear
                        style={{ width: 220 }}
                      />
                      <Select
                        placeholder="所有下线原因"
                        value={auditReasonFilter || undefined}
                        onChange={(val) => {
                          setAuditReasonFilter(val || '');
                          setAuditPage(1);
                          fetchAuditLogs(1, auditPageSize, auditUsername, val || '');
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
                          setAuditPage(1);
                          fetchAuditLogs(1, auditPageSize, auditUsername, auditReasonFilter);
                        }}
                      >
                        查询
                      </Button>
                    </Space>

                    <Button icon={<ReloadOutlined />} onClick={() => fetchAuditLogs()}>
                      刷新审计日志
                    </Button>
                  </div>

                  <Table
                    columns={auditColumns}
                    dataSource={auditLogs}
                    rowKey="id"
                    loading={auditLoading}
                    pagination={{
                      current: auditPage,
                      pageSize: auditPageSize,
                      total: auditTotal,
                      showTotal: (total) => `共 ${total} 条历史审计记录`,
                      onChange: (p, ps) => {
                        setAuditPage(p);
                        setAuditPageSize(ps);
                        fetchAuditLogs(p, ps, auditUsername, auditReasonFilter);
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

      {/* 发送广播 / 消息弹窗 */}
      <Modal
        title="📢 发布即时通知与广播"
        open={broadcastModalOpen}
        onCancel={() => setBroadcastModalOpen(false)}
        footer={null}
        destroyOnClose
        width={540}
      >
        <Form
          form={broadcastForm}
          layout="vertical"
          onFinish={handleSendBroadcast}
          initialValues={{
            title: '系统通知',
            scope: 'all',
            mode: 'notification',
            type: 'info',
            ttlMinutes: 15,
          }}
        >
          <Form.Item
            label="通知范围"
            name="scope"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio.Button value="all">全员广播 (所有在线用户与访客)</Radio.Button>
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
                  <Form.Item
                    label="目标用户 ID"
                    name="targetUserId"
                    rules={[{ required: true, message: '请输入目标用户 ID' }]}
                  >
                    <Input placeholder="例如: 1" />
                  </Form.Item>
                );
              }
              if (scope === 'session') {
                return (
                  <Form.Item
                    label="目标会话 Token"
                    name="targetSessionId"
                    rules={[{ required: true, message: '请输入目标会话 Token' }]}
                  >
                    <Input placeholder="输入或从表格选中的会话 Token" />
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
            <Button onClick={() => setBroadcastModalOpen(false)}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              loading={sendingBroadcast}
              style={{ background: '#722ed1', borderColor: '#722ed1' }}
            >
              立即发送
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
