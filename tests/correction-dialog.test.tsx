// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CorrectionModal } from '../src/renderer/src/correction/CorrectionModal.js';
import { FeedbackDialog } from '../src/renderer/src/feedback/FeedbackDialog.js';

afterEach(cleanup);

it('单文件对话框聚焦标题、约束 Tab、Escape 关闭后回到入口', async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>检查入口</button>
        {open && (
          <CorrectionModal title="检查单个文件" close={() => setOpen(false)}>
            <button>选择文件</button>
            <button onClick={() => setOpen(false)}>取消</button>
          </CorrectionModal>
        )}
      </>
    );
  }
  render(<Example />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: '检查入口' });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: '检查单个文件' });
  expect(document.activeElement).toBe(within(dialog).getByRole('heading'));
  await user.tab();
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '选择文件' }));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('反馈对话框优先聚焦备注，Escape 保留关闭操作', async () => {
  function Example() {
    const [open, setOpen] = useState(true);
    return open ? (
      <FeedbackDialog title="这条不对" close={() => setOpen(false)}>
        <textarea aria-label="反馈备注" />
      </FeedbackDialog>
    ) : null;
  }
  render(<Example />);
  const user = userEvent.setup();
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '反馈备注' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});
