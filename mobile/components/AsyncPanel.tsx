import { MessageState, LoadingState } from './AsyncState';
import { contentState } from '../utils/uiState';
import { userFacingError } from '../utils/userFacingError';

export function AsyncPanel({ isLoading, error, isEmpty, onRetry, emptyTitle = 'Nothing here yet', emptyMessage = 'No records were returned.', children }: {
  isLoading: boolean; error: unknown; isEmpty: boolean; onRetry: () => void; emptyTitle?: string; emptyMessage?: string; children?: React.ReactNode;
}) {
  const state = contentState({ loading: isLoading, error: Boolean(error), empty: isEmpty });
  if (state === 'loading') return <LoadingState />;
  if (state === 'error') return <MessageState title="Could not load data" message={userFacingError(error)} onRetry={onRetry} />;
  if (state === 'empty') return <MessageState title={emptyTitle} message={emptyMessage} />;
  return <>{children}</>;
}
