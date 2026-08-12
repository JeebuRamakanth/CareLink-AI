/**
 * CareLink Health Agent feature — public barrel.
 *
 * Import everything the app needs from here:
 *   import { HealthCommandCenter, useHealthAgent, type AgentResult } from '@/features/health-agent';
 */

export * from './types';
export { useHealthAgent } from './hooks/useHealthAgent';
export type { UseHealthAgent, HealthAgentState, HealthAgentStatus } from './hooks/useHealthAgent';
export { useDocumentLibrary } from './hooks/useDocumentLibrary';
export type { DocumentLibraryFilter, UseDocumentLibrary } from './hooks/useDocumentLibrary';
export {
  prepareDocumentBatch,
  processDocument,
  deleteDocumentArtifact,
  isRealDocumentStorageConfigured,
} from './services/documentPipeline';
export type { DocumentPipelineEvent, ProcessOptions, PipelineAcceptResult } from './services/documentPipeline';
export { HealthCommandCenter } from './components/HealthCommandCenter';
export type { HealthCommandCenterHandle } from './components/HealthCommandCenter';
export { createAgentOrchestrator } from './services/agentOrchestrator';
export type { AgentOrchestrator } from './services/agentOrchestrator';
export { mockAdapters } from './services/adapters/mockAdapters';
export { adapters, isAnyProviderReal } from './services/adapters/registry';
export { rankHospitals, rankDoctors, rankPharmacies, rankLabs } from './utils/ranking';
export { DISCLOSURES, tierForIntent, urgencyForIntent, isEmergencyIntent, tierLabel, assessDocumentSafety } from './utils/safety';
export type { DocumentSafetyInput, DocumentSafetyOutput } from './utils/safety';
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
