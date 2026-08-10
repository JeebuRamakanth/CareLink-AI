/**
 * AgentResponseCard — single dispatcher that renders the correct response card
 * based on AgentResponse.kind. Components only ever import this, not each card.
 */

import type { AgentResponse } from '../../../services/agent/agentTypes';
import { SymptomResponseCard } from './SymptomResponseCard';
import { DiseaseResponseCard } from './DiseaseResponseCard';
import { HospitalResponseCard } from './HospitalResponseCard';
import { DoctorResponseCard } from './DoctorResponseCard';
import { PharmacyResponseCard } from './PharmacyResponseCard';
import { LabResponseCard } from './LabResponseCard';
import { MedicineResponseCard } from './MedicineResponseCard';
import { MedicalReportResponseCard } from './MedicalReportResponseCard';
import { EmergencyResponseCard } from './EmergencyResponseCard';
import { AppointmentResponseCard } from './AppointmentResponseCard';
import { RouteResponseCard } from './RouteResponseCard';
import { RecoveryTrackerCard } from './RecoveryTrackerCard';
import { FollowUpResponseCard } from './FollowUpResponseCard';
import { HealthSummaryResponseCard } from './HealthSummaryResponseCard';
import { TextResponseCard } from './TextResponseCard';

interface Props {
  response: AgentResponse;
  onPickReply?: (reply: string) => void;
  onGetDirections?: (route: import('../../../services/agent/agentTypes').RouteResult) => void;
}

export function AgentResponseCard({ response, onPickReply, onGetDirections }: Props) {
  switch (response.kind) {
    case 'symptom':
      return <SymptomResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'disease':
      return <DiseaseResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'hospital':
      return <HospitalResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} onGetDirections={(h) => h.route && onGetDirections?.(h.route)} />;
    case 'doctor':
      return <DoctorResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} onGetDirections={(d) => d.route && onGetDirections?.(d.route)} />;
    case 'pharmacy':
      return <PharmacyResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} onGetDirections={(p) => p.route && onGetDirections?.(p.route)} />;
    case 'lab':
      return <LabResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} onGetDirections={(l) => l.route && onGetDirections?.(l.route)} />;
    case 'medicine':
      return <MedicineResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'report':
      return <MedicalReportResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'emergency':
      return <EmergencyResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'appointment':
      return <AppointmentResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'route':
      return <RouteResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} onGetDirections={onGetDirections} />;
    case 'recovery':
      return <RecoveryTrackerCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'follow-up':
      return <FollowUpResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'health-summary':
      return <HealthSummaryResponseCard data={response.data} title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
    case 'text':
    default:
      return <TextResponseCard title={response.title} explanation={response.explanation} suggestedReplies={response.suggestedReplies} onPickReply={onPickReply} />;
  }
}
