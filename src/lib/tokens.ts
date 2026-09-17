import { createHash, randomBytes } from "node:crypto";
import { SignJWT, importJWK, jwtVerify, type JWK } from "jose";

const ALGORITHM = "EdDSA";
const ISSUER = "webshow-core";
const AUDIENCE = "webshow";

// Short, because a JWT cannot be withdrawn before it expires
export const ACCESS_TOKEN_SECONDS = 15 * 60;
// Long, because this half is a random string this service can look up and revoke
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

// Importing a key is async, so the pair is built once on first use and reused after that
let keys: ReturnType<typeof importKeys> | null = null;

async function importKeys() {
  const raw = process.env.AUTH_PRIVATE_JWK;

  if (!raw) {
    throw new Error("AUTH_PRIVATE_JWK is not set");
  }

  const jwk = JSON.parse(raw) as JWK;

  if (!jwk.kid) {
    throw new Error("AUTH_PRIVATE_JWK needs a kid, so published keys can be told apart");
  }

  // Only these fields are published: the private scalar "d" stays in this process
  const publicJwk: JWK = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    kid: jwk.kid,
    alg: ALGORITHM,
    use: "sig",
  };

  const [privateKey, publicKey] = await Promise.all([
    importJWK(jwk, ALGORITHM),
    importJWK(publicJwk, ALGORITHM),
  ]);

  return { privateKey, publicKey, publicJwk, kid: jwk.kid };
}

function loadKeys() {
  if (keys === null) {
    keys = importKeys();
  }

  return keys;
}

export async function signAccessToken(userId: string): Promise<string> {
  const { privateKey, kid } = await loadKeys();

  const token = await new SignJWT()
    .setProtectedHeader({ alg: ALGORITHM, kid })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
    .sign(privateKey);

  return token;
}

// The user id the token was issued for. Throws for anything else: expired, tampered with,
// signed by another key, or meant for another audience.
export async function verifyAccessToken(token: string): Promise<string> {
  const { publicKey } = await loadKeys();

  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [ALGORITHM],
  });

  if (!payload.sub) {
    throw new Error("Access token has no subject");
  }

  return payload.sub;
}

// What other services fetch to verify tokens without calling this one
export async function publicJwks(): Promise<{ keys: JWK[] }> {
  const { publicJwk } = await loadKeys();

  return { keys: [publicJwk] };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// An opaque random string: there is nothing to verify offline, and its point is to be revocable
export function createRefreshToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000),
  };
}
