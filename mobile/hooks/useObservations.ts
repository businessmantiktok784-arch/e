import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchCategories, fetchObservation, fetchObservations, fetchObservationMapData, fetchSites, fetchInvestigations, fetchSiteVisits, fetchObservationComments } from '../services/api';
import type { ObservationFilters } from '../types/api';
import { nextObservationPage } from '../utils/observationNavigation';

export function useObservations(filters: ObservationFilters = {}) {
  const normalized = { search: filters.search?.trim() || '', category: filters.category || '' };
  return useInfiniteQuery({ queryKey: ['observations', normalized], initialPageParam: 1, queryFn: ({ pageParam, signal }) => fetchObservations(pageParam, 20, signal, normalized), getNextPageParam: (last) => nextObservationPage(last.pagination.page, last.pagination.totalPages) });
}
export function useRecentObservations() {
  return useQuery({ queryKey: ['observations', 'recent'], queryFn: ({ signal }) => fetchObservations(1, 5, signal) });
}
export function useObservation(id: string) {
  return useQuery({ queryKey: ['observation', id], queryFn: ({ signal }) => fetchObservation(id, signal), enabled: Boolean(id) });
}
export function useSites() { return useQuery({ queryKey: ['community', 'sites'], queryFn: ({ signal }) => fetchSites(signal) }); }
export function useInvestigations() { return useQuery({ queryKey: ['community', 'investigations'], queryFn: ({ signal }) => fetchInvestigations(signal) }); }
export function useSiteVisits(siteId: string) { return useQuery({ queryKey: ['community', 'visits', siteId], queryFn: ({ signal }) => fetchSiteVisits(siteId, signal), enabled: Boolean(siteId) }); }
export function useObservationComments(passportId: string) { return useQuery({ queryKey: ['observation-comments', passportId], queryFn: ({ signal }) => fetchObservationComments(passportId, signal), enabled: Boolean(passportId) }); }
export function useCategories() { return useQuery({ queryKey: ['observations', 'categories'], queryFn: ({ signal }) => fetchCategories(signal), staleTime: 5 * 60 * 1000 }); }
export function useMapData(filters: ObservationFilters = {}) {
  const normalized = { search: filters.search?.trim() || '', category: filters.category || '' };
  return useQuery({ queryKey: ['map', 'observations', normalized], queryFn: ({ signal }) => fetchObservationMapData(signal, normalized) });
}
