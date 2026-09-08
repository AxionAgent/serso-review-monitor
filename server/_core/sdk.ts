import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

class LocalSessionSDK {
  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}) {
    return this.signSession({ openId, appId: ENV.appId || "local-admin", name: options.name || "" }, options);
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    return new SignJWT({ openId: payload.openId, appId: payload.appId, name: payload.name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((issuedAt + expiresInMs) / 1000))
      .sign(this.getSessionSecret());
  }

  async verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
    if (!cookieValue) return null;
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), { algorithms: ["HS256"] });
      const { openId, appId, name } = payload as Record<string, unknown>;
      if (typeof openId !== "string" || !openId || typeof name !== "string") return null;
      return { openId, appId: typeof appId === "string" && appId ? appId : "local-admin", name };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    let sessionToken = cookies[COOKIE_NAME];
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) sessionToken = authHeader.slice(7);
    }
    const session = await this.verifySession(sessionToken);
    if (!session) throw ForbiddenError("Invalid local session");
    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("Local user not found");
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export const sdk = new LocalSessionSDK();
