import request from "supertest";
import app, { generateRoomToken, verifyRoomToken } from "./index";
import jwt from "jsonwebtoken";

describe("Enterprise RTC Gateway Authentication Tests", () => {
  const secret = process.env.JWT_SECRET || "super_secret_enterprise_jwt_signing_key_2026";

  it("should generate a valid JWT token signed with JWT_SECRET", () => {
    const token = generateRoomToken("test-user", "lobby-room", "host");
    expect(token).toBeDefined();

    const decoded = verifyRoomToken(token);
    expect(decoded.username).toBe("test-user");
    expect(decoded.room).toBe("lobby-room");
    expect(decoded.role).toBe("host");
    expect(decoded.presenter).toBe(true);
  });

  it("should block API room creation without corporate Bearer authentication", async () => {
    const res = await request(app)
      .post("/api/v1/rooms/create")
      .send({ roomName: "boardroom", username: "ceo", role: "host" });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Missing or malformed Authorization header");
  });

  it("should authorize room creation when Bearer header is valid", async () => {
    const res = await request(app)
      .post("/api/v1/rooms/create")
      .set("Authorization", "Bearer mock-okta-token-123")
      .send({ roomName: "boardroom", username: "ceo", role: "host" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.room).toBe("boardroom");
    expect(res.body.role).toBe("host");
    expect(res.body.token).toBeDefined();
    expect(res.body.url).toContain("room=boardroom");
  });

  it("should validate signed JWT tokens properly via verification endpoint", async () => {
    const token = generateRoomToken("guest-user", "lobby", "participant");

    const res = await request(app)
      .post("/api/v1/rooms/validate-token")
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.payload.username).toBe("guest-user");
    expect(res.body.payload.role).toBe("participant");
  });

  it("should reject invalid or tampered tokens", async () => {
    const res = await request(app)
      .post("/api/v1/rooms/validate-token")
      .send({ token: "invalid.tampered.token" });

    expect(res.status).toBe(401);
    expect(res.body.valid).toBe(false);
  });
});
