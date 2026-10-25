import { clipboard } from 'electron';
import { channels, type SidebarLayout } from '../shared/api.js';
import type { AttachmentType, ManualEntry } from '../core/types.js';
import type { LaborManualEntry } from '../core/labor/types.js';
import type { ClaimState } from '../core/domain/claim.js';
import type { ClaimMeta } from './claim-store.js';
import type { WorkspaceService } from './workspace.js';
import type { DesktopStore } from './store.js';

type Handle = <T extends unknown[]>(channel: string, fn: (...args: T) => unknown) => void;
export function registerWorkspaceIpc(
  handle: Handle,
  service: WorkspaceService,
  store: DesktopStore,
) {
  handle(channels.recheck, (dir?: string) => service.refresh(dir));
  handle(channels.selectBatch, (dir: string | null) => service.select(dir));
  handle(channels.saveLayout, (layout: Partial<SidebarLayout>) => store.saveLayout(layout));
  handle(channels.confirmAttachment, (dir: string, file: string, type: AttachmentType) =>
    service.confirm(dir, file, type),
  );
  handle(channels.saveRejectedReason, (number: string, reason: string) =>
    service.saveRejectedReason(number, reason),
  );
  handle(channels.saveManual, (dir: string, entry: ManualEntry) => service.manual(dir, entry));
  handle(channels.saveLabor, (dir: string, file: string, entry: LaborManualEntry) =>
    service.saveLabor(dir, file, entry),
  );
  handle(channels.exportLabor, (dir: string, file: string, entry?: LaborManualEntry) =>
    service.exportLabor(dir, file, entry),
  );
  handle(channels.copyText, (text: string) => {
    if (typeof text !== 'string' || text.length > 100000) throw new Error('复制文本不合法或过长');
    clipboard.writeText(text);
  });
  handle(channels.exportBatch, (dir: string) => service.export(dir));
  handle(channels.markSubmitted, (dir: string, marked = true) => {
    if (typeof marked !== 'boolean') throw new Error('提交标记必须为布尔值');
    return service.mark(dir, marked);
  });
  handle(channels.transitionClaim, (dir: string, to: ClaimState, note?: string) =>
    service.transitionClaim(dir, to, note),
  );
  handle(channels.updateClaim, (dir: string, meta: ClaimMeta) => service.updateClaim(dir, meta));
  handle(channels.waiveFinding, (dir: string, id: string, reason: string) =>
    service.waiveFinding(dir, id, reason),
  );
  handle(channels.unwaiveFinding, (dir: string, id: string) => service.unwaiveFinding(dir, id));
  handle(channels.inbox, () => service.inbox());
  handle(channels.ignoreFile, (dir: string, file: string) => service.ignoreFile(dir, file));
  handle(channels.unignoreFile, (dir: string, file: string) => service.unignoreFile(dir, file));
  handle(channels.registry, () => service.registry());
  handle(channels.exportLedger, () => service.exportLedger());
}
