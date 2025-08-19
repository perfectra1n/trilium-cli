import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TriliumClient } from '../../src/api/client.js';
import { getLiveTestConfig } from './live-test.config.js';
import type { CreateNoteDef } from '../../src/types/api.js';

/**
 * Performance Benchmark Tests for Trilium ETAPI
 * 
 * These tests measure performance characteristics of the Trilium API
 * to establish baseline performance metrics and detect regressions.
 */

const config = getLiveTestConfig();

describe.skipIf(!config.enabled)('Trilium API Performance Benchmarks', () => {
  
  let client: TriliumClient;
  let benchmarkResults: Record<string, any> = {};
  const testNotesCreated: string[] = [];

  beforeAll(async () => {
    client = new TriliumClient({
      baseUrl: config.serverUrl,
      apiToken: config.apiToken,
      timeout: 60000, // Longer timeout for performance tests
      debugMode: false, // Disable debug to avoid affecting timing
    });

    // Warm up the connection
    await client.getAppInfo();
    console.log('🔥 API connection warmed up for performance testing');
  });

  afterAll(async () => {
    // Cleanup test notes
    for (const noteId of testNotesCreated) {
      try {
        await client.deleteNote(noteId);
      } catch (error) {
        console.warn(`Failed to cleanup note ${noteId}:`, error);
      }
    }

    // Display benchmark summary
    console.log('\n📊 Performance Benchmark Results:');
    console.log('==================================');
    Object.entries(benchmarkResults).forEach(([test, results]) => {
      console.log(`${test}:`);
      Object.entries(results).forEach(([metric, value]) => {
        console.log(`  ${metric}: ${value}`);
      });
      console.log('');
    });
  });

  beforeEach(() => {
    if (!config.enabled) {
      // @ts-ignore - vitest's skip functionality  
      return;
    }
  });

  describe('Connection Performance', () => {
    it('should measure connection establishment time', async () => {
      const iterations = 5;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await client.getAppInfo();
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      benchmarkResults['Connection'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Min (ms)': minTime.toFixed(2),
        'Max (ms)': maxTime.toFixed(2),
        'Iterations': iterations,
      };

      expect(avgTime).toBeLessThan(2000); // Should be under 2 seconds
      console.log(`✓ Connection benchmark: ${avgTime.toFixed(2)}ms average`);
    });
  });

  describe('Note CRUD Performance', () => {
    it('should measure note creation performance', async () => {
      const iterations = 10;
      const times: number[] = [];
      const createdNotes: string[] = [];

      for (let i = 0; i < iterations; i++) {
        const noteData: CreateNoteDef = {
          parentNoteId: 'root',
          title: `Performance Test Note ${i}`,
          type: 'text',
          content: `Performance test content for note ${i}. This is a standard test note with typical content length.`,
        };

        const start = performance.now();
        const result = await client.createNote(noteData);
        const end = performance.now();
        
        times.push(end - start);
        createdNotes.push(result.note.noteId);
        testNotesCreated.push(result.note.noteId);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const throughput = (iterations / (times.reduce((sum, time) => sum + time, 0))) * 1000;

      benchmarkResults['Note Creation'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Throughput (notes/sec)': throughput.toFixed(2),
        'Total time (ms)': times.reduce((sum, time) => sum + time, 0).toFixed(2),
        'Iterations': iterations,
      };

      expect(avgTime).toBeLessThan(5000); // Should be under 5 seconds per note
      console.log(`✓ Note creation benchmark: ${avgTime.toFixed(2)}ms average, ${throughput.toFixed(2)} notes/sec`);
    });

    it('should measure note retrieval performance', async () => {
      // Create test notes first
      const testNotes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await client.createNote({
          parentNoteId: 'root',
          title: `Retrieval Test Note ${i}`,
          type: 'text',
          content: `Content for retrieval test note ${i}`,
        });
        testNotes.push(result.note.noteId);
        testNotesCreated.push(result.note.noteId);
      }

      const iterations = 20;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const noteId = testNotes[i % testNotes.length];
        
        const start = performance.now();
        await client.getNote(noteId);
        const end = performance.now();
        
        times.push(end - start);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const throughput = (iterations / (times.reduce((sum, time) => sum + time, 0))) * 1000;

      benchmarkResults['Note Retrieval'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Throughput (reads/sec)': throughput.toFixed(2),
        'Iterations': iterations,
      };

      expect(avgTime).toBeLessThan(2000); // Should be under 2 seconds
      console.log(`✓ Note retrieval benchmark: ${avgTime.toFixed(2)}ms average, ${throughput.toFixed(2)} reads/sec`);
    });

    it('should measure note content retrieval performance', async () => {
      // Create test note with substantial content
      const largeContent = 'x'.repeat(10000); // 10KB of content
      const result = await client.createNote({
        parentNoteId: 'root',
        title: 'Large Content Performance Test',
        type: 'text',
        content: largeContent,
      });
      testNotesCreated.push(result.note.noteId);

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const content = await client.getNoteContent(result.note.noteId);
        const end = performance.now();
        
        times.push(end - start);
        expect(content.length).toBe(largeContent.length);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const throughputMBps = (largeContent.length * iterations / (times.reduce((sum, time) => sum + time, 0))) * 1000 / (1024 * 1024);

      benchmarkResults['Content Retrieval (10KB)'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Throughput (MB/s)': throughputMBps.toFixed(2),
        'Content size': '10KB',
        'Iterations': iterations,
      };

      expect(avgTime).toBeLessThan(3000); // Should be under 3 seconds
      console.log(`✓ Content retrieval benchmark: ${avgTime.toFixed(2)}ms average, ${throughputMBps.toFixed(2)} MB/s`);
    });

    it('should measure note update performance', async () => {
      // Create test note
      const result = await client.createNote({
        parentNoteId: 'root',
        title: 'Update Performance Test',
        type: 'text',
        content: 'Original content',
      });
      testNotesCreated.push(result.note.noteId);

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await client.updateNote(result.note.noteId, {
          title: `Updated Title ${i}`,
        });
        const end = performance.now();
        
        times.push(end - start);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const throughput = (iterations / (times.reduce((sum, time) => sum + time, 0))) * 1000;

      benchmarkResults['Note Updates'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Throughput (updates/sec)': throughput.toFixed(2),
        'Iterations': iterations,
      };

      expect(avgTime).toBeLessThan(3000); // Should be under 3 seconds
      console.log(`✓ Note update benchmark: ${avgTime.toFixed(2)}ms average, ${throughput.toFixed(2)} updates/sec`);
    });
  });

  describe('Search Performance', () => {
    beforeAll(async () => {
      if (!config.enabled) return;
      
      // Create searchable test data
      console.log('Creating test data for search benchmarks...');
      const searchTestData = [
        'JavaScript programming tutorial for beginners',
        'Python data science and machine learning guide',
        'React components and state management patterns',
        'Node.js backend development with Express',
        'Database design principles and optimization',
        'TypeScript advanced types and generics',
        'Web development best practices and security',
        'API design and RESTful service patterns',
        'Testing strategies for modern applications',
        'Performance optimization techniques',
      ];

      for (let i = 0; i < searchTestData.length; i++) {
        const result = await client.createNote({
          parentNoteId: 'root',
          title: `Search Test Note ${i}: ${searchTestData[i]}`,
          type: 'text',
          content: `This is search test content for: ${searchTestData[i]}. It contains additional text to make the content more realistic and searchable. The note covers various aspects of ${searchTestData[i]} and related topics.`,
        });
        testNotesCreated.push(result.note.noteId);
      }

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('✓ Search test data created and indexed');
    });

    it('should measure basic search performance', async () => {
      const searchTerms = ['JavaScript', 'Python', 'React', 'Node.js', 'database'];
      const iterations = searchTerms.length;
      const times: number[] = [];
      const resultCounts: number[] = [];

      for (const term of searchTerms) {
        const start = performance.now();
        const results = await client.searchNotes(term);
        const end = performance.now();
        
        times.push(end - start);
        resultCounts.push(results.length);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const avgResults = resultCounts.reduce((sum, count) => sum + count, 0) / resultCounts.length;
      const throughput = (iterations / (times.reduce((sum, time) => sum + time, 0))) * 1000;

      benchmarkResults['Basic Search'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Average results': Math.round(avgResults),
        'Throughput (searches/sec)': throughput.toFixed(2),
        'Search terms': searchTerms.length,
      };

      expect(avgTime).toBeLessThan(5000); // Should be under 5 seconds
      console.log(`✓ Basic search benchmark: ${avgTime.toFixed(2)}ms average, ${throughput.toFixed(2)} searches/sec`);
    });

    it('should measure advanced search performance', async () => {
      const searchQueries = [
        { search: 'JavaScript OR Python', fastSearch: false },
        { search: 'programming AND tutorial', fastSearch: false },
        { search: 'development', fastSearch: true },
        { search: 'data science', fastSearch: false, limit: 20 },
      ];

      const times: number[] = [];
      const resultCounts: number[] = [];

      for (const query of searchQueries) {
        const start = performance.now();
        const results = await client.searchNotesAdvanced(query);
        const end = performance.now();
        
        times.push(end - start);
        resultCounts.push(results.results.length);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const avgResults = resultCounts.reduce((sum, count) => sum + count, 0) / resultCounts.length;

      benchmarkResults['Advanced Search'] = {
        'Average (ms)': avgTime.toFixed(2),
        'Average results': Math.round(avgResults),
        'Queries tested': searchQueries.length,
      };

      expect(avgTime).toBeLessThan(10000); // Should be under 10 seconds
      console.log(`✓ Advanced search benchmark: ${avgTime.toFixed(2)}ms average`);
    });
  });

  describe('Concurrent Operations Performance', () => {
    it('should measure concurrent note creation performance', async () => {
      const concurrency = 5;
      const notesPerBatch = 3;
      const totalNotes = concurrency * notesPerBatch;

      const start = performance.now();
      
      const batchPromises = Array(concurrency).fill(null).map(async (_, batchIndex) => {
        const batchNotes = [];
        for (let i = 0; i < notesPerBatch; i++) {
          const result = await client.createNote({
            parentNoteId: 'root',
            title: `Concurrent Test Note B${batchIndex}-${i}`,
            type: 'text',
            content: `Concurrent test content for batch ${batchIndex}, note ${i}`,
          });
          batchNotes.push(result.note.noteId);
          testNotesCreated.push(result.note.noteId);
        }
        return batchNotes;
      });

      const results = await Promise.all(batchPromises);
      const end = performance.now();
      
      const totalTime = end - start;
      const throughput = (totalNotes / totalTime) * 1000;

      benchmarkResults['Concurrent Creation'] = {
        'Total time (ms)': totalTime.toFixed(2),
        'Throughput (notes/sec)': throughput.toFixed(2),
        'Concurrency': concurrency,
        'Total notes': totalNotes,
      };

      expect(results).toHaveLength(concurrency);
      expect(totalTime).toBeLessThan(30000); // Should be under 30 seconds
      console.log(`✓ Concurrent creation benchmark: ${totalTime.toFixed(2)}ms total, ${throughput.toFixed(2)} notes/sec`);
    });

    it('should measure concurrent search performance', async () => {
      const concurrency = 3;
      const searchTerms = ['test', 'content', 'note'];
      
      const start = performance.now();
      
      const searchPromises = searchTerms.map(term => 
        client.searchNotes(term, { 
          fastSearch: false, 
          includeArchived: false, 
          limit: 10 
        })
      );

      const results = await Promise.all(searchPromises);
      const end = performance.now();
      
      const totalTime = end - start;
      const throughput = (searchTerms.length / totalTime) * 1000;

      benchmarkResults['Concurrent Search'] = {
        'Total time (ms)': totalTime.toFixed(2),
        'Throughput (searches/sec)': throughput.toFixed(2),
        'Concurrent searches': searchTerms.length,
        'Total results': results.reduce((sum, result) => sum + result.length, 0),
      };

      expect(results).toHaveLength(searchTerms.length);
      expect(totalTime).toBeLessThan(15000); // Should be under 15 seconds
      console.log(`✓ Concurrent search benchmark: ${totalTime.toFixed(2)}ms total, ${throughput.toFixed(2)} searches/sec`);
    });
  });

  describe('Attribute Operations Performance', () => {
    it('should measure attribute creation and retrieval performance', async () => {
      // Create test note
      const result = await client.createNote({
        parentNoteId: 'root',
        title: 'Attribute Performance Test',
        type: 'text',
        content: 'Note for attribute performance testing',
      });
      testNotesCreated.push(result.note.noteId);

      const attributeCount = 10;
      const createTimes: number[] = [];
      const retrieveTimes: number[] = [];

      // Measure attribute creation
      for (let i = 0; i < attributeCount; i++) {
        const start = performance.now();
        await client.createAttribute({
          noteId: result.note.noteId,
          type: 'label',
          name: `perf-test-${i}`,
          value: `value-${i}`,
        });
        const end = performance.now();
        createTimes.push(end - start);
      }

      // Measure attribute retrieval
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await client.getNoteAttributes(result.note.noteId);
        const end = performance.now();
        retrieveTimes.push(end - start);
      }

      const avgCreateTime = createTimes.reduce((sum, time) => sum + time, 0) / createTimes.length;
      const avgRetrieveTime = retrieveTimes.reduce((sum, time) => sum + time, 0) / retrieveTimes.length;

      benchmarkResults['Attribute Operations'] = {
        'Avg creation (ms)': avgCreateTime.toFixed(2),
        'Avg retrieval (ms)': avgRetrieveTime.toFixed(2),
        'Attributes created': attributeCount,
        'Retrieval iterations': retrieveTimes.length,
      };

      expect(avgCreateTime).toBeLessThan(2000); // Should be under 2 seconds
      expect(avgRetrieveTime).toBeLessThan(1000); // Should be under 1 second
      console.log(`✓ Attribute operations benchmark: ${avgCreateTime.toFixed(2)}ms create, ${avgRetrieveTime.toFixed(2)}ms retrieve`);
    });
  });
});