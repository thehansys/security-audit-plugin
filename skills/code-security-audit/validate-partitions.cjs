#!/usr/bin/env node

/**
 * Validates partitions.json: the split of the in-scope files between hunters.
 * Every in-scope file must belong to exactly one part, so no two hunters scan the same file.
 * Usage: node validate-partitions.cjs <path-to-partitions.json>
 *
 * Shape: { "scope": ["src/a.rb", ...], "parts": { "h1": ["src/a.rb", "lib/**"], ... } }
 * A part entry is an exact scope path or a directory prefix written as "dir/**".
 */

const fs = require("node:fs");

const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const MAX_BYTES = 20 * 1024 * 1024;

function safePath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") &&
    !value.split("/").some((part) => part === "" || part === "." || part === "..") &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validatePartitions(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["input must be an object with scope and parts"];
  const { scope, parts } = doc;
  if (!Array.isArray(scope) || scope.length === 0) errors.push("scope: expected a nonempty array of paths");
  if (!parts || typeof parts !== "object" || Array.isArray(parts) || Object.keys(parts).length === 0) {
    errors.push("parts: expected a nonempty object keyed by agent ID");
  }
  if (errors.length) return errors;

  const scopeSet = new Set();
  scope.forEach((p, i) => {
    if (!safePath(p)) errors.push(`scope[${i}]: unsafe or empty path`);
    else if (scopeSet.has(p)) errors.push(`scope[${i}]: duplicate path ${JSON.stringify(p)}`);
    else scopeSet.add(p);
  });

  const owner = new Map();
  for (const [id, entries] of Object.entries(parts)) {
    if (!AGENT_ID.test(id) || RESERVED.test(id)) errors.push(`parts.${id}: invalid agent ID`);
    if (!Array.isArray(entries) || entries.length === 0) {
      errors.push(`parts.${id}: expected a nonempty array of paths`);
      continue;
    }
    entries.forEach((entry, i) => {
      const isPrefix = typeof entry === "string" && entry.endsWith("/**");
      const base = isPrefix ? entry.slice(0, -3) : entry;
      if (!safePath(base)) {
        errors.push(`parts.${id}[${i}]: unsafe or empty path`);
        return;
      }
      const matched = [...scopeSet].filter((p) => (isPrefix ? p.startsWith(`${base}/`) : p === base));
      if (matched.length === 0) errors.push(`parts.${id}[${i}]: ${JSON.stringify(entry)} matches no scope path`);
      for (const p of matched) {
        if (owner.has(p) && owner.get(p) !== id) {
          errors.push(`overlap: ${JSON.stringify(p)} is in both ${owner.get(p)} and ${id}`);
        } else {
          owner.set(p, id);
        }
      }
    });
  }
  for (const p of scopeSet) {
    if (!owner.has(p)) errors.push(`uncovered: ${JSON.stringify(p)} is in no part`);
  }
  return errors;
}

function run(file) {
  if (!file) {
    console.error("Usage: node validate-partitions.cjs <partitions.json>");
    return 2;
  }
  let text;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("not a regular file or larger than 20 MiB");
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    console.error(`Cannot read input: ${error.message}`);
    return 2;
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    console.error("Invalid JSON");
    return 2;
  }
  const errors = validatePartitions(doc);
  if (errors.length) {
    for (const message of errors.slice(0, 100)) console.error(message);
    if (errors.length > 100) console.error(`... ${errors.length - 100} more`);
    return 1;
  }
  console.log(`OK: ${doc.scope.length} files in ${Object.keys(doc.parts).length} disjoint parts`);
  return 0;
}

module.exports = { validatePartitions };
if (require.main === module) process.exit(run(process.argv[2]));
