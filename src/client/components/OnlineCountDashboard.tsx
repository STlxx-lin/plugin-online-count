import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Space,
  Tabs,
  Form,
  Switch,
  message,
  Typography,
} from 'antd';
import {
  ReloadOutlined,
  FireOutlined,
  ClockCircleOutlined,
  SettingOutlined,
  LineChartOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  NotificationOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { OnlineTrendChart } from './OnlineTrendChart';
import { getClientAuthInfo, safeRedirectToLogin } from '../hooks/useOnlineHeartbeat';
import { SessionsTab } from './tabs/SessionsTab';
import { BroadcastsTab } from './tabs/BroadcastsTab';
import { AuditLogsTab } from './tabs/AuditLogsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { BroadcastSendModal } from './modals/BroadcastSendModal';
import { BroadcastReadersDrawer } from './modals/BroadcastReadersDrawer';

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

  // 广播通知管理与历史数据
  const [broadcastList, setBroadcastList] = useState<any[]>([]);
  const [broadcastTotal, setBroadcastTotal] = useState(0);
  const [broadcastPage, setBroadcastPage] = useState(1);
  const [broadcastPageSize, setBroadcastPageSize] = useState(10);
  const [broadcastStatusFilter, setBroadcastStatusFilter] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  // 在线认证用户下拉列表
  const [onlineUserOptions, setOnlineUserOptions] = useState<{ label: string; value: string; userId: any }[]>([]);

  // 广播阅读人员明细抽屉
  const [readersDrawerOpen, setReadersDrawerOpen] = useState(false);
  const [currentReaders, setCurrentReaders] = useState<any[]>([]);
  const [selectedBroadcastTitle, setSelectedBroadcastTitle] = useState('');
  const [readersLoading, setReadersLoading] = useState(false);

  // 发送广播弹窗
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastForm] = Form.useForm();
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // 优雅登出并引导跳转登录页
  const handleLogoutAndRedirect = (reasonText?: string) => {
    safeRedirectToLogin(api, reasonText);
  };

  // 通用安全解析分页列表数据，全面兼容 NocoBase 的多种响应包装
  const parsePagedData = (res: any) => {
    const raw = res?.data;
    let rows: any[] = [];
    let count = 0;

    if (Array.isArray(raw?.data)) {
      rows = raw.data;
    } else if (Array.isArray(raw?.rows)) {
      rows = raw.rows;
    } else if (Array.isArray(raw?.data?.rows)) {
      rows = raw.data.rows;
    } else if (Array.isArray(raw)) {
      rows = raw;
    }

    if (typeof raw?.meta?.count === 'number') {
      count = raw.meta.count;
    } else if (typeof raw?.count === 'number') {
      count = raw.count;
    } else if (typeof raw?.data?.count === 'number') {
      count = raw.data.count;
    } else {
      count = rows.length;
    }

    return { rows, count };
  };

  // 获取指标概览
  const fetchStats = async () => {
    if (!api) return;
    try {
      setStatsLoading(true);
      const res = await api.request({ url: 'onlineCount:getStats' });
      const data = res?.data?.data || res?.data;
      if (data) setStats(data);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        const errData = err.response.data;
        if (errData?.kicked || errData?.code === 'SESSION_KICKED_OUT') {
          handleLogoutAndRedirect(errData.message);
        }
      }
    } finally {
      setStatsLoading(false);
    }
  };

  // 获取会话列表
  const fetchSessions = async (p = page, ps = pageSize, kw = keyword, dev = deviceFilter, isManual = false) => {
    if (!api) return;
    try {
      setSessionsLoading(true);
      const queryParams: any = { page: p, pageSize: ps };
      if (kw && String(kw).trim()) queryParams.keyword = String(kw).trim();
      if (dev && String(dev).trim()) queryParams.device = String(dev).trim();

      const res = await api.request({
        url: 'onlineCount:listSessions',
        params: queryParams,
      });
      const { rows, count } = parsePagedData(res);
      setSessions(rows);
      setTotalCount(count);
    } catch (err: any) {
      console.warn('[OnlineCount] 获取在线会话异常:', err);
      if (err?.response?.status === 401) {
        const errData = err.response.data;
        if (errData?.kicked || errData?.code === 'SESSION_KICKED_OUT') {
          handleLogoutAndRedirect(errData.message);
          return;
        }
      }
      if (isManual) {
        message.error('获取在线会话失败：' + (err.message || '网络异常'));
      }
    } finally {
      setSessionsLoading(false);
    }
  };

  // 获取在线认证及系统用户选项
  const fetchOnlineUsersList = async () => {
    if (!api) return;
    try {
      const res = await api.request({ url: 'onlineCount:getOnlineUsersList' });
      let list: any = res?.data;
      while (list && list.data && !Array.isArray(list)) {
        list = list.data;
      }
      if (!Array.isArray(list)) list = [];

      // 若后端尚未返回在线会话，从当前 sessions 状态进行兜底补充
      if (sessions && sessions.length > 0) {
        const existUserIds = new Set(list.map((u: any) => Number(u.userId)));
        sessions.forEach((s: any) => {
          if (s.userId && !existUserIds.has(Number(s.userId))) {
            existUserIds.add(Number(s.userId));
            list.unshift({
              userId: Number(s.userId),
              username: s.username,
              nickname: s.nickname,
              isOnline: true,
            });
          }
        });
      }

      const opts = list.map((u: any) => ({
        label: `${u.isOnline ? '🟢 [在线]' : '⚪ [离线]'} ${u.nickname || u.username} (@${u.username})`,
        value: String(u.username),
        userId: u.userId,
      }));
      setOnlineUserOptions(opts);
    } catch {}
  };

  // 获取广播历史列表
  const fetchBroadcasts = async (p = broadcastPage, ps = broadcastPageSize, status = broadcastStatusFilter, isManual = false) => {
    if (!api) return;
    try {
      setBroadcastLoading(true);
      const res = await api.request({
        url: 'onlineCount:listBroadcasts',
        params: {
          page: p,
          pageSize: ps,
          status: status || undefined,
        },
      });
      const { rows, count } = parsePagedData(res);
      setBroadcastList(rows);
      setBroadcastTotal(count);
    } catch (err: any) {
      console.warn('[OnlineCount] 获取广播历史异常:', err);
      if (isManual) {
        message.error('获取广播历史失败：' + (err.message || '网络异常'));
      }
    } finally {
      setBroadcastLoading(false);
    }
  };

  // 撤回广播
  const handleRevokeBroadcast = async (record: any) => {
    if (!api) return;
    try {
      const broadcastId = typeof record === 'object' ? (record.broadcastId || record.id) : record;
      const id = typeof record === 'object' ? record.id : undefined;
      await api.request({
        url: 'onlineCount:revokeBroadcast',
        method: 'POST',
        data: {
          broadcastId,
          id,
        },
      });
      message.success('已成功撤回该条广播，客户端将不再展示！');
      fetchBroadcasts();
    } catch (err: any) {
      message.error('撤回失败：' + (err.message || '未知错误'));
    }
  };

  // 查看已读人员明细
  const handleViewReaders = async (record: any) => {
    if (!api) return;
    try {
      setReadersLoading(true);
      setSelectedBroadcastTitle(record.title);
      setReadersDrawerOpen(true);
      const broadcastId = record.broadcastId || record.id;
      const res = await api.request({
        url: 'onlineCount:getBroadcastReaders',
        params: {
          broadcastId,
          id: record.id,
        },
      });
      let payload: any = res?.data;
      while (payload && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) && !payload.readUsers) {
        payload = payload.data;
      }
      let list: any = Array.isArray(payload) ? payload : (payload?.readUsers || payload?.data || []);
      if (typeof list === 'string') {
        try {
          const parsed = JSON.parse(list);
          if (Array.isArray(parsed)) list = parsed;
        } catch {}
      }
      if (!Array.isArray(list)) list = [];
      setCurrentReaders(list);
    } catch (err: any) {
      if (err?.message === 'Network Error') {
        message.warning('服务正处在重载更新中，请刷新页面重试');
      } else {
        message.error('获取已读人员明细失败：' + (err.message || '网络异常'));
      }
    } finally {
      setReadersLoading(false);
    }
  };

  // 获取会话审计日志
  const fetchAuditLogs = async (p = auditPage, ps = auditPageSize, un = auditUsername, reason = auditReasonFilter, isManual = false) => {
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
      const { rows, count } = parsePagedData(res);
      setAuditLogs(rows);
      setAuditTotal(count);
    } catch (err: any) {
      console.warn('[OnlineCount] 获取审计日志异常:', err);
      if (err?.response?.status === 401) {
        const errData = err.response.data;
        if (errData?.kicked || errData?.code === 'SESSION_KICKED_OUT') {
          handleLogoutAndRedirect(errData.message);
          return;
        }
      }
      if (isManual) {
        message.error('获取审计日志失败：' + (err.message || '网络异常'));
      }
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
    const currentAuth = getClientAuthInfo(api);
    const isCurrentSession = Boolean(
      (record.token && currentAuth.token && record.token === currentAuth.token) ||
      (record.userId && currentAuth.user?.id && Number(record.userId) === Number(currentAuth.user.id))
    );

    try {
      const res = await api.request({
        url: 'onlineCount:kickout',
        method: 'POST',
        data: {
          token: record.token,
          userId: record.userId,
          relatedTokens: record.relatedTokens || [],
          reason: '管理员手动在后台踢出',
        },
      });
      const resData = res?.data?.data || res?.data;

      if (isCurrentSession || resData?.isSelf) {
        handleLogoutAndRedirect('您已成功下线当前管理员会话，系统已安全登出。');
        return;
      }

      message.success(`已成功强制下线用户：${record.username || record.nickname || '访客'}`);
      fetchSessions();
      fetchStats();
      if (activeTab === 'audit-logs') {
        fetchAuditLogs();
      }
    } catch (err: any) {
      if (err?.response?.status === 401 && isCurrentSession) {
        handleLogoutAndRedirect('当前管理员会话已下线，系统已安全登出。');
        return;
      }
      message.error('踢出失败：' + (err.message || '未知原因'));
    }
  };

  // 打开给特定用户的广播弹窗
  const handleOpenDirectMessage = (record: any) => {
    fetchOnlineUsersList();
    broadcastForm.resetFields();
    broadcastForm.setFieldsValue({
      title: '系统消息提醒',
      scope: record.userId ? 'user' : 'session',
      targetUsername: record.username || undefined,
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
      const payload = { ...values };

      if (payload.scope === 'user') {
        const usernameVal = payload.targetUsername ? String(payload.targetUsername).trim() : '';
        if (!usernameVal && !payload.targetUserId) {
          message.error('请选择或输入目标用户名或 UID');
          setSendingBroadcast(false);
          return;
        }

        // 尝试从当前 onlineUserOptions 自动匹配补充 targetUserId
        if (!payload.targetUserId && usernameVal) {
          const matched = onlineUserOptions.find(
            (opt: any) =>
              String(opt.value).toLowerCase() === usernameVal.toLowerCase() ||
              String(opt.userId) === usernameVal
          );
          if (matched && matched.userId) {
            payload.targetUserId = matched.userId;
            payload.targetUsername = matched.value;
          }
        }
      }

      await api.request({
        url: 'onlineCount:sendBroadcast',
        method: 'POST',
        data: payload,
      });
      message.success('广播通知已成功发布，目标在线客户端将在心跳时即时送达！');
      setBroadcastModalOpen(false);
      broadcastForm.resetFields();
      if (activeTab === 'broadcasts') {
        fetchBroadcasts();
      }
    } catch (err: any) {
      message.error('发布失败：' + (err.message || '未知错误'));
    } finally {
      setSendingBroadcast(false);
    }
  };

  useEffect(() => {
    const initDashboard = async () => {
      fetchStats();
      fetchSessions(1, pageSize);
      fetchBroadcasts(1, broadcastPageSize);
      fetchAuditLogs(1, auditPageSize);
    };

    initDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'broadcasts') {
      fetchBroadcasts(1, broadcastPageSize);
      fetchOnlineUsersList();
    } else if (activeTab === 'trend') {
      fetchTrend();
    } else if (activeTab === 'settings') {
      fetchConfigs();
    } else if (activeTab === 'audit-logs') {
      fetchAuditLogs(1, auditPageSize);
    }
  }, [activeTab]);

  // 打开广播弹窗时自动拉取最新在线/系统用户列表
  useEffect(() => {
    if (broadcastModalOpen) {
      fetchOnlineUsersList();
    }
  }, [broadcastModalOpen]);

  // 定时自动刷新会话与指标
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (activeTab === 'sessions') {
        fetchStats();
        fetchSessions();
      } else if (activeTab === 'broadcasts') {
        fetchBroadcasts();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, activeTab, page, pageSize, keyword, deviceFilter, broadcastPage, broadcastPageSize, broadcastStatusFilter]);

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
              fetchOnlineUsersList();
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
            onClick={() => {
              fetchStats();
              fetchSessions(page, pageSize, keyword, deviceFilter, activeTab === 'sessions');
              fetchBroadcasts(broadcastPage, broadcastPageSize, broadcastStatusFilter, activeTab === 'broadcasts');
              fetchAuditLogs(auditPage, auditPageSize, auditUsername, auditReasonFilter, activeTab === 'audit-logs');
              if (activeTab === 'trend') fetchTrend();
            }}
            loading={statsLoading || sessionsLoading || auditLoading || broadcastLoading}
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
                <SessionsTab
                  api={api}
                  sessions={sessions}
                  totalCount={totalCount}
                  loading={sessionsLoading}
                  page={page}
                  pageSize={pageSize}
                  keyword={keyword}
                  deviceFilter={deviceFilter}
                  onPageChange={(p, ps) => {
                    setPage(p);
                    setPageSize(ps);
                    fetchSessions(p, ps, keyword, deviceFilter);
                  }}
                  onSearchChange={(kw, dev) => {
                    setKeyword(kw);
                    setDeviceFilter(dev);
                    setPage(1);
                    fetchSessions(1, pageSize, kw, dev);
                  }}
                  onRefresh={() => fetchSessions()}
                  onKickout={handleKickout}
                  onDirectMessage={handleOpenDirectMessage}
                />
              ),
            },
            {
              key: 'broadcasts',
              label: (
                <span>
                  <NotificationOutlined style={{ marginRight: 6 }} />
                  广播通知管理 ({broadcastTotal})
                </span>
              ),
              children: (
                <BroadcastsTab
                  broadcastList={broadcastList}
                  total={broadcastTotal}
                  loading={broadcastLoading}
                  page={broadcastPage}
                  pageSize={broadcastPageSize}
                  statusFilter={broadcastStatusFilter}
                  onPageChange={(p, ps) => {
                    setBroadcastPage(p);
                    setBroadcastPageSize(ps);
                    fetchBroadcasts(p, ps, broadcastStatusFilter);
                  }}
                  onFilterChange={(st) => {
                    setBroadcastStatusFilter(st);
                    setBroadcastPage(1);
                    fetchBroadcasts(1, broadcastPageSize, st);
                  }}
                  onRefresh={() => fetchBroadcasts()}
                  onOpenSendModal={() => {
                    fetchOnlineUsersList();
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
                  onRevoke={handleRevokeBroadcast}
                  onViewReaders={handleViewReaders}
                />
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
                <AuditLogsTab
                  auditLogs={auditLogs}
                  total={auditTotal}
                  loading={auditLoading}
                  page={auditPage}
                  pageSize={auditPageSize}
                  username={auditUsername}
                  reasonFilter={auditReasonFilter}
                  onPageChange={(p, ps) => {
                    setAuditPage(p);
                    setAuditPageSize(ps);
                    fetchAuditLogs(p, ps, auditUsername, auditReasonFilter);
                  }}
                  onSearchChange={(un, reason) => {
                    setAuditUsername(un);
                    setAuditReasonFilter(reason);
                    setAuditPage(1);
                    fetchAuditLogs(1, auditPageSize, un, reason);
                  }}
                  onRefresh={() => fetchAuditLogs()}
                />
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
                <SettingsTab
                  form={configForm}
                  loading={configsLoading}
                  saving={savingConfigs}
                  onSave={handleSaveConfigs}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 查看已读人员明细抽屉 */}
      <BroadcastReadersDrawer
        open={readersDrawerOpen}
        title={selectedBroadcastTitle}
        readers={currentReaders}
        loading={readersLoading}
        onClose={() => setReadersDrawerOpen(false)}
      />

      {/* 发送广播 / 消息弹窗 */}
      <BroadcastSendModal
        open={broadcastModalOpen}
        form={broadcastForm}
        loading={sendingBroadcast}
        onlineUserOptions={onlineUserOptions}
        onCancel={() => setBroadcastModalOpen(false)}
        onSend={handleSendBroadcast}
        onFetchOnlineUsers={fetchOnlineUsersList}
      />
    </div>
  );
};
export default OnlineCountDashboard;
