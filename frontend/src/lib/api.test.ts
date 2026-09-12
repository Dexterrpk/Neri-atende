import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiPost } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API error handling", () => {
  it("preserves disconnected status and detail instead of treating send as success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "WhatsApp não está conectado." }), { status: 409 })));
    await expect(apiPost("/whatsapp/test-send")).rejects.toMatchObject({ status: 409, body: { detail: "WhatsApp não está conectado." } });
  });

  it("handles an unavailable proxy with a non-JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 })));
    await expect(apiGet("/whatsapp/status")).rejects.toBeInstanceOf(ApiError);
  });

  it("polls status using GET without creating a session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ connected: false, web_status: "conflict" })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await apiGet<{ web_status: string }>("/whatsapp/status");
    expect(result.web_status).toBe("conflict");
    expect(fetchMock).toHaveBeenCalledWith("/api/whatsapp/status", expect.objectContaining({ method: "GET", body: undefined }));
  });

  it("requests pairing with the number in the JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ connected: false, web_pairing_code: "1234ABCD" })));
    vi.stubGlobal("fetch", fetchMock);
    await apiPost("/whatsapp/web/pairing", { phone_number: "5511999990000" });
    expect(fetchMock).toHaveBeenCalledWith("/api/whatsapp/web/pairing", expect.objectContaining({ method: "POST", body: '{"phone_number":"5511999990000"}' }));
  });
});
