/**
 * Universal Signal Schema - Core Interfaces
 * 
 * This module defines the interfaces that components must implement
 * for signal translation, entity resolution, and storage.
 */

import {
  Universal_Signal,
  EntityMapping,
  QueryOptions,
  UniversalEventType,
  SignalCategory,
  Platform,
} from './types';

/**
 * Interface that all platform translators must implement
 */
export interface Signal_Translator<T> {
  /**
   * Translate a platform-specific signal to Universal_Signal format
   * @param signal - Platform-specific signal
   * @param entityMapping - Optional pre-resolved entity mapping
   * @returns Universal_Signal or null if translation fails
   */
  translate(
    signal: T,
    entityMapping?: EntityMapping
  ): Promise<Universal_Signal | null>;
  
  /**
   * Validate that a platform signal has required fields
   * @param signal - Platform-specific signal
   * @returns true if valid, false otherwise
   */
  validate(signal: T): boolean;
  
  /**
   * Extract correlation keys from platform signal
   * @param signal - Platform-specific signal
   * @returns Array of correlation keys (email, customer ID, etc.)
   */
  extractCorrelationKeys(signal: T): Promise<string[]>;
}

/**
 * Entity resolver for cross-platform matching
 */
export interface Entity_Resolver {
  /**
   * Resolve entity mapping from correlation keys
   * @param correlationKeys - Array of identifiers to match
   * @param platform - Source platform
   * @param platformId - Platform-specific ID
   * @returns EntityMapping or creates new one
   */
  resolve(
    correlationKeys: string[],
    platform: Platform,
    platformId: string
  ): Promise<EntityMapping>;
  
  /**
   * Get entity mapping by primary key
   * @param primaryKey - Email or primary identifier
   * @returns EntityMapping or null
   */
  getByPrimaryKey(primaryKey: string): Promise<EntityMapping | null>;
  
  /**
   * Update entity mapping with new platform ID
   * @param primaryKey - Email or primary identifier
   * @param platform - Platform to update
   * @param platformId - Platform-specific ID
   */
  updateMapping(
    primaryKey: string,
    platform: Platform,
    platformId: string
  ): Promise<void>;
}

/**
 * Storage interface for Universal_Signals
 */
export interface Signal_Store {
  /**
   * Store a Universal_Signal
   * @param signal - Universal_Signal to store
   */
  store(signal: Universal_Signal): Promise<void>;
  
  /**
   * Retrieve signals for an entity
   * @param primaryKey - Entity's primary key
   * @param options - Query options (time range, limit, etc.)
   * @returns Array of Universal_Signals
   */
  getByEntity(
    primaryKey: string,
    options?: QueryOptions
  ): Promise<Universal_Signal[]>;
  
  /**
   * Retrieve signals by type
   * @param eventType - Universal event type
   * @param options - Query options (time range, limit, etc.)
   * @returns Array of Universal_Signals
   */
  getByType(
    eventType: UniversalEventType,
    options?: QueryOptions
  ): Promise<Universal_Signal[]>;
  
  /**
   * Retrieve signals by category
   * @param category - Signal category
   * @param options - Query options (time range, limit, etc.)
   * @returns Array of Universal_Signals
   */
  getByCategory(
    category: SignalCategory,
    options?: QueryOptions
  ): Promise<Universal_Signal[]>;
}
