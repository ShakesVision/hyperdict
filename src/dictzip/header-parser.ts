/**
 * DictZip Header Parser - Parse gzip headers and RA extra field
 * Authored by Shakeeb Ahmad
 *
 * .dict.dz files use gzip format with Random Access (RA) extra field
 * RA field contains:
 * - Block size
 * - Array of block offsets in the compressed file
 */

import type { DictZipHeader } from '../core/types';

export class ShaekeebDictZipHeaderParser {
  /**
   * Parse dictzip header from first 4KB of .dict.dz file
   * Extracts block size and block offsets for random access
   */
  public parseHeader(buffer: ArrayBuffer): DictZipHeader {
    const view = new DataView(buffer);
    let offset = 0;

    // Check gzip magic number
    if (view.byteLength < 2 || view.getUint8(0) !== 0x1f || view.getUint8(1) !== 0x8b) {
      throw new Error('Not a valid gzip file');
    }

    offset = 2;

    // Check compression method (must be 8 for deflate)
    const method = view.getUint8(offset);
    if (method !== 8) {
      throw new Error('Invalid gzip compression method');
    }

    offset = 3;

    // Read flags
    const flags = view.getUint8(offset);
    offset = 4;

    // Skip modification time (4 bytes)
    offset += 4;

    // Skip extra flags and OS (2 bytes)
    offset += 2;

    // Check for extra field
    if ((flags & 0x04) === 0) {
      throw new Error('No extra field found in dictzip header');
    }

    // Read extra field length (little-endian)
    const extraLen = view.getUint16(offset, true);
    offset += 2;

    // Parse extra field to find RA header
    const extraEnd = offset + extraLen;
    const raHeader = this.parseExtraField(view, offset, extraEnd);

    if (!raHeader) {
      throw new Error('RA (Random Access) header not found in extra field');
    }

    return raHeader;
  }

  /**
   * Parse extra field to find RA (Random Access) header
   * RA header format:
   * - 'R' 'A' (2 bytes)
   * - Version (1 byte) = 1
   * - Block size in 32KB chunks (1 byte)
   * - Number of blocks (4 bytes, big-endian)
   * - Array of block offsets (4 bytes each, big-endian)
   */
  private parseExtraField(view: DataView, start: number, end: number): DictZipHeader | null {
    let offset = start;

    while (offset + 4 <= end) {
      // Check for RA signature
      if (view.getUint8(offset) === 0x52 && view.getUint8(offset + 1) === 0x41) {
        // Found RA header
        offset += 2;

        // Read version
        const version = view.getUint8(offset);
        if (version !== 1) {
          console.warn(`Unknown RA version: ${version}`);
        }

        offset += 1;

        // Read block size (in 32KB chunks)
        const blockSizeChunks = view.getUint8(offset);
        const blockSize = blockSizeChunks * 32 * 1024;
        offset += 1;

        // Read number of blocks (big-endian)
        const blockCount = view.getUint32(offset, false);
        offset += 4;

        // Read block offsets
        const blockOffsets = new Uint32Array(blockCount);
        for (let i = 0; i < blockCount; i++) {
          if (offset + 4 > end) {
            throw new Error('Truncated block offset array in RA header');
          }

          blockOffsets[i] = view.getUint32(offset, false);
          offset += 4;
        }

        return {
          blockSize,
          blockOffsets,
          totalBlocks: blockCount,
        };
      }

      // Skip this extra field subfield
      // Next 2 bytes are subfield ID, then 2 bytes length
      if (offset + 4 > end) {
        break;
      }

      offset += 2; // Skip ID
      const subLen = view.getUint16(offset, true); // little-endian
      offset += 2;
      offset += subLen;
    }

    return null;
  }

  /**
   * Find block containing given file offset
   * Returns block index, or -1 if offset is invalid
   */
  public findBlockForOffset(header: DictZipHeader, offset: number): number {
    for (let i = 0; i < header.blockOffsets.length - 1; i++) {
      if (offset >= header.blockOffsets[i] && offset < header.blockOffsets[i + 1]) {
        return i;
      }
    }

    // Check last block
    if (
      header.blockOffsets.length > 0 &&
      offset >= header.blockOffsets[header.blockOffsets.length - 1]
    ) {
      return header.blockOffsets.length - 1;
    }

    return -1;
  }

  /**
   * Get decompressed block boundaries within decompressed stream
   */
  public getDecompressedBlockBoundaries(
    header: DictZipHeader,
    blockIndex: number
  ): { start: number; end: number } {
    const blockStart = blockIndex * header.blockSize;
    const blockEnd = Math.min((blockIndex + 1) * header.blockSize, blockStart + header.blockSize);

    return {
      start: blockStart,
      end: blockEnd,
    };
  }

  /**
   * Get bytes range to fetch from compressed file for a block
   */
  public getCompressedBlockRange(
    header: DictZipHeader,
    blockIndex: number
  ): { start: number; end: number } | null {
    if (blockIndex < 0 || blockIndex >= header.blockOffsets.length) {
      return null;
    }

    const start = header.blockOffsets[blockIndex];
    const end =
      blockIndex + 1 < header.blockOffsets.length
        ? header.blockOffsets[blockIndex + 1]
        : Number.MAX_SAFE_INTEGER; // Last block extends to end

    return { start, end };
  }
}
