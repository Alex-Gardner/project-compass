import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import type { ConstraintType, DependencyType, TaskAssignmentRow, TaskStatus } from "@project-compass/shared-types";

const dependencyTypes: DependencyType[] = ["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish", "none"];
const constraintTypes: ConstraintType[] = ["none", "material", "crew", "access", "permit", "weather", "other"];
const taskStatuses: TaskStatus[] = ["not_started", "in_progress", "blocked", "complete", "unknown"];
const DEFAULT_PDF_PARSE_MAX_PAGES = 12;
const DEFAULT_PDF_TEXT_MAX_CHARS = 24000;

function isOpenAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key !== "openai_placeholder");
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeDate(input: string): string {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return "";
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseEnum<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function rowSchemaNormalize(row: Partial<TaskAssignmentRow>, filename: string, documentId: string): TaskAssignmentRow {
  const plannedStart = normalizeDate(String(row.plannedStart ?? ""));
  const plannedFinish = normalizeDate(String(row.plannedFinish ?? ""));
  const scAvailableFrom = normalizeDate(String(row.scAvailableFrom ?? ""));
  const scAvailableTo = normalizeDate(String(row.scAvailableTo ?? ""));

  return {
    recordId: String(row.recordId ?? `row_${crypto.randomUUID().slice(0, 8)}`),
    documentId,
    projectName: String(row.projectName ?? filename.replace(/\.pdf$/i, "")).trim(),
    gcName: String(row.gcName ?? "").trim(),
    scName: String(row.scName ?? "").trim(),
    trade: String(row.trade ?? "").trim(),
    taskId: String(row.taskId ?? "").trim(),
    taskName: String(row.taskName ?? "").trim(),
    locationPath: String(row.locationPath ?? "").trim(),
    upstreamTaskId: String(row.upstreamTaskId ?? "").trim(),
    downstreamTaskId: String(row.downstreamTaskId ?? "").trim(),
    dependencyType: parseEnum(String(row.dependencyType ?? "none"), dependencyTypes, "none"),
    lagDays: Number.isFinite(Number(row.lagDays)) ? Number(row.lagDays) : 0,
    plannedStart,
    plannedFinish,
    durationDays: Number.isFinite(Number(row.durationDays)) ? Number(row.durationDays) : 0,
    scAvailableFrom,
    scAvailableTo,
    allocationPct: clamp(0, Number(row.allocationPct ?? 0) || 0, 100),
    constraintType: parseEnum(String(row.constraintType ?? "none"), constraintTypes, "none"),
    constraintNote: String(row.constraintNote ?? "").trim(),
    constraintImpactDays: Number.isFinite(Number(row.constraintImpactDays)) ? Number(row.constraintImpactDays) : 0,
    status: parseEnum(String(row.status ?? "unknown"), taskStatuses, "unknown"),
    percentComplete: clamp(0, Number(row.percentComplete ?? 0) || 0, 100),
    confidence: clamp(0, Number(row.confidence ?? 0.45) || 0.45, 1),
    sourcePage: Number.isFinite(Number(row.sourcePage)) ? Number(row.sourcePage) : 1,
    sourceSnippet: String(row.sourceSnippet ?? "").trim(),
    extractedAt: new Date().toISOString()
  };
}

function heuristicExtractRows(filename: string, documentId: string, pdfText: string): TaskAssignmentRow[] {
  const text = normalizeText(pdfText);
  const projectMatch = text.match(
    /(?:project\s*(?:name)?|job\s*(?:name|title)?|subject)\s*[:\-]\s*([A-Za-z0-9 ,.&()\/-]{3,120}?)(?=\s+(?:bid\s+due|bid\s+date|due\s+date|scope)\b|$)/i
  );
  const bidDateMatch = text.match(
    /(?:bid\s+due\s+date|bid\s+date|proposal\s+due|due\s+date)\s*[:\-]?\s*([A-Za-z0-9,\/ -]{4,40}?)(?=\s+scope\b|$)/i
  );
  const scopeMatch = text.match(/(?:scope|work\s*scope|description)\s*[:\-]\s*([^]{1,220})/i);
  const tradeMatch = text.match(/(?:trade|discipline)\s*[:\-]\s*([A-Za-z0-9 &\/-]{2,50})/i);

  const row = rowSchemaNormalize(
    {
      projectName: projectMatch?.[1] ?? filename.replace(/\.pdf$/i, ""),
      scName: "",
      trade: tradeMatch?.[1] ?? "",
      taskId: "T-001",
      taskName: (scopeMatch?.[1] ?? "Document-derived task").slice(0, 80),
      locationPath: "",
      dependencyType: "none",
      lagDays: 0,
      plannedStart: "",
      plannedFinish: normalizeDate(bidDateMatch?.[1] ?? ""),
      durationDays: 0,
      scAvailableFrom: "",
      scAvailableTo: "",
      allocationPct: 0,
      constraintType: "none",
      constraintNote: "",
      constraintImpactDays: 0,
      status: "unknown",
      percentComplete: 0,
      confidence: text ? 0.55 : 0.35,
      sourcePage: 1,
      sourceSnippet: text.slice(0, 180)
    },
    filename,
    documentId
  );

  return [row];
}

async function extractPdfText(storagePath: string): Promise<string> {
  const file = await readFile(storagePath);
  const parser = new PDFParse({ data: file });
  const maxPages = parsePositiveIntEnv("PDF_PARSE_MAX_PAGES", DEFAULT_PDF_PARSE_MAX_PAGES);
  const maxChars = parsePositiveIntEnv("PDF_TEXT_MAX_CHARS", DEFAULT_PDF_TEXT_MAX_CHARS);

  try {
    const parsed = await parser.getText({ first: maxPages, pageJoiner: "\n", itemJoiner: " " });
    const text = normalizeText(parsed.text ?? "");
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  } finally {
    await parser.destroy();
  }
}

export async function extractTaskRowsForDemo(filename: string, documentId: string, storagePath: string): Promise<TaskAssignmentRow[]> {
  const pdfText = await extractPdfText(storagePath).catch((error) => {
    console.error("[extract] failed to parse PDF text, using empty text", error);
    return "";
  });

  const fallback = heuristicExtractRows(filename, documentId, pdfText);

  if (!isOpenAiConfigured()) {
    console.log("[openai-stub] OPENAI_API_KEY missing or placeholder, using local extraction fallback");
    return fallback;
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "Extract a flat row table for subcontractor task assignments. Prefer explicit values from the document. " +
            "Infer minimally. Unknown values must be empty strings (or 0 for numeric fields). Return strict JSON only."
        },
        {
          role: "user",
          content:
            `Filename: ${filename}\nDocumentId: ${documentId}\n` +
            `PDF Text:\n${pdfText.slice(0, 16000)}\n\n` +
            "Return rows with columns: recordId, projectName, gcName, scName, trade, taskId, taskName, locationPath, upstreamTaskId, downstreamTaskId, dependencyType, lagDays, plannedStart, plannedFinish, durationDays, scAvailableFrom, scAvailableTo, allocationPct, constraintType, constraintNote, constraintImpactDays, status, percentComplete, confidence, sourcePage, sourceSnippet."
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "task_assignment_rows",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              rows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    recordId: { type: "string" },
                    projectName: { type: "string" },
                    gcName: { type: "string" },
                    scName: { type: "string" },
                    trade: { type: "string" },
                    taskId: { type: "string" },
                    taskName: { type: "string" },
                    locationPath: { type: "string" },
                    upstreamTaskId: { type: "string" },
                    downstreamTaskId: { type: "string" },
                    dependencyType: { type: "string" },
                    lagDays: { type: "number" },
                    plannedStart: { type: "string" },
                    plannedFinish: { type: "string" },
                    durationDays: { type: "number" },
                    scAvailableFrom: { type: "string" },
                    scAvailableTo: { type: "string" },
                    allocationPct: { type: "number" },
                    constraintType: { type: "string" },
                    constraintNote: { type: "string" },
                    constraintImpactDays: { type: "number" },
                    status: { type: "string" },
                    percentComplete: { type: "number" },
                    confidence: { type: "number" },
                    sourcePage: { type: "number" },
                    sourceSnippet: { type: "string" }
                  },
                  required: [
                    "recordId", "projectName", "gcName", "scName", "trade", "taskId", "taskName", "locationPath",
                    "upstreamTaskId", "downstreamTaskId", "dependencyType", "lagDays", "plannedStart", "plannedFinish",
                    "durationDays", "scAvailableFrom", "scAvailableTo", "allocationPct", "constraintType", "constraintNote",
                    "constraintImpactDays", "status", "percentComplete", "confidence", "sourcePage", "sourceSnippet"
                  ]
                }
              }
            },
            required: ["rows"]
          }
        }
      }
    });

    const parsed = JSON.parse(response.output_text) as { rows?: Partial<TaskAssignmentRow>[] };
    if (!parsed.rows?.length) return fallback;

    return parsed.rows.map((row) => rowSchemaNormalize(row, filename, documentId));
  } catch (error) {
    console.error("[openai] extraction failed, using fallback", error);
    return fallback;
  }
}
