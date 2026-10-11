import { communityRepository } from '../repositories/community.repository.js';
import { siteRepository } from '../repositories/site.repository.js';
import { demoSites, buildDemoCommunityData } from './demo-community.js';

/**
 * Registers the labelled demonstration community data with the repositories.
 *
 * Safe to call more than once: both repositories replace their whole
 * demonstration store rather than appending, so a re-registration cannot
 * duplicate a site or a vote.
 *
 * Returns the number of demonstration community rows registered so the server
 * can log how much labelled content it is serving.
 */
export function registerDemoCommunityRecords(): number {
  const siteCount = siteRepository.registerDemoSites(demoSites());
  const data = buildDemoCommunityData();
  const communityCount = communityRepository.registerDemoCommunityData(data);
  return siteCount + communityCount;
}