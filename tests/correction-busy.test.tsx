// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CorrectionAction, CorrectionProvider } from '../src/renderer/src/SingleFileCheck.js';
import { useStatusStore } from '../src/renderer/src/store/status.js';
import type { CorrectionPreview } from '../src/core/correction/types.js';

afterEach(cleanup);
it('纠错检查等待期间保留原 fieldset 的禁用边界', async () => {
  let finish!: (preview: CorrectionPreview) => void;
  const pending = new Promise<CorrectionPreview>((resolve) => (finish = resolve));
  Object.assign(window, {
    precheck: {
      correctionTargets: async () => [
        { id: 'first', label: '合成目标', kind: 'attachment', folder: 'AI' },
      ],
      chooseCorrectionFile: async () => '/synthetic/new.pdf',
      previewCorrection: () => pending,
      cancelCorrection: async () => {},
    },
  });
  useStatusStore.setState({ busy: false });
  function Harness() {
    const busy = useStatusStore((state) => state.busy);
    return (
      <fieldset disabled={busy}>
        <CorrectionProvider dir="/synthetic">
          <CorrectionAction global />
        </CorrectionProvider>
      </fieldset>
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '检查单个文件' }));
  const dialog = screen.getByRole('dialog');
  const target = within(dialog).getByRole('combobox') as HTMLSelectElement;
  await user.selectOptions(target, 'first');
  await user.click(within(dialog).getByRole('button', { name: '或从文件夹选择…' }));
  expect(target.matches(':disabled')).toBe(true);
  expect(within(dialog).getByRole('button', { name: '或从文件夹选择…' }).matches(':disabled')).toBe(
    true,
  );
  expect(within(dialog).getByRole('button', { name: '取消' }).matches(':disabled')).toBe(true);
  expect(target.value).toBe('first');
  finish({
    status: 'checked',
    token: 'synthetic-token',
    passed: false,
    resolved: false,
    target: '合成目标',
    destination: '/synthetic/new.pdf',
    operations: [],
    added: [],
    remaining: [],
    blockers: ['合成检查未通过'],
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '关闭' }).matches(':disabled')).toBe(false),
  );
});
