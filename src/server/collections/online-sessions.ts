export default {
  name: 'online_sessions',
  title: '在线会话',
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
    },
    {
      name: 'token',
      type: 'string',
      unique: true,
      index: true,
      comment: '会话唯一 Token 标识',
    },
    {
      name: 'userId',
      type: 'bigInt',
      index: true,
      comment: '关联用户 ID',
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
      name: 'userAgent',
      type: 'text',
      comment: '客户端 User-Agent',
    },
    {
      name: 'device',
      type: 'string',
      comment: '设备类型 (Desktop/Mobile/Tablet)',
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
      name: 'currentPath',
      type: 'string',
      comment: '当前所在路由页面',
    },
    {
      name: 'loginAt',
      type: 'date',
      comment: '登录会话建立时间',
    },
    {
      name: 'lastActiveAt',
      type: 'date',
      index: true,
      comment: '最后一次心跳活跃时间',
    },
    {
      name: 'isKicked',
      type: 'boolean',
      defaultValue: false,
      comment: '是否已被管理员强制下线',
    },
    {
      name: 'kickReason',
      type: 'string',
      comment: '强制下线原因',
    },
  ],
};
