import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../components/ui/Badge';
import type { DoctorProfile } from '../data/doctorProfileData';

type DoctorProfessionalProfileProps = {
  doctor: DoctorProfile;
};

export function DoctorProfessionalProfile({ doctor }: DoctorProfessionalProfileProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="grid gap-8">
        <div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-brand-200">Professional Profile</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Evidence-based care rooted in clinical expertise</h2>
            </div>
            <Badge tone="success">Verified practitioner</Badge>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-300">{doctor.profileSummary}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ProfileSection label="Education" items={doctor.education} />
          <ProfileSection label="Qualifications" items={doctor.qualifications} />
          <ProfileSection label="Certifications" items={doctor.certifications} />
          <ProfileSection label="Consultation modes" items={doctor.consultationModes} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ProfileSection label="Specializations" items={doctor.specializations} />
          <ProfileSection label="Hospitals worked with" items={doctor.hospitalsWorkedWith} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ProfileSection label="Areas of expertise" items={doctor.expertiseAreas} />
          <ProfileSection label="Professional memberships" items={doctor.memberships} />
        </div>
      </div>
    </motion.section>
  );
}

function ProfileSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5">
      <p className="text-sm uppercase tracking-[0.26em] text-ink-400">{label}</p>
      <ul className="mt-4 space-y-3 text-sm text-ink-300">
        {items.map((item) => (
          <li key={item} className="rounded-2xl bg-white/5 px-4 py-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
