import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useWorkspaceStore } from '../store/workspace.js';
import { useRun } from '../store/status.js';
import type { CorrectionTarget } from '../../../core/correction/types.js';
import { problemKey } from '../../../core/correction/problems.js';
import {
  CorrectionNoticeProvider,
  useCorrectionNotice,
  receiptRecord,
} from '../CorrectionNotice.js';
import {
  CorrectionContext,
  type DialogState,
  type ProviderProps,
  type Request,
} from './context.js';
import { SingleFileDialog } from './SingleFileDialog.js';
export function CorrectionProvider(props: ProviderProps) {
  const notices = useCorrectionNotice();
  return notices ? (
    <CorrectionSession {...props} />
  ) : (
    <CorrectionNoticeProvider>
      <CorrectionSession {...props} />
    </CorrectionNoticeProvider>
  );
}
function CorrectionSession({ dir, disabled = false, children }: ProviderProps) {
  const run = useRun();
  const apply = useWorkspaceStore((state) => state.apply);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const token = useRef<string | null>(null);
  const working = useRef(false);
  const notify = useCorrectionNotice()!;
  useEffect(
    () => () => {
      if (token.current) void window.precheck.cancelCorrection(token.current).catch(() => {});
    },
    [],
  );
  const perform = (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    void run(async () => {
      try {
        await action();
      } finally {
        working.current = false;
      }
    });
  };
  const discard = async () => {
    if (token.current) {
      await window.precheck.cancelCorrection(token.current);
      token.current = null;
    }
  };
  const close = async () => {
    await discard();
    setDialog(null);
  };
  const simulate = async (source: string, targetId: string, targets: CorrectionTarget[]) => {
    await discard();
    const preview = await window.precheck.previewCorrection({
      dir,
      source,
      ...(targetId ? { targetId } : {}),
    });
    if (preview.status === 'checked') token.current = preview.token;
    if (preview.status === 'checked' && preview.passed) {
      try {
        const view = await apply(() => window.precheck.confirmCorrection(preview.token));
        if (!view) return;
        token.current = null;
        setDialog(null);
        notify({ dir, source, preview, record: receiptRecord(view, dir) });
      } catch (error) {
        await discard();
        setDialog({
          source,
          targetId,
          targets,
          message: '',
          preview: {
            ...preview,
            passed: false,
            blockers: [...preview.blockers, error instanceof Error ? error.message : String(error)],
          },
        });
      }
    } else
      setDialog({
        source,
        targetId,
        targets,
        preview,
        message: preview.status === 'needs-target' ? preview.message : '',
      });
  };
  const open = (request: Request = {}) =>
    perform(async () => {
      await discard();
      const targets = await window.precheck.correctionTargets(dir);
      const key = request.finding ? problemKey(request.finding, dir) : undefined;
      const selected =
        request.targetId ??
        targets.find(
          (t) =>
            (key
              ? t.findingKey === key
              : request.material
                ? t.groupId === request.material.groupId &&
                  t.attachmentType === request.material.type
                : false) &&
            (!request.file || t.relativePath === request.file),
        )?.id ??
        '';
      setDialog({ source: '', targetId: selected, targets, message: '', preview: null });
      if (request.source) await simulate(request.source, selected, targets);
    });
  const choose = () =>
    perform(async () => {
      const source = await window.precheck.chooseCorrectionFile();
      if (source && dialog) await simulate(source, dialog.targetId, dialog.targets);
    });
  const drop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files[0];
    if (file && dialog)
      perform(() =>
        simulate(window.precheck.droppedFilePath(file), dialog.targetId, dialog.targets),
      );
  };
  return (
    <CorrectionContext.Provider value={disabled ? null : open}>
      {children}
      {dialog && (
        <SingleFileDialog
          dialog={dialog}
          choose={choose}
          drop={drop}
          close={() => perform(close)}
          selectTarget={(targetId) => {
            setDialog({ ...dialog, targetId, preview: null, message: '' });
            if (dialog.source) perform(() => simulate(dialog.source, targetId, dialog.targets));
          }}
        />
      )}
    </CorrectionContext.Provider>
  );
}
