/* One table for the four playable modes. Speeds are km/h, costs are zł per vehicle-km, dwell is minutes. */
export const modes = {
  bus: { label: 'Bus', color: '#ef705e', speed: 22, capacity: 75, costPerKm: 12, dwell: 0.55 },
  tram: { label: 'Tram', color: '#15b8c7', speed: 25, capacity: 170, costPerKm: 20, dwell: 0.55 },
  rail: { label: 'Rail', color: '#5387ef', speed: 48, capacity: 380, costPerKm: 38, dwell: 0.55 },
  metro: { label: 'Metro', color: '#8068e8', speed: 42, capacity: 650, costPerKm: 55, dwell: 0.55 }
};

export const modeSpeed = {
  bus: modes.bus.speed,
  tram: modes.tram.speed,
  rail: modes.rail.speed,
  metro: modes.metro.speed
};

export const cruiseSpeed = modeSpeed;

export const capacity = {
  bus: modes.bus.capacity,
  tram: modes.tram.capacity,
  rail: modes.rail.capacity,
  metro: modes.metro.capacity
};

export const costPerKm = {
  bus: modes.bus.costPerKm,
  tram: modes.tram.costPerKm,
  rail: modes.rail.costPerKm,
  metro: modes.metro.costPerKm
};

export const colors = {
  bus: modes.bus.color,
  tram: modes.tram.color,
  rail: modes.rail.color,
  metro: modes.metro.color
};

export function modeLabel(mode) {
  return modes[mode]?.label || String(mode || 'line');
}
