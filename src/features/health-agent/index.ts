/**
 * CareLink Health Agent feature — public barrel.
 *
 * Import everything the app needs from here:
 *   import { HealthCommandCenter, useHealthAgent, type AgentResult } from '@/features/health-agent';
 */

export * from './types';
export { useHealthAgent } from './hooks/useHealthAgent';
export type { UseHealthAgent, HealthAgentState, HealthAgentStatus } from './hooks/useHealthAgent';
export { useAgentConversation } from './hooks/useAgentConversation';
export type { UseAgentConversation, ChatStatus } from './hooks/useAgentConversation';
export { HealthCommandCenter } from './components/HealthCommandCenter';
export type { HealthCommandCenterHandle } from './components/HealthCommandCenter';
export { AIChatPage } from './components/AIChatPage';
export { AgentDocumentAnalysisPanel } from './components/AgentDocumentAnalysisPanel';
export { createAgentOrchestrator } from './services/agentOrchestrator';
export type { AgentOrchestrator } from './services/agentOrchestrator';
export { accumulateContext, emptyContext, resolveSpecialtyFromContext, hospitalFocusTopic } from './services/contextManager';
export { rankHospitals, rankDoctors, rankPharmacies, rankLabs, explainRecommendation } from './services/recommendationRanking';
export { setPendingHandoff, drainPendingHandoff, hasPendingHandoff, clearPendingHandoff } from './services/pendingHandoff';
export type { PendingHandoff } from './services/pendingHandoff';
export { mockAdapters } from './services/adapters/mockAdapters';
export { adapters, isAnyProviderReal } from './services/adapters/registry';
export { DISCLOSURES, tierForIntent, urgencyForIntent, isEmergencyIntent, tierLabel } from './utils/safety';
export type {
  AgentAdapters,
  AIProvider,
  HospitalSearchAdapter,
  DoctorSearchAdapter,
  PharmacySearchAdapter,
  LaboratorySearchAdapter,
  MapsRoutingAdapter,
  MapsProvider,
  DirectionsProvider,
  GeocodingProvider,
  StorageProvider,
  StorageUploadResult,
  AppointmentServiceAdapter,
  DocumentAnalysisAdapter,
  MedicineRecognitionAdapter,
  RecoveryServiceAdapter,
  EmergencyServiceAdapter,
} from './services/adapters/interfaces';
export type { RankReason, RankReasonTag, RankedRecommendation, RankingContext, InformationTier } from './types';
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
