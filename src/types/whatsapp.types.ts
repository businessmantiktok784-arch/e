/**
 * WhatsApp Cloud API Type Definitions for Earth Talk.
 *
 * Earth Talk is WhatsApp-first, so the inbound payload surface is the primary
 * user interface. Video and location are first-class here: a video is how
 * someone shows a rock cut, and a shared pin is how they tell the platform where
 * they were standing.
 */

export interface WebhookVerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

export interface WhatsAppTextMessage {
  body: string;
}

export interface WhatsAppImageMessage {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppVideoMessage {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
}

export interface WhatsAppAudioMessage {
  id: string;
  mime_type?: string;
  sha256?: string;
}

/**
 * A shared location pin.
 *
 * `name` and `address` are supplied by the sender and are therefore unverified
 * free text. Nothing in them is treated as a confirmed place name; a sender may
 * label a pin with anything at all.
 */
export interface WhatsAppLocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'video'
    | 'document'
    | 'location'
    | 'contacts'
    | 'interactive'
    | 'sticker'
    | 'reaction'
    | 'button'
    | 'order'
    | string;
  text?: WhatsAppTextMessage;
  image?: WhatsAppImageMessage;
  video?: WhatsAppVideoMessage;
  audio?: WhatsAppAudioMessage;
  location?: WhatsAppLocationMessage;
  context?: { id?: string; forwarded?: boolean; referred_product?: { product_retailer_id?: string } };
}

export interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface SendTextMessagePayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: {
    preview_url: boolean;
    body: string;
  };
}

export interface WhatsAppApiResponse {
  messaging_product?: string;
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: Array<{
    id: string;
  }>;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
}
