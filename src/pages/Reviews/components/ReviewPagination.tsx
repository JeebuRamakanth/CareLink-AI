import { Button } from '../../../components/ui/Button';

type ReviewPaginationProps = {
  currentPage: number;
  pageCount: number;
  filteredCount: number;
  onPageChange: (page: number) => void;
};

export function ReviewPagination({ currentPage, pageCount, filteredCount, onPageChange }: ReviewPaginationProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[1.4rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-300 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-white">Showing page {currentPage} of {pageCount}</p>
        <p className="mt-1">{filteredCount} reviews match your filters.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          ← Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
