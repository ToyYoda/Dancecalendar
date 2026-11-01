import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/index";
import { fakeApis, flyer } from "./fake-apis";
import { feed, formFrom, get, post, runJob } from "./flow";

const ADMIN = { authorization: `Basic ${btoa("admin:test-admin-secret")}` };
const base = "http://dancecalendar.test/admin/upload";

beforeEach(async () => {
  await env.DB.batch([
    ...["event", "submission", "venue", "organizer"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name) VALUES (1, '4915200000001', 'Salsa Kassel')"),
    env.DB.prepare("INSERT INTO organizer (id, whatsapp_number, display_name) VALUES (2, '4915200000002', 'Bachata Göttingen')"),
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

  it("lists the Organizers to publish under", async () => {
    const html = await (await get(base, ADMIN)).text();

    expect(html).toContain("Salsa Kassel");
    expect(html).toContain("Bachata Göttingen");
  });
});

describe("an Admin Flyer upload", () => {
  it("goes through the queue and extraction into the confirm page and publishes under the chosen Organizer, without a WhatsApp message", async () => {
    const api = fakeApis();

    const { job, waiting } = await upload("2");

    expect(await (await get(waiting, ADMIN)).text()).toContain("ausgelesen");
    await runJob(job);
    const ready = await get(waiting, ADMIN);
    expect(ready.status).toBe(303);
    const confirm = new URL(ready.headers.get("location")!, base).href;
    const page = await (await get(confirm)).text();
    expect(page).toContain("Salsa Night");

    const res = await post(confirm, formFrom(page).toString(), { "content-type": "application/x-www-form-urlencoded" });

    expect(await res.text()).toMatch(/\/e\/[\w-]+/);
    const html = await feed();
    expect(html).toContain("Salsa Night");
    expect(html).toContain("Bachata Göttingen");
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
});
