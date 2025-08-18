# Live Integration Tests for Trilium ETAPI

This directory contains comprehensive integration tests that validate the Trilium CLI against a live Trilium server instance. These tests ensure that all core ETAPI functionality works correctly in real-world scenarios.

## Overview

The integration test suite includes:

- **Live API Integration Tests** - Tests all CRUD operations against real Trilium server
- **Performance Benchmarks** - Measures API performance and throughput
- **Error Handling Tests** - Validates error conditions and edge cases
- **Data Integrity Tests** - Ensures consistency across operations
- **Concurrency Tests** - Tests concurrent operations and race conditions

## Prerequisites

1. **Trilium Server**: Running instance at `localhost:8080` (or custom URL)
2. **ETAPI Token**: Valid authentication token for the server
3. **Node.js**: Version 18+ with npm/pnpm

## Quick Start

### 1. Set Environment Variables

```bash
# Required
export TRILIUM_TEST_ENABLED=true
export TRILIUM_SERVER_URL=http://localhost:8080
export TRILIUM_API_TOKEN=your_etapi_token_here

# Optional
export TRILIUM_TEST_DEBUG=true          # Enable debug output
export TRILIUM_TEST_CLEANUP=true        # Auto-cleanup test data (default: true)
export TRILIUM_TEST_TIMEOUT=30000       # Request timeout in ms (default: 30000)
export TRILIUM_TEST_PREFIX="Integration Test"  # Prefix for test notes
```

### 2. Run Tests

```bash
# Run all integration tests with smart test runner
npm run test:live

# Run specific test suites
npm run test:integration        # Core API integration tests
npm run test:performance       # Performance benchmarks
npm run test:errors            # Error handling tests

# Run with debug output
npm run test:live:debug

# Run without cleanup (leaves test data)
npm run test:live:no-cleanup
```

## Test Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|-----------|
| `TRILIUM_TEST_ENABLED` | Enable live tests | `false` | Yes |
| `TRILIUM_SERVER_URL` | Trilium server URL | `http://localhost:8080` | Yes |
| `TRILIUM_API_TOKEN` | ETAPI authentication token | - | Yes |
| `TRILIUM_TEST_DEBUG` | Enable debug logging | `false` | No |
| `TRILIUM_TEST_CLEANUP` | Auto-cleanup test data | `true` | No |
| `TRILIUM_TEST_TIMEOUT` | Request timeout (ms) | `30000` | No |
| `TRILIUM_TEST_PREFIX` | Test note title prefix | `"Integration Test"` | No |

### Getting Your ETAPI Token

1. Open Trilium web interface
2. Go to **Options** → **ETAPI**
3. Create a new token or use existing one
4. Copy the token value

## Test Suites

### 1. Live API Integration Tests (`live-api-integration.test.ts`)

**Scope**: Tests all core ETAPI endpoints against live server

**Test Categories**:
- Server Connection & Authentication
- Note CRUD Operations (Create, Read, Update, Delete)
- Search Functionality (Basic, Advanced, Enhanced)
- Attribute Management (Labels, Relations)
- Branch Operations (Hierarchy, Cloning)
- Error Handling & Edge Cases
- Performance & Concurrency
- Data Integrity & Consistency

**Key Features**:
- ✅ Tests against real Trilium server
- ✅ Automatic test data cleanup
- ✅ Comprehensive error handling
- ✅ Performance measurements
- ✅ Data consistency validation

### 2. Performance Benchmarks (`performance-benchmark.test.ts`)

**Scope**: Measures API performance characteristics

**Benchmarks**:
- Connection establishment time
- CRUD operation throughput (notes/sec)
- Search performance (searches/sec)
- Content transfer rates (MB/s)
- Concurrent operation handling
- Attribute operation performance

**Metrics Tracked**:
- Average response time
- Minimum/Maximum response time
- Throughput (operations per second)
- Data transfer rates
- Concurrency handling

### 3. Error Handling Tests (`error-handling.test.ts`)

**Scope**: Validates error conditions and edge cases

**Error Categories**:
- Authentication errors (invalid tokens)
- Network errors (unreachable server)
- Resource not found (invalid IDs)
- Validation errors (invalid data)
- Server errors and timeouts
- Rate limiting
- Large content handling

## Test Data Management

### Automatic Cleanup

Tests automatically clean up all created data:
- **Notes**: All test notes are deleted after each test
- **Attributes**: All test attributes are removed
- **Branches**: All test branches are deleted
- **Isolation**: Each test runs in isolation

### Test Data Tracking

The test framework tracks all created resources:
```typescript
const testTracker = new TestDataTracker();
testTracker.trackNote(noteId);
testTracker.trackAttribute(attributeId);
testTracker.trackBranch(branchId);
```

### Manual Cleanup

If automatic cleanup fails, you can manually remove test data by searching for notes with the test prefix.

## Performance Baselines

### Expected Performance (on localhost)

| Operation | Expected Time | Throughput |
|-----------|---------------|------------|
| Connection | < 2s | - |
| Note Creation | < 5s | > 1 note/sec |
| Note Retrieval | < 2s | > 5 reads/sec |
| Content Transfer (10KB) | < 3s | > 3 MB/s |
| Basic Search | < 5s | > 1 search/sec |
| Attribute Operations | < 2s | - |

### Performance Monitoring

Tests will fail if performance degrades significantly below baselines:
- Connection timeouts
- Slow CRUD operations
- Search performance issues
- Content transfer problems

## Troubleshooting

### Common Issues

#### Tests Don't Run
```
❌ Live integration tests are disabled.
```
**Solution**: Set `TRILIUM_TEST_ENABLED=true`

#### Connection Failures
```
❌ Failed to connect to Trilium server
```
**Solutions**:
1. Verify Trilium server is running
2. Check `TRILIUM_SERVER_URL` is correct
3. Validate `TRILIUM_API_TOKEN` is valid
4. Test connectivity: `curl http://localhost:8080/etapi/app-info`

#### Authentication Errors
```
❌ Invalid API token or authentication failed
```
**Solutions**:
1. Generate new ETAPI token in Trilium
2. Verify token is copied correctly (no extra spaces)
3. Check token hasn't expired

#### Timeout Issues
```
❌ Request timeout after 30000ms
```
**Solutions**:
1. Increase timeout: `TRILIUM_TEST_TIMEOUT=60000`
2. Check server performance
3. Reduce test concurrency

### Debug Mode

Enable detailed logging:
```bash
export TRILIUM_TEST_DEBUG=true
npm run test:live:debug
```

Debug output includes:
- Request/response details
- Timing information
- Error stack traces
- Test data tracking

### Test Data Inspection

Disable cleanup to inspect test data:
```bash
export TRILIUM_TEST_CLEANUP=false
npm run test:live:no-cleanup
```

Then search for notes with your test prefix in Trilium.

## Contributing

### Adding New Tests

1. **Follow Existing Patterns**: Use the same structure as existing tests
2. **Track Test Data**: Always track created resources for cleanup
3. **Handle Errors**: Expect and handle potential errors
4. **Performance Awareness**: Consider performance impact of new tests

### Test Structure Example

```typescript
describe('My New Feature', () => {
  let testNotesCreated: string[] = [];

  afterEach(async () => {
    // Cleanup test data
    for (const noteId of testNotesCreated) {
      await client.deleteNote(noteId);
    }
    testNotesCreated = [];
  });

  it('should test feature functionality', async () => {
    const result = await client.createNote(/* ... */);
    testNotesCreated.push(result.note.noteId);
    
    // Test assertions
    expect(result.note).toBeDefined();
    
    console.log('✓ Feature test completed');
  });
});
```

## Test Results

### Success Output
```
🧪 Trilium Live Integration Test Runner
=====================================

✅ Configuration validated
✅ Successfully connected to Trilium server
   Version: 0.60.4
   Database: 60
   URL: http://localhost:8080

🚀 Starting live integration tests...

✅ All tests completed successfully! 🎉

📊 Test Summary:
✅ Server connection: OK
✅ Authentication: OK
✅ CRUD operations: OK
✅ Search functionality: OK
✅ Attribute management: OK
✅ Branch operations: OK
✅ Error handling: OK
✅ Performance tests: OK
✅ Data integrity: OK
```

### Performance Report
```
📊 Performance Benchmark Results:
==================================
Connection:
  Average (ms): 245.67
  Min (ms): 198.23
  Max (ms): 312.45
  Iterations: 5

Note Creation:
  Average (ms): 1234.56
  Throughput (notes/sec): 2.43
  Total time (ms): 6172.80
  Iterations: 10

Basic Search:
  Average (ms): 567.89
  Average results: 12
  Throughput (searches/sec): 1.76
  Search terms: 5
```

## Security Considerations

- **Token Security**: Never commit API tokens to version control
- **Test Isolation**: Tests don't interfere with production data
- **Cleanup**: All test data is automatically removed
- **Network Security**: Tests only make authenticated API calls

## Supported Trilium Versions

- **Minimum**: Trilium 0.58+
- **Recommended**: Trilium 0.60+
- **ETAPI**: Version 1.0+

The test suite validates compatibility and reports version information during execution.

---

For questions or issues, please check the main project documentation or open an issue on GitHub.