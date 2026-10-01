import { recordAudit, type AuditClient } from "@/lib/auditLog";

const AT = "2026-10-02T09:00:00.000Z";

function fakeClient(
  result: Promise<{ errors?: unknown[] | null }> = Promise.resolve({}),
) {
  const create = jest.fn(() => result);
  return {
    client: { models: { AuditLog: { create } } } as AuditClient,
    create,
  };
}

const ENTRY = {
  eventType: "data_modification",
  resource: { type: "route", id: "r1" },
  action: "route.finalise",
  at: AT,
} as const;

describe("recordAudit", () => {
  it("writes a successful entry with its details as JSON", async () => {
    const { client, create } = fakeClient();

    const result = await recordAudit(client, {
      ...ENTRY,
      actor: "admin-1",
      customerId: "c1",
      details: { minutes: 30 },
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      customerId: "c1",
      operatorId: "admin-1",
      eventType: "data_modification",
      resourceType: "route",
      resourceId: "r1",
      action: "route.finalise",
      status: "success",
      timestamp: AT,
      details: '{"minutes":30}',
    });
  });

  it.each([null, undefined])(
    "leaves out a %s customerId rather than sending it",
    async (customerId) => {
      const { client, create } = fakeClient();

      await recordAudit(client, { ...ENTRY, customerId });

      expect(create.mock.calls[0][0]).not.toHaveProperty("customerId");
    },
  );

  it("records a failure with its reason", async () => {
    const { client, create } = fakeClient();

    await recordAudit(client, { ...ENTRY, failure: "Gate locked" });

    expect(create.mock.calls[0][0]).toMatchObject({
      status: "failure",
      reason: "Gate locked",
    });
  });

  it("stamps the time now when none is given, and accepts a Date", async () => {
    jest.useFakeTimers().setSystemTime(new Date(AT));
    const { client, create } = fakeClient();

    await recordAudit(client, { ...ENTRY, at: undefined });
    await recordAudit(client, {
      ...ENTRY,
      at: new Date("2026-10-01T00:00:00.000Z"),
    });

    expect(create.mock.calls[0][0]).toMatchObject({ timestamp: AT });
    expect(create.mock.calls[1][0]).toMatchObject({
      timestamp: "2026-10-01T00:00:00.000Z",
    });
    jest.useRealTimers();
  });

  it("hands back the errors of a rejected write", async () => {
    const { client } = fakeClient(
      Promise.resolve({ errors: [{ message: "Unauthorized" }] }),
    );

    await expect(recordAudit(client, ENTRY)).resolves.toEqual({
      ok: false,
      errors: [{ message: "Unauthorized" }],
    });
  });

  it("hands back a thrown error instead of throwing", async () => {
    const error = new Error("Network down");
    const { client } = fakeClient(Promise.reject(error));

    await expect(recordAudit(client, ENTRY)).resolves.toEqual({
      ok: false,
      errors: [error],
    });
  });
});
