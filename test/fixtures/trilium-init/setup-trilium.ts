#!/usr/bin/env tsx
/**
 * Trilium test instance initialization script
 * Sets up a fresh Trilium instance with test data and API tokens
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import got from 'got';

const TRILIUM_URL = process.env.TRILIUM_URL || 'http://localhost:8080';
const TRILIUM_PASSWORD = process.env.TRILIUM_INITIAL_PASSWORD || 'test_password_123';
const MAX_RETRIES = 60; // 5 minutes with 5 second intervals
const RETRY_INTERVAL = 5000; // 5 seconds

interface TriliumSetupOptions {
  url?: string;
  password?: string;
  createTestData?: boolean;
  generateApiToken?: boolean;
}

interface ApiTokenResponse {
  authToken: string;
  protectedSessionId: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTrilium(url: string, maxRetries: number = MAX_RETRIES): Promise<boolean> {
  console.log(`⏳ Waiting for Trilium to be ready at ${url}...`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await got.get(`${url}/api/health`, {
        timeout: { request: 3000 },
        throwHttpErrors: false
      });
      
      if (response.statusCode === 200) {
        console.log('✅ Trilium is ready!');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    if (i < maxRetries - 1) {
      process.stdout.write('.');
      await delay(RETRY_INTERVAL);
    }
  }
  
  console.error('❌ Trilium failed to start after 5 minutes');
  return false;
}

async function setupInitialPassword(url: string, password: string): Promise<void> {
  console.log('🔐 Setting up initial password...');
  
  try {
    // First, check if setup is needed
    const setupResponse = await got.get(`${url}/api/setup/status`, {
      throwHttpErrors: false
    });
    
    if (setupResponse.statusCode === 200) {
      const setupStatus = JSON.parse(setupResponse.body);
      
      if (setupStatus.initialized) {
        console.log('ℹ️  Trilium is already initialized');
        return;
      }
    }
    
    // Perform initial setup
    await got.post(`${url}/api/setup/new-document`, {
      json: {
        password: password,
        theme: 'dark'
      }
    });
    
    console.log('✅ Initial password set');
  } catch (error) {
    console.log('ℹ️  Trilium might already be initialized or using a different setup flow');
  }
}

async function loginAndGetToken(url: string, password: string): Promise<string | null> {
  console.log('🔑 Logging in and generating API token...');
  
  try {
    // Login to get session
    const loginResponse = await got.post(`${url}/api/login/token`, {
      json: {
        password: password
      },
      throwHttpErrors: false
    });
    
    if (loginResponse.statusCode !== 200 && loginResponse.statusCode !== 201) {
      // Try alternative login endpoint
      const altLoginResponse = await got.post(`${url}/api/auth/login`, {
        json: {
          password: password
        },
        throwHttpErrors: false
      });
      
      if (altLoginResponse.statusCode === 200) {
        const authData = JSON.parse(altLoginResponse.body);
        return authData.authToken || authData.token;
      }
    }
    
    if (loginResponse.statusCode === 200 || loginResponse.statusCode === 201) {
      const tokenData: ApiTokenResponse = JSON.parse(loginResponse.body);
      console.log('✅ API token generated');
      return tokenData.authToken;
    }
    
    console.error('❌ Failed to login:', loginResponse.statusCode, loginResponse.body);
    return null;
  } catch (error) {
    console.error('❌ Error during login:', error);
    return null;
  }
}

async function createTestData(url: string, token: string): Promise<void> {
  console.log('📝 Creating test data...');
  
  const headers = {
    'Authorization': token,
    'Content-Type': 'application/json'
  };
  
  try {
    // Create test notes
    const testNotes = [
      {
        title: 'Test Note 1',
        content: 'This is a test note for CI/CD testing',
        type: 'text'
      },
      {
        title: 'Test Code Note',
        content: '```javascript\nconst test = "Hello World";\nconsole.log(test);\n```',
        type: 'code',
        mime: 'application/javascript'
      },
      {
        title: 'Test Task',
        content: '- [ ] Test task 1\n- [ ] Test task 2\n- [x] Completed task',
        type: 'text'
      },
      {
        title: 'Test Parent Note',
        content: 'This note has children',
        type: 'text',
        children: [
          {
            title: 'Child Note 1',
            content: 'First child',
            type: 'text'
          },
          {
            title: 'Child Note 2',
            content: 'Second child',
            type: 'text'
          }
        ]
      }
    ];
    
    for (const note of testNotes) {
      const response = await got.post(`${url}/api/create-note`, {
        headers,
        json: {
          parentNoteId: 'root',
          title: note.title,
          content: note.content,
          type: note.type,
          mime: note.mime
        },
        throwHttpErrors: false
      });
      
      if (response.statusCode === 200 || response.statusCode === 201) {
        console.log(`  ✅ Created: ${note.title}`);
        
        // Create children if specified
        if (note.children) {
          const parentNote = JSON.parse(response.body);
          for (const child of note.children) {
            await got.post(`${url}/api/create-note`, {
              headers,
              json: {
                parentNoteId: parentNote.note.noteId,
                title: child.title,
                content: child.content,
                type: child.type
              }
            });
            console.log(`    ✅ Created child: ${child.title}`);
          }
        }
      }
    }
    
    console.log('✅ Test data created');
  } catch (error) {
    console.error('⚠️  Warning: Could not create all test data:', error);
  }
}

async function saveCredentials(token: string): Promise<void> {
  const envContent = `# Trilium Test Credentials (Auto-generated)
TRILIUM_SERVER_URL=${TRILIUM_URL}
TRILIUM_API_KEY=${token}
TRILIUM_PASSWORD=${TRILIUM_PASSWORD}
`;
  
  const envPath = path.join(process.cwd(), '.env.test');
  await fs.writeFile(envPath, envContent);
  console.log(`✅ Credentials saved to ${envPath}`);
}

export async function setupTrilium(options: TriliumSetupOptions = {}): Promise<boolean> {
  const url = options.url || TRILIUM_URL;
  const password = options.password || TRILIUM_PASSWORD;
  const createData = options.createTestData !== false;
  const generateToken = options.generateApiToken !== false;
  
  console.log('🚀 Starting Trilium test instance setup...');
  console.log(`   URL: ${url}`);
  
  // Wait for Trilium to be ready
  const isReady = await waitForTrilium(url);
  if (!isReady) {
    return false;
  }
  
  // Setup initial password
  await setupInitialPassword(url, password);
  
  // Get API token
  let token: string | null = null;
  if (generateToken) {
    token = await loginAndGetToken(url, password);
    if (!token) {
      console.error('❌ Failed to generate API token');
      return false;
    }
    
    // Save credentials
    await saveCredentials(token);
  }
  
  // Create test data
  if (createData && token) {
    await createTestData(url, token);
  }
  
  console.log('🎉 Trilium test instance is ready!');
  console.log(`   URL: ${url}`);
  if (token) {
    console.log(`   API Token: ${token.substring(0, 10)}...`);
  }
  
  return true;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTrilium()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    });
}