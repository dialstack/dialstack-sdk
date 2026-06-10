/**
 * An uploaded file scoped to an account. Created via `POST /v1/files` and
 * referenced by resources such as faxes.
 */
export interface File {
  object: 'file';
  id: string;
  /** Categorizes the file's intended use (e.g. `fax_source`). */
  purpose: string;
  /** Original uploaded filename; null when not provided. */
  filename: string | null;
  /** Short type derived from the MIME type (e.g. `pdf`); null when unrecognized. */
  type: string | null;
  /** Detected/declared content type (e.g. `application/pdf`). */
  mime_type: string;
  /** File size in bytes. */
  size: number;
  /**
   * Signed, short-lived URL for the file's bytes. Loads directly in a browser
   * within the expiry window; null when not available.
   */
  url: string | null;
  created_at: string;
  updated_at: string;
}
