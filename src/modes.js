/* One table for the four playable modes. Speeds are km/h, costs are zł per vehicle-km, dwell is minutes.
   Capacity is seats plus standing at 4 people/m². Standing places in Bujak, Bujak and Kucharski,
   Sustainability 2025, 17(13), 5835, Table 1, are at 5 people/m² (0.2 m² each); they are rescaled by 4/5.
   https://www.mdpi.com/2071-1050/17/13/5835 */
export const vehicles = {
  bus12: { mode: 'bus', capacity: 28 + Math.round(50 * 4 / 5) },
  bus18: { mode: 'bus', capacity: 42 + Math.round(88 * 4 / 5) },
  tram30: { mode: 'tram', capacity: 40 + Math.round(175 * 4 / 5) },
  emu3: { mode: 'rail', capacity: 154 + Math.round(252 * 4 / 5) },
  metro6: { mode: 'metro', capacity: 244 + Math.round(940 * 4 / 5) },
};

export const modes = {
  bus: { label: 'Bus', color: '#ef705e', speed: 22, capacity: vehicles.bus12.capacity, costPerKm: 12, dwell: 0.55, stopSpacingHint: 400, defaultHeadway: 10, vehicleOptions: ['bus12', 'bus18'], alignmentOptions: ['street', 'lane'] },
  tram: { label: 'Tram', color: '#15b8c7', speed: 25, capacity: vehicles.tram30.capacity, costPerKm: 20, dwell: 0.55, stopSpacingHint: 500, defaultHeadway: 8, vehicleOptions: ['tram30'], alignmentOptions: ['street', 'segregated'] },
  rail: { label: 'Rail', color: '#5387ef', speed: 48, capacity: vehicles.emu3.capacity, costPerKm: 38, dwell: 0.55, stopSpacingHint: 1500, defaultHeadway: 20, vehicleOptions: ['emu3'], alignmentOptions: ['track'] },
  metro: { label: 'Metro', color: '#8068e8', speed: 42, capacity: vehicles.metro6.capacity, costPerKm: 55, dwell: 0.55, stopSpacingHint: 1000, defaultHeadway: 6, vehicleOptions: ['metro6'], alignmentOptions: ['tunnel', 'elevated'] }
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
