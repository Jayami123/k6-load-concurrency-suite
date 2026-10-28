// The one stylesheet of the evidence site, inlined in the page: no CDN, no remote font, no script. Colours are tokens on :root;
// the dark theme follows the reader's system setting. Status pills carry their text, so no state is colour alone.
export const PAGE_CSS = `
:root {
  --bg: #fbfbfa; --fg: #1b1f24; --muted: #4f5862; --line: #d8dce1; --card: #ffffff; --accent: #0b5cad;
  --pass: #1a6b33; --fail: #a4262c; --known: #7a4b00; --pending: #3b4a5a; --invalid: #6b2d8a; --focus: #0b5cad;
  --bar: #0b5cad; --bar-fill: #cfe2f7; --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --fg: #e6edf3; --muted: #a7b1bc; --line: #30363d; --card: #161b22; --accent: #6cb6ff;
    --pass: #56d364; --fail: #ff7b72; --known: #e3b341; --pending: #adbac7; --invalid: #d2a8ff; --focus: #6cb6ff;
    --bar: #6cb6ff; --bar-fill: #1f3a5c;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 var(--sans); }
main, header { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
header { padding-top: 32px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
h1 { font-size: 1.75rem; margin: 0 0 8px; }
h2 { font-size: 1.125rem; margin: 0; }
h3 { font-size: 1rem; margin: 24px 0 8px; }
p { margin: 8px 0; }
a { color: var(--accent); text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 2px; }
code, .mono { font-family: var(--mono); font-size: 0.875em; }
.muted { color: var(--muted); }
.meta { color: var(--muted); font-size: 0.875rem; margin: 8px 0 0; }
nav ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 0; margin: 16px 0 0; font-size: 0.9375rem; }
section.block { padding: 24px 0 8px; }
.strip { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.fact { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 16px; }
.fact-value { display: block; font-family: var(--mono); font-size: 1.125rem; }
.fact-label { display: block; color: var(--muted); font-size: 0.875rem; }
.fact-src { display: block; color: var(--muted); font-size: 0.75rem; margin-top: 8px; }
.cards { display: grid; gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 16px; }
.card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.pill { display: inline-block; font: 600 0.75rem/1 var(--mono); letter-spacing: 0.02em; padding: 4px 8px; border: 1px solid currentColor; border-radius: 999px; background: var(--card); white-space: nowrap; }
.pill-pass { color: var(--pass); }
.pill-fail { color: var(--fail); }
.pill-known-fail { color: var(--known); }
.pill-pending { color: var(--pending); }
.pill-invalid { color: var(--invalid); }
.reason { color: var(--muted); }
figure { margin: 16px 0 0; }
figure svg { display: block; width: 100%; height: auto; }
figcaption { color: var(--muted); font-size: 0.875rem; margin-top: 8px; }
details { margin-top: 12px; }
summary { cursor: pointer; color: var(--accent); }
summary:hover { text-decoration: underline; }
.table-wrap { overflow-x: auto; margin-top: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
caption { text-align: left; color: var(--muted); padding: 8px 0; }
th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid var(--line); }
th { font-weight: 600; }
td code { overflow-wrap: anywhere; }
tbody tr:hover { background: var(--bar-fill); }
footer { max-width: 1100px; margin: 32px auto 0; padding: 16px 16px 32px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.875rem; }
@media (max-width: 480px) { h1 { font-size: 1.5rem; } th, td { padding: 6px; } }
`;
