import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
const L = String.fromCharCode(60);
const G = String.fromCharCode(62);
const S = String.fromCharCode(47);
function tag(name, body) {
  return L + name + G + String(body || "") + L + S + name + G;
}
function yen(value) {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function pct(value) {
  return new Intl.NumberFormat("ja-JP", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}
const data = JSON.parse(await readFile("public/data/performance.json", "utf8"));
const p = data.portfolio;
const rows = p.positions.map(function(item) {
  return tag("li", item.label + " " + item.symbol + " value " + yen(item.valueJpy) + " return " + pct(item.returnPct) + " signal " + item.signal);
}).join("");
const css = "body{margin:0;background:#07111f;color:#e5eefc;font-family:system-ui,sans-serif}main{max-width:980px;margin:auto;padding:48px 20px}section{background:#0f172a;border:1px solid #334155;border-radius:24px;padding:24px;margin:18px 0}h1{font-size:48px;line-height:1;margin:0 0 16px}h2{margin-top:0}.good{color:#22c55e}.bad{color:#fb7185}li{margin:10px 0}code{color:#67e8f9;word-break:break-all}";
const body = tag("main", tag("section", tag("h1", "Crypto Auto Trade Simulator") + tag("p", "BTC ETH SOL dry run portfolio dashboard") + tag("p", "Public URL: " + data.publicDashboardUrl)) + tag("section", tag("h2", "Portfolio") + tag("p", "Current value: " + yen(p.currentValueJpy)) + tag("p", "PL: " + yen(p.pnlJpy)) + tag("p", "Total return: " + pct(p.totalReturnPct)) + tag("p", "Risk score: " + p.riskScore + " / 100")) + tag("section", tag("h2", "Positions") + tag("ul", rows)) + tag("section", tag("h2", "Data") + tag("p", "Generated: " + data.generatedAt) + tag("p", "Mode: " + data.source.mode) + tag("code", "data/performance.json")));
const html = L + "!doctype html" + G + tag("html", tag("head", L + "meta charset=UTF-8" + G + L + "meta name=viewport content=width=device-width,initial-scale=1" + G + tag("title", "Crypto Auto Trade Simulator") + tag("style", css)) + tag("body", body));
await mkdir("dist/data", { recursive: true });
await writeFile("dist/index.html", html, "utf8");
await copyFile("public/data/performance.json", "dist/data/performance.json");
console.log("built minimal dashboard");
