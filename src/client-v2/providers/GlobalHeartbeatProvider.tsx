import React from 'react';
import { useAPIClient } from '../hooks/useAPIClient';
import { useOnlineHeartbeat } from '../../client/hooks/useOnlineHeartbeat';

export const GlobalHeartbeatProviderV2: React.FC<{ api?: any; children?: React.ReactNode }> = (props) => {
  const contextApi = useAPIClient();
  const api = props.api || contextApi;
  useOnlineHeartbeat(api);
  return <>{props.children}</>;
};
