// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { StatementCard } from '../src/renderer/src/labor/StatementCard.js';
import { checkLabor } from '../src/core/labor/engine.js';
import { loadConfig } from '../src/core/rules/config.js';
import { laborScan } from './labor-fixtures.js';

afterEach(cleanup);
it('情况说明卡片保留序号、文件身份和默认收起的字段区', () => {
  const config = loadConfig();
  const report = checkLabor(laborScan(), config);
  const entry = report.entries[0]!;
  render(
    <StatementCard
      entry={entry}
      ordinal={2}
      dir={report.dir}
      config={config}
      attachments={report.attachments}
      otherFiles={{}}
    />,
  );
  const card = screen.getByTestId('labor-entry');
  expect(card.getAttribute('data-labor-file')).toBe(entry.relativePath);
  expect(within(card).getByTestId('labor-ordinal').textContent).toBe('2.');
  expect(
    within(card)
      .getByRole('button', { name: /^抽取字段与手动补充/ })
      .getAttribute('aria-expanded'),
  ).toBe('false');
  expect(within(card).queryByRole('textbox', { name: '姓名' })).toBeNull();
});
