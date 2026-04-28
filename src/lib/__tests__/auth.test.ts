import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCookieGet = vi.hoisted(() => vi.fn());
const mockCookieSet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: mockCookieGet, set: mockCookieSet }),
}));

const mockSign = vi.hoisted(() => vi.fn().mockResolvedValue("header.payload.signature"));
const mockJwtVerify = vi.hoisted(() => vi.fn());
vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: mockSign,
  })),
  jwtVerify: mockJwtVerify,
}));

const { createSession, getSession } = await import("@/lib/auth");

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("sets a cookie named auth-token", async () => {
    await createSession("user-123", "test@example.com");

    expect(mockCookieSet.mock.calls[0][0]).toBe("auth-token");
  });

  test("stores the signed JWT as the cookie value", async () => {
    await createSession("user-123", "test@example.com");

    expect(mockCookieSet.mock.calls[0][1]).toBe("header.payload.signature");
  });

  test("cookie expires in approximately 7 days", async () => {
    const before = Date.now();
    await createSession("user-123", "test@example.com");
    const after = Date.now();

    const { expires } = mockCookieSet.mock.calls[0][2];
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(new Date(expires).getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(new Date(expires).getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  test("cookie is httpOnly with sameSite lax and path /", async () => {
    await createSession("user-123", "test@example.com");

    const options = mockCookieSet.mock.calls[0][2];
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("cookie is secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-123", "test@example.com");

    expect(mockCookieSet.mock.calls[0][2].secure).toBe(true);
    vi.unstubAllEnvs();
  });

  test("cookie is not secure outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await createSession("user-123", "test@example.com");

    expect(mockCookieSet.mock.calls[0][2].secure).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns null when no cookie is present", async () => {
    mockCookieGet.mockReturnValue(undefined);

    expect(await getSession()).toBeNull();
  });

  test("returns the session payload from a valid token", async () => {
    const payload = { userId: "user-123", email: "test@example.com", expiresAt: new Date() };
    mockCookieGet.mockReturnValue({ value: "valid.jwt.token" });
    mockJwtVerify.mockResolvedValue({ payload });

    expect(await getSession()).toEqual(payload);
  });

  test("returns null when the token is invalid", async () => {
    mockCookieGet.mockReturnValue({ value: "bad.jwt.token" });
    mockJwtVerify.mockRejectedValue(new Error("invalid signature"));

    expect(await getSession()).toBeNull();
  });

  test("returns null when the token is expired", async () => {
    mockCookieGet.mockReturnValue({ value: "expired.jwt.token" });
    mockJwtVerify.mockRejectedValue(new Error("JWT expired"));

    expect(await getSession()).toBeNull();
  });
});
