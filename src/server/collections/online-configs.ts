export default {
  name: 'online_configs',
  title: '在线统计插件配置',
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
    },
    {
      name: 'key',
      type: 'string',
      unique: true,
      index: true,
      comment: '配置键名',
    },
    {
      name: 'value',
      type: 'text',
      comment: '配置键值',
    },
    {
      name: 'description',
      type: 'string',
      comment: '配置描述',
    },
  ],
};
