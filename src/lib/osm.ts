// OpenStreetMap, Nominatim & OSRM Services (100% Free & Open Source)

export interface OSMAddressDetails {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  residential?: string;
  city?: string;
  town?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface ReverseGeocodeResult {
  street: string;
  houseNumber: string;
  colonia: string;
  city: string;
  formattedAddress: string;
}

export interface OSMPlace {
  place_id: number;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  address?: OSMAddressDetails;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  coordinates: [number, number][]; // [lat, lng] array for polyline
}

/**
 * Searches places via Nominatim OpenStreetMap API
 */
export async function searchOSMPlaces(query: string, cityBias: string = 'Mazatlán'): Promise<OSMPlace[]> {
  if (!query || query.trim().length < 2) return [];
  const cleanQuery = query.trim();

  try {
    // Attempt 1: Direct query
    const params = new URLSearchParams({
      q: cleanQuery,
      format: 'json',
      addressdetails: '1',
      limit: '8',
      countrycodes: 'mx',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'Accept-Language': 'es',
      },
    });

    let data: OSMPlace[] = [];
    if (res.ok) {
      data = await res.json();
    }

    // If no direct results and query doesn't include city, try with city bias
    if ((!data || data.length === 0) && cityBias && !cleanQuery.toLowerCase().includes(cityBias.toLowerCase())) {
      const biasedParams = new URLSearchParams({
        q: `${cleanQuery}, ${cityBias}`,
        format: 'json',
        addressdetails: '1',
        limit: '8',
        countrycodes: 'mx',
      });
      const resBiased = await fetch(`https://nominatim.openstreetmap.org/search?${biasedParams.toString()}`, {
        headers: {
          'Accept-Language': 'es',
        },
      });
      if (resBiased.ok) {
        data = await resBiased.json();
      }
    }

    // If still no results and query contains a number (e.g. "Reforma 45" or "#45"), try searching just the street
    if ((!data || data.length === 0) && /\d+/.test(cleanQuery)) {
      const streetOnly = cleanQuery.replace(/#?\s*\d+[a-zA-Z]?\b/g, '').replace(/,\s*,/g, ',').trim();
      if (streetOnly.length >= 3) {
        const fallbackParams = new URLSearchParams({
          q: cityBias ? `${streetOnly}, ${cityBias}` : streetOnly,
          format: 'json',
          addressdetails: '1',
          limit: '5',
          countrycodes: 'mx',
        });
        const resFallback = await fetch(`https://nominatim.openstreetmap.org/search?${fallbackParams.toString()}`, {
          headers: {
            'Accept-Language': 'es',
          },
        });
        if (resFallback.ok) {
          data = await resFallback.json();
        }
      }
    }

    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('OSM search notice:', err);
    return [];
  }
}

/**
 * Reverse geocodes coordinates to street address
 */
export async function reverseOSMGeocode(lat: number, lng: number): Promise<string> {
  const details = await reverseOSMDetails(lat, lng);
  if (details.street) {
    let formatted = details.street;
    if (details.houseNumber) formatted += ` #${details.houseNumber}`;
    if (details.colonia) formatted += `, Col. ${details.colonia}`;
    if (details.city) formatted += `, ${details.city}`;
    return formatted;
  }
  return details.formattedAddress || `Ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

/**
 * Reverse geocodes coordinates to structured address parts
 */
export async function reverseOSMDetails(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lng.toString(),
      format: 'json',
      addressdetails: '1',
      zoom: '18',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        'Accept-Language': 'es',
      },
    });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    if (data && data.display_name) {
      const addr: OSMAddressDetails = data.address || {};
      const street = addr.road || data.display_name.split(',')[0]?.trim() || '';
      const houseNumber = addr.house_number || '';
      const colonia = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || '';
      const city = addr.city || addr.town || addr.municipality || 'Mazatlán';
      return {
        street,
        houseNumber,
        colonia,
        city,
        formattedAddress: data.display_name,
      };
    }
  } catch (err) {
    console.warn('OSM reverse geocode fallback:', err);
  }
  return {
    street: `Ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
    houseNumber: '',
    colonia: '',
    city: '',
    formattedAddress: `Ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
  };
}

/**
 * Calculates straight line distance (Haversine formula) in km
 */
export function calculateStraightDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Fetches accurate driving route from Open Source Routing Machine (OSRM)
 */
export async function getOSRMRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult> {
  const straightDist = calculateStraightDistance(origin.lat, origin.lng, destination.lat, destination.lng);
  const estRoadKm = Math.max(0.5, Number((straightDist * 1.35).toFixed(1)));
  const estDurationMin = Math.max(1, Math.round(estRoadKm * 2.2));

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distKm = Number((route.distance / 1000).toFixed(1));
        const durMin = Math.max(1, Math.round(route.duration / 60));
        const coords: [number, number][] = route.geometry.coordinates.map(
          ([lon, lat]: [number, number]) => [lat, lon]
        );
        return {
          distanceKm: distKm,
          durationMin: durMin,
          coordinates: coords,
        };
      }
    }
  } catch (err) {
    console.warn('OSRM routing fallback used:', err);
  }

  // Fallback to straight-line interpolation
  return {
    distanceKm: estRoadKm,
    durationMin: estDurationMin,
    coordinates: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
  };
}
