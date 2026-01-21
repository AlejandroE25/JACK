/**
 * System Introspector
 *
 * Provides self-awareness capabilities for the agent system.
 * Allows Pace to understand and communicate its own capabilities,
 * system status, and knowledge boundaries.
 */

import { logger } from '../utils/logger.js';
import { PluginRegistry } from '../plugins/pluginRegistry.js';
import { config } from '../config/index.js';
import {
  CapabilityDescription,
  HealthStatus,
  KnowledgeBoundary,
  MetaQueryType
} from '../types/agent.js';

export class SystemIntrospector {
  private pluginRegistry: PluginRegistry;

  constructor(pluginRegistry: PluginRegistry) {
    this.pluginRegistry = pluginRegistry;
    logger.info('System introspector initialized');
  }

  /**
   * Detect if a query is asking about system capabilities
   */
  isMetaQuery(query: string): MetaQueryType | null {
    const lowerQuery = query.toLowerCase().trim();

    // "What can you do?"
    if (
      /^what (can|could|do) (you|pace) (do|help|assist)/i.test(lowerQuery) ||
      /^(tell|show) me (what|your) (you can|capabilities)/i.test(lowerQuery) ||
      /^list (your )?capabilities/i.test(lowerQuery)
    ) {
      return MetaQueryType.WHAT_CAN_YOU_DO;
    }

    // "Can you [do something]?"
    if (/^can (you|pace) /i.test(lowerQuery)) {
      return MetaQueryType.CAPABILITY_LIST;
    }

    // System status queries
    if (
      /^(what'?s? |check |show )?(your |the |system )?status/i.test(lowerQuery) ||
      /^(are|is) (you|everything|all systems?) (working|operational|ok|ready)/i.test(lowerQuery)
    ) {
      return MetaQueryType.SYSTEM_STATUS;
    }

    // Plugin/tool health
    if (
      /^(check|test|verify) (tools?|plugins?|systems?)/i.test(lowerQuery) ||
      /^(what|which) (tools?|plugins?|systems?) (are|is) (working|available|configured)/i.test(lowerQuery)
    ) {
      return MetaQueryType.TOOL_HEALTH;
    }

    // Knowledge boundary queries
    if (
      /^(do|can) you (have access to|access|see|read)/i.test(lowerQuery) ||
      /^what (data|information|sources?) (do|can) you (access|use|see)/i.test(lowerQuery)
    ) {
      return MetaQueryType.KNOWLEDGE_BOUNDARY;
    }

    // Plugin information
    if (/^(list|show|what) (are )?(your )?(plugins?|integrations?|extensions?)/i.test(lowerQuery)) {
      return MetaQueryType.PLUGIN_INFO;
    }

    return null;
  }

  /**
   * Get all system capabilities grouped by category
   */
  getCapabilities(): CapabilityDescription[] {
    const capabilities: Map<string, CapabilityDescription> = new Map();

    // Get all tools from registry
    const allTools = this.pluginRegistry.getAllTools();

    for (const tool of allTools) {
      const category = tool.category;

      if (!capabilities.has(category)) {
        capabilities.set(category, {
          category,
          status: HealthStatus.HEALTHY,
          tools: []
        });
      }

      const capDesc = capabilities.get(category)!;

      // Check if tool requires configuration
      const requiresSetup = this.toolRequiresSetup(tool.name);
      const configured = this.isToolConfigured(tool.name);

      capDesc.tools.push({
        name: tool.name,
        description: tool.description,
        requiresSetup,
        configured
      });

      // Update category health status
      if (requiresSetup && !configured) {
        if (capDesc.status === HealthStatus.HEALTHY) {
          capDesc.status = HealthStatus.DEGRADED;
        }
      }
    }

    // Add requirements for degraded categories
    for (const capDesc of capabilities.values()) {
      if (capDesc.status === HealthStatus.DEGRADED) {
        const unconfiguredTools = capDesc.tools
          .filter(t => t.requiresSetup && !t.configured)
          .map(t => t.name);

        capDesc.requirements = unconfiguredTools.map(
          toolName => `${toolName} requires API key configuration`
        );
      }
    }

    return Array.from(capabilities.values());
  }

  /**
   * Get overall system health status
   */
  getSystemStatus(): {
    overallHealth: HealthStatus;
    components: Array<{
      name: string;
      status: HealthStatus;
      message: string;
    }>;
  } {
    const capabilities = this.getCapabilities();

    const components = capabilities.map(cap => ({
      name: cap.category,
      status: cap.status,
      message:
        cap.status === HealthStatus.HEALTHY
          ? `All ${cap.category} tools operational`
          : `${cap.category}: ${cap.requirements?.join(', ')}`
    }));

    // Add agent system status
    components.push({
      name: 'Agent System',
      status: HealthStatus.HEALTHY,
      message: 'Multi-step planning and execution operational'
    });

    // Add memory system status
    components.push({
      name: 'Memory System',
      status: HealthStatus.HEALTHY,
      message: 'Persistent memory storage operational'
    });

    // Determine overall health
    const hasUnhealthy = components.some(c => c.status === HealthStatus.UNHEALTHY);
    const hasDegraded = components.some(c => c.status === HealthStatus.DEGRADED);

    const overallHealth = hasUnhealthy
      ? HealthStatus.UNHEALTHY
      : hasDegraded
      ? HealthStatus.DEGRADED
      : HealthStatus.HEALTHY;

    return { overallHealth, components };
  }

  /**
   * Get knowledge boundaries - what Pace can and cannot access
   */
  getKnowledgeBoundaries(): KnowledgeBoundary[] {
    const boundaries: KnowledgeBoundary[] = [];

    // Check which data sources are available
    const hasWeather = this.pluginRegistry.getTool('get_weather') !== undefined;
    const hasNews = this.pluginRegistry.getTool('get_news') !== undefined;
    const hasWolfram = this.pluginRegistry.getTool('wolfram_query') !== undefined;
    const hasMemory = this.pluginRegistry.getTool('search_memory') !== undefined;

    if (hasWeather) {
      boundaries.push({
        domain: 'Weather Data',
        hasAccess: this.isToolConfigured('get_weather'),
        availableData: ['Current weather conditions', 'Location-based forecasts'],
        requirements: this.isToolConfigured('get_weather')
          ? undefined
          : ['OpenWeatherMap API key']
      });
    }

    if (hasNews) {
      boundaries.push({
        domain: 'News & Current Events',
        hasAccess: true,
        availableData: ['Wikinews headlines', 'Recent articles'],
        relatedInfo: ['News is cached for 1 hour']
      });
    }

    if (hasWolfram) {
      boundaries.push({
        domain: 'Computational Knowledge',
        hasAccess: this.isToolConfigured('wolfram_query'),
        availableData: ['Mathematical calculations', 'Unit conversions', 'Facts and data'],
        requirements: this.isToolConfigured('wolfram_query')
          ? undefined
          : ['Wolfram Alpha App ID']
      });
    }

    if (hasMemory) {
      boundaries.push({
        domain: 'Personal Memory',
        hasAccess: true,
        availableData: ['Stored conversations', 'User preferences', 'Important information'],
        relatedInfo: ['Memories persist across sessions']
      });
    }

    // Add unavailable data sources
    boundaries.push({
      domain: 'Email',
      hasAccess: false,
      requirements: ['Email plugin not yet installed']
    });

    boundaries.push({
      domain: 'Calendar',
      hasAccess: false,
      requirements: ['Calendar plugin not yet installed']
    });

    boundaries.push({
      domain: 'File System',
      hasAccess: false,
      requirements: ['File system plugin not yet installed']
    });

    return boundaries;
  }

  /**
   * Generate a natural language description of capabilities
   */
  generateCapabilityDescription(): string {
    const capabilities = this.getCapabilities();
    const healthyCategories = capabilities.filter(c => c.status === HealthStatus.HEALTHY);
    const degradedCategories = capabilities.filter(c => c.status === HealthStatus.DEGRADED);

    let description = 'I am PACE, your personal AI assistant. Here are my capabilities:\n\n';

    // List healthy capabilities
    if (healthyCategories.length > 0) {
      description += '✓ **Available Features:**\n';
      for (const category of healthyCategories) {
        description += `\n**${category.category}:**\n`;
        for (const tool of category.tools) {
          description += `  • ${tool.description}\n`;
        }
      }
    }

    // List degraded capabilities
    if (degradedCategories.length > 0) {
      description += '\n⚠️ **Partially Available (requires configuration):**\n';
      for (const category of degradedCategories) {
        description += `\n**${category.category}:**\n`;
        for (const tool of category.tools) {
          if (tool.configured) {
            description += `  ✓ ${tool.description}\n`;
          } else {
            description += `  ⚠️ ${tool.description} (needs setup)\n`;
          }
        }
        if (category.requirements) {
          description += `  Requirements: ${category.requirements.join(', ')}\n`;
        }
      }
    }

    // Add general capabilities
    description += '\n**General Capabilities:**\n';
    description += '  • Multi-step task planning and execution\n';
    description += '  • Persistent memory across conversations\n';
    description += '  • Concurrent task handling\n';
    description += '  • Context-aware responses\n';

    return description;
  }

  /**
   * Check if a tool requires external setup (API keys, etc.)
   */
  private toolRequiresSetup(toolName: string): boolean {
    const requiresSetup = [
      'get_weather',
      'wolfram_query'
    ];

    return requiresSetup.includes(toolName);
  }

  /**
   * Check if a tool is properly configured
   */
  private isToolConfigured(toolName: string): boolean {
    switch (toolName) {
      case 'get_weather':
        return !!config.openWeatherMapApiKey && config.openWeatherMapApiKey !== 'your_api_key_here';

      case 'wolfram_query':
        return !!config.wolframAlphaAppId && config.wolframAlphaAppId !== 'your_wolfram_id_here';

      // Memory and news don't require external configuration
      case 'get_news':
      case 'store_memory':
      case 'search_memory':
      case 'recall_memory':
      case 'delete_memory':
        return true;

      default:
        return true;
    }
  }

  /**
   * Answer a specific capability question (e.g., "Can you check weather?")
   */
  answerSpecificCapabilityQuery(query: string): string {
    const lowerQuery = query.toLowerCase();

    // Extract what they're asking about
    let domain = '';

    if (/weather/i.test(lowerQuery)) {
      domain = 'weather';
    } else if (/news|headlines/i.test(lowerQuery)) {
      domain = 'news';
    } else if (/calculat|math|compute/i.test(lowerQuery)) {
      domain = 'computation';
    } else if (/remember|memory|recall/i.test(lowerQuery)) {
      domain = 'memory';
    } else if (/email/i.test(lowerQuery)) {
      domain = 'email';
    } else if (/calendar|schedule/i.test(lowerQuery)) {
      domain = 'calendar';
    } else if (/file|document/i.test(lowerQuery)) {
      domain = 'files';
    }

    const boundaries = this.getKnowledgeBoundaries();
    const boundary = boundaries.find(b =>
      b.domain.toLowerCase().includes(domain) ||
      domain.includes(b.domain.toLowerCase())
    );

    if (boundary) {
      if (boundary.hasAccess) {
        return `Yes, I can help with ${boundary.domain.toLowerCase()}! ${
          boundary.availableData ? `I have access to: ${boundary.availableData.join(', ')}.` : ''
        }`;
      } else {
        return `I don't currently have access to ${boundary.domain.toLowerCase()}. ${
          boundary.requirements ? `To enable this, I would need: ${boundary.requirements.join(', ')}.` : ''
        }`;
      }
    }

    // Generic response if we can't determine the specific domain
    return "I'm not sure about that specific capability. You can ask 'What can you do?' to see my full list of capabilities.";
  }
}
