import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../components/ui/Badge';
import type { DoctorMatchInfo } from '../data/doctorProfileData';

type DoctorMatchSummaryProps = {
  matchInfo: DoctorMatchInfo;
  patientsTreated: number;
  treatmentRate: string;
  verifiedReviewCount: number;
};

export function DoctorMatchSummary({ matchInfo, patientsTreated, treatmentRate, verifiedReviewCount }: DoctorMatchSummaryProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5, ease: 'easeOut' }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-brand-200">{matchInfo.score > 0 ? 'Clinical match' : 'Directory information'}</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {matchInfo.score > 0 ? 'Best match for your care needs' : 'About this listing'}
            </h2>
          </div>
          <Badge tone={matchInfo.score > 0 ? 'brand' : 'neutral'}>{matchInfo.score > 0 ? 'Premium match' : 'Directory listing'}</Badge>
        </div>

        {matchInfo.score > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Match score" value={`${matchInfo.score}%`} />
            <Stat label="Match label" value={matchInfo.label} />
            <Stat label="Patients treated" value={`${patientsTreated.toLocaleString()}`} />
            <Stat label="Treatment success" value={treatmentRate} />
            <Stat label="Verified reviews" value={`${verifiedReviewCount} reviews`} />
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
            {matchInfo.disclaimer}
          </div>
        )}

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-5">
          <p className="text-sm uppercase tracking-[0.24em] text-ink-400">Match details</p>
          <p className="mt-3 text-sm leading-7 text-ink-300">{matchInfo.description}</p>
          {matchInfo.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {matchInfo.tags.map((tag) => (
                <Badge key={tag} tone="accent">{tag}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </motion.section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-ink-400">{label}</p>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
