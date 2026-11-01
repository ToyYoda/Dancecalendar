import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signedPost, textMessage } from "./whatsapp-fixtures";

const base = "http://dancecalendar.test/webhook";

describe("webhook verification handshake", () => {
  it("echoes the challenge when the verify token matches", async () => {
    const res = await exports.default.fetch(`${base}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=4242`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("4242");
  });

  it("refuses a wrong verify token", async () => {
    const res = await exports.default.fetch(`${base}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=4242`);

    expect(res.status).toBe(403);
  });
});

describe("webhook delivery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects a delivery whose signature does not match the app secret", async () => {
    const send = vi.spyOn(env.JOBS, "send");

    const res = await exports.default.fetch(await signedPost(textMessage("Hallo"), "wrong-secret"));

    expect(res.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("acknowledges a signed message and queues it once, even when Meta delivers it twice", async () => {
    const send = vi.spyOn(env.JOBS, "send").mockResolvedValue(undefined as never);
    const payload = textMessage("Hallo");

    const first = await exports.default.fetch(await signedPost(payload));
    const again = await exports.default.fetch(await signedPost(payload));

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ from: "4915200000001", type: "text" });
  });
});
