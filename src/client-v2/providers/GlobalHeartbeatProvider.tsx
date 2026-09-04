import React from 'react';
import { useAPIClient } from '../hooks/useAPIClient';
import { useOnlineHeartbeat } from '../../client/hooks/useOnlineHeartbeat';

export const GlobalHeartbeatProviderV2: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const api = useAPIClient();
  useOnlineHeartbeat(api);
  return <>{children}</>;
};
