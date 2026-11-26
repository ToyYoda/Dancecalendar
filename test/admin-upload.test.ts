import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/index";
import { fakeApis, flyer, knownVenue } from "./fake-apis";
import { feed, formFrom, get, post, runJob } from "./flow";

const ADMIN = { authorization: `Basic ${btoa("admin:test-admin-secret")}` };
const base = "http://dancecalendar.test/admin/upload";

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "submission", "venue", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (1, '4915200000001', 'Ana Alves')"),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, name) VALUES (2, '4915200000002', 'Ben Becker')"),
    knownVenue(env.DB),
  ]);
});

afterEach(() => vi.restoreAllMocks());

// Uploads a Flyer as the Admin and returns the queued job and the page it redirects to.
async function upload(organizerId: string) {
  const send = vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
  const body = new FormData();
  body.append("flyer", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "flyer.jpg", { type: "image/jpeg" }));
  body.append("organizer_id", organizerId);

  const res = await post(base, body, ADMIN);

  expect(res.status).toBe(303);
  expect(send).toHaveBeenCalledTimes(1);
  return { job: send.mock.calls[0][0] as Job, waiting: new URL(res.headers.get("location")!, base).href };
}

describe("/admin", () => {
  it("asks for the admin secret", async () => {
    expect((await get(base)).status).toBe(401);
    expect((await get(base, { authorization: `Basic ${btoa("admin:wrong")}` })).status).toBe(401);
    expect((await get(base, ADMIN)).status).toBe(200);
  });

  it("finds the upload page with a trailing slash too", async () => {
    expect((await get(`${base}/`, ADMIN)).status).toBe(200);
  });

  it("lists the Organizers to publish under", async () => {
    const html = await (await get(base, ADMIN)).text();

    expect(html).toContain("Ana Alves");
    expect(html).toContain("Ben Becker");
  });
});

describe("an Admin Flyer upload", () => {
  it("goes through the queue and extraction into the confirm page and publishes under the chosen Organizer, without a WhatsApp message", async () => {
    const api = fakeApis();

    const { job, waiting } = await upload("2");

    expect(await (await get(waiting, ADMIN)).text()).toContain("ausgelesen");
    expect((await runJob(job)).retryMessages).toEqual([]);
    const ready = await get(waiting, ADMIN);
    expect(ready.status).toBe(303);
    const confirm = new URL(ready.headers.get("location")!, base).href;
    const page = await (await get(confirm)).text();
    expect(page).toContain("Salsa Night");

    const res = await post(confirm, formFrom(page).toString(), { "content-type": "application/x-www-form-urlencoded" });

    expect(await res.text()).toMatch(/\/e\/[\w-]+/);
    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("Ben Becker");
    expect(api.anthropicCalls).toHaveLength(1);
    expect(api.sent).toEqual([]);
  });

  it("says so when the image is not an event Flyer", async () => {
    fakeApis({ extraction: { ...flyer([]), is_event_flyer: false } });
    const { job, waiting } = await upload("1");

    await runJob(job);

    const res = await get(waiting, ADMIN);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("keine Tanzveranstaltung");
  });

  it("retries a failed extraction, and shows the error once the last try fails", async () => {
    fakeApis({ anthropicError: "image exceeds 5 MB maximum" });
    const { job, waiting } = await upload("1");

    expect((await runJob(job, 1)).retryMessages).toHaveLength(1);
    expect(await (await get(waiting, ADMIN)).text()).toContain("ausgelesen");

    expect((await runJob(job, 3)).retryMessages).toEqual([]);
    const html = await (await get(waiting, ADMIN)).text();
    expect(html).toContain("fehlgeschlagen");
    expect(html).toContain("image exceeds 5 MB maximum");
  });
});

describe("the waiting page", () => {
  const refresh = (html: string) => html.match(/<meta http-equiv="refresh" content="([^"]*)"/)?.[1];

  it("counts its own tries, every 2 seconds at first, then every 5", async () => {
    const { waiting } = await upload("1");
    const path = new URL(waiting).pathname;

    expect(refresh(await (await get(waiting, ADMIN)).text())).toBe(`2; url=${path}?n=1`);
    expect(refresh(await (await get(`${waiting}?n=14`, ADMIN)).text())).toBe(`2; url=${path}?n=15`);
    expect(refresh(await (await get(`${waiting}?n=15`, ADMIN)).text())).toBe(`5; url=${path}?n=16`);
    expect(refresh(await (await get(`${waiting}?n=34`, ADMIN)).text())).toBe(`5; url=${path}?n=35`);
  });

  it("stops refreshing after about two minutes and offers to look again or upload again", async () => {
    const { waiting } = await upload("1");
    const path = new URL(waiting).pathname;

    const html = await (await get(`${waiting}?n=35`, ADMIN)).text();

    expect(refresh(html)).toBeUndefined();
    expect(html).toContain("Das dauert ungewöhnlich lange");
    expect(html).toContain(`href="${path}"`);
    expect(html).toContain("Nochmal nachsehen");
    expect(html).toContain('href="/admin/upload"');
    expect(html).toContain("Nochmal hochladen");
  });

  it("ignores a broken try count", async () => {
    const { waiting } = await upload("1");
    const path = new URL(waiting).pathname;

    expect(refresh(await (await get(`${waiting}?n=abc`, ADMIN)).text())).toBe(`2; url=${path}?n=1`);
  });
});
