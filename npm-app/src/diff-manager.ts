import { FileChange, FileChanges } from '@codebuff/common/actions'

/**
 * Singleton class for managing file changes and diffs throughout the application.
 * Provides centralized functionality for tracking, displaying, and managing file modifications.
 */
export class DiffManager {
  private static userInputChanges: FileChanges = []
  private static hookFiles: string[] = []
  private static userInputBeginning: boolean = false

  public static setChanges(userInputChanges: FileChanges): void {
    this.userInputChanges = [...userInputChanges]
  }

  public static startUserInput(): void {
    this.userInputBeginning = true
  }

  public static receivedResponse(): void {
    if (this.userInputBeginning) {
      this.userInputBeginning = false
      this.clearAllChanges()
    }
  }

  public static addChange(change: FileChange): void {
    if (this.userInputBeginning) {
      this.userInputBeginning = false
      this.clearAllChanges()
    }
    this.userInputChanges.push(change)
    this.hookFiles.push(change.path)
  }

  public static getChanges(): FileChanges {
    return [...this.userInputChanges]
  }

  public static getHookFiles(): string[] {
    return [...this.hookFiles]
  }

  public static clearAllChanges(): void {
    this.userInputChanges = []
    this.hookFiles = []
  }

  public static clearHookFiles(): void {
    this.hookFiles = []
  }
}
