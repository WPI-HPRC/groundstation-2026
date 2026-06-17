/** Decode a base64 string of raw RGB8 bytes into RGBA ImageData (alpha = 255). */
export function rgbBase64ToImageData(base64: string, width: number, height: number): ImageData {
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid frame dimensions: ${width}x${height}`);
  }
  const expectedRgbLen = width * height * 3;
  const binary = atob(base64);
  if (binary.length < expectedRgbLen) {
    throw new Error(`Expected at least ${expectedRgbLen} RGB bytes, got ${binary.length}`);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  let j = 0;
  for (let i = 0; i + 2 < expectedRgbLen; i += 3) {
    rgba[j++] = binary.charCodeAt(i);
    rgba[j++] = binary.charCodeAt(i + 1);
    rgba[j++] = binary.charCodeAt(i + 2);
    rgba[j++] = 255;
  }
  return new ImageData(rgba, width, height);
}
