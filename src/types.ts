// Shared geometry types for the overlay / pixel path.

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IgnoreRegion {
  geometry: Geometry; // frame-relative CSS px
}
