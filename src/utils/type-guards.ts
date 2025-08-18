/**
 * Type guard utilities for runtime safety
 */

/**
 * Checks if an array is valid (non-null, non-undefined, and has at least one element)
 * @param arr - The array to check
 * @param minLength - Minimum required length (default: 1)
 * @returns True if the array is valid and has the minimum required length
 */
export function isValidArray<T>(arr: T[] | null | undefined, minLength = 1): arr is T[] {
  return arr !== null && arr !== undefined && Array.isArray(arr) && arr.length >= minLength;
}

/**
 * Checks if a value is not null or undefined
 * @param value - The value to check
 * @returns True if the value is not null or undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Checks if a string has content (not null, undefined, or empty)
 * @param str - The string to check
 * @returns True if the string has content
 */
export function hasContent(str: string | null | undefined): str is string {
  return str !== null && str !== undefined && str.length > 0;
}

/**
 * Checks if an object has a specific property
 * @param obj - The object to check
 * @param prop - The property name
 * @returns True if the object has the property
 */
export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  prop: K
): obj is T & Record<K, unknown> {
  return prop in obj;
}

/**
 * Safely gets the first element of an array
 * @param arr - The array to get the first element from
 * @param errorMessage - Custom error message if array is empty
 * @returns The first element of the array
 * @throws Error if array is empty or invalid
 */
export function getFirstElement<T>(arr: T[] | null | undefined, errorMessage?: string): T {
  if (!isValidArray(arr)) {
    throw new Error(errorMessage || 'Array is empty or invalid');
  }
  return arr[0]!;
}

/**
 * Safely gets an element at a specific index
 * @param arr - The array to get the element from
 * @param index - The index to access
 * @param errorMessage - Custom error message if index is out of bounds
 * @returns The element at the specified index
 * @throws Error if array is invalid or index is out of bounds
 */
export function getElementAt<T>(arr: T[] | null | undefined, index: number, errorMessage?: string): T {
  if (!isValidArray(arr, index + 1)) {
    throw new Error(errorMessage || `Array does not have element at index ${index}`);
  }
  return arr[index]!;
}

/**
 * Checks if a note has content (for note content validation)
 * @param content - The note content to check
 * @returns True if the content is valid
 */
export function hasNoteContent(content: any): content is string | Buffer {
  if (typeof content === 'string') {
    return content.length > 0;
  }
  if (Buffer.isBuffer(content)) {
    return content.length > 0;
  }
  return false;
}

/**
 * Safely access a nested property
 * @param obj - The object to access
 * @param path - The property path (e.g., 'user.profile.name')
 * @param defaultValue - Default value if property doesn't exist
 * @returns The property value or default value
 */
export function getNestedProperty<T = any>(
  obj: any,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current as T;
}

/**
 * Ensures a value is defined or throws an error
 * @param value - The value to check
 * @param errorMessage - Error message to throw if value is not defined
 * @returns The value if it's defined
 * @throws Error if value is null or undefined
 */
export function ensureDefined<T>(value: T | null | undefined, errorMessage: string): T {
  if (!isDefined(value)) {
    throw new Error(errorMessage);
  }
  return value;
}