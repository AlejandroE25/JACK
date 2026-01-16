/**
 * Git Operations Wrapper
 * Provides safe git command execution for auto-update functionality
 */

import { execSync } from 'child_process';
import { CommitInfo } from '../types/update.js';
import { logger } from '../utils/logger.js';

export class GitChecker {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Fetch updates from remote without modifying working tree
   */
  async fetch(remote: string = 'origin'): Promise<void> {
    try {
      logger.info(`Fetching from remote: ${remote}`);
      execSync(`git fetch ${remote}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      logger.info(`Successfully fetched from ${remote}`);
    } catch (error: any) {
      logger.error(`Failed to fetch from ${remote}:`, error.message);
      throw new Error(`Git fetch failed: ${error.message}`);
    }
  }

  /**
   * Get the current local commit hash
   */
  async getLocalCommit(branch: string = 'HEAD'): Promise<string> {
    try {
      const commit = execSync(`git rev-parse ${branch}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return commit;
    } catch (error: any) {
      logger.error(`Failed to get local commit for ${branch}:`, error.message);
      throw new Error(`Failed to get local commit: ${error.message}`);
    }
  }

  /**
   * Get the remote commit hash
   */
  async getRemoteCommit(remote: string, branch: string): Promise<string> {
    try {
      const commit = execSync(`git rev-parse ${remote}/${branch}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return commit;
    } catch (error: any) {
      logger.error(`Failed to get remote commit for ${remote}/${branch}:`, error.message);
      throw new Error(`Failed to get remote commit: ${error.message}`);
    }
  }

  /**
   * Check if there are uncommitted local changes
   */
  async hasLocalChanges(): Promise<boolean> {
    try {
      const status = execSync('git status --porcelain', {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return status.length > 0;
    } catch (error: any) {
      logger.error('Failed to check for local changes:', error.message);
      throw new Error(`Failed to check local changes: ${error.message}`);
    }
  }

  /**
   * Check if there are unpushed commits
   */
  async hasUnpushedCommits(remote: string = 'origin', branch: string = 'main'): Promise<boolean> {
    try {
      const unpushed = execSync(`git log ${remote}/${branch}..HEAD --oneline`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return unpushed.length > 0;
    } catch (error: any) {
      logger.error('Failed to check for unpushed commits:', error.message);
      // If remote branch doesn't exist, there are no unpushed commits
      return false;
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = execSync('git branch --show-current', {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return branch;
    } catch (error: any) {
      logger.error('Failed to get current branch:', error.message);
      throw new Error(`Failed to get current branch: ${error.message}`);
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(remote: string, branch: string): Promise<void> {
    try {
      logger.info(`Pulling from ${remote}/${branch}...`);
      const output = execSync(`git pull ${remote} ${branch}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      logger.info(`Successfully pulled from ${remote}/${branch}`);
      logger.debug(`Git pull output: ${output}`);
    } catch (error: any) {
      logger.error(`Failed to pull from ${remote}/${branch}:`, error.message);
      throw new Error(`Git pull failed: ${error.message}`);
    }
  }

  /**
   * Reset working tree to specific commit (hard reset)
   */
  async resetHard(commit: string): Promise<void> {
    try {
      logger.warn(`Performing hard reset to commit: ${commit}`);
      execSync(`git reset --hard ${commit}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      logger.info(`Successfully reset to ${commit}`);
    } catch (error: any) {
      logger.error(`Failed to reset to ${commit}:`, error.message);
      throw new Error(`Git reset failed: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a commit
   */
  async getCommitInfo(commit: string): Promise<CommitInfo> {
    try {
      // Get commit details in custom format
      const format = '%H%n%h%n%an%n%ai%n%s';
      const output = execSync(`git show -s --format="${format}" ${commit}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const lines = output.trim().split('\n');
      if (lines.length < 5) {
        throw new Error('Unexpected git show output format');
      }

      const branch = await this.getCurrentBranch();

      return {
        hash: lines[0],
        shortHash: lines[1],
        author: lines[2],
        date: new Date(lines[3]),
        message: lines.slice(4).join('\n'),
        branch
      };
    } catch (error: any) {
      logger.error(`Failed to get commit info for ${commit}:`, error.message);
      throw new Error(`Failed to get commit info: ${error.message}`);
    }
  }

  /**
   * Get commit count between two commits
   */
  async getCommitCount(fromCommit: string, toCommit: string): Promise<number> {
    try {
      const output = execSync(`git rev-list --count ${fromCommit}..${toCommit}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return parseInt(output, 10);
    } catch (error: any) {
      logger.error('Failed to get commit count:', error.message);
      return 0;
    }
  }

  /**
   * Check if git repository is valid
   */
  async isValidRepository(): Promise<boolean> {
    try {
      execSync('git rev-parse --git-dir', {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the remote URL
   */
  async getRemoteUrl(remote: string = 'origin'): Promise<string> {
    try {
      const url = execSync(`git remote get-url ${remote}`, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
      return url;
    } catch (error: any) {
      logger.error(`Failed to get remote URL for ${remote}:`, error.message);
      throw new Error(`Failed to get remote URL: ${error.message}`);
    }
  }
}
