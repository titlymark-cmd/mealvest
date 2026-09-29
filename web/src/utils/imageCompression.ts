const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Resizes/compresses an image client-side before it ever leaves the
 * device — a phone camera photo can easily be 10-15MB, and the server
 * caps uploads at 4MB (storageService.MAX_IMAGE_BYTES). Shared by
 * every image-upload entry point in the hotel dashboard.
 */
export function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not process this image."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not process this image."));
            return;
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This file doesn't look like a valid image."));
    };
    img.src = objectUrl;
  });
}
