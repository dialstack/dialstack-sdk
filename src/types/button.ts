/**
 * Programmable button types for desk phones and compatible devices.
 */

export type ButtonType =
  | 'line'
  | 'blf_extension'
  | 'blf_park'
  | 'blf_voicemail_shared'
  | 'blf_queue_agent'
  | 'blf_queue_depth'
  | 'speed_dial'
  | 'dtmf'
  | 'voicemail'
  | 'url'
  | 'multicast'
  | 'conference'
  | 'transfer'
  | 'forward'
  | 'park'
  | 'intercom'
  | 'dnd'
  | 'record_toggle';

/**
 * Type-specific target payload for a button. The discriminator is the
 * surrounding `type` field; each variant carries its own narrow shape so
 * callers get a compile-time error when they pair the wrong target with
 * a type.
 */
export type ButtonTarget =
  | { line_index?: number } // line
  | { user: 'self' | string } // blf_extension, voicemail (per-user)
  | { slot: number } // blf_park, park (when explicit)
  | { shared_voicemail_box: string } // blf_voicemail_shared
  | { queue: string; user: 'self' | string } // blf_queue_agent
  | { queue: string } // blf_queue_depth
  | { destination: string } // speed_dial, forward (when explicit)
  | { digits: string } // dtmf
  | { url: string } // url
  | { address: string; port: number } // multicast
  | { mode: 'blind' | 'attended' } // transfer
  | Record<string, never>; // conference, dnd, record_toggle, park (auto), forward (default), voicemail (own mailbox)

/**
 * Type-narrowed button params used by `CreateTemplateButton` / `CreateDeviceButtonOverride`.
 * Pair this discriminator with its `target` shape so TypeScript catches
 * mismatched payloads at compile time.
 */
export type ButtonParams =
  | { type: 'line'; target?: { line_index?: number } }
  | { type: 'blf_extension'; target: { user: 'self' | string } }
  | { type: 'blf_park'; target: { slot: number } }
  | { type: 'blf_voicemail_shared'; target: { shared_voicemail_box: string } }
  | { type: 'blf_queue_agent'; target: { queue: string; user: 'self' | string } }
  | { type: 'blf_queue_depth'; target: { queue: string } }
  | { type: 'speed_dial'; target: { destination: string } }
  | { type: 'dtmf'; target: { digits: string } }
  | { type: 'voicemail'; target?: { user?: 'self' | string } }
  | { type: 'url'; target: { url: string } }
  | { type: 'multicast'; target: { address: string; port: number } }
  | { type: 'conference'; target?: Record<string, never> }
  | { type: 'transfer'; target: { mode: 'blind' | 'attended' } }
  | { type: 'forward'; target?: { destination?: string } }
  | { type: 'park'; target?: { slot?: number } }
  | { type: 'intercom'; target: { user: string } }
  | { type: 'dnd'; target?: Record<string, never> }
  | { type: 'record_toggle'; target?: Record<string, never> };

export type ButtonCompatibilityReason =
  'vendor_does_not_support_type' | 'position_out_of_range_for_model' | 'device_has_no_owning_user';

export interface ButtonCompatibilityVerdict {
  supported: boolean;
  reason?: ButtonCompatibilityReason;
}

export interface ButtonCompatibilitySummary {
  device: {
    vendor: string;
    model: string;
    kind: 'deskphone' | 'dect_base' | 'dect_handset';
    max_position: number;
  };
  supported_count: number;
  unsupported: Array<{
    template_button?: string | null;
    /** @deprecated Use `template_button`. Retained for backwards compatibility. */
    template_button_id?: string | null;
    override?: string | null;
    /** @deprecated Use `override`. Retained for backwards compatibility. */
    override_id?: string | null;
    position: number;
    type: ButtonType;
    reason: ButtonCompatibilityReason;
  }>;
}

export interface ButtonTemplate {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ButtonTemplateWithDetails extends ButtonTemplate {
  /** Present only when `expand[]=buttons`. */
  buttons?: TemplateButton[];
  /** Present only when `for_device` is supplied. */
  compatibility?: ButtonCompatibilitySummary;
}

export interface TemplateButton {
  id: string;
  template?: string;
  /** @deprecated Use `template`. Retained for backwards compatibility. */
  template_id: string;
  position: number;
  label: string;
  type: ButtonType;
  target: ButtonTarget;
  created_at: string;
}

export interface DeviceButtonOverride {
  id: string;
  device?: string;
  /** @deprecated Use `device`. Retained for backwards compatibility. */
  device_id: string;
  position: number;
  suppressed: boolean;
  label?: string | null;
  type?: ButtonType | null;
  target?: ButtonTarget;
  created_at: string;
}

export interface MaterializedButton {
  position: number;
  label: string;
  type: ButtonType;
  target: ButtonTarget;
  source: 'template' | 'override' | 'template_overridden';
  template_button?: string | null;
  /** @deprecated Use `template_button`. Retained for backwards compatibility. */
  template_button_id?: string | null;
  override?: string | null;
  /** @deprecated Use `override`. Retained for backwards compatibility. */
  override_id?: string | null;
  compatibility: ButtonCompatibilityVerdict;
}

export interface CreateButtonTemplateRequest {
  name: string;
  description?: string;
}

export interface UpdateButtonTemplateRequest {
  name?: string;
  description?: string | null;
}

export type CreateTemplateButtonRequest = {
  position: number;
  label: string;
} & ButtonParams;

export interface UpdateTemplateButtonRequest {
  /** New position for the button (position is the only updatable field). */
  position: number;
}

export type CreateDeviceButtonOverrideRequest =
  | {
      position: number;
      suppressed: true;
    }
  | ({
      position: number;
      suppressed?: false;
      label: string;
    } & ButtonParams);
