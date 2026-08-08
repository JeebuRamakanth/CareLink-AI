type RatingSummaryProps = {
  averageRating: number;
  reviewCount: number;
  topSpecialties: string[];
  starDistribution: Array<{ stars: number; percent: number }>;
};

export function RatingSummary({ averageRating, reviewCount, topSpecialties, starDistribution }: RatingSummaryProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/65 p-5 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Average rating</p>
        <div className="mt-4 flex items-end justify-center gap-3">
          <span className="text-5xl font-semibold text-white">{averageRating.toFixed(1)}</span>
          <span className="text-sm text-ink-300">/ 5.0</span>
        </div>
        <p className="mt-2 text-sm text-ink-300">Based on {reviewCount.toLocaleString()} verified patient reviews.</p>
      </div>

      <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/65 p-5">
        {starDistribution.map((entry) => (
          <div key={entry.stars} className="flex items-center gap-3 text-sm text-ink-300">
            <span className="w-10 font-semibold text-white">{entry.stars}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400" style={{ width: `${entry.percent}%` }} />
            </div>
            <span className="w-12 text-right">{entry.percent}%</span>
          </div>
        ))}
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-sm text-ink-300">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Featured specialties</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {topSpecialties.map((specialty) => (
            <span key={specialty} className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-[0.78rem] text-white">
              {specialty}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
