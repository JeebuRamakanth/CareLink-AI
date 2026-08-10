/**
 * CareLink-AI Agent — service barrel.
 *
 * Import everything agent-related from here:
 *   import { sendAgentMessage, type AgentResponse } from '@/services/agent';
 */

export { sendAgentMessage, classifyIntent, buildResponseForIntent, buildResponseForQuickAction } from './agentService';
export type {
  AgentResponse,
  AgentMessage,
  AgentConversation,
  AgentAttachment,
  AgentIntent,
  IntentClassification,
  PatientProfile,
  PatientContext,
  RecoveryStatus,
  RecoveryCheckIn,
  RecoveryTrend,
  RouteResult,
  HospitalRecommendation,
  DoctorRecommendation,
  PharmacyRecommendation,
  LabRecommendation,
  MedicineResult,
  MedicalReportResult,
  EmergencyResponse,
  EmergencyFacility,
  EmergencyContactAction,
  SymptomInsight,
  DiseaseInsight,
  AppointmentAction,
  FollowUpCardData,
  HealthSummaryCardData,
  AgentLanguage,
  UrgencyLevel,
  ConfidenceLevel,
  TransportMode,
  AttachmentKind,
  AttachmentStatus,
  AgentResponseKind,
  AgentStateStatus,
  AgentMessageRole,
  BaseAgentResponse,
  AgentMeta,
  MedicalReportValue,
} from './agentTypes';
