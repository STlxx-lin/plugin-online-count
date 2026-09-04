export default {
  name: 'online_broadcasts',
  title: '即时广播通知',
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
    },
    {
      name: 'broadcastId',
      type: 'string',
      unique: true,
      index: true,
      comment: '唯一广播编号',
    },
    {
      name: 'title',
      type: 'string',
      comment: '通知标题',
    },
    {
      name: 'content',
      type: 'text',
      comment: '广播正文内容',
    },
    {
      name: 'mode',
      type: 'string',
      defaultValue: 'notification',
      comment: '展示方式：notification(浮窗) / modal(强弹窗)',
    },
    {
      name: 'scope',
      type: 'string',
      defaultValue: 'all',
      comment: '发布范围：all(全员) / user(指定用户) / session(指定会话)',
    },
    {
      name: 'type',
      type: 'string',
      defaultValue: 'info',
      comment: '消息等级：info / warning / error / success',
    },
    {
      name: 'targetUserId',
      type: 'bigInt',
      comment: '目标用户 ID',
    },
    {
      name: 'targetUsername',
      type: 'string',
      comment: '目标用户名/昵称',
    },
    {
      name: 'targetSessionId',
      type: 'string',
      comment: '目标会话 Token',
    },
    {
      name: 'status',
      type: 'string',
      defaultValue: 'active',
      index: true,
      comment: '状态：active(生效中) / revoked(已撤回) / expired(已过期)',
    },
    {
      name: 'expiresAt',
      type: 'date',
      comment: '有效截止时间',
    },
    {
      name: 'readCount',
      type: 'integer',
      defaultValue: 0,
      comment: '已读人数累计',
    },
    {
      name: 'readUsers',
      type: 'json',
      defaultValue: [],
      comment: '已读用户列表明细',
    },
    {
      name: 'createdAt',
      type: 'date',
    },
    {
      name: 'updatedAt',
      type: 'date',
    },
  ],
};
