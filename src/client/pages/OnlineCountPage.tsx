import React from 'react';
import { OnlineCountDashboard } from '../components/OnlineCountDashboard';

export const OnlineCountPage: React.FC<{ api: any }> = ({ api }) => {
  return <OnlineCountDashboard api={api} />;
};

export default OnlineCountPage;
