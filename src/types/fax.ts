import type { File } from './file';

export type FaxDirection = 'inbound' | 'outbound';

export type FaxStatus = 'queued' | 'sending' | 'delivered' | 'failed' | 'received';

/** Related resources that can be inlined on a fax via `expand[]`. */
export type FaxExpand = 'file';

export type FaxTransport = 't38' | 'g711';

export interface FaxItem {
  object: 'fax';
  id: string;
  direction: FaxDirection;
  status: FaxStatus;
  /** ID of the file holding the fax document; null when there is no file yet. */
  file_id: string | null;
  /**
   * The fax document. The file's id by default; a {@link File} object (carrying
   * a signed `url`) when expand[]=file is requested; null when there is no file.
   */
  file: string | File | null;
  /** Source DID for outbound, terminating DID for inbound. */
  from_did_id: string;
  call_id: string | null;
  pages: number | null;
  transport: FaxTransport | null;
  error_code: string | null;
  attempts: number;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Upload the PDF via POST /v1/files (purpose=fax_source) first. */
export interface CreateFaxRequest {
  file_id: string;
  to: string;
  from_did_id: string;
}

export interface ListFaxesOptions {
  limit?: number;
  direction?: FaxDirection;
  status?: FaxStatus;
  did_id?: string;
  /** Related resources to inline. Supported: `file`. */
  expand?: FaxExpand[];
}
