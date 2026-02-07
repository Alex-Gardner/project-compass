export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type IssueSeverity = "low" | "medium" | "high";

export interface DocumentRecord {
  id: string;
  filename: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
}

export interface OutputJobRecord {
  id: string;
  documentId: string;
  status: JobStatus;
  attempts: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ExtractionFieldRecord {
  id: string;
  documentId: string;
  name: string;
  value: string;
  confidence: number;
  sourcePage: number;
  sourceBBox: [number, number, number, number];
  createdAt: string;
}

export interface IssueRecord {
  id: string;
  documentId: string;
  fieldId: string;
  type: string;
  severity: IssueSeverity;
  status: "open" | "resolved";
  details: string;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface QueueMessage {
  type: "document-ingest";
  jobId: string;
  documentId: string;
}

export interface DataStore {
  documents: DocumentRecord[];
  jobs: OutputJobRecord[];
  fields: ExtractionFieldRecord[];
  issues: IssueRecord[];
  notifications: NotificationRecord[];
  audits: AuditRecord[];
  queue: QueueMessage[];
}
