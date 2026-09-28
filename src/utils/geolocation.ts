import type { CheckInLocation } from '@/types';

/**
 * Reads the check-in phone's approximate position without making location a
 * requirement. A denied permission, unsupported browser, or slow GPS simply
 * records the attendance without coordinates.
 */
export function getCheckInLocation(): Promise<CheckInLocation | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy } = coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          resolve(undefined);
          return;
        }
        resolve({
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
        });
      },
      () => resolve(undefined),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  });
}
