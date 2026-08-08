import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/states';

type ReviewEmptyStateProps = {
  query: string;
  onClear: () => void;
};

export function ReviewEmptyState({ query, onClear }: ReviewEmptyStateProps) {
  return (
    <EmptyState
      title={query ? 'No discovery results yet' : 'Discovery space is empty'}
      description={
        query
          ? 'No smart search results matched your review query. Try a broader illness, specialty, or hospital name to uncover more previews.'
          : 'Use smart search and filters to surface hospital review previews and care signals across specialties.'
      }
      icon="🔎"
      action={
        <Button type="button" variant="secondary" onClick={onClear}>
          Reset search
        </Button>
      }
    />
  );
}
