/**
 * Auto-Update Monitor
 * Automatically checks for git updates, pulls changes, rebuilds, and restarts the service
 */

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitChecker } from './gitChecker.js';
import { ErrorRecoveryManager } from './errorRecoveryManager.js';
import {
  UpdateMonitorConfig,
  UpdateStatus,
  UpdateResult,
  BackupMetadata
} from '../types/update.js';
import { logger } from '../utils/logger.js';

export class UpdateMonitor extends EventEmitter {
  private config: UpdateMonitorConfig;
  private gitChecker: GitChecker;
  private recoveryManager: ErrorRecoveryManager;
  private intervalHandle?: NodeJS.Timeout;
  private isUpdating: boolean = false;
  private currentCommit: string = '';
  private lastCheckTime?: Date;
  private lastUpdateTime?: Date;
  private nextCheckTime?: Date;
  private lastError?: string;

  // Metrics
  private totalChecks: number = 0;
  private updatesApplied: number = 0;
  private updatesFailed: number = 0;
  private rollbacksPerformed: number = 0;

  constructor(recoveryManager: ErrorRecoveryManager, config: UpdateMonitorConfig) {
    super();
    this.config = config;
    this.recoveryManager = recoveryManager;
    this.gitChecker = new GitChecker();

    // Register with recovery manager
    this.recoveryManager.registerComponent('update_monitor');

    logger.info('UpdateMonitor initialized', {
      checkInterval: config.checkInterval,
      remote: config.remoteName,
      branch: config.remoteBranch
    });
  }

  /**
   * Start the update monitor
   */
  start(): void {
    if (this.intervalHandle) {
      logger.warn('UpdateMonitor already running');
      return;
    }

    logger.info(`UpdateMonitor started - checking every ${this.config.checkInterval}ms`);
    logger.info(`Auto-update check interval: ${this.config.checkInterval}ms`); // For dashboard parsing

    // Get initial commit
    this.gitChecker.getLocalCommit()
      .then(commit => {
        this.currentCommit = commit;
        logger.info(`Current commit: ${commit}`);
      })
      .catch(error => {
        logger.error('Failed to get initial commit:', error);
      });

    // Schedule periodic checks
    this.intervalHandle = setInterval(() => {
      this.runUpdateCheck().catch(error => {
        logger.error('Update check failed:', error);
      });
    }, this.config.checkInterval);

    // Calculate next check time
    this.nextCheckTime = new Date(Date.now() + this.config.checkInterval);

    // Perform initial check
    this.runUpdateCheck().catch(error => {
      logger.error('Initial update check failed:', error);
    });
  }

  /**
   * Stop the update monitor
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      logger.info('UpdateMonitor stopped');
    }
  }

  /**
   * Manually trigger an update check
   */
  async checkNow(): Promise<void> {
    logger.info('Manual update check triggered');
    await this.runUpdateCheck();
  }

  /**
   * Get current status
   */
  getStatus(): UpdateStatus {
    return {
      isRunning: !!this.intervalHandle,
      isUpdating: this.isUpdating,
      currentCommit: this.currentCommit,
      lastCheckTime: this.lastCheckTime,
      lastUpdateTime: this.lastUpdateTime,
      lastError: this.lastError,
      nextCheckTime: this.nextCheckTime,
      totalChecks: this.totalChecks,
      updatesApplied: this.updatesApplied,
      updatesFailed: this.updatesFailed,
      rollbacksPerformed: this.rollbacksPerformed
    };
  }

  /**
   * Main update check loop
   */
  private async runUpdateCheck(): Promise<void> {
    // Mutex lock to prevent concurrent updates
    if (this.isUpdating) {
      logger.warn('Update already in progress, skipping check');
      return;
    }

    this.lastCheckTime = new Date();
    this.totalChecks++;
    this.nextCheckTime = new Date(Date.now() + this.config.checkInterval);

    logger.info('Update check started');
    this.emit('update_check_started');

    try {
      // Fetch remote
      await this.gitChecker.fetch(this.config.remoteName);

      // Get local and remote commits
      const localCommit = await this.gitChecker.getLocalCommit();
      const remoteCommit = await this.gitChecker.getRemoteCommit(
        this.config.remoteName,
        this.config.remoteBranch
      );

      logger.debug(`Local: ${localCommit.substring(0, 7)}, Remote: ${remoteCommit.substring(0, 7)}`);

      // Check if update is available
      if (localCommit === remoteCommit) {
        logger.info('No updates available');
        this.emit('update_check_completed', {
          hasUpdate: false,
          localCommit,
          remoteCommit: undefined
        });
        this.recoveryManager.recordSuccess('update_monitor');
        return;
      }

      // Update available!
      logger.info(`Update available: ${localCommit.substring(0, 7)} -> ${remoteCommit.substring(0, 7)}`);

      const localInfo = await this.gitChecker.getCommitInfo(localCommit);
      const remoteInfo = await this.gitChecker.getCommitInfo(remoteCommit);

      this.emit('update_check_completed', {
        hasUpdate: true,
        localCommit,
        remoteCommit
      });

      this.emit('update_available', {
        localCommit: localInfo,
        remoteCommit: remoteInfo
      });

      // Execute update
      await this.executeUpdate(localCommit, remoteCommit);

    } catch (error: any) {
      this.lastError = error.message;
      logger.error('Update check failed:', error);
      this.recoveryManager.recordFailure('update_monitor', error, {
        phase: 'check'
      });
    }
  }

  /**
   * Execute the update process
   */
  private async executeUpdate(fromCommit: string, toCommit: string): Promise<void> {
    // Validate update conditions
    const canUpdate = await this.validateUpdateConditions();
    if (!canUpdate) {
      return;
    }

    // Acquire update lock
    this.isUpdating = true;

    const startTime = new Date();
    let backupPath: string | undefined;

    logger.warn(`Starting update: ${fromCommit.substring(0, 7)} -> ${toCommit.substring(0, 7)}`);

    this.emit('update_started', {
      fromCommit,
      toCommit
    });

    try {
      // Create backup if enabled
      if (this.config.backupBeforeUpdate) {
        backupPath = await this.createBackup(fromCommit);
      }

      // Perform the update
      const result = await this.performUpdate(fromCommit, toCommit, startTime, backupPath);

      if (result.success) {
        this.updatesApplied++;
        this.lastUpdateTime = new Date();
        this.currentCommit = toCommit;
        logger.info('Update completed successfully');
        this.emit('update_completed', result);
        this.recoveryManager.recordSuccess('update_monitor');
      } else {
        throw new Error(result.error || 'Update failed');
      }

    } catch (error: any) {
      this.updatesFailed++;
      this.lastError = error.message;
      logger.error('Update failed:', error);

      // Attempt rollback if backup exists
      if (backupPath) {
        try {
          logger.warn('Attempting rollback...');
          await this.rollback(fromCommit, backupPath);
        } catch (rollbackError: any) {
          logger.error('Rollback failed:', rollbackError);
        }
      }

      const failedResult: UpdateResult = {
        success: false,
        previousCommit: fromCommit,
        newCommit: toCommit,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        error: error.message,
        rolledBack: !!backupPath,
        backupPath
      };

      this.emit('update_failed', {
        phase: 'execution',
        error,
        result: failedResult
      });

      this.recoveryManager.recordFailure('update_monitor', error, {
        phase: 'update',
        fromCommit,
        toCommit
      });

    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Validate that update can proceed
   */
  private async validateUpdateConditions(): Promise<boolean> {
    try {
      // Check for local uncommitted changes
      const hasLocalChanges = await this.gitChecker.hasLocalChanges();
      if (hasLocalChanges && !this.config.allowLocalChanges) {
        logger.warn('Update blocked: local changes detected');
        this.emit('update_blocked', {
          reason: 'local_changes',
          message: 'Local uncommitted changes detected. Set AUTO_UPDATE_ALLOW_LOCAL_CHANGES=true to override.'
        });
        return false;
      }

      // Check for unpushed commits
      const hasUnpushed = await this.gitChecker.hasUnpushedCommits(
        this.config.remoteName,
        this.config.remoteBranch
      );
      if (hasUnpushed) {
        logger.warn('Update blocked: unpushed commits detected');
        this.emit('update_blocked', {
          reason: 'unpushed_commits',
          message: 'Unpushed commits detected. Push or discard them before auto-update can proceed.'
        });
        return false;
      }

      return true;

    } catch (error: any) {
      logger.error('Failed to validate update conditions:', error);
      this.emit('update_blocked', {
        reason: 'network_error',
        message: `Validation failed: ${error.message}`
      });
      return false;
    }
  }

  /**
   * Create backup before update
   */
  private async createBackup(commitHash: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const backupDir = path.join(process.cwd(), '.backups', `backup-${timestamp}`);

    logger.info(`Creating backup at: ${backupDir}`);

    try {
      // Create backup directory
      await fs.mkdir(backupDir, { recursive: true });

      // Copy dist/ directory
      const distPath = path.join(process.cwd(), 'dist');
      const backupDistPath = path.join(backupDir, 'dist');

      if (await this.pathExists(distPath)) {
        await this.copyDirectory(distPath, backupDistPath);
        logger.debug('Copied dist/ directory to backup');
      }

      // Read package.json for version
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageData = JSON.parse(await fs.readFile(packagePath, 'utf-8'));

      // Save metadata
      const metadata: BackupMetadata = {
        timestamp: new Date(),
        commitHash,
        branch: await this.gitChecker.getCurrentBranch(),
        version: packageData.version || 'unknown',
        reason: 'auto-update',
        path: backupDir
      };

      await fs.writeFile(
        path.join(backupDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      logger.info('Backup created successfully');
      this.emit('backup_created', { path: backupDir, metadata });

      // Clean up old backups
      await this.cleanupOldBackups();

      return backupDir;

    } catch (error: any) {
      logger.error('Failed to create backup:', error);
      throw new Error(`Backup creation failed: ${error.message}`);
    }
  }

  /**
   * Perform the actual update: pull, build, restart
   */
  private async performUpdate(
    fromCommit: string,
    toCommit: string,
    startTime: Date,
    backupPath?: string
  ): Promise<UpdateResult> {
    let buildOutput = '';
    let buildErrors = '';

    try {
      // Pull changes
      logger.info(`Pulling changes from ${this.config.remoteName}/${this.config.remoteBranch}...`);
      await this.gitChecker.pull(this.config.remoteName, this.config.remoteBranch);

      // Build project
      logger.info('Building project...');
      try {
        buildOutput = execSync('npm run build', {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: this.config.buildTimeout,
          stdio: 'pipe'
        });
        logger.info('Build completed successfully');
      } catch (buildError: any) {
        buildErrors = buildError.stderr || buildError.message;
        throw new Error(`Build failed: ${buildErrors}`);
      }

      // Wait before restarting
      await this.delay(this.config.restartDelay);

      // Restart service
      logger.warn('Restarting service...');
      try {
        execSync('nssm restart proPACE', {
          cwd: process.cwd(),
          encoding: 'utf8',
          stdio: 'pipe'
        });
        logger.info('Service restart initiated');
      } catch (restartError: any) {
        logger.error('Failed to restart service:', restartError);
        // Note: This may fail if we're being shut down, which is expected
      }

      // Return success result
      return {
        success: true,
        previousCommit: fromCommit,
        newCommit: toCommit,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        rolledBack: false,
        backupPath,
        buildOutput
      };

    } catch (error: any) {
      return {
        success: false,
        previousCommit: fromCommit,
        newCommit: toCommit,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
        error: error.message,
        rolledBack: false,
        backupPath,
        buildOutput,
        buildErrors
      };
    }
  }

  /**
   * Rollback to previous version
   */
  private async rollback(commitHash: string, backupPath: string): Promise<void> {
    logger.warn(`Rolling back to commit: ${commitHash}`);

    this.emit('rollback_started', {
      reason: 'Update failed',
      backupPath
    });

    try {
      // Stop service
      try {
        execSync('nssm stop proPACE', {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        await this.delay(2000); // Wait for service to stop
      } catch (error) {
        logger.warn('Service may not be running');
      }

      // Git reset to previous commit
      await this.gitChecker.resetHard(commitHash);

      // Restore dist/ from backup
      const backupDistPath = path.join(backupPath, 'dist');
      const currentDistPath = path.join(process.cwd(), 'dist');

      if (await this.pathExists(backupDistPath)) {
        // Remove current dist
        if (await this.pathExists(currentDistPath)) {
          await fs.rm(currentDistPath, { recursive: true, force: true });
        }
        // Restore from backup
        await this.copyDirectory(backupDistPath, currentDistPath);
        logger.info('Restored dist/ from backup');
      }

      // Restart service
      execSync('nssm start proPACE', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      this.rollbacksPerformed++;
      logger.info('Rollback completed successfully');

      this.emit('rollback_completed', {
        success: true,
        restoredCommit: commitHash
      });

    } catch (error: any) {
      logger.error('Rollback failed:', error);
      this.emit('rollback_completed', {
        success: false,
        restoredCommit: commitHash
      });
      throw error;
    }
  }

  /**
   * Clean up old backups
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupsDir = path.join(process.cwd(), '.backups');

      if (!(await this.pathExists(backupsDir))) {
        return;
      }

      const entries = await fs.readdir(backupsDir, { withFileTypes: true });
      const backups = entries
        .filter(entry => entry.isDirectory() && entry.name.startsWith('backup-'))
        .map(entry => ({
          name: entry.name,
          path: path.join(backupsDir, entry.name)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Newest first

      // Keep only maxBackups
      const toDelete = backups.slice(this.config.maxBackups);

      for (const backup of toDelete) {
        logger.info(`Deleting old backup: ${backup.name}`);
        await fs.rm(backup.path, { recursive: true, force: true });
      }

      if (toDelete.length > 0) {
        logger.info(`Cleaned up ${toDelete.length} old backup(s)`);
      }

    } catch (error: any) {
      logger.error('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Helper: Check if path exists
   */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Helper: Delay for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
