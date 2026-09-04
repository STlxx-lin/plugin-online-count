import React from 'react';
import { OnlineCountDashboard } from '../components/OnlineCountDashboard';
import { useOnlineHeartbeat } from '../hooks/useOnlineHeartbeat';

export const OnlineCountPage: React.FC<{ api: any }> = ({ api }) => {
  useOnlineHeartbeat(api);
  return <OnlineCountDashboard api={api} />;
};

export default OnlineCountPage;
