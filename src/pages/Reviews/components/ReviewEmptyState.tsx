import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/states';

type ReviewEmptyStateProps = {
  onReset: () => void;
};

export function ReviewEmptyState({ onReset }: ReviewEmptyStateProps) {
  return (
    <EmptyState
      title="No reviews found"
      description="Try broadening the filter criteria to discover more patient feedback for doctors and hospitals."
      icon="📝"
      action={
        <Button type="button" variant="secondary" onClick={onReset}>
          Reset filters
        </Button>
      }
    />
  );
}
