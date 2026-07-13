import { useSyncExternalStore } from "react";

export interface EditorCommand {
  readonly label: string;
  execute(): void;
  undo(): void;
}

interface HistorySnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

export class CommandManager {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private listeners = new Set<() => void>();
  private snapshot: HistorySnapshot = { canUndo: false, canRedo: false };

  execute(command: EditorCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    this.emit();
  }

  commitExecuted(command: EditorCommand): void {
    this.undoStack.push(command);
    this.redoStack = [];
    this.emit();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.emit();
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
    this.emit();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HistorySnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.label,
      redoLabel: this.redoStack.at(-1)?.label,
    };
    for (const listener of this.listeners) listener();
  }
}

export const commandManager = new CommandManager();

export const useCommandHistory = (): HistorySnapshot =>
  useSyncExternalStore(
    commandManager.subscribe,
    commandManager.getSnapshot,
    commandManager.getSnapshot,
  );
