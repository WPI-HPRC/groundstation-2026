/**
 * Global test setup: polyfill browser APIs that jsdom doesn't provide but our
 * payload code requires (e.g. ImageData for canvas operations).
 */

if (typeof globalThis.ImageData === "undefined") {
  class ImageDataPolyfill {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ImageData = ImageDataPolyfill;
}
