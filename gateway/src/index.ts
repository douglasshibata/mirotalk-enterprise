import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Environment variables
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_enterprise_jwt_signing_key_2026";
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || "1h";
const API_KEY_SECRET = process.env.API_KEY_SECRET || "mirotalksfu_secure_enterprise_secret_key_99";
const MIROTALK_URL = process.env.MIROTALK_URL || "https://rtc.company.com";
const MIROTALK_API_URL = process.env.MIROTALK_API_URL || "http://localhost:3010";

// --- JWT Helper Functions ---

export interface JWTPayload {
  username: string;
  room: string;
  role: "host" | "participant";
  presenter: boolean;
  exp?: number;
}

/**
 * Generates a signed JWT token allowing a user with specific capabilities to access a secure MiroTalk room.
 */
export function generateRoomToken(username: string, room: string, role: "host" | "participant"): string {
  const isHost = role === "host";

  const payload: JWTPayload = {
    username,
    room,
    role,
    presenter: isHost, // Host can present / share screen by default
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION as any });
}

/**
 * Validates a room access JWT token.
 */
export function verifyRoomToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

// --- Middleware: Basic Enterprise Client Authentication Simulation ---

function authenticateClient(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header. Expected 'Bearer <token>'" });
  }

  const clientToken = authHeader.split(" ")[1];
  try {
    // In a real production setup, you would verify against your Central Identity Provider (OIDC/OAuth2/Okta).
    // For this gateway, we accept any client authentication token containing a valid username for demo purposes.
    if (!clientToken || clientToken === "undefined") {
      throw new Error("Invalid client token");
    }
    next();
  } catch (error) {
    return res.status(403).json({ error: "Forbidden: Invalid corporate credentials" });
  }
}

// --- REST API Endpoints ---

/**
 * @route   POST /api/v1/rooms/create
 * @desc    Creates a secure MiroTalk room and yields authenticated Entry URLs for Host and Participants.
 * @access  Protected (Requires Corporate Bearer Auth Token)
 */
app.post("/api/v1/rooms/create", authenticateClient, async (req: Request, res: Response) => {
  const { roomName, username, role } = req.body;

  if (!roomName || !username) {
    return res.status(400).json({ error: "Missing parameters. 'roomName' and 'username' are required." });
  }

  const userRole = role === "host" ? "host" : "participant";

  try {
    // 1. Generate the JWT token with room scopes and roles
    const roomToken = generateRoomToken(username, roomName, userRole);

    // 2. Call MiroTalk SFU Join API to register/verify the meeting credentials
    // Note: MiroTalk expects 'authorization: API_KEY_SECRET' in headers and the room join options.
    const joinData = {
      room: roomName,
      roomPassword: "false", // No raw password, we protect via host authorization token
      name: username,
      avatar: "false",
      audio: "false",
      video: "false",
      screen: "false",
      chat: "true",
      hide: "false",
      notify: "true",
      duration: "unlimited",
      token: {
        username: username,
        password: "jwt-bypassed", // overridden by the secure peer_token WebRTC engine
        presenter: userRole === "host" ? "true" : "false",
        expire: JWT_EXPIRATION,
      },
    };

    let mirotalkJoinUrl = `${MIROTALK_URL}/join/?room=${roomName}&token=${roomToken}`;

    try {
      const response = await axios.post(`${MIROTALK_API_URL}/api/v1/join`, joinData, {
        headers: {
          "authorization": API_KEY_SECRET,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });

      if (response.data && response.data.join) {
        // Use MiroTalk's precise returned join entry point, appending our secure token
        mirotalkJoinUrl = `${response.data.join}&token=${roomToken}`;
      }
    } catch (apiError: any) {
      // Fallback: If MiroTalk is offline, we fallback to the structurally correct direct URL
      console.warn("MiroTalk SFU API unreachable, falling back to static URL structure.", apiError.message);
    }

    // 3. Return the URLs and token package
    return res.status(200).json({
      success: true,
      room: roomName,
      role: userRole,
      token: roomToken,
      url: mirotalkJoinUrl,
    });

  } catch (error: any) {
    console.error("Error creating room:", error);
    return res.status(500).json({ error: "Internal Server Error during secure room provisioning." });
  }
});

/**
 * @route   POST /api/v1/rooms/validate-token
 * @desc    Validate a room access JWT token. (Typically called by MiroTalk or verification webhooks)
 * @access  Public
 */
app.post("/api/v1/rooms/validate-token", (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing 'token' in request body" });
  }

  try {
    const decoded = verifyRoomToken(token);
    return res.status(200).json({
      valid: true,
      payload: decoded,
    });
  } catch (error: any) {
    return res.status(401).json({
      valid: false,
      error: error.message || "Invalid or expired token.",
    });
  }
});

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start express server
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[Enterprise RTC Auth Gateway] listening on port ${PORT}`);
  });
}

export default app;
