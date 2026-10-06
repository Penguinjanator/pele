import { sanitizeUrl as reference } from '@braintree/sanitize-url';
import { describe, expect, it } from 'vitest';
import { sanitizeUrl } from '../../src/util/url.js';

// Mermaid sanitizes click targets with @braintree/sanitize-url; Pele must give the same answers.
const URLS = [
  'https://example.com',
  'http://EXAMPLE.com/Path?q=1#frag',
  'click.html',
  './relative/path',
  '/absolute/path',
  'mailto:someone@example.com',
  'obsidian://open?vault=Notes&file=Idea',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'java\nscript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  '&#106;avascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'javascript&colon;alert(1)',
  '%6A%61%76%61%73%63%72%69%70%74:alert(1)',
  'https://example.com/a b',
  'http://',
  'ftp://example.com/file',
  'www.example.com',
  'C:\\Users\\file.txt',
  '\\\\server\\share',
  'note name with spaces',
  '#heading',
  '?query=1',
  '',
  'about:blank',
  'tel:+123456',
  'https://example.com/%E0%A4%A',
];

describe('url sanitizer', () => {
  for (const url of URLS) {
    it(`matches the reference for ${JSON.stringify(url)}`, () => {
      expect(sanitizeUrl(url)).toBe(reference(url));
    });
  }
});
