import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";
import worker, { type Job } from "../src/index";

// Runs one job through the queue consumer, as the queue would after the webhook or an Admin upload.
export async function runJob(job: Job, attempts = 1) {
  const batch = createMessageBatch("dancecalendar-jobs", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts, body: job }]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  return getQueueResult(batch, ctx);
}

// Runs one inbound WhatsApp webhook payload through the queue consumer.
export async function deliver(payload: any) {
  const result = await runJob(payload.entry[0].changes[0].value.messages[0]);
  expect(result.retryMessages).toEqual([]);
}

export function get(url: string, headers: HeadersInit = {}) {
  return exports.default.fetch(new Request(url.replace("https://dancecalendar.test", "http://dancecalendar.test"), { headers, redirect: "manual" }));
}

export function post(url: string, body: BodyInit, headers: HeadersInit = {}) {
  return exports.default.fetch(
    new Request(url.replace("https://dancecalendar.test", "http://dancecalendar.test"), { method: "POST", body, headers, redirect: "manual" }),
  );
}

export async function feed() {
  return (await get("http://dancecalendar.test/")).text();
}

// The form as a browser would submit it untouched: filled inputs, ticked boxes and selected options.
export function formFrom(html: string): URLSearchParams {
  const form = new URLSearchParams();
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const a = attributes(tag);
    if (!a.name || a.type === "file") continue;
    if (a.type === "checkbox" && a.checked === undefined) continue;
    form.append(a.name, a.value ?? (a.type === "checkbox" ? "on" : ""));
  }
  for (const [, open, body] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const options = [...body.matchAll(/<option\b[^>]*>/g)].map(([o]) => attributes(o));
    const chosen = options.find((o) => o.selected !== undefined) ?? options[0];
    if (attributes(open).name && chosen) form.append(attributes(open).name, chosen.value ?? "");
  }
  return form;
}

// The opening tag of the input or button named `name`, for checking its classes and state.
export function inputTag(html: string, name: string): string {
  const tag = [...html.matchAll(/<(?:input|button|fieldset)\b[^>]*>/g)].map(([t]) => t).find((t) => attributes(t).name === name);
  if (!tag) throw new Error(`No input named ${name}`);
  return tag;
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, key, , value] of tag.matchAll(/\s([\w.:-]+)(="([^"]*)")?/g)) out[key] = decode(value ?? "");
  return out;
}

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
