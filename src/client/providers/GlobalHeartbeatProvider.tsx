import React from 'react';
import { useAPIClient } from '../hooks/useAPIClient';
import { useOnlineHeartbeat } from '../hooks/useOnlineHeartbeat';

export const GlobalHeartbeatProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const api = useAPIClient();
  useOnlineHeartbeat(api);
  return <>{children}</>;
};
