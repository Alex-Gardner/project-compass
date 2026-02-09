import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export type ExtractedField = {
  name: string;
  value: string;
  confidence: number;
  sourcePage: number;
  sourceBBox: [number, number, number, number];
};

function isOpenAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key !== "openai_placeholder");
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function heuristicExtract(filename: string, pdfText: string): ExtractedField[] {
  const text = normalizeText(pdfText);
  const projectMatch = text.match(
    /(?:project\s*(?:name)?|job\s*(?:name|title)?|subject)\s*[:\-]\s*([A-Za-z0-9 ,.&()\/-]{3,120}?)(?=\s+(?:bid\s+due|bid\s+date|due\s+date|scope)\b|$)/i
  );
  const bidDateMatch = text.match(
    /(?:bid\s+due\s+date|bid\s+date|proposal\s+due|due\s+date)\s*[:\-]?\s*([A-Za-z0-9,\/ -]{4,40}?)(?=\s+scope\b|$)/i
  );
  const scopeSummary = text.slice(0, 180) || filename.replace(/\.pdf$/i, "");

  return [
    {
      name: "project_name",
      value: (projectMatch?.[1] ?? filename.replace(/\.pdf$/i, "")).trim(),
      confidence: projectMatch ? 0.76 : 0.58,
      sourcePage: 1,
      sourceBBox: [0.1, 0.1, 0.5, 0.2]
    },
    {
      name: "bid_due_date",
      value: (bidDateMatch?.[1] ?? "TBD").trim(),
      confidence: bidDateMatch ? 0.74 : 0.45,
      sourcePage: 1,
      sourceBBox: [0.1, 0.3, 0.35, 0.4]
    },
    {
      name: "scope_summary",
      value: scopeSummary,
      confidence: text ? 0.67 : 0.4,
      sourcePage: 1,
      sourceBBox: [0.05, 0.45, 0.9, 0.65]
    }
  ];
}

async function extractPdfText(storagePath: string): Promise<string> {
  const file = await readFile(storagePath);
  const parser = new PDFParse({ data: file });
  const parsed = await parser.getText();
  await parser.destroy();
  return normalizeText(parsed.text ?? "");
}

export async function extractFieldsForDemo(filename: string, storagePath: string): Promise<ExtractedField[]> {
  const pdfText = await extractPdfText(storagePath).catch((error) => {
    console.error("[extract] failed to parse PDF text, using empty text", error);
    return "";
  });
  const fallback = heuristicExtract(filename, pdfText);

  if (!isOpenAiConfigured()) {
    console.log("[openai-stub] OPENAI_API_KEY missing or placeholder, using local extraction fallback");
    return heuristicExtract(filename, pdfText);
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: "You extract structured construction bidding fields for a tech demo. Return strict JSON only."
        },
        {
          role: "user",
          content:
            `Filename: ${filename}\n` +
            `PDF Text:\n${pdfText.slice(0, 12000)}\n\n` +
            "Return JSON with fields: project_name, bid_due_date, scope_summary. Include confidence from 0 to 1."
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "extraction_fields",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              fields: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    value: { type: "string" },
                    confidence: { type: "number" }
                  },
                  required: ["name", "value", "confidence"]
                }
              }
            },
            required: ["fields"]
          }
        }
      }
    });

    const output = response.output_text;
    const parsed = JSON.parse(output) as { fields?: Array<{ name: string; value: string; confidence: number }> };
    if (!parsed.fields?.length) return fallback;

    return parsed.fields.map((field, index) => ({
      name: field.name,
      value: field.value,
      confidence: Math.min(1, Math.max(0, Number(field.confidence) || 0.5)),
      sourcePage: 1,
      sourceBBox:
        index === 0
          ? [0.1, 0.1, 0.5, 0.2]
          : index === 1
            ? [0.1, 0.3, 0.35, 0.4]
            : [0.05, 0.45, 0.9, 0.65]
    }));
  } catch (error) {
    console.error("[openai] extraction failed, using fallback", error);
    return heuristicExtract(filename, pdfText);
  }
}
