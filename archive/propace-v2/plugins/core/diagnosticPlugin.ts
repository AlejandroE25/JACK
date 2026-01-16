/**
 * Diagnostic Plugin
 *
 * Provides self-diagnostic capabilities as tools that Pace can use
 * to test itself and troubleshoot issues.
 */

import {
  Plugin,
  PluginMetadata,
  PluginTool,
  PluginCapability,
  ExecutionContext,
  ToolResult
} from '../../types/plugin.js';
import { SystemDiagnostics, DiagnosticLevel } from '../../agent/diagnostics.js';
import { PluginRegistry } from '../pluginRegistry.js';
import { AgentOrchestrator } from '../../agent/agentOrchestrator.js';
import { logger } from '../../utils/logger.js';

export class DiagnosticPlugin implements Plugin {
  readonly metadata: PluginMetadata = {
    id: 'pace.core.diagnostic',
    name: 'Diagnostic Plugin',
    version: '1.0.0',
    description: 'Self-diagnostic and system health testing capabilities',
    author: 'PACE Core Team',
    tags: ['diagnostic', 'testing', 'health', 'introspection']
  };

  private diagnostics?: SystemDiagnostics;
  private orchestrator?: AgentOrchestrator;

  tools: PluginTool[] = [
    {
      name: 'run_diagnostics',
      description: 'Run system diagnostics to verify all components are working properly. Returns a comprehensive health report.',
      category: 'diagnostic',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'level',
          type: 'string',
          description: 'Diagnostic level: "quick" (fast smoke tests), "standard" (normal checks), or "thorough" (comprehensive testing)',
          required: false
        }
      ],
      execute: this.runDiagnostics.bind(this)
    },
    {
      name: 'run_test',
      description: 'Run a specific diagnostic test by ID. Use list_tests to see available test IDs.',
      category: 'diagnostic',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'test_id',
          type: 'string',
          description: 'The ID of the test to run (e.g., "plugin_registry_loaded", "weather_tool_available")',
          required: true
        }
      ],
      execute: this.runTest.bind(this)
    },
    {
      name: 'list_tests',
      description: 'List all available diagnostic tests with their descriptions and categories.',
      category: 'diagnostic',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.listTests.bind(this)
    },
    {
      name: 'get_system_health',
      description: 'Get a quick summary of system health status. Fast alternative to full diagnostics.',
      category: 'diagnostic',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.getSystemHealth.bind(this)
    },
    {
      name: 'trigger_update_check',
      description: 'Manually trigger a check for system updates. Only available if auto-update is enabled. Useful for testing the update system.',
      category: 'diagnostic',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.triggerUpdateCheck.bind(this)
    },
    {
      name: 'get_update_status',
      description: 'Get the status of the auto-update system including last check time, update stats, and next scheduled check.',
      category: 'diagnostic',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.getUpdateStatus.bind(this)
    }
  ];

  async initialize(_config: Record<string, any>): Promise<void> {
    logger.info('Diagnostic plugin initialized');
  }

  /**
   * Set the plugin registry (needed to create SystemDiagnostics)
   */
  setPluginRegistry(registry: PluginRegistry): void {
    this.diagnostics = new SystemDiagnostics(registry);
  }

  /**
   * Set the agent orchestrator (needed for update monitor access)
   */
  setOrchestrator(orchestrator: AgentOrchestrator): void {
    this.orchestrator = orchestrator;
  }

  async shutdown(): Promise<void> {
    logger.info('Diagnostic plugin shut down');
  }

  /**
   * Run full diagnostic suite
   */
  private async runDiagnostics(
    params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.diagnostics) {
      return {
        success: false,
        error: 'Diagnostics system not initialized'
      };
    }

    try {
      // Parse diagnostic level
      const levelParam = (params.level as string)?.toLowerCase() || 'standard';
      let level: DiagnosticLevel;

      switch (levelParam) {
        case 'quick':
          level = DiagnosticLevel.QUICK;
          break;
        case 'thorough':
          level = DiagnosticLevel.THOROUGH;
          break;
        case 'standard':
        default:
          level = DiagnosticLevel.STANDARD;
          break;
      }

      logger.info(`Running ${level} diagnostics...`);

      // Run diagnostics
      const report = await this.diagnostics.runDiagnostics(level);

      // Format report for display
      const formattedReport = this.diagnostics.formatReport(report);

      return {
        success: true,
        data: {
          report: formattedReport,
          summary: report.summary,
          level: report.level,
          timestamp: report.timestamp
        }
      };
    } catch (error) {
      logger.error('Error running diagnostics:', error);
      return {
        success: false,
        error: `Failed to run diagnostics: ${(error as Error).message}`
      };
    }
  }

  /**
   * Run specific diagnostic test
   */
  private async runTest(
    params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.diagnostics) {
      return {
        success: false,
        error: 'Diagnostics system not initialized'
      };
    }

    const testId = params.test_id as string;

    if (!testId) {
      return {
        success: false,
        error: 'test_id parameter is required'
      };
    }

    try {
      logger.info(`Running diagnostic test: ${testId}`);

      const result = await this.diagnostics.runTest(testId);

      // Format result
      let message = `**Test: ${testId}**\n`;
      message += `Status: ${result.status.toUpperCase()}\n`;
      message += `Message: ${result.message}\n`;

      if (result.details) {
        message += `Details: ${result.details}\n`;
      }

      if (result.error) {
        message += `Error: ${result.error.message}\n`;
      }

      message += `Duration: ${result.duration}ms`;

      return {
        success: result.status === 'pass' || result.status === 'warn',
        data: {
          result,
          formatted: message
        }
      };
    } catch (error) {
      logger.error(`Error running test ${testId}:`, error);
      return {
        success: false,
        error: `Failed to run test: ${(error as Error).message}`
      };
    }
  }

  /**
   * List all available diagnostic tests
   */
  private async listTests(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.diagnostics) {
      return {
        success: false,
        error: 'Diagnostics system not initialized'
      };
    }

    try {
      const tests = this.diagnostics.listTests();

      // Group by category
      const byCategory = new Map<string, typeof tests>();

      for (const test of tests) {
        if (!byCategory.has(test.category)) {
          byCategory.set(test.category, []);
        }
        byCategory.get(test.category)!.push(test);
      }

      // Format output
      let output = `**Available Diagnostic Tests** (${tests.length} total)\n\n`;

      for (const [category, categoryTests] of byCategory.entries()) {
        output += `**${category.toUpperCase()}:**\n`;

        for (const test of categoryTests) {
          output += `  • ${test.id} (${test.level})\n`;
          output += `    ${test.name}: ${test.description}\n`;
        }

        output += '\n';
      }

      return {
        success: true,
        data: {
          tests,
          count: tests.length,
          categories: Array.from(byCategory.keys()),
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error listing tests:', error);
      return {
        success: false,
        error: `Failed to list tests: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get quick system health summary
   */
  private async getSystemHealth(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.diagnostics) {
      return {
        success: false,
        error: 'Diagnostics system not initialized'
      };
    }

    try {
      logger.info('Running quick health check...');

      // Run quick diagnostics only
      const report = await this.diagnostics.runDiagnostics(DiagnosticLevel.QUICK);

      // Build summary
      const { summary } = report;
      const overallHealth = summary.failed === 0 ? 'healthy' :
                           summary.passed > summary.failed ? 'degraded' : 'unhealthy';

      let output = `**System Health: ${overallHealth.toUpperCase()}**\n\n`;
      output += `✓ Passed: ${summary.passed}\n`;

      if (summary.failed > 0) {
        output += `✗ Failed: ${summary.failed}\n`;
      }

      if (summary.warnings > 0) {
        output += `⚠️ Warnings: ${summary.warnings}\n`;
      }

      output += `\nDuration: ${summary.duration}ms\n`;

      // Add any failures or warnings
      if (summary.failed > 0 || summary.warnings > 0) {
        output += '\n**Issues Detected:**\n';

        for (const result of report.results) {
          if (result.status === 'fail' || result.status === 'warn') {
            const icon = result.status === 'fail' ? '✗' : '⚠️';
            output += `${icon} ${result.testId}: ${result.message}\n`;
          }
        }
      }

      return {
        success: true,
        data: {
          health: overallHealth,
          summary,
          timestamp: report.timestamp,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting system health:', error);
      return {
        success: false,
        error: `Failed to get system health: ${(error as Error).message}`
      };
    }
  }

  /**
   * Manually trigger an update check
   */
  private async triggerUpdateCheck(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.orchestrator) {
      return {
        success: false,
        error: 'Orchestrator not available'
      };
    }

    const updateMonitor = this.orchestrator.getUpdateMonitor();

    if (!updateMonitor) {
      return {
        success: false,
        error: 'Auto-update is not enabled. Set ENABLE_AUTO_UPDATE=true to enable it.'
      };
    }

    try {
      logger.info('Manually triggering update check...');
      await updateMonitor.checkNow();

      return {
        success: true,
        data: {
          message: 'Update check triggered successfully',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('Error triggering update check:', error);
      return {
        success: false,
        error: `Failed to trigger update check: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get update system status
   */
  private async getUpdateStatus(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.orchestrator) {
      return {
        success: false,
        error: 'Orchestrator not available'
      };
    }

    const updateMonitor = this.orchestrator.getUpdateMonitor();

    if (!updateMonitor) {
      return {
        success: true,
        data: {
          enabled: false,
          message: 'Auto-update is not enabled. Set ENABLE_AUTO_UPDATE=true to enable it.'
        }
      };
    }

    try {
      const status = updateMonitor.getStatus();

      let output = `**Auto-Update Status**\n\n`;
      output += `Enabled: Yes\n`;
      output += `Running: ${status.isRunning ? 'Yes' : 'No'}\n`;
      output += `Update in Progress: ${status.isUpdating ? 'Yes' : 'No'}\n\n`;

      output += `**Statistics:**\n`;
      output += `Total Checks: ${status.totalChecks}\n`;
      output += `Updates Applied: ${status.updatesApplied}\n`;
      output += `Updates Failed: ${status.updatesFailed}\n`;
      output += `Rollbacks Performed: ${status.rollbacksPerformed}\n\n`;

      if (status.lastCheckTime) {
        output += `Last Check: ${status.lastCheckTime.toLocaleString()}\n`;
      }

      if (status.lastUpdateTime) {
        output += `Last Update: ${status.lastUpdateTime.toLocaleString()}\n`;
      }

      if (status.nextCheckTime) {
        const now = new Date();
        const diff = status.nextCheckTime.getTime() - now.getTime();
        const minutesUntil = Math.floor(diff / 60000);
        const secondsUntil = Math.floor((diff % 60000) / 1000);
        output += `Next Check: in ${minutesUntil}m ${secondsUntil}s\n`;
      }

      if (status.lastError) {
        output += `\n**Last Error:** ${status.lastError}\n`;
      }

      output += `\nCurrent Commit: ${status.currentCommit.substring(0, 7)}\n`;

      return {
        success: true,
        data: {
          ...status,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting update status:', error);
      return {
        success: false,
        error: `Failed to get update status: ${(error as Error).message}`
      };
    }
  }
}
