import { motion, useReducedMotion } from 'framer-motion';
import type { DoctorProfile } from '../data/doctorProfileData';

type DoctorConsultationInfoProps = {
  consultationInfo: DoctorProfile['consultationInfo'];
};

export function DoctorConsultationInfo({ consultationInfo }: DoctorConsultationInfoProps) {
  const shouldReduceMotion = useReducedMotion();

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
          <h2 className="mt-3 text-2xl font-semibold text-white">Mock consultation details</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCell label="Consultation fee" value={consultationInfo.fee} />
          <InfoCell label="Duration" value={consultationInfo.duration} />
          <InfoCell label="Modes" value={consultationInfo.modes.join(', ')} />
          <InfoCell label="In-person" value={consultationInfo.inPerson} />
          <InfoCell label="Online" value={consultationInfo.online} />
          <InfoCell label="Location" value={consultationInfo.location} />
        </div>

        <p className="text-xs text-ink-500">{consultationInfo.mockDisclaimer}</p>
      </div>
    </motion.section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
      <p className="text-sm uppercase tracking-[0.24em] text-ink-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
