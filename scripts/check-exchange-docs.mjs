import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

const guide = read("wallets/walletd-exchange-guide.md");
const deposits = read("wallets/walletd-deposit-addresses.md");
const profile = read("wallets/exchange-listing-profile.md");
const quickstart = read("wallets/exchange-quickstart.md");
const depositGuide = read("wallets/exchange-deposits.md");
const withdrawals = read("wallets/exchange-withdrawals.md");
const operations = read("wallets/exchange-operations.md");
const qualification = read("wallets/exchange-qualification.md");
const sidebar = read("_sidebar.md");
const css = read("assets/docs.css");

assert.doesNotMatch(
  `${guide}\n${quickstart}\n${depositGuide}`,
  /^transaction\.amount\s*>\s*0\b/m,
  "whole-wallet transaction.amount must not gate deposit crediting",
);
assert.match(guide, /Choose your task/);
assert.match(depositGuide, /transfer\.amount > 0/);
assert.match(withdrawals, /submission_unknown/);
assert.match(withdrawals, /no caller-supplied durable idempotency key/);
assert.match(withdrawals, /Failure and retry matrix/);
assert.match(withdrawals, /CHANGE_ADDRESS_REQUIRED/);
assert.match(withdrawals, /AMOUNT_TOO_LARGE_FOR_ONE_TRANSACTION/);
assert.match(deposits, /Aggregated multikey/);
assert.match(deposits, /Single key index/);
assert.match(deposits, /not required for visibility/);
assert.match(operations, /restore-address-count = depositCount \+ 1/);
assert.match(operations, /outContext-v2/);
assert.match(profile, /1 XDS = 100 atoms/);
assert.match(profile, /9330[\s\S]*9331[\s\S]*9335/);
assert.match(profile, /First issued deposit[\s\S]*`T=1`/);
assert.doesNotMatch(profile, /Testnet acceptance sequence/);
assert.match(qualification, /drop[\s\S]*HTTP response/);

for (const route of [
  "walletd-exchange-guide",
  "exchange-listing-profile",
  "exchange-quickstart",
  "exchange-deposits",
  "exchange-withdrawals",
  "exchange-operations",
  "exchange-qualification",
]) {
  assert.match(sidebar, new RegExp(`\\/wallets\\/${route}\\.md`));
}

const wordCount = (text) => text.trim().split(/\s+/).length;
assert.ok(wordCount(guide) <= 1200, "exchange landing page must stay scannable");
assert.ok(wordCount(profile) <= 700, "listing profile must stay concise");
assert.doesNotMatch(
  css,
  /\.content\s*\{[^}]*position:\s*relative/si,
  "Docsify content must not overflow the viewport by overriding its positioning",
);
assert.match(css, /\.docs-grid--compact/);
assert.match(
  css,
  /\.markdown-section table\s*\{[^}]*border:\s*1px solid var\(--dc-line\)[^}]*border-radius:\s*9px/si,
  "all documentation tables must use one continuous rounded outer frame",
);
assert.match(
  css,
  /\.markdown-section tr > :last-child\s*\{[^}]*border-right:\s*0/si,
  "table edge cells must not double the outer frame",
);
assert.match(
  css,
  /\.markdown-section tbody tr:last-child > \*\s*\{[^}]*border-bottom:\s*0/si,
  "table bottom cells must not double the outer frame",
);

const firstDepositText = [
  guide,
  deposits,
  profile,
  quickstart,
  depositGuide,
  operations,
  qualification,
].join("\n");
assert.doesNotMatch(
  firstDepositText,
  /first (?:issued |customer )?deposit(?: address)?\s+(?:is|has|=)\s*`?T=0`?/i,
  "single-key-index first deposit must not regress to T=0",
);

for (const relative of [
  "wallets/walletd-exchange-guide.md",
  "wallets/walletd-deposit-addresses.md",
  "wallets/exchange-listing-profile.md",
  "wallets/exchange-quickstart.md",
  "wallets/exchange-deposits.md",
  "wallets/exchange-withdrawals.md",
  "wallets/exchange-operations.md",
  "wallets/exchange-qualification.md",
  "README.md",
]) {
  const contents = read(relative);
  const links = contents.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g);
  for (const match of links) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target)) continue;
    const resolved = target.startsWith("/")
      ? path.join(root, target.slice(1))
      : path.resolve(root, path.dirname(relative), target);
    assert.ok(existsSync(resolved), `${relative}: missing Markdown target ${target}`);
  }
}

console.log("exchange documentation checks passed");
