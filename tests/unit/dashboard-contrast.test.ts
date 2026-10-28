import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAGE_CSS } from "../../src/dashboard/render/style.ts";

function srgbChannel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = srgbChannel((n >> 16) & 255);
  const g = srgbChannel((n >> 8) & 255);
  const b = srgbChannel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 1.4.3 contrast ratio of two #rrggbb colours. */
function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function tokensFrom(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[m[1] ?? ""] = m[2] ?? "";
  }
  return tokens;
}

const light = tokensFrom(PAGE_CSS.slice(0, PAGE_CSS.indexOf("@media")));
const dark = tokensFrom(PAGE_CSS.slice(PAGE_CSS.indexOf("prefers-color-scheme")));

describe("dashboard contrast", () => {
  it("fg on bg, pass on card, and fail on card meet 4.5:1 in light and dark", () => {
    for (const [theme, tokens] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      assert.match(tokens.fg ?? "", /^#[0-9a-fA-F]{6}$/, `${theme} --fg`);
      assert.match(tokens.bg ?? "", /^#[0-9a-fA-F]{6}$/, `${theme} --bg`);
      assert.match(tokens.pass ?? "", /^#[0-9a-fA-F]{6}$/, `${theme} --pass`);
      assert.match(tokens.fail ?? "", /^#[0-9a-fA-F]{6}$/, `${theme} --fail`);
      assert.match(tokens.card ?? "", /^#[0-9a-fA-F]{6}$/, `${theme} --card`);
      const pairs: Array<[string, string, string]> = [
        ["--fg on --bg", tokens.fg!, tokens.bg!],
        ["--pass on --card", tokens.pass!, tokens.card!],
        ["--fail on --card", tokens.fail!, tokens.card!],
      ];
      for (const [label, fg, bg] of pairs) {
        const ratio = contrastRatio(fg, bg);
        assert.ok(
          ratio >= 4.5,
          `${theme} ${label} contrast ${ratio.toFixed(3)} is below 4.5:1 (${fg} on ${bg})`,
        );
      }
    }
  });
});
