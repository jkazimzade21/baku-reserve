/**
 * Utility functions for input validation and sanitization
 */

export const sanitizeInput = (input: string): string => {
  if (!input) return '';

  // Remove script tags and event handlers
  const sanitized = input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/onerror=/gi, '')
    .replace(/onload=/gi, '')
    .replace(/onclick=/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');

  return sanitized;
};

export const validateEmail = (email: string): boolean => {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhoneNumber = (phone: string): boolean => {
  if (!phone) return false;

  const phoneRegex = /^\+?[\d\s\-()]+$/;
  const digitsOnly = phone.replace(/\D/g, '');

  return phoneRegex.test(phone) && digitsOnly.length >= 10 && digitsOnly.length <= 15;
};

export const validateUrl = (url: string): boolean => {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

export const sanitizeHtml = (html: string): string => {
  if (!html) return '';

  // Basic HTML sanitization
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
};

export const validateInput = (
  input: string,
  type: 'email' | 'phone' | 'url' | 'text'
): boolean => {
  switch (type) {
    case 'email':
      return validateEmail(input);
    case 'phone':
      return validatePhoneNumber(input);
    case 'url':
      return validateUrl(input);
    case 'text':
      return input.length > 0 && input.length < 10000;
    default:
      return false;
  }
};
