const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { validatePartitions } = require("./validate-partitions.cjs");

const scope = ["app/a.rb", "app/b.rb", "lib/c.rb", "lib/sub/d.rb"];

test("accepts disjoint parts that cover the scope", () => {
  assert.deepEqual(validatePartitions({ scope, parts: { h1: ["app/**"], h2: ["lib/c.rb", "lib/sub/**"] } }), []);
});

test("rejects a file claimed by two parts", () => {
  const errors = validatePartitions({ scope, parts: { h1: ["app/**", "lib/c.rb"], h2: ["lib/**"] } });
  assert(errors.some((e) => e.startsWith("overlap:")));
});

test("rejects uncovered files", () => {
  const errors = validatePartitions({ scope, parts: { h1: ["app/**"] } });
  assert(errors.some((e) => e.startsWith("uncovered:")));
});

test("rejects entries that match nothing and paths outside scope", () => {
  assert(validatePartitions({ scope, parts: { h1: ["app/**", "lib/**", "other/x.rb"] } }).some((e) => e.includes("matches no scope path")));
});

test("rejects unsafe paths and bad agent IDs", () => {
  assert(validatePartitions({ scope: ["../x"], parts: { h1: ["../x"] } }).length > 0);
  assert(validatePartitions({ scope, parts: { "H 1": ["app/**", "lib/**"] } }).some((e) => e.includes("invalid agent ID")));
  assert(validatePartitions({ scope, parts: { con: ["app/**", "lib/**"] } }).some((e) => e.includes("invalid agent ID")));
});

test("rejects malformed documents", () => {
  assert(validatePartitions(null).length > 0);
  assert(validatePartitions({ scope: [], parts: {} }).length > 0);
});

test("CLI exit codes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "partitions-"));
  const file = path.join(dir, "partitions.json");
  const cli = path.join(__dirname, "validate-partitions.cjs");
  fs.writeFileSync(file, JSON.stringify({ scope, parts: { h1: ["app/**"], h2: ["lib/**"] } }));
  assert.equal(spawnSync(process.execPath, [cli, file]).status, 0);
  fs.writeFileSync(file, JSON.stringify({ scope, parts: { h1: ["app/**", "lib/c.rb"], h2: ["lib/**"] } }));
  assert.equal(spawnSync(process.execPath, [cli, file]).status, 1);
  assert.equal(spawnSync(process.execPath, [cli]).status, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
