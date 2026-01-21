/**
 * Type definitions for the auto-update system
 */

/**
 * Configuration for the UpdateMonitor
 */
export interface UpdateMonitorConfig {
  /** Enable auto-update functionality */
  enabled: boolean;

  /** Interval between update checks in milliseconds (default: 300000 = 5 minutes) */
  checkInterval: number;

  /** Git remote name (default: 'origin') */
  remoteName: string;

  /** Git branch to track (default: 'main') */
  remoteBranch: string;

  /** Allow updates even if local changes exist (default: false) */
  allowLocalChanges: boolean;

  /** Create backup before performing update (default: true) */
  backupBeforeUpdate: boolean;

  /** Maximum number of backups to keep (default: 5) */
  maxBackups: number;

  /** Build timeout in milliseconds (default: 180000 = 3 minutes) */
  buildTimeout: number;

  /** Delay before restarting service in milliseconds (default: 5000 = 5 seconds) */
  restartDelay: number;
}

/**
 * Current status of the UpdateMonitor
 */
export interface UpdateStatus {
  /** Whether the monitor is currently running */
  isRunning: boolean;

  /** Whether an update is currently in progress */
  isUpdating: boolean;

  /** Current local commit hash */
  currentCommit: string;

  /** Last time an update check was performed */
  lastCheckTime?: Date;

  /** Last time an update was successfully applied */
  lastUpdateTime?: Date;

  /** Last error that occurred */
  lastError?: string;

  /** Next scheduled check time */
  nextCheckTime?: Date;

  /** Total number of checks performed */
  totalChecks: number;

  /** Total number of updates applied */
  updatesApplied: number;

  /** Total number of update failures */
  updatesFailed: number;

  /** Total number of rollbacks performed */
  rollbacksPerformed: number;
}

/**
 * Result of an update operation
 */
export interface UpdateResult {
  /** Whether the update was successful */
  success: boolean;

  /** Previous commit hash (before update) */
  previousCommit: string;

  /** New commit hash (after update) */
  newCommit: string;

  /** Timestamp when update started */
  startTime: Date;

  /** Timestamp when update completed */
  endTime: Date;

  /** Duration of update in milliseconds */
  duration: number;

  /** Error message if update failed */
  error?: string;

  /** Whether a rollback was performed */
  rolledBack: boolean;

  /** Path to backup created (if any) */
  backupPath?: string;

  /** Build output (stdout) */
  buildOutput?: string;

  /** Build errors (stderr) */
  buildErrors?: string;
}

/**
 * Information about a git commit
 */
export interface CommitInfo {
  /** Commit hash */
  hash: string;

  /** Short commit hash (first 7 characters) */
  shortHash: string;

  /** Commit author */
  author: string;

  /** Commit date */
  date: Date;

  /** Commit message */
  message: string;

  /** Branch name */
  branch: string;
}

/**
 * Metadata stored with each backup
 */
export interface BackupMetadata {
  /** Timestamp when backup was created */
  timestamp: Date;

  /** Commit hash at time of backup */
  commitHash: string;

  /** Branch name at time of backup */
  branch: string;

  /** Version string (from package.json) */
  version: string;

  /** Reason for backup ('auto-update' | 'manual') */
  reason: string;

  /** Path to backup directory */
  path: string;
}

/**
 * Event payloads emitted by UpdateMonitor
 */
export interface UpdateEventPayloads {
  update_check_started: void;

  update_check_completed: {
    hasUpdate: boolean;
    localCommit: string;
    remoteCommit?: string;
  };

  update_available: {
    localCommit: CommitInfo;
    remoteCommit: CommitInfo;
  };

  update_blocked: {
    reason: 'local_changes' | 'unpushed_commits' | 'network_error' | 'update_in_progress';
    message: string;
  };

  update_started: {
    fromCommit: string;
    toCommit: string;
  };

  update_completed: UpdateResult;

  update_failed: {
    phase: 'fetch' | 'pull' | 'build' | 'restart' | 'verify';
    error: Error;
    result: UpdateResult;
  };

  rollback_started: {
    reason: string;
    backupPath: string;
  };

  rollback_completed: {
    success: boolean;
    restoredCommit: string;
  };

  backup_created: {
    path: string;
    metadata: BackupMetadata;
  };
}
