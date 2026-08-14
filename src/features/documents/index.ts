/**
 * CareLink-AI — Step 11 documents feature barrel.
 *
 * Single import surface for the secure medical-document + image-intelligence
 * foundation. UI components import from here rather than reaching into services.
 */

export * from './types';
export * from './services/fileValidation';
export * from './services/storageService';
export * from './services/documentAnalysisService';
export * from './services/medicineRecognitionService';
export * from './services/documentService';
