// Distances on the ground, in metres: one place for both ways the app measures them.
//   haversine  the great circle: places, the street graph, distances shown to the rider
//   metres     a flat approximation, faster, as good under a few kilometres: where vehicles are along their trips (the
//              pipeline's bustimes.py and railtimes.py use the same, so the learned times answer the app's question)

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((lon2 - lon1) * Math.PI / 360) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function metres(lat1, lon1, lat2, lon2) {
  const kx = 111320 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180), ky = 110540;
  const dx = (lon2 - lon1) * kx, dy = (lat2 - lat1) * ky;
  return Math.sqrt(dx * dx + dy * dy);
}
