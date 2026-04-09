import type { Response } from "express";

export type BoardroomMessage = {
  id: string;
  ts: number;
  agent: "CEO" | "Planner" | "Designer" | "Engineer" | "Critic";
  kind: "note" | "question" | "risk" | "decision";
  text: string;
};

export type GeneratedFile = {
  path: string;
  content: string;
};

export type RunState =
  | { status: "debating" }
  | { status: "awaiting_approval"; proposal: string }
  | { status: "generating" }
  | { status: "ready" }
  | { status: "failed"; error: string };

export type Run = {
  id: string;
  createdAt: number;
  prompt: string;
  productType:
    | "landing"
    | "website"
    | "internal_tool"
    | "simple_app"
    | "dashboard"
    | "mvp_tool"
    | "uploader"
    | "game";
  state: RunState;
  messages: BoardroomMessage[];
  files: GeneratedFile[];
  outDir: string;
  zipPath?: string;
  sseClients: Set<Response>;
};

export const runs = new Map<string, Run>();

export function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

