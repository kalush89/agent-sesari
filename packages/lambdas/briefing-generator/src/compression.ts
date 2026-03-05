/**
 * Compression Utilities
 * 
 * Provides gzip compression and decompression for briefing content.
 * Handles failures gracefully by storing uncompressed content as fallback.
 */

import { gzipSync, gunzipSync } from 'zlib';

/**
 * Compress content using gzip
 * 
 * Compresses JSON string content to minimize storage costs.
 * If compression fails, returns the original content uncompressed
 * to ensure briefing availability.
 * 
 * @param content - JSON string to compress
 * @returns Compressed buffer, or original content if compression fails
 */
export function compressContent(content: string): Buffer {
  try {
    const buffer = Buffer.from(content, 'utf-8');
    const compressed = gzipSync(buffer);
    return compressed;
  } catch (error) {
    console.warn('Compression failed, storing uncompressed:', error);
    // Return uncompressed content as fallback
    return Buffer.from(content, 'utf-8');
  }
}

/**
 * Decompress gzip content
 * 
 * Decompresses gzip buffer back to JSON string.
 * If decompression fails, attempts to treat the buffer as uncompressed content.
 * 
 * @param compressed - Compressed buffer
 * @returns Decompressed JSON string
 */
export function decompressContent(compressed: Buffer): string {
  try {
    const decompressed = gunzipSync(compressed);
    return decompressed.toString('utf-8');
  } catch (error) {
    console.warn('Decompression failed, attempting to read as uncompressed:', error);
    // Attempt to read as uncompressed content (fallback)
    try {
      return compressed.toString('utf-8');
    } catch (fallbackError) {
      console.error('Failed to read content:', fallbackError);
      throw new Error('Unable to decompress or read briefing content');
    }
  }
}

/**
 * Check if content is compressed
 * 
 * Checks for gzip magic number (0x1f 0x8b) at the start of the buffer
 * 
 * @param buffer - Buffer to check
 * @returns True if buffer appears to be gzip compressed
 */
export function isCompressed(buffer: Buffer): boolean {
  // Check for gzip magic number
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}
