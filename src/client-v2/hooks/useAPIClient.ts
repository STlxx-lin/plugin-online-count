import { useApp as useAppV2 } from '@nocobase/client-v2';

export function useAPIClient(): any {
  if (typeof window !== 'undefined' && (window as any).__nocobase_api_client__) {
    return (window as any).__nocobase_api_client__;
  }

  try {
    if (typeof useAppV2 === 'function') {
      const app = useAppV2();
      if (app?.apiClient) {
        return app.apiClient;
      }
    }
  } catch {}

  if (typeof window !== 'undefined' && (window as any).nocobase?.apiClient) {
    return (window as any).nocobase.apiClient;
  }

  return {
    __isDummy: true,
    request: async (opts: any) => {
      console.warn('[OnlineCount] Fallback V2 APIClient called:', opts);
      return {};
    },
  };
}

export default useAPIClient;
