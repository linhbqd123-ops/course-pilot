import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getConfig, loadConfig } from './config/index.js';
import { initializeDatabase } from './db/index.js';
import { initializeRepositories } from './db/repositories/index.js';
import { initLLMFactory } from './llm/factory.js';
import { BrowserController } from './browser/controller.js';
import { OrchestratorAgent } from './agents/orchestrator.js';
import { logSuccess, logError, logInfo, logProgress, initLogger } from './utils/logger.js';
import { randomUUID } from 'crypto';

const program = new Command();

program
  .name('agent')
  .description('Browser Course Completion Agent')
  .version('1.0.0');

program
  .command('complete <courseName> <courseUrl>')
  .description('Complete an online course')
  .option('--headless', 'Run browser in headless mode', false)
  .option('--provider <name>', 'LLM provider to use (overrides config)')
  .option('--debug', 'Enable debug logging', false)
  .action(async (courseName, courseUrl, options) => {
    try {
      // Initialize config
      const config = loadConfig();
      if (options.debug) {
        config.logging.level = 'debug';
      }

      // Initialize logger
      initLogger(config.logging.level);
      logInfo(`Starting course completion: ${courseName}`);

      // Override headless if specified
      if (options.headless) {
        config.browser.headless = true;
      }

      // Initialize database
      logInfo('Initializing database...');
      const db = initializeDatabase(config.database);
      initializeRepositories();

      // Initialize LLM factory
      logInfo('Initializing LLM providers...');
      const llmFactory = initLLMFactory(config);
      const providers = llmFactory.listProviderNames();
      logInfo(`Available providers: ${providers.join(', ')}`);

      // Prepare profile
      const profilePath = path.join(config.profile.dir, 'agent-profile');
      if (!fs.existsSync(profilePath)) {
        fs.mkdirSync(profilePath, { recursive: true });
        logInfo(`Created profile directory: ${profilePath}`);
      }

      // Initialize browser
      logInfo('Launching browser...');
      const browser = new BrowserController(profilePath, config.browser);
      await browser.initialize();

      // Select LLM provider: CLI option > taskMapping/config default
      let llmProvider;
      try {
        if (options.provider) {
          llmProvider = llmFactory.getProvider(options.provider);
          logInfo(`Using LLM provider (CLI override): ${llmProvider.name} (${llmProvider.config.model})`);
        } else {
          llmProvider = llmFactory.getProviderForTask('orchestrator');
          logInfo(`Using LLM provider (config): ${llmProvider.name} (${llmProvider.config.model})`);
        }
      } catch (err) {
        logError(`LLM provider selection failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      // Create and run orchestrator agent
      const orchestrator = new OrchestratorAgent(llmProvider, browser, db);
      const taskId = randomUUID();

      const result = await orchestrator.execute({
        id: taskId,
        type: 'orchestrator',
        description: `Complete course: ${courseName}`,
        context: {
          courseName,
          courseUrl,
          llmProvider, // Pass LLM provider to all agents
        },
      });

      // Report result
      if (result.success) {
        logSuccess(result.message || 'Course completed successfully!');
        logInfo(`Duration: ${((result.durationMs || 0) / 1000).toFixed(1)} seconds`);
      } else {
        logError(result.error || result.message || 'Unknown error');
      }

      // Cleanup
      await browser.close();
      db.close();

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      logError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show course completion status')
  .action(() => {
    try {
      const config = loadConfig();
      initLogger(config.logging.level);

      const db = initializeDatabase(config.database);
      initializeRepositories();

      logInfo('Database status retrieved');
      db.close();
    } catch (error) {
      logError(`Status check failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show configuration')
  .action(() => {
    try {
      const config = getConfig();
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      logError(`Config error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });

// Parse command line
program.parse(process.argv);

// Show help if no args
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
