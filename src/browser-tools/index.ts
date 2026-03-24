// Re-export all browser tools
export * from './types.js';
export * as navigation from './navigation.js';
export * as content from './content.js';
export * as video from './video.js';
export * as form from './form.js';
export * as detection from './detection.js';

// Convenience exports for commonly used tools
export {
  click,
  navigate,
  type,
  scroll,
  waitForNavigation,
  goBack,
  goForward,
} from './navigation.js';

export {
  extractDOMForLLM,
  extractInteractiveElements,
  getTextContent,
  getPageTitle,
  getPageUrl,
  takeScreenshot,
} from './content.js';

export {
  detectVideo,
  controlVideo,
  waitForVideoEnd,
} from './video.js';

export {
  fillForm,
  extractFormFields,
  extractQuizQuestions,
} from './form.js';

export {
  detectPageState,
  checkElement,
  waitForElement,
  detectProgress,
  hover,
  focus,
} from './detection.js';
