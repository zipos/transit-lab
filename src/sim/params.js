/* Choice parameters. Rationales and sources: docs/model-parameters.md.
   ASC is fixed at 0. Brief 23b is the only place that may change it. */
export const choiceParams = {
  walkWeight: 2,
  waitWeight: 1.5,
  transferPenalty: 5,
  waitAwareHeadway: 10,
  waitLongFactor: 0.3,
  boardMinutes: 1,
  alightMinutes: 0.3,
  lambda: 0.05,
  walkExcludeKm: 1.2,
  carDetour: 1.35,
  carAccessMinutes: 3,
  carParkingMax: 10,
  carParkingDensity: 8000,
  denseResidentsPerKm: 8000,
  denseCarKmh: 18,
  midResidentsPerKm: 3000,
  midCarKmh: 26,
  otherCarKmh: 40,
  satisfactionScale: 20,
  rapidAccessKm: 0.8,
  peakHourShare: 0.1,
  crowdAlpha: 0.6,
  crowdBeta: 2,
  crowdVc0: 0.8,
};

export function resolveChoice(overrides = {}) {
  return { ...choiceParams, ...overrides, asc: 0 };
}

export function waitMinutes(headway, choice) {
  const h = headway;
  if (h <= choice.waitAwareHeadway) return h / 2;
  const atThreshold = choice.waitAwareHeadway / 2;
  return atThreshold + choice.waitLongFactor * (h - choice.waitAwareHeadway);
}

export function crowdMultiplier(volumeOverCapacity, choice = choiceParams) {
  const excess = Math.max(0, volumeOverCapacity - choice.crowdVc0);
  return 1 + choice.crowdAlpha * excess ** choice.crowdBeta;
}

export function carSpeed(density, choice) {
  if (density >= choice.denseResidentsPerKm) return choice.denseCarKmh;
  if (density >= choice.midResidentsPerKm) return choice.midCarKmh;
  return choice.otherCarKmh;
}

export function carMinutes(straightKm, originDensity, destinationDensity, choice) {
  const origin = carSpeed(originDensity, choice);
  const destination = carSpeed(destinationDensity, choice);
  const speed = 2 / (1 / origin + 1 / destination);
  const moving = straightKm * choice.carDetour / speed * 60;
  const parking = Math.max(0, Math.min(1, destinationDensity / choice.carParkingDensity)) * choice.carParkingMax;
  return moving + choice.carAccessMinutes + parking;
}
