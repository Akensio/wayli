// What kind of vehicle runs a line, from its GTFS route type, as the whole app names it: rail (Israel Railways), lrt
// (light rail), cable (the Carmelit and the cable car), taxi (shared taxis), flex (on demand) or bus.

/** @param {number | null | undefined} type @returns {'rail' | 'lrt' | 'cable' | 'taxi' | 'flex' | 'bus'} */
export const modeOfType = (type) =>
  (type === 2 ? 'rail' : type === 0 ? 'lrt' : type === 5 || type === 6 || type === 7 ? 'cable' : type === 8 ? 'taxi' : type === 715 ? 'flex' : 'bus');
