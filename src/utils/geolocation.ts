import type { CheckInLocation } from '@/types';

/** Why a phone gave no position, so the check-in screen can say what to fix. */
export type LocationProblem = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export interface LocationReading {
  location?: CheckInLocation;
  /** Set whenever `location` is not. */
  problem?: LocationProblem;
}

function readOnce(options: PositionOptions): Promise<LocationReading> {
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
          resolve({ problem: 'unavailable' });
          return;
        }
        resolve({
          location: {
            latitude,
            longitude,
            accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined,
          },
        });
      },
      (error) =>
        resolve({
          problem:
            error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable',
        }),
      options,
    );
  });
}

/**
 * Reads the check-in phone's approximate position without making location a
 * requirement. A precise GPS fix is tried first; when that fails for any
 * reason but a refusal — slow GPS indoors is common — the quicker
 * network-based fix is taken rather than no position at all. Never throws: a
 * phone that cannot or will not share its position still checks in, and
 * `problem` says why.
 */
export async function readCheckInLocation(): Promise<LocationReading> {
  if (!navigator.geolocation) return { problem: 'unsupported' };
  const precise = await readOnce({
    enableHighAccuracy: true,
    maximumAge: 60_000,
    timeout: 8_000,
  });
  if (precise.location || precise.problem === 'denied') return precise;
  return readOnce({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 7_000 });
}
