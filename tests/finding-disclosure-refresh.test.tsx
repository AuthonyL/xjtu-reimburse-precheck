// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { checkBatch } from '../src/core/index.js';
import { batch, config } from './helpers.js';
import { finding, Harness, rows, item } from './disclosure-fixtures.js';
afterEach(cleanup);
it('同票多条查重提示可分别展开，删除或重排后保留对应来源的展开状态', async () => {
  const current = batch();
  const otherA = { ...batch(), id: '合成批次A' };
  const otherB = { ...batch(), id: '合成批次B' };
  const duplicates = checkBatch(current, config(), {
    otherBatches: [otherA, otherB],
    submittedHistory: new Set(['SYNTH-001']),
  }).findings.filter((f) => f.ruleId === 'dup');
  const result = render(<Harness findings={duplicates} />);
  const user = userEvent.setup();
  const a = screen.getByRole('button', { name: /与其他批次 合成批次A 重复/ });
  await user.click(a);
  expect(document.querySelectorAll('[class*="_findingDetails_"]')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: /已提交历史/ }));
  expect(document.querySelectorAll('[class*="_findingDetails_"]')).toHaveLength(2);
  result.rerender(
    <Harness
      findings={[
        duplicates[2]!,
        {
          ...duplicates[0]!,
          message: '与合成批次A重复：已在 合成批次A 报销（该批次已有学校报销单）',
        },
      ]}
    />,
  );
  expect(document.querySelectorAll('[class*="_findingDetails_"]')).toHaveLength(2);
  expect(
    screen.getByRole('button', { name: /与合成批次A重复/ }).getAttribute('aria-expanded'),
  ).toBe('true');
});

it('收起提示时清除仅在提示中可见的筛选，避免错误警告被无形筛选隐藏', async () => {
  const user = userEvent.setup();
  render(
    <Harness
      findings={[finding('F2', 'warning'), { ...finding('F1', 'info'), severity: 'info' }]}
    />,
  );
  await user.click(screen.getByRole('button', { name: '提示 1' }));
  await user.click(screen.getByRole('button', { name: '只看规则 F1' }));
  expect(screen.queryByRole('button', { name: /问题-warning/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: '提示 1' }));
  expect(item('warning')).toBeTruthy();
});

it('筛选规则在重查后变成折叠的提示时，自动恢复可见的问题列表', async () => {
  const user = userEvent.setup();
  const result = render(<Harness findings={rows} />);
  await user.click(screen.getByRole('button', { name: '只看规则 F2' }));
  result.rerender(<Harness findings={[{ ...rows[0]!, severity: 'info' }, rows[2]!]} />);
  expect(item('three')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /问题-one/ })).toBeNull();
});
