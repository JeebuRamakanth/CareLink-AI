import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorProfile } from '../data/doctorProfileData';

type DoctorConsultationInfoProps = {
  consultationInfo: DoctorProfile['consultationInfo'];
};

export function DoctorConsultationInfo({ consultationInfo }: DoctorConsultationInfoProps) {
  const shouldReduceMotion = useReducedMotion();
  // A directory doctor carries no mock disclaimer; only the hand-authored demo
  // profile does. The heading follows suit so a real listing is never labelled
  // "Mock".
  const isDemoProfile = Boolean(consultationInfo.mockDisclaimer);

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Consultation info</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {isDemoProfile ? 'Mock consultation details' : 'Published consultation details'}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCell label="Consultation fee" value={consultationInfo.fee} />
          <InfoCell label="Duration" value={consultationInfo.duration} />
          <InfoCell label="Modes" value={consultationInfo.modes.join(', ')} />
          <InfoCell label="In-person" value={consultationInfo.inPerson} />
          <InfoCell label="Online" value={consultationInfo.online} />
          <InfoCell label="Location" value={consultationInfo.location} />
        </div>

        {consultationInfo.mockDisclaimer ? (
          <p className="text-xs text-ink-500">{consultationInfo.mockDisclaimer}</p>
        ) : (
          <p className="text-xs text-ink-500">
            Only fields published by the facility are shown. A blank field means the source did not publish it.
          </p>
        )}
      </div>
    </motion.section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  // A field the source did not publish is omitted rather than rendered as a
  // blank cell, so the grid only shows real, attributable values.
  if (!value?.trim()) return null;
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
      <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
