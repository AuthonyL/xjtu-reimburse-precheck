import { defaultClaim } from '../src/core/domain/claim.js';
// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Collapsible } from '../src/renderer/src/Collapsible.js';
import { DisclosureProvider, type DisclosureState } from '../src/renderer/src/disclosures.js';
import { Results } from '../src/renderer/src/Results.js';
import { buildReport, checkBatch } from '../src/core/index.js';
import { batch, config, invoice } from './helpers.js';
afterEach(cleanup);
const run = async (action: () => Promise<unknown>) => {
  await action();
};
function Harness({ dir }: { dir: string }) {
  const [state, setState] = useState<DisclosureState>({});
  return (
    <DisclosureProvider state={state} setState={setState}>
      <Collapsible scope={dir} disclosureKey="details" title="合成段落" summary="2 个">
        <input aria-label="草稿" defaultValue="" />
      </Collapsible>
    </DisclosureProvider>
  );
}
it('默认收起、概述数字可见、按目录记住状态，收起不丢未保存的表单', async () => {
  const user = userEvent.setup();
  const result = render(<Harness dir="/A" />);
  const toggle = () => screen.getByRole('button', { name: /合成段落.*2 个/ });
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('textbox', { name: '草稿' })).toBeNull();
  await user.click(toggle());
  await user.type(screen.getByLabelText('草稿'), '未保存');
  await user.click(toggle());
  await user.click(toggle());
  expect((screen.getByLabelText('草稿') as HTMLInputElement).value).toBe('未保存');
  result.rerender(<Harness dir="/B" />);
  expect(toggle().getAttribute('aria-expanded')).toBe('false');
  result.rerender(<Harness dir="/A" />);
  expect(toggle().getAttribute('aria-expanded')).toBe('true');
});
it('批次所有组与详细段落默认收起，展开后发票序号按显示顺序连续', async () => {
  const b = batch([invoice(), invoice({ number: 'SYNTH-002' })], 'PCB');
  const report = buildReport(checkBatch(b, config()));
  render(
    <Results
      view={{
        batch: b,
        report,
        claim: defaultClaim('synthetic-view', '2026-01-01'),
        waived: 0,
        markedAt: null,
        outputs: ['/synthetic/_预检/汇总.md'],
        manualTasks: [],
      }}
      settings={{ rules: config(), bocUrl: 'https://example.invalid' }}
      run={run}
      update={() => {}}
      back={() => {}}
    />,
  );
  expect(
    within(screen.getByTestId('group-PCB'))
      .getByRole('button', { name: /PCB/ })
      .getAttribute('aria-expanded'),
  ).toBe('false');
  for (const label of ['发票明细', '手填与汇率', '输出文件'])
    expect(
      screen.getByRole('button', { name: new RegExp('^' + label) }).getAttribute('aria-expanded'),
    ).toBe('false');
  expect(screen.getByRole('button', { name: /发票明细/ }).textContent).toContain('2 张');
  expect(screen.getByRole('button', { name: /^输出文件/ }).textContent).toContain('1 个');
  expect(screen.queryByRole('table')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: /发票明细/ }));
  const table = screen.getByRole('table', { name: '发票明细' });
  expect(within(table).getAllByRole('columnheader')[0]!.textContent).toBe('序号');
  expect(
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]!.textContent),
  ).toEqual(['1', '2']);
});

it('批次重查时保留段落展开状态和新的概述数字', async () => {
  const user = userEvent.setup();
  const b = batch();
  const report = buildReport(checkBatch(b, config()));
  const renderView = (outputs: string[]) => (
    <Results
      view={{
        batch: b,
        report,
        claim: defaultClaim('synthetic-view', '2026-01-01'),
        waived: 0,
        markedAt: null,
        outputs,
        manualTasks: [],
      }}
      run={run}
      update={() => {}}
      back={() => {}}
    />
  );
  const result = render(renderView([]));
  await user.click(screen.getByRole('button', { name: /^输出文件/ }));
  result.rerender(renderView(['/synthetic/_预检/a.xlsx']));
  const button = screen.getByRole('button', { name: /^输出文件/ });
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(button.textContent).toContain('1 个');
});
