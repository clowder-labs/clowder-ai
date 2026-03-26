import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export interface AvailableClient {
  id: string;
  label: string;
  command: string;
  available: boolean;
}

export interface UiHints {
  hiddenHubTabs: string[];
  hiddenEnvCategories: string[];
  hideSkillMountStatus: boolean;
  hideAgentGuides: boolean;
}

interface AvailableClientsState {
  clients: AvailableClient[];
  clientLabels: Record<string, string>;
  uiHints: UiHints;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the list of CLI clients detected by the backend at startup.
 * Returns only the available ones by default.
 */
export function useAvailableClients(): AvailableClientsState {
  const [state, setState] = useState<AvailableClientsState>({
    clients: [],
    clientLabels: {},
    uiHints: { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false },
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/available-clients')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load available clients (${res.status})`);
        return (await res.json()) as { clients: AvailableClient[]; clientLabels?: Record<string, string>; uiHints?: UiHints };
      })
      .then((body) => {
        if (!cancelled) {
          setState({
            clients: body.clients.filter((c) => c.available),
            clientLabels: body.clientLabels ?? {},
            uiHints: body.uiHints ?? { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false },
            loading: false,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ clients: [], clientLabels: {}, uiHints: { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false }, loading: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
