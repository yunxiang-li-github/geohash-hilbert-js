const IntConversion = {
  // Based on the implementation here: https://stackoverflow.com/questions/6213227/fastest-way-to-convert-a-number-to-radix-64-in-javascript
  Base64: "0123456789@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz",
  Base16: "0123456789abcdef",
  Base4: "0123",
  /**
   * converts a given BigInt number to a string representation in a specified base (4, 16, or 64).
   * @param {bigint} number 
   * @param {int} base 4 | 16 | 64
   * @returns {string}
   */
  fromNumber: function (number, base) {
    let residual = number;
    let result = "";
    while (true) {
      const digit = Number(BigInt(residual) % BigInt(base));
      result = this[("Base" + base)].charAt(digit) + result;
      residual = BigInt(residual) / BigInt(base);
      if (residual == 0n) break;
    }
    return result;
  },
  /**
   * converts a given string representation of a number in a specified base (4, 16, or 64) to a BigInt.
   * @param {string} string 
   * @param {int} base 4 | 16 | 64
   * @returns {bigint}
   */
  toNumber: function (string, base) {
    var result = 0n;
    let chars = string.split("");
    for (var e = 0; e < chars.length; e++) {
      result =
        result * BigInt(base) +
        BigInt(this[("Base" + base)].indexOf(chars[e]));
    }
    return result;
  },
};

/**
 * Encode int into a string preserving order
 * @param {bigint} n 
 * @param {int} bits_per_char The number of bits per coding character. Default is 4. base16
 * @returns {string} the encoded integer
 */
const encode_int = (n, bits_per_char = 4) => {
  if (bits_per_char === 6) {
    return IntConversion.fromNumber(n, 64);
  }
  if (bits_per_char === 4) {
    return IntConversion.fromNumber(n, 16);
  }
  if (bits_per_char === 2) {
    return IntConversion.fromNumber(n, 4);
  }
  return "";
};

/**
 * Decode string into int assuming encoding with `encode_int()`
 * @param {string} n 
 * @param {int} bits_per_char 
 * @returns {bigint} the decoded integer
 */
const decode_int = (n, bits_per_char = 6)  => {
  if (bits_per_char === 6) {
    return IntConversion.toNumber(n, 64);
  }
  if (bits_per_char === 4) {
    return IntConversion.toNumber(n, 16);
  }
  if (bits_per_char === 2) {
    return IntConversion.toNumber(n, 4);
  }
  return 0n;
};

module.exports = { encode_int, decode_int };