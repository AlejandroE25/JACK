import { describe, test, expect } from 'bun:test';
import { ModalityEngine } from '../../../src/ui/modalityEngine';
import type { ExecutionResult, ModalityDecision, ContentType } from '../../../src/types';

describe('ModalityEngine', () => {
  const engine = new ModalityEngine();

  describe('decide', () => {
    describe('simple answers (voice only)', () => {
      test('returns voice only for time query', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'get_time',
          success: true,
          data: { time: '3:45 PM', timezone: 'PST' },
        };

        const decision = engine.decide(result, 'simple_answer');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(false);
        expect(decision.autoOpen).toBe(false);
      });

      test('returns voice only for weather query', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'get_weather',
          success: true,
          data: { temp: 72, conditions: 'sunny' },
        };

        const decision = engine.decide(result, 'simple_answer');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(false);
      });

      test('returns voice only for yes/no confirmation', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'create_reminder',
          success: true,
          data: { created: true },
        };

        const decision = engine.decide(result, 'simple_answer');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(false);
      });
    });

    describe('complex results (voice + document)', () => {
      test('returns voice + document for research', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'research',
          success: true,
          data: {
            summary: 'Three database options found',
            details: [
              { name: 'PostgreSQL', pros: ['reliable'], cons: ['complex'] },
              { name: 'SQLite', pros: ['simple'], cons: ['limited'] },
              { name: 'MongoDB', pros: ['flexible'], cons: ['consistency'] },
            ],
          },
        };

        const decision = engine.decide(result, 'complex_result');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(true);
        expect(decision.documentType).toBe('markdown');
        expect(decision.autoOpen).toBe(true);
        expect(decision.highlights).toBeTruthy();
      });

      test('returns voice + document for analysis', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'analyze',
          success: true,
          data: { report: 'detailed analysis...' },
        };

        const decision = engine.decide(result, 'complex_result');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(true);
        expect(decision.autoOpen).toBe(true);
      });

      test('generates highlights for voice summary', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'research',
          success: true,
          data: {
            summary: 'Found 3 options',
            recommendation: 'PostgreSQL is best for reliability',
          },
        };

        const decision = engine.decide(result, 'complex_result');

        expect(decision.highlights).toBeTruthy();
        // Highlights should be concise
        expect(decision.highlights!.length).toBeLessThan(500);
      });
    });

    describe('code output (document only)', () => {
      test('returns document only for generated code', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'generate_code',
          success: true,
          data: {
            code: 'function hello() { console.log("hi"); }',
            language: 'typescript',
            filename: 'hello.ts',
          },
        };

        const decision = engine.decide(result, 'code');

        expect(decision.voice).toBe(true); // Brief announcement
        expect(decision.document).toBe(true);
        expect(decision.documentType).toBe('code');
        expect(decision.autoOpen).toBe(true);
      });

      test('sets correct document location for code', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'generate_code',
          success: true,
          data: {
            code: 'const x = 1;',
            projectPath: '/Users/test/myproject',
          },
        };

        const decision = engine.decide(result, 'code', {
          projectPath: '/Users/test/myproject',
        });

        expect(decision.documentLocation).toContain('/Users/test/myproject');
      });
    });

    describe('data output (document only, no auto-open)', () => {
      test('returns document for data exports', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'export_data',
          success: true,
          data: { rows: 1000, format: 'csv' },
        };

        const decision = engine.decide(result, 'data');

        expect(decision.voice).toBe(true); // Brief announcement
        expect(decision.document).toBe(true);
        expect(decision.documentType).toBe('data');
      });

      test('sets Downloads as default location for data', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'export_data',
          success: true,
          data: {},
        };

        const decision = engine.decide(result, 'data');

        expect(decision.documentLocation).toContain('Downloads');
      });

      test('logs go to ~/.jack/logs/', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'generate_logs',
          success: true,
          data: { logType: 'debug' },
        };

        const decision = engine.decide(result, 'data', { isLog: true });

        expect(decision.documentLocation).toContain('.jack/logs');
        expect(decision.autoOpen).toBe(false); // Logs don't auto-open
      });
    });

    describe('error handling', () => {
      test('returns voice only for errors needing decision', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'build',
          success: false,
          error: 'Build failed - 3 errors found',
        };

        const decision = engine.decide(result, 'error');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(false);
      });

      test('handles failed execution gracefully', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'unknown',
          success: false,
          error: 'Action not found',
        };

        const decision = engine.decide(result, 'error');

        expect(decision.voice).toBe(true);
        expect(decision.document).toBe(false);
      });
    });

    describe('document location rules', () => {
      test('research goes to Desktop', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'research',
          success: true,
          data: {},
        };

        const decision = engine.decide(result, 'complex_result');

        expect(decision.documentLocation).toContain('Desktop');
      });

      test('code goes to project folder when provided', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'generate_code',
          success: true,
          data: {},
        };

        const decision = engine.decide(result, 'code', {
          projectPath: '/Users/test/myproject',
        });

        expect(decision.documentLocation).toBe('/Users/test/myproject');
      });

      test('code goes to Desktop when no project', () => {
        const result: ExecutionResult = {
          intentId: 'i1',
          action: 'generate_code',
          success: true,
          data: {},
        };

        const decision = engine.decide(result, 'code');

        expect(decision.documentLocation).toContain('Desktop');
      });
    });
  });
});
