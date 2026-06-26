"use server"

import { cookies } from "next/headers"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!

export type SourceStatus = "queued" | "crawling" | "processing" | "done" | "error";

export type Source = {
  id: string;
  tenant_id: string;
  type: "url" | "file";
  url: string | null;
  filename: string | null;
  status: SourceStatus;
  chunk_count: number | null;
  error_message: string | null;
  ingested_at: string;
};

export type IngestUrlResponse = {
  source_id: string;
  status: "queued";
  message: string;
};

export type IngestFileResponse = {
  source_id: string;
  chunks_ingested: number;
};

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const jar = await cookies()
  const apiKey = jar.get("rag_api_key")?.value ?? ""

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
  })
}

export async function getSources(): Promise<Source[]> {
  const res = await apiFetch("/sources")
  if (!res.ok) throw new Error(`getSources failed: ${res.status}`)
  return res.json()
}

export async function getSource(id: string): Promise<Source> {
  const res = await apiFetch(`/sources/${id}`)
  if (res.status === 404) throw new Error("Source not found")
  if (!res.ok) throw new Error(`getSource failed: ${res.status}`)
  return res.json()
}

export async function deleteSource(id: string): Promise<{ deleted: string }> {
  const res = await apiFetch(`/sources/${id}`, { method: "DELETE" })
  if (res.status === 404) throw new Error("Source not found")
  if (!res.ok) throw new Error(`deleteSource failed: ${res.status}`)
  return res.json()
}

export async function ingestUrl(
  url: string,
  maxPages = 50,
): Promise<IngestUrlResponse> {
  const res = await apiFetch("/ingest/url", {
    method: "POST",
    body: JSON.stringify({ url, max_pages: maxPages }),
  })
  if (!res.ok) throw new Error(`ingestUrl failed: ${res.status}`)
  return res.json()
}

export async function ingestFile(file: FormData): Promise<IngestFileResponse> {
  const jar = await cookies()
  const apiKey = jar.get("rag_api_key")?.value ?? ""

  const res = await fetch(`${BACKEND_URL}/ingest/file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: file,
  })
  if (!res.ok) throw new Error(`ingestFile failed: ${res.status}`)
  return res.json()
}
