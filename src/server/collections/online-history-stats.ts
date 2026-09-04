export default {
  name: 'online_history_stats',
  title: '在线人数历史统计',
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
    },
    {
      name: 'totalCount',
      type: 'integer',
      defaultValue: 0,
      comment: '总在线人数',
    },
    {
      name: 'userCount',
      type: 'integer',
      defaultValue: 0,
      comment: '已登录用户数',
    },
    {
      name: 'guestCount',
      type: 'integer',
      defaultValue: 0,
      comment: '未登录访客数',
    },
    {
      name: 'sampleTime',
      type: 'date',
      index: true,
      comment: '采样时间戳',
    },
  ],
};
