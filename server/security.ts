// Upload checks that don't trust the browser.
import { HttpError } from "./errors.js";

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

/** Image types we accept, identified by their first bytes, never by name or browser-sent type. */
const SIGNATURES: { ext: string; mime: string; test: (b: Uint8Array) => boolean }[] = [
  { ext: "png", mime: "image/png", test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "jpg", mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "gif", mime: "image/gif", test: (b) => b.length > 6 && /^GIF8[79]a$/.test(ascii(b, 0, 6)) },
  { ext: "webp", mime: "image/webp", test: (b) => b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP" },
];

/**
 * Returns a safe name + type for an uploaded image, or throws 400. SVG is refused
 * because it can carry scripts.
 */
export function checkImage(bytes: Uint8Array): { originalName: string; mimetype: string } {
  const sig = SIGNATURES.find((s) => s.test(bytes));
  if (!sig) throw new HttpError(400, "Please upload a PNG, JPG, GIF or WebP image.");
  return { originalName: `image.${sig.ext}`, mimetype: sig.mime };
}
