/**
 * Resource Limits Utilities
 * 
 * Provides comprehensive resource usage monitoring, memory and file size limits,
 * security validation, and performance constraints enforcement.
 */

/**
 * Resource types that can be monitored and limited
 */
export enum ResourceType {
  Memory = 'memory',
  FileSize = 'fileSize',
  ProcessingTime = 'processingTime',
  NetworkBandwidth = 'networkBandwidth',
  ConcurrentConnections = 'concurrentConnections',
  CacheSize = 'cacheSize',
  QueueSize = 'queueSize'
}

/**
 * Resource limit configuration
 */
export interface ResourceLimit {
  type: ResourceType;
  limit: number;
  softLimit?: number; // Warning threshold
  unit: string;
  enforced: boolean;
  monitoring: boolean;
}

/**
 * Resource usage information
 */
export interface ResourceUsage {
  type: ResourceType;
  current: number;
  peak: number;
  average: number;
  limit: number;
  softLimit?: number;
  unit: string;
  utilizationPercentage: number;
  isAtLimit: boolean;
  isAtSoftLimit: boolean;
  lastUpdated: number;
}

/**
 * Resource violation information
 */
export interface ResourceViolation {
  type: ResourceType;
  current: number;
  limit: number;
  timestamp: number;
  severity: 'warning' | 'critical';
  message: string;
  action: 'throttle' | 'reject' | 'cleanup' | 'alert';
}

/**
 * Performance constraints configuration
 */
export interface PerformanceConstraints {
  maxMemoryMB: number;
  maxFileSizeMB: number;
  maxProcessingTimeMs: number;
  maxConcurrentOperations: number;
  maxCacheEntries: number;
  maxQueueSize: number;
  enableGarbageCollection: boolean;
  enableResourceCleanup: boolean;
  monitoringInterval: number;
}

/**
 * Default resource limits
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimit[] = [
  {
    type: ResourceType.Memory,
    limit: 512 * 1024 * 1024, // 512 MB
    softLimit: 400 * 1024 * 1024, // 400 MB
    unit: 'bytes',
    enforced: true,
    monitoring: true
  },
  {
    type: ResourceType.FileSize,
    limit: 100 * 1024 * 1024, // 100 MB
    softLimit: 80 * 1024 * 1024, // 80 MB
    unit: 'bytes',
    enforced: true,
    monitoring: true
  },
  {
    type: ResourceType.ProcessingTime,
    limit: 30000, // 30 seconds
    softLimit: 20000, // 20 seconds
    unit: 'milliseconds',
    enforced: true,
    monitoring: true
  },
  {
    type: ResourceType.ConcurrentConnections,
    limit: 50,
    softLimit: 40,
    unit: 'connections',
    enforced: true,
    monitoring: true
  },
  {
    type: ResourceType.CacheSize,
    limit: 1000,
    softLimit: 800,
    unit: 'entries',
    enforced: true,
    monitoring: true
  },
  {
    type: ResourceType.QueueSize,
    limit: 200,
    softLimit: 150,
    unit: 'items',
    enforced: true,
    monitoring: true
  }
];

/**
 * Default performance constraints
 */
export const DEFAULT_PERFORMANCE_CONSTRAINTS: PerformanceConstraints = {
  maxMemoryMB: 512,
  maxFileSizeMB: 100,
  maxProcessingTimeMs: 30000,
  maxConcurrentOperations: 10,
  maxCacheEntries: 1000,
  maxQueueSize: 200,
  enableGarbageCollection: true,
  enableResourceCleanup: true,
  monitoringInterval: 5000 // 5 seconds
};

/**
 * Comprehensive resource monitor and enforcer
 */
export class ResourceLimitsManager {
  private limits: Map<ResourceType, ResourceLimit> = new Map();
  private usage: Map<ResourceType, ResourceUsage> = new Map();
  private violations: ResourceViolation[] = [];
  private monitoringInterval?: NodeJS.Timeout;
  private callbacks: Map<ResourceType, Array<(violation: ResourceViolation) => void>> = new Map();
  private readonly constraints: PerformanceConstraints;
  
  constructor(
    limits: ResourceLimit[] = DEFAULT_RESOURCE_LIMITS,
    constraints: Partial<PerformanceConstraints> = {}
  ) {
    this.constraints = { ...DEFAULT_PERFORMANCE_CONSTRAINTS, ...constraints };
    this.initializeLimits(limits);
    this.startMonitoring();
  }
  
  /**
   * Initialize resource limits
   */
  private initializeLimits(limits: ResourceLimit[]): void {
    for (const limit of limits) {
      this.limits.set(limit.type, limit);
      this.usage.set(limit.type, {
        type: limit.type,
        current: 0,
        peak: 0,
        average: 0,
        limit: limit.limit,
        softLimit: limit.softLimit,
        unit: limit.unit,
        utilizationPercentage: 0,
        isAtLimit: false,
        isAtSoftLimit: false,
        lastUpdated: Date.now()
      });
    }
  }
  
  /**
   * Check if resource usage is within limits
   */
  checkResourceUsage(type: ResourceType, requestedAmount: number): {
    allowed: boolean;
    violation?: ResourceViolation;
    currentUsage: number;
    availableAmount: number;
  } {
    const limit = this.limits.get(type);
    const usage = this.usage.get(type);
    
    if (!limit || !usage) {
      return {
        allowed: true,
        currentUsage: 0,
        availableAmount: Number.MAX_SAFE_INTEGER
      };
    }
    
    const newUsage = usage.current + requestedAmount;
    const availableAmount = Math.max(0, limit.limit - usage.current);
    
    if (!limit.enforced) {
      return {
        allowed: true,
        currentUsage: usage.current,
        availableAmount
      };
    }
    
    if (newUsage > limit.limit) {
      const violation: ResourceViolation = {
        type,
        current: newUsage,
        limit: limit.limit,
        timestamp: Date.now(),
        severity: 'critical',
        message: `Resource limit exceeded for ${type}: ${newUsage} ${limit.unit} > ${limit.limit} ${limit.unit}`,
        action: this.determineViolationAction(type, newUsage, limit.limit)
      };
      
      this.recordViolation(violation);
      
      return {
        allowed: false,
        violation,
        currentUsage: usage.current,
        availableAmount
      };
    }
    
    // Check soft limit
    if (limit.softLimit && newUsage > limit.softLimit) {
      const violation: ResourceViolation = {
        type,
        current: newUsage,
        limit: limit.softLimit,
        timestamp: Date.now(),
        severity: 'warning',
        message: `Resource soft limit exceeded for ${type}: ${newUsage} ${limit.unit} > ${limit.softLimit} ${limit.unit}`,
        action: 'alert'
      };
      
      this.recordViolation(violation);
    }
    
    return {
      allowed: true,
      currentUsage: usage.current,
      availableAmount
    };
  }
  
  /**
   * Update resource usage
   */
  updateResourceUsage(type: ResourceType, amount: number): void {
    const usage = this.usage.get(type);
    const limit = this.limits.get(type);
    
    if (!usage || !limit) {
      return;
    }
    
    const previousCurrent = usage.current;
    usage.current = Math.max(0, amount);
    usage.peak = Math.max(usage.peak, usage.current);
    usage.utilizationPercentage = (usage.current / limit.limit) * 100;
    usage.isAtLimit = usage.current >= limit.limit;
    usage.isAtSoftLimit = limit.softLimit ? usage.current >= limit.softLimit : false;
    usage.lastUpdated = Date.now();
    
    // Update running average (simple moving average over last 10 updates)
    usage.average = (usage.average * 9 + usage.current) / 10;
    
    // Trigger callbacks if usage increased significantly
    if (usage.current > previousCurrent + (limit.limit * 0.1)) {
      this.triggerCallbacks(type);
    }
  }
  
  /**
   * Validate file size before processing
   */
  validateFileSize(sizeBytes: number, fileName?: string): {
    valid: boolean;
    error?: string;
    maxAllowedSize: number;
  } {
    const result = this.checkResourceUsage(ResourceType.FileSize, sizeBytes);
    const limit = this.limits.get(ResourceType.FileSize);
    
    if (!result.allowed) {
      return {
        valid: false,
        error: fileName ? 
          `File ${fileName} exceeds size limit: ${this.formatBytes(sizeBytes)} > ${this.formatBytes(limit?.limit || 0)}` :
          `File size exceeds limit: ${this.formatBytes(sizeBytes)} > ${this.formatBytes(limit?.limit || 0)}`,
        maxAllowedSize: limit?.limit || 0
      };
    }
    
    return {
      valid: true,
      maxAllowedSize: limit?.limit || 0
    };
  }
  
  /**
   * Validate memory usage before allocation
   */
  validateMemoryUsage(requestedBytes: number): {
    valid: boolean;
    error?: string;
    availableMemory: number;
  } {
    const result = this.checkResourceUsage(ResourceType.Memory, requestedBytes);
    
    if (!result.allowed) {
      return {
        valid: false,
        error: `Memory allocation would exceed limit: ${this.formatBytes(requestedBytes)} requested, ${this.formatBytes(result.availableAmount)} available`,
        availableMemory: result.availableAmount
      };
    }
    
    return {
      valid: true,
      availableMemory: result.availableAmount
    };
  }
  
  /**
   * Monitor processing time with timeout
   */
  async withProcessingTimeLimit<T>(
    operation: () => Promise<T>,
    customTimeoutMs?: number
  ): Promise<T> {
    const limit = this.limits.get(ResourceType.ProcessingTime);
    const timeoutMs = customTimeoutMs || limit?.limit || 30000;
    
    const startTime = Date.now();
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const elapsed = Date.now() - startTime;
        this.updateResourceUsage(ResourceType.ProcessingTime, elapsed);
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    try {
      const result = await Promise.race([operation(), timeoutPromise]);
      const elapsed = Date.now() - startTime;
      this.updateResourceUsage(ResourceType.ProcessingTime, elapsed);
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.updateResourceUsage(ResourceType.ProcessingTime, elapsed);
      throw error;
    }
  }
  
  /**
   * Get current resource usage statistics
   */
  getResourceUsage(type?: ResourceType): ResourceUsage | ResourceUsage[] {
    if (type) {
      return this.usage.get(type) || this.createDefaultUsage(type);
    }
    
    return Array.from(this.usage.values());
  }
  
  /**
   * Get system memory usage (Node.js specific)
   */
  getSystemMemoryUsage(): {
    used: number;
    total: number;
    free: number;
    percentage: number;
  } {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal + memUsage.external;
    
    this.updateResourceUsage(ResourceType.Memory, memUsage.heapUsed);
    
    return {
      used: memUsage.heapUsed,
      total: totalMemory,
      free: totalMemory - memUsage.heapUsed,
      percentage: (memUsage.heapUsed / totalMemory) * 100
    };
  }
  
  /**
   * Cleanup resources and trigger garbage collection
   */
  cleanupResources(): void {
    if (this.constraints.enableGarbageCollection && global.gc) {
      global.gc();
    }
    
    // Clear old violations (keep only last 100)
    if (this.violations.length > 100) {
      this.violations = this.violations.slice(-100);
    }
    
    // Reset peak values periodically
    const now = Date.now();
    for (const usage of this.usage.values()) {
      if (now - usage.lastUpdated > 300000) { // 5 minutes
        usage.peak = usage.current;
      }
    }
  }
  
  /**
   * Get resource violations history
   */
  getViolations(type?: ResourceType, limit = 50): ResourceViolation[] {
    let violations = this.violations;
    
    if (type) {
      violations = violations.filter(v => v.type === type);
    }
    
    return violations.slice(-limit);
  }
  
  /**
   * Register callback for resource violations
   */
  onResourceViolation(type: ResourceType, callback: (violation: ResourceViolation) => void): void {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, []);
    }
    this.callbacks.get(type)!.push(callback);
  }
  
  /**
   * Security validation for input data
   */
  validateSecurityConstraints(data: {
    contentLength?: number;
    fileName?: string;
    mimeType?: string;
    sourceUrl?: string;
  }): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // File size validation
    if (data.contentLength !== undefined) {
      const sizeResult = this.validateFileSize(data.contentLength, data.fileName);
      if (!sizeResult.valid && sizeResult.error) {
        errors.push(sizeResult.error);
      }
    }
    
    // File name validation
    if (data.fileName) {
      const invalidChars = /[<>:"|?*\x00-\x1f]/;
      if (invalidChars.test(data.fileName)) {
        errors.push('File name contains invalid characters');
      }
      
      if (data.fileName.length > 255) {
        errors.push('File name too long (max 255 characters)');
      }
      
      // Check for suspicious file extensions
      const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js'];
      const ext = data.fileName.toLowerCase().slice(data.fileName.lastIndexOf('.'));
      if (dangerousExtensions.includes(ext)) {
        warnings.push(`Potentially dangerous file extension: ${ext}`);
      }
    }
    
    // MIME type validation
    if (data.mimeType) {
      const allowedMimeTypes = [
        'text/plain', 'text/html', 'text/markdown', 'text/css',
        'application/json', 'application/javascript',
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'application/pdf'
      ];
      
      const isAllowed = allowedMimeTypes.some(allowed => 
        data.mimeType!.startsWith(allowed.split('/')[0]) || 
        allowedMimeTypes.includes(data.mimeType!)
      );
      
      if (!isAllowed) {
        warnings.push(`Uncommon MIME type: ${data.mimeType}`);
      }
    }
    
    // URL validation
    if (data.sourceUrl) {
      try {
        const url = new URL(data.sourceUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Invalid URL protocol (only HTTP/HTTPS allowed)');
        }
        
        // Check for localhost/private IPs
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname.startsWith('127.') || 
            hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
          warnings.push('URL points to local/private network');
        }
      } catch {
        errors.push('Invalid URL format');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Start resource monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      // Update memory usage
      this.getSystemMemoryUsage();
      
      // Cleanup resources if enabled
      if (this.constraints.enableResourceCleanup) {
        this.cleanupResources();
      }
      
      // Check for limit violations
      for (const [type, usage] of this.usage.entries()) {
        const limit = this.limits.get(type);
        if (limit && usage.isAtLimit && limit.enforced) {
          this.triggerCallbacks(type);
        }
      }
    }, this.constraints.monitoringInterval);
  }
  
  /**
   * Stop resource monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }
  
  /**
   * Record resource violation
   */
  private recordViolation(violation: ResourceViolation): void {
    this.violations.push(violation);
    this.triggerCallbacks(violation.type);
  }
  
  /**
   * Determine action for resource violation
   */
  private determineViolationAction(
    type: ResourceType, 
    current: number, 
    limit: number
  ): ResourceViolation['action'] {
    const severity = (current - limit) / limit;
    
    if (severity > 0.5) return 'reject';
    if (severity > 0.2) return 'throttle';
    if (severity > 0.1) return 'cleanup';
    return 'alert';
  }
  
  /**
   * Trigger callbacks for resource type
   */
  private triggerCallbacks(type: ResourceType): void {
    const callbacks = this.callbacks.get(type);
    if (!callbacks) return;
    
    const usage = this.usage.get(type);
    if (!usage) return;
    
    const violation: ResourceViolation = {
      type,
      current: usage.current,
      limit: usage.limit,
      timestamp: Date.now(),
      severity: usage.isAtLimit ? 'critical' : 'warning',
      message: `Resource ${usage.isAtLimit ? 'limit' : 'soft limit'} reached for ${type}`,
      action: 'alert'
    };
    
    for (const callback of callbacks) {
      try {
        callback(violation);
      } catch (error) {
        console.error('Error in resource violation callback:', error);
      }
    }
  }
  
  /**
   * Create default usage object
   */
  private createDefaultUsage(type: ResourceType): ResourceUsage {
    return {
      type,
      current: 0,
      peak: 0,
      average: 0,
      limit: 0,
      unit: 'unknown',
      utilizationPercentage: 0,
      isAtLimit: false,
      isAtSoftLimit: false,
      lastUpdated: Date.now()
    };
  }
  
  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Cleanup and dispose of resources
   */
  dispose(): void {
    this.stopMonitoring();
    this.callbacks.clear();
    this.violations = [];
  }
}

/**
 * Create default resource limits manager
 */
export function createResourceLimitsManager(
  customLimits?: Partial<ResourceLimit>[],
  constraints?: Partial<PerformanceConstraints>
): ResourceLimitsManager {
  const limits = customLimits ? 
    DEFAULT_RESOURCE_LIMITS.map(limit => ({ ...limit, ...customLimits.find(c => c.type === limit.type) })) :
    DEFAULT_RESOURCE_LIMITS;
  
  return new ResourceLimitsManager(limits, constraints);
}

/**
 * Simple memory validator function
 */
export function validateMemoryUsage(requestedMB: number, maxMB: number = 512): boolean {
  const memUsage = process.memoryUsage();
  const currentMB = memUsage.heapUsed / 1024 / 1024;
  
  return (currentMB + requestedMB) <= maxMB;
}

/**
 * Simple file size validator function
 */
export function validateFileSize(sizeBytes: number, maxSizeMB: number = 100): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return sizeBytes <= maxBytes;
}

/**
 * Resource-aware operation wrapper
 */
export async function withResourceLimits<T>(
  operation: () => Promise<T>,
  resourceManager: ResourceLimitsManager,
  options: {
    memoryMB?: number;
    timeoutMs?: number;
    fileSize?: number;
  } = {}
): Promise<T> {
  // Validate memory if specified
  if (options.memoryMB) {
    const memResult = resourceManager.validateMemoryUsage(options.memoryMB * 1024 * 1024);
    if (!memResult.valid) {
      throw new Error(memResult.error || 'Memory limit exceeded');
    }
  }
  
  // Validate file size if specified
  if (options.fileSize) {
    const fileResult = resourceManager.validateFileSize(options.fileSize);
    if (!fileResult.valid) {
      throw new Error(fileResult.error || 'File size limit exceeded');
    }
  }
  
  // Execute with timeout if specified
  if (options.timeoutMs) {
    return resourceManager.withProcessingTimeLimit(operation, options.timeoutMs);
  }
  
  return operation();
}