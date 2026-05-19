export type FaxDirection = 'inbound' | 'outbound';

export type FaxStatus = 'queued' | 'sending' | 'delivered' | 'failed' | 'received';

export type FaxTransport = 't38' | 'g711';

/** Mint a FileLink against `file_id` to render the PDF. */
export interface FaxItem {
  object: 'fax';
  id: string;
  direction: FaxDirection;
  status: FaxStatus;
  file_id: string;
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
}
