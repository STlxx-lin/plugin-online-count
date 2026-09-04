export const CONFIG_KEYS = {
  HEARTBEAT_INTERVAL: 'online_heartbeat_interval', // 前端心跳间隔（秒，默认 30）
  OFFLINE_THRESHOLD: 'online_offline_threshold',   // 离线判定阈值（秒，默认 90）
  CONCURRENT_POLICY: 'online_concurrent_policy',   // 并发策略：'allow_multiple' | 'single_kick_previous'
  TRACK_GUESTS: 'online_track_guests',             // 是否统计未登录访客（布尔值，默认 true）
  SAMPLE_INTERVAL: 'online_sample_interval',       // 历史采样间隔（分钟，默认 5）
  MAX_HISTORY_DAYS: 'online_max_history_days',     // 历史时序保留天数（天，默认 30）
  IDLE_TIMEOUT_MINUTES: 'online_idle_timeout_minutes', // 挂机空闲超时自动登出（分钟，默认 30，0 为禁用）
  AUDIT_LOG_RETENTION_DAYS: 'online_audit_log_retention_days', // 审计日志保留天数（天，默认 30）
};

export const DEFAULT_CONFIGS = {
  [CONFIG_KEYS.HEARTBEAT_INTERVAL]: 30,
  [CONFIG_KEYS.OFFLINE_THRESHOLD]: 90,
  [CONFIG_KEYS.CONCURRENT_POLICY]: 'allow_multiple',
  [CONFIG_KEYS.TRACK_GUESTS]: true,
  [CONFIG_KEYS.SAMPLE_INTERVAL]: 5,
  [CONFIG_KEYS.MAX_HISTORY_DAYS]: 30,
  [CONFIG_KEYS.IDLE_TIMEOUT_MINUTES]: 30,
  [CONFIG_KEYS.AUDIT_LOG_RETENTION_DAYS]: 30,
};
