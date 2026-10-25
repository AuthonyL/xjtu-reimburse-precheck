// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FeedbackProvider, useFindingFeedback } from '../src/renderer/src/Feedback.js';
import { finding } from './helpers.js';

afterEach(cleanup);
it('反馈保存失败后取消仍显示原来的外部错误消息', async () => {
  Object.assign(window, {
    precheck: {
      feedbackState: async () => ({ records: [], workspaceKey: null }),
      markFeedback: async () => {
        throw new Error('合成保存失败');
      },
    },
  });
  function Entry() {
    const feedback = useFindingFeedback(finding(), '/synthetic');
    return <button onClick={feedback.mark}>反馈入口</button>;
  }
  render(
    <FeedbackProvider>
      <Entry />
    </FeedbackProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '反馈入口' }));
  await user.type(screen.getByRole('textbox', { name: '反馈备注' }), '合成备注');
  await user.click(screen.getByRole('button', { name: '保存反馈' }));
  expect((await screen.findByRole('alert')).textContent).toContain('合成保存失败');
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('alert').textContent).toContain('反馈记录读取失败：Error: 合成保存失败');
});
