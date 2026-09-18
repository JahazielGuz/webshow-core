import { HttpError } from "../lib/httpError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import {
  ACCESS_TOKEN_SECONDS,
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "../lib/tokens.js";
import type { AuthResult, PublicUser, TokenPair } from "../types/auth.js";

const userSelect = { id: true, email: true, displayName: true, createdAt: true };

// One message for a wrong password and for an address with no account, so this endpoint cannot
// be used to find out who is registered
function invalidCredentials() {
  return new HttpError(401, "INVALID_CREDENTIALS", "That email and password do not match");
}

function invalidRefreshToken() {
  return new HttpError(401, "INVALID_REFRESH_TOKEN", "Please sign in again");
}

// Postgres raised the unique constraint on email: two people registered the same address at once
function isDuplicateEmail(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && error["code"] === "P2002"
  );
}

async function issueTokens(userId: string): Promise<TokenPair> {
  const accessToken = await signAccessToken(userId);
  const refresh = createRefreshToken();

  await prisma.session.create({
    data: { userId, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
  });

  return { accessToken, refreshToken: refresh.token, expiresIn: ACCESS_TOKEN_SECONDS };
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { email: email.trim().toLowerCase(), passwordHash, displayName },
      select: userSelect,
    });

    const tokens = await issueTokens(user.id);

    return { user, ...tokens };
  } catch (error) {
    if (isDuplicateEmail(error)) {
      throw new HttpError(409, "EMAIL_TAKEN", "That email already has an account");
    }

    throw error;
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  if (user === null) {
    // Hash anyway, so an address with no account does not answer measurably faster than one
    // with a wrong password
    await hashPassword(password);
    throw invalidCredentials();
  }

  const matches = await verifyPassword(user.passwordHash, password);

  if (!matches) {
    throw invalidCredentials();
  }

  const tokens = await issueTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
    ...tokens,
  };
}

// Spends the presented refresh token and issues a fresh pair
export async function refresh(token: string): Promise<TokenPair> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
  });

  if (session === null || session.expiresAt <= new Date()) {
    throw invalidRefreshToken();
  }

  if (session.revokedAt !== null) {
    // This token was already exchanged, so the copy being presented now was probably stolen.
    // End every session the user has and make them sign in again.
    await prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    throw invalidRefreshToken();
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

  const tokens = await issueTokens(session.userId);

  return tokens;
}

// Revoking a token that was already gone is not a failure, so signing out always succeeds
export async function logout(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function findUser(id: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: userSelect });
}
