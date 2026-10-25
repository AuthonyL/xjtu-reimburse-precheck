import type { Batch } from '../core/types.js';
import type { BatchView, WorkspaceView } from '../shared/api.js';
import type { Registry } from '../core/domain/registry.js';
import { samePath } from '../core/fs-path.js';
import type { WorkspaceLocation } from './paths.js';
import { LaborService } from './labor-service.js';
import { SerialQueue } from './json-store.js';
import { DesktopStore } from './store.js';
import { RegistryStore } from './registry.js';

export abstract class WorkspaceState {
  protected location: WorkspaceLocation | null = null;
  protected view: WorkspaceView | null = null;
  protected scans = new Map<string, Batch>();
  protected rejected: Batch | null = null;
  protected laborService = new LaborService();
  readonly queue = new SerialQueue();
  protected registryStore: RegistryStore;
  protected registryView: Registry = { version: 1, entries: [] };
  constructor(readonly store: DesktopStore) {
    this.registryStore = new RegistryStore(store.dir);
  }

  currentWorkspace(): WorkspaceView | null {
    return this.view;
  }

  batch(dir: string): BatchView {
    if (samePath(this.view?.rejected?.batch.dir, dir))
      throw new Error('无法报销费用为只读参考目录');
    const batch = this.view?.batches.find((v) => samePath(v.batch.dir, dir));
    if (!batch) throw new Error('批次不属于当前打开的工作区，请重新打开');
    return batch;
  }
  abstract refresh(dir?: string, cached?: boolean): Promise<WorkspaceView>;
}
