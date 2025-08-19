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
 * Login to Trilium and get an auth token using username/password
 */
export async function loginWithPassword(
  serverUrl: string,
  credentials: LoginCredentials
): Promise<string> {
  try {
    // Trilium's login endpoint
    const response = await got.post(`${serverUrl}/api/login/token`, {
      json: {
        username: credentials.username || '',
        password: credentials.password
      },
      responseType: 'json',
      throwHttpErrors: false,
      timeout: {
        request: 10000
      }
    });

    if (response.statusCode === 401) {
      throw new ApiError('Invalid username or password', 401);
    }

    if (response.statusCode !== 200 && response.statusCode !== 201) {
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
 * Get or create an ETAPI token using an auth token
 */
export async function getOrCreateETAPIToken(
  serverUrl: string,
  authToken: string,
  tokenName: string = 'trilium-cli'
): Promise<string> {
  try {
    // First, try to get existing ETAPI tokens
    const listResponse = await got.get(`${serverUrl}/etapi/tokens`, {
      headers: {
        'Authorization': authToken
      },
      responseType: 'json',
      throwHttpErrors: false,
      timeout: {
        request: 10000
      }
    });

    if (listResponse.statusCode === 200) {
      const tokens = listResponse.body as ETAPITokenResponse[];
      const existingToken = tokens.find(t => t.name === tokenName);
      if (existingToken && existingToken.token) {
        return existingToken.token;
      }
    }

    // If no existing token, create a new one
    const createResponse = await got.post(`${serverUrl}/etapi/tokens`, {
      headers: {
        'Authorization': authToken
      },
      json: {
        name: tokenName
      },
      responseType: 'json',
      throwHttpErrors: false,
      timeout: {
        request: 10000
      }
    });

    if (createResponse.statusCode !== 200 && createResponse.statusCode !== 201) {
      throw new ApiError(
        `Failed to create ETAPI token with status ${createResponse.statusCode}`,
        createResponse.statusCode
      );
    }

    const data = createResponse.body as ETAPITokenResponse;
    if (!data.token) {
      throw new ApiError('No token received from ETAPI token creation');
    }

    return data.token;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new TriliumError(`Failed to get/create ETAPI token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate ETAPI token using username/password authentication
 * This combines login and token generation into one flow
 */
export async function generateETAPIToken(
  serverUrl: string,
  credentials: LoginCredentials,
  tokenName: string = 'trilium-cli'
): Promise<string> {
  // Step 1: Login with password to get auth token
  const authToken = await loginWithPassword(serverUrl, credentials);
  
  // Step 2: Use auth token to get/create ETAPI token
  const etapiToken = await getOrCreateETAPIToken(serverUrl, authToken, tokenName);
  
  return etapiToken;
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