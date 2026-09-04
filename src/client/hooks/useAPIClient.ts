import { useAPIClient as useAPIClientV1, useApp as useAppV1 } from '@nocobase/client';

export function useAPIClient(): any {
  if (typeof window !== 'undefined' && (window as any).__nocobase_api_client__) {
    return (window as any).__nocobase_api_client__;
  }

  try {
    if (typeof useAPIClientV1 === 'function') {
      const api = useAPIClientV1();
      if (api) return api;
    }
  } catch {}

  try {
    if (typeof useAppV1 === 'function') {
      const app = useAppV1();
      if (app?.apiClient) return app.apiClient;
    }
  } catch {}

  if (typeof window !== 'undefined' && (window as any).nocobase?.apiClient) {
    return (window as any).nocobase.apiClient;
  }

  return {
    __isDummy: true,
    request: async (opts: any) => {
      console.warn('[OnlineCount] Fallback V1 APIClient called:', opts);
      return {};
    },
  };
}

export default useAPIClient;
