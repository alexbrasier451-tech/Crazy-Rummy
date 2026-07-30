import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ASSET_REGISTER_COLUMNS = Object.freeze([
  "asset_id",
  "display_name",
  "kind",
  "usage",
  "source_path",
  "derived_paths",
  "origin_type",
  "source_url",
  "creator",
  "licence",
  "licence_url",
  "downloaded_or_created_utc",
  "upstream_version_or_commit",
  "modifications",
  "ai_tool_and_model",
  "ai_prompt_or_brief_hash",
  "third_party_inputs",
  "rights_reviewed_by",
  "rights_reviewed_utc",
  "approval_pr_or_issue",
  "content_hash_sha256",
  "status",
  "notes"
]);

const ALLOWED_STATUSES = new Set(["approved", "quarantined", "superseded"]);
const APPROVED_REQUIRED = Object.freeze([
  "asset_id",
  "display_name",
  "kind",
  "usage",
  "source_path",
  "origin_type",
  "creator",
  "licence",
  "downloaded_or_created_utc",
  "rights_reviewed_by",
  "rights_reviewed_utc",
  "approval_pr_or_issue",
  "content_hash_sha256"
]);

function parseCsvRow(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  if (quoted) throw new Error("Asset register contains an unterminated quoted field.");
  return values;
}

export function parseAssetRegister(source) {
  const lines = String(source).replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("Asset register must contain a header and at least one row.");
  const columns = parseCsvRow(lines[0]);
  if (columns.join(",") !== ASSET_REGISTER_COLUMNS.join(",")) {
    throw new Error("Asset register columns do not match the required v1.1 schema.");
  }
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvRow(line);
    if (values.length !== columns.length) {
      throw new Error(`Asset register row ${rowIndex + 2} has ${values.length} fields; expected ${columns.length}.`);
    }
    return Object.freeze(Object.fromEntries(
      columns.map((column, index) => [column, values[index]])
    ));
  });
}

function repositoryPath(rootDirectory, relativePath) {
  const normalized = String(relativePath).replaceAll("/", path.sep);
  const resolved = path.resolve(rootDirectory, normalized);
  const relative = path.relative(rootDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Asset path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

export async function validateAssetRegister({
  rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  registerPath = "docs/v1.1/ASSET_REGISTER.csv"
} = {}) {
  const registerFile = repositoryPath(rootDirectory, registerPath);
  const rows = parseAssetRegister(await readFile(registerFile, "utf8"));
  const assetIds = new Set();

  for (const row of rows) {
    if (!ALLOWED_STATUSES.has(row.status)) {
      throw new Error(`${row.asset_id || "Unknown asset"} has unsupported status ${row.status}.`);
    }
    if (assetIds.has(row.asset_id)) throw new Error(`Duplicate asset ID: ${row.asset_id}`);
    assetIds.add(row.asset_id);

    if (row.status === "approved") {
      const missing = APPROVED_REQUIRED.filter((field) => !row[field]);
      if (missing.length) throw new Error(`${row.asset_id} is missing ${missing.join(", ")}.`);
    }

    const sourceFile = repositoryPath(rootDirectory, row.source_path);
    const bytes = await readFile(sourceFile);
    const observed = createHash("sha256").update(bytes).digest("hex");
    const expected = row.content_hash_sha256.replace(/^sha256:/, "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error(`${row.asset_id} does not contain a lowercase SHA-256 hash.`);
    }
    if (observed !== expected) {
      throw new Error(`${row.asset_id} hash mismatch: expected ${expected}; observed ${observed}.`);
    }
  }

  return Object.freeze({
    registerPath,
    rows: rows.length,
    approved: rows.filter(({ status }) => status === "approved").length,
    quarantined: rows.filter(({ status }) => status === "quarantined").length
  });
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  validateAssetRegister()
    .then((result) => {
      console.log(`v1.1 asset register valid: ${result.approved} approved, ${result.quarantined} quarantined.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
