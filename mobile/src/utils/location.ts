export const AZERBAIJAN_BOUNDS = {
  minLat: 38.3,
  maxLat: 42.8,
  minLon: 44,
  maxLon: 51.7,
};

export function isWithinAzerbaijan(latitude: number, longitude: number): boolean {
  return (
    latitude >= AZERBAIJAN_BOUNDS.minLat &&
    latitude <= AZERBAIJAN_BOUNDS.maxLat &&
    longitude >= AZERBAIJAN_BOUNDS.minLon &&
    longitude <= AZERBAIJAN_BOUNDS.maxLon
  );
}
