import React from 'react';
import { OnlineCountDashboard } from '../components/OnlineCountDashboard';
import { useOnlineHeartbeat } from '../hooks/useOnlineHeartbeat';

export const OnlineCountPage: React.FC<{ api: any }> = ({ api }) => {
  // 挂载全局心跳上报
  useOnlineHeartbeat(api);

  return <OnlineCountDashboard api={api} />;
};

export default OnlineCountPage;
