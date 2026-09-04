export default {
  name: 'online_audit_logs',
  title: '会话审计日志',
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
    },
    {
      name: 'sessionId',
      type: 'string',
      index: true,
      comment: '会话标识/Token',
    },
    {
      name: 'userId',
      type: 'bigInt',
      index: true,
      comment: '用户 ID',
    },
    {
      name: 'username',
      type: 'string',
      index: true,
      comment: '用户名',
    },
    {
      name: 'nickname',
      type: 'string',
      comment: '用户昵称',
    },
    {
      name: 'ip',
      type: 'string',
      comment: '客户端 IP 地址',
    },
    {
      name: 'device',
      type: 'string',
      comment: '设备类型',
    },
    {
      name: 'os',
      type: 'string',
      comment: '操作系统',
    },
    {
      name: 'browser',
      type: 'string',
      comment: '浏览器',
    },
    {
      name: 'loginAt',
      type: 'date',
      comment: '登录/建立会话时间',
    },
    {
      name: 'logoutAt',
      type: 'date',
      index: true,
      comment: '下线/结束时间',
    },
    {
      name: 'durationSeconds',
      type: 'integer',
      comment: '在线总时长 (秒)',
    },
    {
      name: 'terminationReason',
      type: 'string',
      index: true,
      comment: '下线原因 (kickout, mutex_kickout, heartbeat_timeout, idle_timeout, manual_logout)',
    },
    {
      name: 'detail',
      type: 'string',
      comment: '详细备注说明',
    },
  ],
};
