/**
 * District coordinates and location generalization for Earth Talk
 */

export interface DistrictCenter {
  name: string;
  province: 'Kigali' | 'Northern' | 'Southern' | 'Eastern' | 'Western';
  latitude: number;
  longitude: number;
}

/**
 * Standard representative coordinates for Rwanda's 30 administrative districts.
 * Used for generalized public map points when public_location_precision = 'district'.
 */
export const RWANDA_DISTRICTS: Record<string, DistrictCenter> = {
  // Kigali City
  Gasabo: { name: 'Gasabo', province: 'Kigali', latitude: -1.9000, longitude: 30.1333 },
  Kicukiro: { name: 'Kicukiro', province: 'Kigali', latitude: -1.9833, longitude: 30.1000 },
  Nyarugenge: { name: 'Nyarugenge', province: 'Kigali', latitude: -1.9667, longitude: 30.0500 },

  // Northern Province
  Burera: { name: 'Burera', province: 'Northern', latitude: -1.4500, longitude: 29.8333 },
  Gakenke: { name: 'Gakenke', province: 'Northern', latitude: -1.7000, longitude: 29.7833 },
  Gicumbi: { name: 'Gicumbi', province: 'Northern', latitude: -1.6000, longitude: 30.0833 },
  Musanze: { name: 'Musanze', province: 'Northern', latitude: -1.5000, longitude: 29.6333 },
  Rulindo: { name: 'Rulindo', province: 'Northern', latitude: -1.7333, longitude: 30.0000 },

  // Southern Province
  Gisagara: { name: 'Gisagara', province: 'Southern', latitude: -2.6000, longitude: 29.8500 },
  Huye: { name: 'Huye', province: 'Southern', latitude: -2.6000, longitude: 29.7333 },
  Kamonyi: { name: 'Kamonyi', province: 'Southern', latitude: -2.0000, longitude: 29.9000 },
  Muhanga: { name: 'Muhanga', province: 'Southern', latitude: -2.0833, longitude: 29.7500 },
  Nyamagabe: { name: 'Nyamagabe', province: 'Southern', latitude: -2.4667, longitude: 29.5000 },
  Nyanza: { name: 'Nyanza', province: 'Southern', latitude: -2.3500, longitude: 29.7500 },
  Nyaruguru: { name: 'Nyaruguru', province: 'Southern', latitude: -2.7167, longitude: 29.5333 },
  Ruhango: { name: 'Ruhango', province: 'Southern', latitude: -2.2167, longitude: 29.7833 },

  // Eastern Province
  Bugesera: { name: 'Bugesera', province: 'Eastern', latitude: -2.2000, longitude: 30.1500 },
  Gatsibo: { name: 'Gatsibo', province: 'Eastern', latitude: -1.6000, longitude: 30.4500 },
  Kayonza: { name: 'Kayonza', province: 'Eastern', latitude: -1.8500, longitude: 30.6000 },
  Kirehe: { name: 'Kirehe', province: 'Eastern', latitude: -2.2667, longitude: 30.7167 },
  Ngoma: { name: 'Ngoma', province: 'Eastern', latitude: -2.1833, longitude: 30.5000 },
  Nyagatare: { name: 'Nyagatare', province: 'Eastern', latitude: -1.3000, longitude: 30.3333 },
  Rwamagana: { name: 'Rwamagana', province: 'Eastern', latitude: -1.9500, longitude: 30.4333 },

  // Western Province
  Karongi: { name: 'Karongi', province: 'Western', latitude: -2.1500, longitude: 29.3500 },
  Ngororero: { name: 'Ngororero', province: 'Western', latitude: -1.8667, longitude: 29.6167 },
  Nyabihu: { name: 'Nyabihu', province: 'Western', latitude: -1.6500, longitude: 29.5000 },
  Nyamasheke: { name: 'Nyamasheke', province: 'Western', latitude: -2.3667, longitude: 29.1500 },
  Rubavu: { name: 'Rubavu', province: 'Western', latitude: -1.6833, longitude: 29.2667 },
  Rusizi: { name: 'Rusizi', province: 'Western', latitude: -2.5833, longitude: 28.9000 },
  Rutsiro: { name: 'Rutsiro', province: 'Western', latitude: -1.9333, longitude: 29.3167 },
};

/**
 * Normalizes user-entered district name to match standard district keys.
 */
export function normalizeDistrictName(rawName?: string | null): string | null {
  if (!rawName) return null;
  const cleaned = rawName.trim().toLowerCase();

  for (const districtKey of Object.keys(RWANDA_DISTRICTS)) {
    if (districtKey.toLowerCase() === cleaned) {
      return districtKey;
    }
  }

  // Check if string contains district name
  for (const districtKey of Object.keys(RWANDA_DISTRICTS)) {
    if (cleaned.includes(districtKey.toLowerCase())) {
      return districtKey;
    }
  }

  return null;
}

/**
 * Deliberately generalizes exact coordinates by introducing a deterministic offset
 * or truncating precision to ~2km (~0.02 deg) for approximate location sharing.
 */
export function approximateCoordinates(lat: number, lon: number): { lat: number; lon: number } {
  const roundedLat = Math.round(lat * 50) / 50;
  const roundedLon = Math.round(lon * 50) / 50;
  return { lat: roundedLat, lon: roundedLon };
}

/**
 * Resolves the public coordinates according to the observation's public_location_precision policy:
 * - 'district': returns representative center coordinates for the district (never reveals real coordinate).
 * - 'approximate': returns generalized ~2km coordinate.
 * - 'exact': returns exact coordinate ONLY if explicit consent policy is satisfied.
 */
/**
 * Resolves the coordinates according to the record's declared precision.
 *
 * This function generalizes; it does not decide whether a location may be
 * shared. That is the caller's job, and the distinction matters: a raw record
 * holds the true coordinate whether or not the contributor consented, so a caller
 * reading one must apply the consent gate itself. Callers reading the public SQL
 * view do not, because that view already replaces an unconsented coordinate with
 * NULL before this function ever sees it.
 */
export function resolvePublicCoordinates(params: {
  precision: 'district' | 'approximate' | 'exact';
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): { latitude: number; longitude: number } | null {
  const { precision, district, latitude, longitude } = params;

  if (precision === 'district') {
    const matchedDistrict = normalizeDistrictName(district);
    if (matchedDistrict && RWANDA_DISTRICTS[matchedDistrict]) {
      const center = RWANDA_DISTRICTS[matchedDistrict];
      return { latitude: center.latitude, longitude: center.longitude };
    }
    // If district is unknown or not in table, fall back to center of Rwanda
    return { latitude: -1.9403, longitude: 29.8739 };
  }

  if (precision === 'approximate') {
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      const approx = approximateCoordinates(latitude, longitude);
      return { latitude: approx.lat, longitude: approx.lon };
    }
    const matchedDistrict = normalizeDistrictName(district);
    if (matchedDistrict && RWANDA_DISTRICTS[matchedDistrict]) {
      const center = RWANDA_DISTRICTS[matchedDistrict];
      return { latitude: center.latitude, longitude: center.longitude };
    }
    return { latitude: -1.9403, longitude: 29.8739 };
  }

  if (precision === 'exact') {
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      return { latitude, longitude };
    }
  }

  return null;
}
