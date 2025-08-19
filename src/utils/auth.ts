/**
 * Authentication utilities for Trilium
 */

import got from 'got';
import { TriliumError, ApiError } from '../error.js';

export interface LoginCredentials {
  username?: string;
  password: string;
}

export interface AuthTokenResponse {
  authToken?: string;
  token?: string;
}

export interface ETAPITokenResponse {
  token: string;
  name?: string;
  created?: string;
}

/**
 * Generate ETAPI token directly using password
 * Based on the trilium-py implementation
 */
export async function generateETAPITokenWithPassword(
  serverUrl: string,
  password: string
): Promise<string> {
  try {
    // Trilium's ETAPI login endpoint
    const response = await got.post(`${serverUrl}/etapi/auth/login`, {
      form: {
        password: password
      },
      responseType: 'json',
      throwHttpErrors: false,
      timeout: {
        request: 10000
      }
    });

    if (response.statusCode === 401) {
      throw new ApiError('Invalid password', 401);
    }

    if (response.statusCode !== 201) {
      throw new ApiError(
        `Login failed with status ${response.statusCode}`,
        response.statusCode
      );
    }

    const data = response.body as AuthTokenResponse;
    const token = data.authToken || data.token;
    
    if (!token) {
      throw new ApiError('No auth token received from login');
    }

    return token;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new TriliumError(`Failed to login: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate ETAPI token using password authentication
 * This is the main function to call for password-based auth
 */
export async function generateETAPIToken(
  serverUrl: string,
  credentials: LoginCredentials,
  tokenName: string = 'trilium-cli'
): Promise<string> {
  // Use the password directly to get ETAPI token
  return generateETAPITokenWithPassword(serverUrl, credentials.password);
}

/**
 * Test if we can authenticate with the given token
 */
export async function testETAPIToken(
  serverUrl: string,
  token: string
): Promise<boolean> {
  try {
    const response = await got.get(`${serverUrl}/etapi/app-info`, {
      headers: {
        'Authorization': token
      },
      responseType: 'json',
      throwHttpErrors: false,
      timeout: {
        request: 5000
      }
    });

    return response.statusCode === 200;
  } catch {
    return false;
  }
}