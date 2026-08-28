import axios from 'axios';
import sharp from 'sharp';
import { config } from '../config';
import { FileTooLargeError, InvalidFileTypeError, ValidationError } from '../types/errors';

// Allowed Mime Types & extensions
const ALLOWED_IMAGE_MIME_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};

const ALLOWED_AUDIO_MIME_TYPES: Record<string, string[]> = {
  'audio/mpeg': ['mp3'],
  'audio/mp3': ['mp3'],
  'audio/wav': ['wav'],
  'audio/x-wav': ['wav'],
  'audio/wave': ['wav'],
  'audio/mp4': ['m4a'],
  'audio/m4a': ['m4a'],
  'audio/x-m4a': ['m4a'],
  'audio/ogg': ['ogg'],
  'audio/webm': ['webm'],
  'video/webm': ['webm'], // web browser audio recordings can be sent as video/webm
};

export interface FileValidationResult {
  content: Buffer;
  contentType: string;
  extension: string;
}

export const validateAndReadImage = async (
  file: Express.Multer.File
): Promise<FileValidationResult> => {
  const filename = file.originalname || '';
  const ext = pathExtension(filename);
  
  const allowedImageExts = ['jpg', 'jpeg', 'png', 'webp'];
  if (!allowedImageExts.includes(ext)) {
    throw new InvalidFileTypeError(allowedImageExts);
  }

  const contentType = file.mimetype ? file.mimetype.split(';')[0].trim().toLowerCase() : '';
  if (!ALLOWED_IMAGE_MIME_TYPES[contentType]) {
    throw new InvalidFileTypeError(Object.keys(ALLOWED_IMAGE_MIME_TYPES));
  }

  const allowedExtsForMime = ALLOWED_IMAGE_MIME_TYPES[contentType] || [];
  if (!allowedExtsForMime.includes(ext)) {
    throw new ValidationError(`File extension '.${ext}' does not match content type '${contentType}'`);
  }

  const content = file.buffer;
  if (!content || content.length === 0) {
    throw new ValidationError('Uploaded file is empty');
  }

  if (content.length > config.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    throw new FileTooLargeError(config.MAX_IMAGE_SIZE_MB);
  }

  verifyImageMagicBytes(content, ext);

  return { content, contentType, extension: ext };
};

export const validateAndReadAudio = async (
  file: Express.Multer.File
): Promise<FileValidationResult> => {
  const filename = file.originalname || '';
  const ext = pathExtension(filename);

  const allowedAudioExts = ['mp3', 'wav', 'm4a', 'ogg', 'webm'];
  if (!allowedAudioExts.includes(ext)) {
    throw new InvalidFileTypeError(allowedAudioExts);
  }

  const contentType = file.mimetype ? file.mimetype.split(';')[0].trim().toLowerCase() : '';
  if (!ALLOWED_AUDIO_MIME_TYPES[contentType]) {
    throw new InvalidFileTypeError(Object.keys(ALLOWED_AUDIO_MIME_TYPES));
  }

  const content = file.buffer;
  if (!content || content.length === 0) {
    throw new ValidationError('Uploaded audio file is empty');
  }

  if (content.length > config.MAX_AUDIO_SIZE_MB * 1024 * 1024) {
    throw new FileTooLargeError(config.MAX_AUDIO_SIZE_MB);
  }

  return { content, contentType, extension: ext };
};

export const enhanceImageBytes = async (
  imageBytes: Buffer,
  contentType: string
): Promise<{ content: Buffer; contentType: string; extension: string }> => {
  try {
    let sh = sharp(imageBytes).rotate(); // auto-rotate based on EXIF tags
    
    // Flatten transparency to white background
    sh = sh.flatten({ background: { r: 255, g: 255, b: 255 } });
    
    // Brightness + Saturation adjustments
    sh = sh.modulate({
      brightness: 1.03,
      saturation: 1.04
    });
    
    // Apply contrast correction via a linear transformation
    sh = sh.linear(1.06, -7.68);
    
    // Mild sharpening
    sh = sh.sharpen({
      sigma: 1.0,
      m1: config.ENHANCE_SHARPEN_AMOUNT
    });
    
    // Resize if longest side exceeds ENHANCE_MAX_DIMENSION
    sh = sh.resize({
      width: config.ENHANCE_MAX_DIMENSION,
      height: config.ENHANCE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    });

    const enhanced = await sh
      .jpeg({ quality: config.ENHANCE_JPEG_QUALITY, force: true })
      .toBuffer();

    if (!enhanced || enhanced.length === 0) {
      throw new ValidationError('Image enhancement produced an empty result');
    }

    return {
      content: enhanced,
      contentType: 'image/jpeg',
      extension: 'jpg'
    };
  } catch (error) {
    throw new ValidationError(`Unable to decode or process image contents: ${error instanceof Error ? error.message : error}`);
  }
};

export const fetchImageBytes = async (url: string): Promise<{ content: Buffer; contentType: string }> => {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: config.MAX_IMAGE_SIZE_MB * 1024 * 1024,
    });

    const rawContentType = response.headers['content-type'];
    const contentType = typeof rawContentType === 'string' ? rawContentType.split(';')[0].trim() : 'application/octet-stream';
    const content = Buffer.from(response.data);

    if (content.length > config.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      throw new FileTooLargeError(config.MAX_IMAGE_SIZE_MB);
    }

    return { content, contentType };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new ValidationError(`Could not download the original image (HTTP ${error.response.status})`);
    }
    throw new ValidationError(`Could not reach the original image URL: ${error instanceof Error ? error.message : error}`);
  }
};

// Internal helpers
const pathExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
};

const verifyImageMagicBytes = (content: Buffer, extension: string): void => {
  if (!content || content.length < 4) {
    throw new ValidationError('File content is too short to be a valid image');
  }

  const magic = content.subarray(0, 4);

  const checks: Record<string, (b: Buffer) => boolean> = {
    'jpg': (b) => b[0] === 0xff && b[1] === 0xd8,
    'jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
    'png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, // \x89PNG
    'webp': (b) => b.toString('ascii', 0, 4) === 'RIFF', // WebP starts with RIFF container
  };

  const checker = checks[extension];
  if (checker && !checker(magic)) {
    throw new ValidationError(`File content does not match expected format for '.${extension}'`);
  }
};
