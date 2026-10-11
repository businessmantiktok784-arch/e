import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { GeologicalAnalysisError } from '../ai/geological.types.js';
import { detectMediaFromBuffer, type MediaKind } from '../utils/image-validator.js';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  fileSize: number;
  /**
   * The kind determined from the bytes, not from what Meta declared. A sender
   * controls the declared type, so the bytes decide which pipeline runs.
   */
  mediaKind: MediaKind;
}

export class WhatsAppMediaService {
  /**
   * Retrieves media metadata and downloads the media bytes securely from Meta's
   * Cloud API.
   *
   * The download URL is short-lived and single-use, so it is fetched immediately
   * and never logged. The returned `mediaKind` comes from inspecting the bytes,
   * not from the `mime_type` Meta reported.
   *
   * @param mediaId The WhatsApp media identifier.
   */
  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    logger.info('Media download started', { mediaId });

    // Step 1: Retrieve media metadata from Graph API
    const metaUrl = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${mediaId}`;
    let downloadUrl: string;
    let declaredMimeType = 'image/jpeg';
    let declaredFileSize = 0;

    try {
      const metaResponse = await fetch(metaUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        },
      });

      if (!metaResponse.ok) {
        logger.error('WhatsApp Media API failed to retrieve metadata', {
          mediaId,
          status: metaResponse.status,
          statusText: metaResponse.statusText,
        });
        throw new GeologicalAnalysisError(
          'WHATSAPP_MEDIA_ERROR',
          `Failed to retrieve media metadata: HTTP ${metaResponse.status}`
        );
      }

      const metaData = (await metaResponse.json()) as {
        url?: string;
        mime_type?: string;
        file_size?: number;
      };

      if (!metaData.url) {
        throw new GeologicalAnalysisError('WHATSAPP_MEDIA_ERROR', 'No media download URL in Meta response');
      }

      downloadUrl = metaData.url;
      if (metaData.mime_type) {
        declaredMimeType = metaData.mime_type;
      }
      if (metaData.file_size) {
        declaredFileSize = metaData.file_size;
      }
    } catch (err: unknown) {
      if (err instanceof GeologicalAnalysisError) throw err;
      const msg = err instanceof Error ? err.message : 'Unknown network error';
      logger.error('Error fetching WhatsApp media metadata', { mediaId, error: msg });
      throw new GeologicalAnalysisError('WHATSAPP_MEDIA_ERROR', msg, err);
    }

    // Step 2: Download media bytes from the authenticated Meta media URL
    try {
      const downloadResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        },
      });

      if (!downloadResponse.ok) {
        logger.error('WhatsApp Media download failed', {
          mediaId,
          status: downloadResponse.status,
          statusText: downloadResponse.statusText,
        });
        throw new GeologicalAnalysisError(
          'IMAGE_DOWNLOAD_ERROR',
          `Failed to download media bytes: HTTP ${downloadResponse.status}`
        );
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // The bytes decide the kind and the reported type. If they are unidentifiable
      // the declared type is still passed through so the validator can produce a
      // precise "unsupported format" message rather than a generic failure.
      const detected = detectMediaFromBuffer(buffer);
      const mimeType = detected?.mimeType ?? declaredMimeType;
      const mediaKind: MediaKind = detected?.kind ?? (declaredMimeType.startsWith('video/') ? 'video' : 'image');

      logger.info('Media download completed', {
        mediaId,
        bytesReceived: buffer.length,
        mimeType,
        mediaKind,
        declaredTypeMatchedBytes: Boolean(detected),
      });

      if (detected && detected.mimeType !== declaredMimeType) {
        logger.warn('Declared media type did not match the actual bytes', {
          mediaId,
          declared: declaredMimeType,
          actual: detected.mimeType,
        });
      }

      return {
        buffer,
        mimeType,
        fileSize: declaredFileSize || buffer.length,
        mediaKind,
      };
    } catch (err: unknown) {
      if (err instanceof GeologicalAnalysisError) throw err;
      const msg = err instanceof Error ? err.message : 'Download stream error';
      logger.error('Error downloading media bytes', { mediaId, error: msg });
      throw new GeologicalAnalysisError('IMAGE_DOWNLOAD_ERROR', msg, err);
    }
  }
}

export const whatsappMediaService = new WhatsAppMediaService();
