export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  // Seconds the access token remains valid, so a caller can plan its refresh
  expiresIn: number;
};

export type AuthResult = TokenPair & { user: PublicUser };
