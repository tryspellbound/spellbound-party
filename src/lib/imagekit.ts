import ImageKit from "imagekit";

let imagekitClient: ImageKit | null = null;

/**
 * Get the singleton ImageKit client instance
 */
export const getImageKitClient = () => {
  if (!process.env.IMAGEKIT_PUBLIC_KEY) {
    throw new Error("IMAGEKIT_PUBLIC_KEY is not configured");
  }
  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    throw new Error("IMAGEKIT_PRIVATE_KEY is not configured");
  }

  if (!imagekitClient) {
    imagekitClient = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_ENDPOINT ?? "https://ik.imagekit.io/x2dirkim6/",
    });
  }

  return imagekitClient;
};

/**
 * Upload a player avatar to ImageKit
 * Converts base64 data URL to ImageKit URL
 */
export async function uploadPlayerAvatar(
  gameId: string,
  playerId: string,
  avatarDataUrl: string,
): Promise<string> {
  const client = getImageKitClient();

  console.log(`[ImageKit] Uploading player avatar for ${playerId} in game ${gameId}`);

  try {
    const imageUpload = await client.upload({
      file: avatarDataUrl,
      fileName: `avatar_${playerId}.webp`,
      useUniqueFileName: true,
      folder: `/players/avatars/${gameId}`,
    });

    console.log(`[ImageKit] Avatar uploaded successfully: ${imageUpload.url}`);
    return imageUpload.url;
  } catch (error) {
    console.error(`[ImageKit] Failed to upload player avatar:`, error);
    throw new Error(`Failed to upload avatar: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Upload a turn image to ImageKit
 * Converts base64 PNG data to ImageKit URL
 */
export async function uploadTurnImage(
  gameId: string,
  turnId: string,
  base64Data: string,
): Promise<string> {
  const client = getImageKitClient();

  console.log(`[ImageKit] Uploading turn image for turn ${turnId} in game ${gameId}`);

  try {
    // Format as data URL if it's just base64 without prefix
    const imageData = base64Data.startsWith("data:") ? base64Data : `data:image/png;base64,${base64Data}`;

    const imageUpload = await client.upload({
      file: imageData,
      fileName: `turn_${turnId}.png`,
      useUniqueFileName: true,
      folder: `/turns/images/${gameId}`,
    });

    console.log(`[ImageKit] Turn image uploaded successfully: ${imageUpload.url}`);
    return imageUpload.url;
  } catch (error) {
    console.error(`[ImageKit] Failed to upload turn image:`, error);
    throw new Error(`Failed to upload turn image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
