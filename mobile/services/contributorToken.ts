import * as SecureStore from 'expo-secure-store';
import { fetchContributorToken } from './api';

const TOKEN_KEY = 'earth-talk-community-contributor-token';
let inFlight: Promise<string> | undefined;

/** Obtain the API's pseudonymous token and persist it only in native secure storage. */
export async function getContributorToken(): Promise<string> {
  const existing = await SecureStore.getItemAsync(TOKEN_KEY);
  if (existing) return existing;
  if (!inFlight) {
    inFlight = fetchContributorToken().then(async ({ contributor_token }) => {
      await SecureStore.setItemAsync(TOKEN_KEY, contributor_token);
      return contributor_token;
    }).finally(() => { inFlight = undefined; });
  }
  return inFlight;
}
