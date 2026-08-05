const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateCustomImage(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return "";
}
