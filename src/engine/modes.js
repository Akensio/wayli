// What kind of vehicle runs a line, from its GTFS route type, as the whole app names it: rail (Israel Railways), lrt
// (light rail), cable (the Carmelit and the cable car), taxi (shared taxis), flex (on demand) or bus.

/** @param {number | null | undefined} type @returns {'rail' | 'lrt' | 'cable' | 'taxi' | 'flex' | 'bus'} */
export function modeOfType(type) {
  if (type === 2) return 'rail';
  if (type === 0) return 'lrt';
  if (type === 5 || type === 6 || type === 7) return 'cable';
  if (type === 8) return 'taxi';
  if (type === 715) return 'flex';
  return 'bus';
}
