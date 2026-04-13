#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

const API_URL = process.env.SNAPLINK_API_URL ?? "https://api.snaplink.io";
const TOKEN = process.env.SNAPLINK_TOKEN ?? null;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Client-Version": "mcp-1.0.0",
    "X-Platform": process.platform,
  };
  if (TOKEN) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }
  return headers;
}

const server = new McpServer({
  name: "snaplink",
  version: "1.0.0",
});

// Tool: upload_screenshot
server.tool(
  "upload_screenshot",
  "Upload a screenshot file to SnapLink and get a shareable URL",
  {
    filepath: z.string().describe("Absolute path to the screenshot file"),
    burn_after_read: z.boolean().optional().describe("Delete after first view"),
    ocr: z.boolean().optional().default(true).describe("Run OCR on the image"),
  },
  async ({ filepath, burn_after_read, ocr }) => {
    if (!fs.existsSync(filepath)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: File not found: ${filepath}`,
          },
        ],
      };
    }

    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(filepath));
      form.append("burn_after_read", String(burn_after_read ?? false));
      form.append("ocr", String(ocr ?? true));

      const response = await axios.post(`${API_URL}/api/v1/upload`, form, {
        headers: { ...getHeaders(), ...form.getHeaders() },
        timeout: 30000,
      });

      const data = response.data;
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Screenshot uploaded successfully!`,
              `URL: ${data.url}`,
              `Raw: ${data.rawUrl}`,
              `Markdown: ${data.markdown}`,
              `Size: ${data.size} bytes`,
              data.width ? `Dimensions: ${data.width}x${data.height}` : "",
              `OCR Status: ${data.ocrStatus}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
      return {
        content: [{ type: "text" as const, text: `Upload error: ${message}` }],
      };
    }
  }
);

// Tool: get_recent
server.tool(
  "get_recent",
  "Get the most recent screenshot uploads",
  {
    count: z
      .number()
      .optional()
      .default(5)
      .describe("Number of recent uploads to retrieve (max 20)"),
  },
  async ({ count }) => {
    try {
      const limit = Math.min(count ?? 5, 20);
      const response = await axios.get(
        `${API_URL}/api/v1/uploads?limit=${limit}`,
        { headers: getHeaders(), timeout: 10000 }
      );

      const { items } = response.data;
      if (!items || items.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No recent uploads found." },
          ],
        };
      }

      const text = items
        .map(
          (item: {
            url: string;
            createdAt: string;
            ocrText: string | null;
            width: number | null;
            height: number | null;
          }) => {
            const lines = [
              `- ${item.url} (${item.createdAt})`,
              item.width ? `  ${item.width}x${item.height}` : "",
              item.ocrText
                ? `  OCR: ${item.ocrText.slice(0, 100)}${item.ocrText.length > 100 ? "..." : ""}`
                : "",
            ];
            return lines.filter(Boolean).join("\n");
          }
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Recent uploads:\n\n${text}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  }
);

// Tool: search_uploads
server.tool(
  "search_uploads",
  "Search uploads by OCR text content",
  {
    query: z
      .string()
      .describe("Text to search for in OCR-extracted content"),
  },
  async ({ query }) => {
    try {
      // Fetch recent uploads and filter client-side (full-text search is a v2 feature)
      const response = await axios.get(
        `${API_URL}/api/v1/uploads?limit=50`,
        { headers: getHeaders(), timeout: 10000 }
      );

      const { items } = response.data;
      const queryLower = query.toLowerCase();
      const matches = items.filter(
        (item: { ocrText: string | null; originalName: string | null }) =>
          item.ocrText?.toLowerCase().includes(queryLower) ||
          item.originalName?.toLowerCase().includes(queryLower)
      );

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No uploads found matching "${query}"`,
            },
          ],
        };
      }

      const text = matches
        .map(
          (item: { url: string; ocrText: string | null }) =>
            `- ${item.url}\n  OCR: ${item.ocrText?.slice(0, 200) ?? "(no text)"}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${matches.length} matches for "${query}":\n\n${text}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  }
);

// Tool: get_screenshot_text
server.tool(
  "get_screenshot_text",
  "Get the OCR-extracted text from a screenshot URL (much smaller than fetching the image)",
  {
    url: z.string().describe("SnapLink URL (e.g. https://snp.ink/abc123)"),
  },
  async ({ url }) => {
    try {
      // Extract shortId from URL
      const shortId = url.split("/").pop();
      if (!shortId) {
        return {
          content: [
            { type: "text" as const, text: "Invalid URL format" },
          ],
        };
      }

      const response = await axios.get(
        `${API_URL}/api/v1/upload/${shortId}`,
        { headers: getHeaders(), timeout: 10000 }
      );

      const data = response.data;
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Screenshot: ${data.url}`,
              `Uploaded: ${data.createdAt}`,
              data.width ? `Dimensions: ${data.width}x${data.height}` : "",
              `Views: ${data.viewCount}`,
              "",
              "--- OCR Text ---",
              data.ocrText ?? "(no text extracted)",
            ]
              .filter((line) => line !== undefined)
              .join("\n"),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed";
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SnapLink MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
