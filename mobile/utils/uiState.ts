export type ContentState = 'loading' | 'error' | 'empty' | 'success';
export function contentState(input: { loading: boolean; error: boolean; empty: boolean }): ContentState {
  if (input.loading) return 'loading';
  if (input.error) return 'error';
  if (input.empty) return 'empty';
  return 'success';
}
