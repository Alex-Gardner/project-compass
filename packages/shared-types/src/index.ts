export type JobStatus = "queued" | "processing" | "completed" | "failed";
export type IssueSeverity = "low" | "medium" | "high";
export type DependencyType = "finish_to_start" | "start_to_start" | "finish_to_finish" | "start_to_finish" | "none";
export type ConstraintType = "none" | "material" | "crew" | "access" | "permit" | "weather" | "other";
export type TaskStatus = "not_started" | "in_progress" | "blocked" | "complete" | "unknown";

export interface DocumentRecord {
  id: string;
  filename: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
}

export interface OutputJobRecord {
  id: string;
  taskId: string;
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

export interface TaskAssignmentRow {
  recordId: string;
  documentId: string;
  projectName: string;
  gcName: string;
  scName: string;
  trade: string;
  taskId: string;
  taskName: string;
  locationPath: string;
  upstreamTaskId: string;
  downstreamTaskId: string;
  dependencyType: DependencyType;
  lagDays: number;
  plannedStart: string;
  plannedFinish: string;
  durationDays: number;
  scAvailableFrom: string;
  scAvailableTo: string;
  allocationPct: number;
  constraintType: ConstraintType;
  constraintNote: string;
  constraintImpactDays: number;
  status: TaskStatus;
  percentComplete: number;
  sourcePage: number;
  sourceSnippet: string;
  extractedAt: string;
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
  taskId?: string;
  documentId?: string;
  type: string;
  title: string;
  body: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
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
