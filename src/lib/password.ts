import argon2 from "argon2";

// OWASP's argon2id parameters: 19 MiB of memory, two passes, one lane. They are meant to be
// raised as hardware gets faster, which is why they sit here in plain sight rather than in a
// library default. Memory-hard hashing is what makes a stolen table expensive to crack.
const options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const matches = await argon2.verify(hash, password);
    return matches;
  } catch {
    // A hash this build cannot read is not a match, and is not an error the caller can fix
    return false;
  }
}
