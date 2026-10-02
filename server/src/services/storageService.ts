import axios from "axios";
import crypto from "crypto";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

const BUCKET = "hotel-images";
const AVATAR_BUCKET = "student-avatars";
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB — comfortably under Vercel's ~4.5MB serverless request body cap

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function client() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new ApiError(
      500,
      "STORAGE_NOT_CONFIGURED",
      "Image uploads are not configured on this server yet. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return axios.create({
    baseURL: `${env.supabaseUrl}/storage/v1`,
    headers: {
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      apikey: env.supabaseServiceRoleKey,
    },
  });
}

function validateImageFile(file: { mimetype: string; size: number }): void {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new ApiError(400, "INVALID_FILE_TYPE", "Only JPEG, PNG, or WebP images are allowed.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(400, "FILE_TOO_LARGE", "Image is too large — 4MB maximum.");
  }
}

async function uploadToBucket(
  bucket: string,
  pathPrefix: string,
  file: { buffer: Buffer; mimetype: string; size: number },
  logLabel: string
): Promise<string> {
  validateImageFile(file);
  const ext = EXT_BY_MIME[file.mimetype];
  const objectPath = `${pathPrefix}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;

  try {
    await client().post(`/object/${bucket}/${objectPath}`, file.buffer, {
      headers: { "Content-Type": file.mimetype },
      maxBodyLength: MAX_IMAGE_BYTES + 1024,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(`[${logLabel}] Storage upload failed:`, err.response?.data || err.message);
    }
    throw new ApiError(502, "UPLOAD_FAILED", "Could not upload the image. Please try again.");
  }

  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}

/**
 * Uploads a single image to the shared `hotel-images` bucket (public —
 * these are ordinary food/hotel photos, not sensitive documents, so a
 * stable public URL is the right fit and matches exactly what the
 * existing image_url columns already expect; see migration 024's own
 * comment about that column being written by a real upload later).
 * `pathPrefix` scopes the object under the caller's own hotel
 * (hotel/{hotelId}/profile/... or hotel/{hotelId}/meals/{itemId}/...)
 * — the controller is what enforces THAT the caller actually owns
 * that hotel, this function just uploads wherever it's told.
 */
export async function uploadHotelImage(
  pathPrefix: string,
  file: { buffer: Buffer; mimetype: string; size: number }
): Promise<string> {
  return uploadToBucket(BUCKET, pathPrefix, file, "uploadHotelImage");
}

/**
 * Separate bucket from hotel images (migration 039) — a student's
 * personal photo and a hotel's food/venue photos are different kinds
 * of content with no reason to share a namespace. pathPrefix is always
 * `student/{userId}` — the controller resolves userId from the
 * authenticated session, never from client input, so a student can
 * only ever overwrite their OWN avatar path.
 */
export async function uploadStudentAvatar(
  userId: string,
  file: { buffer: Buffer; mimetype: string; size: number }
): Promise<string> {
  return uploadToBucket(AVATAR_BUCKET, `student/${userId}`, file, "uploadStudentAvatar");
}
