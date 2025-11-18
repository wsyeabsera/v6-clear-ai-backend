import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthTokens, JWTPayload } from 'shared';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export class AuthService {
  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate access and refresh tokens
   */
  generateTokens(userId: string, email: string): AuthTokens {
    const payload: JWTPayload = { userId, email };

    // @ts-ignore - Known issue with jsonwebtoken types
    const accessToken = jwt.sign(
      payload, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    ) as string;

    // @ts-ignore - Known issue with jsonwebtoken types
    const refreshToken = jwt.sign(
      payload, 
      JWT_SECRET, 
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    ) as string;

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode a token
   */
  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Validate password strength
   */
  validatePassword(password: string): void {
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
  }
}

