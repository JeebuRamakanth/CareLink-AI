/**
 * CareLink Health Agent feature — public barrel.
 *
 * Import everything the app needs from here:
 *   import { HealthCommandCenter, useHealthAgent, type AgentResult } from '@/features/health-agent';
 */

export * from './types';
export { useHealthAgent } from './hooks/useHealthAgent';
export type { UseHealthAgent, HealthAgentState, HealthAgentStatus } from './hooks/useHealthAgent';
export { HealthCommandCenter } from './components/HealthCommandCenter';
export { createAgentOrchestrator } from './services/agentOrchestrator';
export type { AgentOrchestrator } from './services/agentOrchestrator';
export { mockAdapters } from './services/adapters/mockAdapters';
export type { AgentAdapters, AIProvider, HospitalSearchAdapter, DoctorSearchAdapter, PharmacySearchAdapter, LaboratorySearchAdapter, MapsRoutingAdapter, AppointmentServiceAdapter, DocumentAnalysisAdapter, MedicineRecognitionAdapter, RecoveryServiceAdapter, EmergencyServiceAdapter } from './services/adapters/interfaces';
export {
  ACCEPT_ATTR,
  detectDocumentKind,
  formatBytes,
  MAX_FILE_SIZE_BYTES,
  QUICK_PROMPTS,
  LANGUAGE_LABELS,
  documentPipelineSteps,
  statusLabel,
  kindLabel,
} from './utils/helpers';
