export interface StrategyState {
  sessionId: string;
  strategyId: string;
  userId: string;
  state: Record<string, unknown>;
  timestamp: number;
  version: number;
}

export interface StateBackup {
  id: string;
  strategyName: string;
  strategyId: string;
  state: StrategyState;
  createdAt: number;
}

export class StateManager {
  private static readonly STORAGE_KEY = 'xpersona_strategy_states';
  private static readonly BACKUP_KEY = 'xpersona_strategy_backups';
  private static readonly VERSION_KEY = 'xpersona_state_version';
  private static readonly CURRENT_VERSION = 1;

  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(autoSaveMs: number = 5000) {
    if (autoSaveMs > 0) {
      this.autoSaveInterval = setInterval(() => {
        this.cleanupOldStates();
      }, autoSaveMs);
    }
  }

  saveState(state: StrategyState): void {
    try {
      const states = this.getAllStates();
      states[state.sessionId] = state;
      
      localStorage.setItem(StateManager.STORAGE_KEY, JSON.stringify(states));
      console.log(`[StateManager] State saved for session ${state.sessionId}`);
    } catch (error) {
      console.error('[StateManager] Failed to save state:', error);
      
      if (this.isQuotaExceeded(error)) {
        this.cleanupOldStates();
        this.saveState(state);
      }
    }
  }

  loadState(sessionId: string): StrategyState | null {
    try {
      const states = this.getAllStates();
      const state = states[sessionId];
      
      if (state) {
        console.log(`[StateManager] State loaded for session ${sessionId}`);
        return state;
      }
      
      return null;
    } catch (error) {
      console.error('[StateManager] Failed to load state:', error);
      return null;
    }
  }

  deleteState(sessionId: string): void {
    try {
      const states = this.getAllStates();
      delete states[sessionId];
      
      localStorage.setItem(StateManager.STORAGE_KEY, JSON.stringify(states));
      console.log(`[StateManager] State deleted for session ${sessionId}`);
    } catch (error) {
      console.error('[StateManager] Failed to delete state:', error);
    }
  }

  exportState(sessionId: string): string | null {
    const state = this.loadState(sessionId);
    if (!state) return null;
    
    const exportData = {
      version: StateManager.CURRENT_VERSION,
      exportedAt: new Date().toISOString(),
      state
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  importState(json: string): StrategyState | null {
    try {
      const data = JSON.parse(json);
      
      if (!data.state || !data.version) {
        throw new Error('Invalid state export format');
      }
      
      if (data.version > StateManager.CURRENT_VERSION) {
        console.warn(`[StateManager] State version ${data.version} newer than current ${StateManager.CURRENT_VERSION}`);
      }
      
      return data.state;
    } catch (error) {
      console.error('[StateManager] Failed to import state:', error);
      return null;
    }
  }

  createBackup(state: StrategyState, strategyName: string): string {
    const backup: StateBackup = {
      id: this.generateBackupId(),
      strategyName,
      strategyId: state.strategyId,
      state,
      createdAt: Date.now()
    };
    
    try {
      const backups = this.getAllBackups();
      backups.unshift(backup);
      
      const maxBackups = 10;
      if (backups.length > maxBackups) {
        backups.splice(maxBackups);
      }
      
      localStorage.setItem(StateManager.BACKUP_KEY, JSON.stringify(backups));
      console.log(`[StateManager] Backup created: ${backup.id}`);
      
      return backup.id;
    } catch (error) {
      console.error('[StateManager] Failed to create backup:', error);
      return '';
    }
  }

  restoreBackup(backupId: string): StrategyState | null {
    try {
      const backups = this.getAllBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (backup) {
        console.log(`[StateManager] Backup restored: ${backupId}`);
        return backup.state;
      }
      
      return null;
    } catch (error) {
      console.error('[StateManager] Failed to restore backup:', error);
      return null;
    }
  }

  listBackups(): StateBackup[] {
    return this.getAllBackups();
  }

  deleteBackup(backupId: string): void {
    try {
      const backups = this.getAllBackups();
      const filtered = backups.filter(b => b.id !== backupId);
      
      localStorage.setItem(StateManager.BACKUP_KEY, JSON.stringify(filtered));
      console.log(`[StateManager] Backup deleted: ${backupId}`);
    } catch (error) {
      console.error('[StateManager] Failed to delete backup:', error);
    }
  }

  getVersionHistory(sessionId: string): StrategyState[] {
    const backups = this.getAllBackups();
    return backups
      .filter(b => b.state.sessionId === sessionId)
      .map(b => b.state)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  exportAllBackups(): string {
    const backups = this.getAllBackups();
    return JSON.stringify(backups, null, 2);
  }

  clearAll(): void {
    try {
      localStorage.removeItem(StateManager.STORAGE_KEY);
      localStorage.removeItem(StateManager.BACKUP_KEY);
      localStorage.removeItem(StateManager.VERSION_KEY);
      console.log('[StateManager] All states cleared');
    } catch (error) {
      console.error('[StateManager] Failed to clear states:', error);
    }
  }

  cleanupOldStates(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    try {
      const states = this.getAllStates();
      const cutoff = Date.now() - maxAgeMs;
      
      let cleaned = false;
      for (const sessionId in states) {
        if (states[sessionId].timestamp < cutoff) {
          delete states[sessionId];
          cleaned = true;
        }
      }
      
      if (cleaned) {
        localStorage.setItem(StateManager.STORAGE_KEY, JSON.stringify(states));
        console.log('[StateManager] Cleaned up old states');
      }
    } catch (error) {
      console.error('[StateManager] Failed to cleanup states:', error);
    }
  }

  getStats(): {
    activeStates: number;
    totalBackups: number;
    storageUsage: number;
  } {
    const states = this.getAllStates();
    const backups = this.getAllBackups();
    
    const storageUsage = (
      JSON.stringify(states).length + 
      JSON.stringify(backups).length
    );
    
    return {
      activeStates: Object.keys(states).length,
      totalBackups: backups.length,
      storageUsage
    };
  }

  dispose(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  private getAllStates(): Record<string, StrategyState> {
    try {
      const data = localStorage.getItem(StateManager.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[StateManager] Failed to parse states:', error);
      return {};
    }
  }

  private getAllBackups(): StateBackup[] {
    try {
      const data = localStorage.getItem(StateManager.BACKUP_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[StateManager] Failed to parse backups:', error);
      return [];
    }
  }

  private generateBackupId(): string {
    return `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isQuotaExceeded(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
       error.name === 'NS_ERROR_DOM' ||
       error.name === 'NS_ERROR_FILE_QUOTA_EXCEEDED')
    );
  }
}

export default StateManager;
