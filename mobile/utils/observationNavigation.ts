export function observationDetailRoute(passportId: string) {
  return { pathname: '/observations/[id]' as const, params: { id: passportId } };
}

export function nextObservationPage(page: number, totalPages: number): number | undefined {
  return page < totalPages ? page + 1 : undefined;
}
