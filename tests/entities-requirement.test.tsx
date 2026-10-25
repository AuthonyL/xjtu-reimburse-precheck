// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RequirementRow } from '../src/renderer/src/claim/RequirementRow.js';

afterEach(cleanup);
it('材料行独立展示状态、规则和只读材料要求', () => {
  render(
    <RequirementRow
      dir="/synthetic"
      groupId="PCB"
      readOnly
      requirement={{
        id: 'synthetic-requirement',
        type: 'payment',
        ruleIds: ['R1'],
        reason: '合成支付记录要求',
        invoiceNumbers: [],
        foundFiles: [],
        candidateFiles: [],
        status: 'missing',
      }}
    />,
  );
  expect(screen.getByTestId('requirement-payment').textContent).toContain('✗ 缺失');
  expect(screen.getByText('R1')).toBeTruthy();
  expect(screen.getByText('合成支付记录要求')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
