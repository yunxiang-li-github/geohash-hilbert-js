const { encode_int, decode_int } = require("./utils");
const assert = require("assert");

/**
 * convert x, y coordinates to a Hilbert curve hash
 * Based on the implementation here: https://en.wikipedia.org/w/index.php?title=Hilbert_curve&oldid=797332503
 * @param {bigint} x value of point [0, dim) in dim x dim coord system
 * @param {bigint} y value of point [0, dim) in dim x dim coord system
 * @param {number} dim Number of coding points each x, y value can take.
 * @returns {bigint} hashcode ∈ [0, dim**2)
 */
const xy2hash = (x, y, dim) => {
  let d = 0n;
  let lvl = BigInt(dim >> 1);
  while (lvl > 0) {
    let rx = (x & lvl) > 0 ? 1n : 0n;
    let ry = (y & lvl) > 0 ? 1n : 0n;
    d += lvl * lvl * ((3n * rx) ^ ry);
    const r = rotate(lvl, x, y, rx, ry);
    x = r.x;
    y = r.y;
    lvl >>= 1n;
  }
  return d;
};

/**
 * Convert hashcode to (x, y).
 * Based on the implementation here: https://en.wikipedia.org/w/index.php?title=Hilbert_curve&oldid=797332503
 * @param {number} hashcode
 * @param {bigint} dim
 * @returns {Object} {x, y} point in dim x dim-grid system
 */
const hash2xy = (hashcode, dim) => {
  let x = 0n;
  let y = 0n;
  let lvl = 1n;
  let big = BigInt(hashcode);
  while (lvl < dim) {
    let rx = 1n & (big >> 1n);
    let ry = 1n & (big ^ rx);
    const r = rotate(lvl, x, y, rx, ry);
    x = r.x;
    y = r.y;
    x += lvl * rx;
    y += lvl * ry;
    big >>= 2n;
    lvl <<= 1n;
  }
  return { x: Number(x), y: Number(y) };
};

/**
 * Rotate and flip a quadrant appropriately
 * Based on the implementation here: https://en.wikipedia.org/w/index.php?title=Hilbert_curve&oldid=797332503
 * @param {bigint} n
 * @param {bigint} x
 * @param {bigint} y
 * @param {bigint} rx
 * @param {bigint} ry
 * @returns
 */
const rotate = (n, x, y, rx, ry) => {
  if (ry === 0n) {
    if (rx === 1n) {
      x = n - 1n - x;
      y = n - 1n - y;
    }
    return { x: y, y: x };
  }
  return { x, y };
};

const LAT_INTERVAL = [-90.0, 90.0];
const LNG_INTERVAL = [-180.0, 180.0];

/**
 * Get the lng/lat error for the hilbert curve with the given level
 * On every level, the error of the hilbert curve is halved, e.g.
    - level 0 has lng error of +-180 (only one coding point is available: (0, 0))
    - on level 1, there are 4 coding points: (-90, -45), (90, -45), (-90, 45), (90, 45)
      hence the lng error is +-90
 * @param {number} level Level of the used hilbert curve
 * @returns {Object} {lng, lat} (lng-error, lat-error) for the given level
 */
const lvl_error = (level) => {
  const err = 1 / (1 << level);
  return { lng: 180 * err, lat: 90 * err };
};

/**
 * Convert x, y values in dim x dim-grid coordinate system into lng, lat values.
 * @param {number} x
 * @param {number} y
 * @param {number} dim
 * @returns {Object} {lng, lat}
 */
const int2coord = (x, y, dim) => {
  const lng = (x / dim) * 360 - 180;
  const lat = (y / dim) * 180 - 90;
  return { lng, lat };
};

/**
 * Decode a geohash on a hilbert curve as a lng/lat position with error-margins
 * It assumes that the length of `code` corresponds to the precision. And that each character
    in `code` encodes `bits_per_char` bits. Do not mix geohashes with different `bits_per_char`!
 * @param {string} code 
 * @param {int} bits_per_char 
 * @returns {Object} {lng, lat, lng_err, lat_err}
 */
const decode_exactly = (code, bits_per_char = 4) => {
  isCorrectBpc(bits_per_char);
  let bits = code.length * bits_per_char;
  isOverflowing(bits);
  let level = BigInt(bits) >> 1n;
  let dim = 1n << level;
  let code_int = decode_int(code, bits_per_char);
  const { x, y } = hash2xy(code_int, dim);
  const { lng, lat } = int2coord(x, y, Number(dim));
  const err = lvl_error(Number(level));
  return {
    lng: lng + err.lng,
    lat: lat + err.lat,
    lng_err: err.lng,
    lat_err: err.lat
  };
};

/**
 * Decode a geohash on a hilbert curve as a lng/lat position
 * @param {string} code 
 * @param {int} bits_per_char 
 * @returns {Object} {lng, lat} 
 */
const decode = (code, bits_per_char = 4) => {
  isCorrectBpc(bits_per_char);
  const { lng, lat } = decode_exactly(code, bits_per_char);
  return { lng, lat };
};

/**
 * Convert lon, lat values into a dim x dim-grid coordinate system.
 * @param {number} lng Longitude value of coordinate (-180.0, 180.0); corresponds to X axis
 * @param {number} lat Latitude value of coordinate (-90.0, 90.0); corresponds to Y axis
 * @param {number} dim Number of coding points each x, y value can take.
 * @returns {bigint, bigint} Lower left corner of corresponding dim x dim-grid box
 */
const coord2int = (lng, lat, dim) => {
  // shifts the latitude range from [-90, 90] to [0, 180] and normalizes it to [0, dim]
  const lat_y = ((lat + LAT_INTERVAL[1]) / 180.0) * dim;
  // shifts the longitude range from [-180, 180] to [0, 360] and normalizes it to [0, dim]
  const lng_x = ((lng + LNG_INTERVAL[1]) / 360.0) * dim;
  return {
    // ensure that the coordinates are within the grid, but rarely necessary
    x: Math.min(dim - 1, Math.floor(lng_x)),
    y: Math.min(dim - 1, Math.floor(lat_y))
  };
};

/**
 * Get the neighboring geohashes for `code`.
 * Look for the north, north-east, east, south-east, south, south-west, west,
    north-west neighbors. If you are at the east/west edge of the grid (lng ∈ (-180, 180)), 
    then it wraps around the globe and gets the corresponding neighbor.
 * @param {string} code 
 * @param {int} bits_per_char 
 * @returns {Object} neighbors
 */
const neighbors = (code, bits_per_char = 4) => {
  isCorrectBpc(bits_per_char);
  const { lng, lat, lng_err, lat_err } = decode_exactly(code, bits_per_char);
  const precision = code.length;
  let north = lat + 2 * lat_err;
  let south = lat - 2 * lat_err;

  let east = lng + 2 * lng_err;
  if (east > 180) east -= 360;

  let west = lng - 2 * lng_err;
  if (west < -180) west += 360;

  const neighbors = {
    east: encode(east, lat, precision, bits_per_char),
    west: encode(west, lat, precision, bits_per_char)
  };

  if (north <= 90) {
    neighbors["north"] = encode(lng, north, precision, bits_per_char);
    neighbors["north-east"] = encode(east, north, precision, bits_per_char);
    neighbors["north-west"] = encode(west, north, precision, bits_per_char);
  }
  if (south >= -90) {
    neighbors["south"] = encode(lng, south, precision, bits_per_char);
    neighbors["south-east"] = encode(east, south, precision, bits_per_char);
    neighbors["south-west"] = encode(west, south, precision, bits_per_char);
  }
  return neighbors;
};

/**
 * Builds a (geojson) rectangle from `code`
 * The center of the rectangle decodes as the lng/lat for code and
    the rectangle corresponds to the error-margin, i.e. every lng/lat
    point within this rectangle will be encoded as `code`, given `precision == len(code)`.
 * @param {string} code 
 * @param {int} bits_per_char 
 * @returns {geojson} geojson `Feature` containing the rectangle as a `Polygon`.
 */
const rectangle = (code, bits_per_char = 4) => {
  isCorrectBpc(bits_per_char);
  const { lng, lat, lng_err, lat_err } = decode_exactly(code, bits_per_char);
  return {
    type: "Feature",
    properties: {
      code,
      lng,
      lat,
      lng_err,
      lat_err,
      bits_per_char
    },
    bbox: [lng - lng_err, lat - lat_err, lng + lng_err, lat + lat_err],
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng - lng_err, lat - lat_err],
          [lng + lng_err, lat - lat_err],
          [lng + lng_err, lat + lat_err],
          [lng - lng_err, lat + lat_err],
          [lng - lng_err, lat - lat_err]
        ]
      ]
    }
  };
};

/**
 * Build the (geojson) `LineString` of the used hilbert-curve
 * @param {number} precision 
 * @param {int} bits_per_char 
 * @returns {geojson} geojson `Feature` containing the hilbert curve as a `LineString`.
 */
const hilbert_curve = (precision, bits_per_char = 4) => {
  isCorrectBpc(bits_per_char);
  assert(precision < 4, "Only precision less than 4 supported right now");
  const bits = precision * bits_per_char;
  const coordinates = [];
  for (let i = 0; i < 1 << bits; i++) {
    const code = encode_int(i, bits_per_char).padStart(precision, "0");
    const { lng, lat } = decode_exactly(code, bits_per_char);
    coordinates.push([lng, lat]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates
    }
  };
};

/**
 * @param {number} bits
 */
const isOverflowing = (bits) =>
  assert(
    bits < 64,
    "Over 64 bits not supported. Reduce 'precision' or 'bits_per_char' so their product is <= 64"
  );

/**
 * @param {number} bpc
 */
const isCorrectBpc = (bpc) =>
  assert([2, 4, 6].includes(bpc), "bits_per_char must be 2, 4 or 6");

/**
 *
 * @param {number} lng Longitude; between -180.0 and 180.0; WGS 84
 * @param {number} lat Latitude; between -90.0 and 90.0; WGS 84
 * @param {int} precision The number of characters in a geohash
 * @param {int} bits_per_char The number of bits per coding character
 * @returns {string} geohash for lng/lat of length `precision`
 */
const encode = (
  lng,
  lat,
  precision = 10, // default: error 19.088 m
  bits_per_char = 4 // default: base16
) => {
  isCorrectBpc(bits_per_char);
  const bits = precision * bits_per_char;
  isOverflowing(bits);
  const level = bits >> 1;
  const dim = 1 << level;
  const { x, y } = coord2int(lng, lat, dim);
  const code = xy2hash(BigInt(x), BigInt(y), dim);
  return encode_int(code, bits_per_char).padStart(precision, "0");
};

module.exports = { encode, decode_exactly, neighbors, hilbert_curve, rectangle };
