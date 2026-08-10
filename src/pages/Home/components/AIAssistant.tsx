import { HealthCommandCenter } from '../../../features/health-agent';

/**
 * Premium entry point to the CareLink AI Healthcare Command Center.
 * Renders the interactive HealthCommandCenter (mock-backed agent search) so the
 * Home page itself lets users type, upload, and see structured results — while
 * the full workspace remains at /agent.
 */
export function AIAssistant() {
  return <HealthCommandCenter />;
}
