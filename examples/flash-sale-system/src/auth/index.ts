import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute, withTransaction } from '../infra/postgres.js';
import { config } from '../config/index.js';
import { AppError, User, UserRow, TokenPair } from '../types/index.js';
import { logger } from '../infra/logger.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth.js';

export type { User, TokenPair };

// ─── Password Hashing ────────────────────────────────────────

export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await bcryptjs.genSalt(config.bcrypt.costFactor);
  return bcryptjs.hash(plaintext, salt);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(plaintext, hash);
}

// ─── User CRUD ───────────────────────────────────────────────

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (!row) return null;
  return {
    id: row.id as string,
    email: row.email as string,
    password_hash: row.password_hash as string,
    role: (row.role as string || 'buyer') as UserRow['role'],
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await queryOne<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return row ? mapUser(row) : null;
}

export async function createUser(email: string, passwordHash: string, role: string = 'buyer'): Promise<User> {
  const id = uuidv4();
  const row = await queryOne<UserRow>(
    `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING *`,
    [id, email.toLowerCase(), passwordHash, role]
  );
  return mapUser(row!);
}

// ─── Register ─────────────────────────────────────────────────

export async function registerUser(
  email: string,
  password: string
): Promise<{ user: User; tokens: TokenPair }> {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Invalid email format', 400, 'VALIDATION_ERROR');
  }

  // Validate password
  if (!password || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }

  // Check uniqueness
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError('Email already registered', 409, 'CONFLICT');
  }

  const passwordHash = await hashPassword(password);

  const user = await withTransaction(async (query) => {
    const id = uuidv4();
    const result = await query(
      `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, 'buyer', NOW(), NOW())
       RETURNING *`,
      [id, email.toLowerCase(), passwordHash]
    );
    return mapUser(result.rows[0] as unknown as UserRow);
  });

  const tokens = await issueTokenPair(user.id, user.email, user.role);

  logger.info({ userId: user.id, email: user.email }, 'User registered');
  return { user, tokens };
}

// ─── Login ───────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: User; tokens: TokenPair }> {
  const userRow = await findUserByEmail(email);
  if (!userRow) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const valid = await verifyPassword(password, userRow.password_hash);
  if (!valid) {
    logger.warn({ email }, 'Failed login attempt - invalid password');
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const user = mapUser(userRow);
  const tokens = await issueTokenPair(user.id, user.email, user.role);

  logger.info({ userId: user.id }, 'User logged in');
  return { user, tokens };
}

// ─── Refresh Token ───────────────────────────────────────────

export async function refreshUserToken(
  refreshToken: string
): Promise<{ user: User; tokens: TokenPair }> {
  let payload: { sub: string; familyId: string };

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err: any) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  // Check if the token is already revoked
  const tokenHash = await hashTokenForStorage(refreshToken);
  const existing = await queryOne<Record<string, unknown>>(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash]
  );

  if (!existing) {
    throw new AppError('Refresh token not found', 401, 'UNAUTHORIZED');
  }

  if ((existing.revoked_at as Date | null)) {
    // Token reuse detected - revoke entire family
    await execute(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL',
      [payload.familyId]
    );
    logger.warn({ userId: payload.sub, familyId: payload.familyId }, 'Refresh token reuse detected - family revoked');
    throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
  }

  // Check expiry
  if (new Date(existing.expires_at as Date) < new Date()) {
    throw new AppError('Refresh token expired', 401, 'UNAUTHORIZED');
  }

  // Revoke old token
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
    [existing.id]
  );

  // Get user
  const user = await findUserById(payload.sub);
  if (!user) {
    throw new AppError('User not found', 401, 'UNAUTHORIZED');
  }

  // Issue new tokens with same family
  const tokens = await issueTokenPair(user.id, user.email, user.role, payload.familyId);

  return { user, tokens };
}

// ─── Revoke All User Tokens ──────────────────────────────────

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await execute(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
  logger.info({ userId }, 'All user tokens revoked');
}

// ─── Internal Helpers ───────────────────────────────────────

async function issueTokenPair(
  userId: string,
  email: string,
  role: string,
  existingFamilyId?: string
): Promise<TokenPair> {
  const familyId = existingFamilyId || uuidv4();

  const accessToken = generateAccessToken({
    sub: userId,
    email,
    role: role as any,
  });

  const refreshToken = generateRefreshToken(userId, familyId);
  const tokenHash = await hashTokenForStorage(refreshToken);

  const id = uuidv4();
  const expiresAt = new Date(Date.now() + config.jwt.refreshTokenTtlMs);

  await execute(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, userId, tokenHash, familyId, expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(config.jwt.refreshTokenTtlMs / 1000),
  };
}

async function hashTokenForStorage(token: string): Promise<string> {
  return bcryptjs.hash(token, 6); // Lower cost for token hashing
}
