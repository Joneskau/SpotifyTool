export interface ProcessedCoverImage {
  base64: string;
  dataUrl: string;
}

export function validateCoverImage(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const nameLower = file.name.toLowerCase();
  const typeLower = file.type.toLowerCase();

  // Reject HEIC / HEIF format with informative message
  if (
    typeLower.includes('heic') ||
    typeLower.includes('heif') ||
    nameLower.endsWith('.heic') ||
    nameLower.endsWith('.heif')
  ) {
    return {
      valid: false,
      error: 'HEIC format is not supported by browsers. Please use JPEG, PNG, or WebP.',
    };
  }

  const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  const matchesMime = validMimes.includes(typeLower);
  const matchesExt = validExtensions.some(ext => nameLower.endsWith(ext));

  if (!matchesMime && !matchesExt) {
    return {
      valid: false,
      error: 'Unsupported image format. Please select a JPEG, PNG, or WebP image.',
    };
  }

  // Cap raw input at 12 MB to avoid memory spikes in browser canvas
  const MAX_INPUT_BYTES = 12 * 1024 * 1024;
  if (file.size > MAX_INPUT_BYTES) {
    return {
      valid: false,
      error: 'Image file is too large (maximum 12 MB). Please select a smaller image.',
    };
  }

  return { valid: true };
}

/**
 * Strips data URL scheme prefix (e.g. "data:image/jpeg;base64,") to return raw base64.
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex !== -1) {
    return dataUrl.slice(commaIndex + 1);
  }
  return dataUrl;
}

/**
 * Processes, center-crops to square, fills white background for transparent PNGs,
 * and compresses to JPEG until the base64 payload fits within Spotify's 256 KB limit.
 */
export async function processImageForSpotifyCover(
  file: File,
  targetSize = 640
): Promise<ProcessedCoverImage> {
  const validation = validateCoverImage(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid cover image file.');
  }

  // 1. Decode image with EXIF orientation
  let imageSource: ImageBitmap | HTMLImageElement;
  let sourceWidth = 0;
  let sourceHeight = 0;

  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      imageSource = await createImageBitmap(file, { imageOrientation: 'from-image' });
      sourceWidth = imageSource.width;
      sourceHeight = imageSource.height;
    } catch {
      imageSource = await loadImageElement(file);
      sourceWidth = imageSource.naturalWidth || imageSource.width;
      sourceHeight = imageSource.naturalHeight || imageSource.height;
    }
  } else {
    imageSource = await loadImageElement(file);
    sourceWidth = imageSource.naturalWidth || imageSource.width;
    sourceHeight = imageSource.naturalHeight || imageSource.height;
  }

  if (sourceWidth === 0 || sourceHeight === 0) {
    throw new Error('Unable to determine image dimensions.');
  }

  // 2. Setup canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available.');
  }

  // Fill background with white so transparent PNGs do not become black in JPEG
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetSize, targetSize);

  // 3. Center-crop source into target square
  const minDim = Math.min(sourceWidth, sourceHeight);
  const srcX = (sourceWidth - minDim) / 2;
  const srcY = (sourceHeight - minDim) / 2;

  ctx.drawImage(
    imageSource,
    srcX,
    srcY,
    minDim,
    minDim,
    0,
    0,
    targetSize,
    targetSize
  );

  // Close bitmap if applicable
  if ('close' in imageSource && typeof imageSource.close === 'function') {
    imageSource.close();
  }

  // 4. Compress to JPEG, reducing quality until base64 payload <= 250 KB
  const MAX_BASE64_BYTES = 250 * 1024; // Margin below Spotify 256 KB limit
  let quality = 0.9;
  let finalDataUrl = '';
  let rawBase64 = '';

  while (quality >= 0.3) {
    finalDataUrl = canvas.toDataURL('image/jpeg', quality);
    rawBase64 = stripDataUrlPrefix(finalDataUrl);

    if (rawBase64.length <= MAX_BASE64_BYTES) {
      break;
    }
    quality -= 0.08;
  }

  // Fallback: If still above limit, downscale dimensions
  if (rawBase64.length > MAX_BASE64_BYTES && targetSize > 320) {
    return processImageForSpotifyCover(file, Math.floor(targetSize * 0.75));
  }

  return {
    base64: rawBase64,
    dataUrl: finalDataUrl,
  };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file.'));
    };
    img.src = url;
  });
}
