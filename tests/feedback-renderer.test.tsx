// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FeedbackProvider, FeedbackPanel } from '../src/renderer/src/Feedback.js';
import { FindingList } from '../src/renderer/src/FindingItem.js';
import { RuleVersion, ruleVersionLabel } from '../src/renderer/src/RuleVersion.js';
import type { FeedbackRecord, FeedbackInput } from '../src/shared/feedback.js';
import { config, finding } from './helpers.js';
import { DEFAULT_BOC_URL } from '../src/main/store.js';
afterEach(cleanup);
const run = async (action: () => Promise<unknown>) => {
  await action();
};
it('反馈表单必填、保存后摘要显示已反馈，设置可见并删除，预览默认不带原文件', async () => {
  let records: FeedbackRecord[] = [];
  let originals: boolean | undefined;
  let exported = '';
  Object.assign(window, {
    precheck: {
      feedbackState: async () => ({ records, workspaceKey: 'workspace' }),
      markFeedback: async (input: FeedbackInput) => {
        records = [
          {
            ...input,
            directory: '.',
            id: 'one',
            recordedAt: '2026-01-02',
            workspaceKey: 'workspace',
            workspaceName: '合成根',
            ruleId: 'R2',
            message: '合成问题',
            action: '补材料',
            files: [],
            invoices: [],
            configHash: 'abc',
          },
        ];
        return { records, workspaceKey: 'workspace' };
      },
      deleteFeedback: async () => {
        records = [];
        return { records, workspaceKey: 'workspace' };
      },
      previewFeedback: async (include: boolean) => {
        originals = include;
        return {
          token: 'token',
          includeOriginals: include,
          files: [{ path: 'meta.json', size: 100 }],
          samples: [{ before: '合成人名', after: '人员A' }],
        };
      },
      exportFeedback: async (token: string) => {
        exported = token;
        return '/synthetic/反馈.zip';
      },
      cancelFeedback: async () => {},
    },
  });
  render(
    <FeedbackProvider revision="test" run={run}>
      <FindingList
        scope="/synthetic"
        run={run}
        findings={[
          {
            finding: finding({
              ruleId: 'R2',
              severity: 'warning',
              message: '合成问题',
              action: '补材料',
              files: [],
              invoiceNumbers: [],
            }),
          },
        ]}
      />
      <FeedbackPanel run={run} />
    </FeedbackProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /R2.*合成问题/ }));
  await user.click(screen.getByRole('button', { name: '这条不对' }));
  const dialog = screen.getByRole('dialog', { name: '这条不对' });
  expect(
    within(dialog).getByRole('textbox', { name: '反馈备注' }).getAttribute('required'),
  ).not.toBeNull();
  await user.type(within(dialog).getByRole('textbox', { name: '反馈备注' }), '这张票已有材料');
  await user.click(within(dialog).getByRole('button', { name: '保存反馈' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: /R2.*合成问题/ }).textContent).toContain('已反馈');
  expect(screen.getByText('这张票已有材料')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '导出反馈包' }));
  const preview = screen.getByRole('dialog', { name: '导出反馈包预览' });
  expect(originals).toBe(false);
  expect((within(preview).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  expect(preview.textContent).toContain('meta.json');
  expect(preview.textContent).toContain('人员A');
  await user.click(within(preview).getByRole('button', { name: '确认导出' }));
  await waitFor(() => expect(exported).toBe('token'));
  expect(screen.getByRole('status').textContent).toContain('请把这个文件发给维护者');
  await user.click(screen.getByRole('button', { name: '删除标记' }));
  await waitFor(() => expect(screen.queryByText('已反馈')).toBeNull());
});
it('规则版本显示哈希、自定义和导入来源，升级逐项选择', async () => {
  const version = {
    defaultsHash: 'abc12345def0',
    configHash: 'def123',
    customized: 2,
    imported: { file: '合成规则.json', importedAt: '2026-01-02T00:00:00Z' },
    upgrade: {
      fromHash: 'old',
      toHash: 'new',
      items: [
        { path: 'thresholds.inventory.value', oldDefault: 500, newDefault: 700, currentValue: 800 },
      ],
    },
  };
  expect(ruleVersionLabel(version)).toBe(
    '规则：默认 vabc12345 · 已自定义 2 项 · 导入自 合成规则.json 2026-01-02',
  );
  let chosen: unknown;
  let changed = 0;
  Object.assign(window, {
    precheck: {
      resolveRuleUpgrade: async (choices: unknown) => {
        chosen = choices;
        return { rules: config(), version: { ...version, upgrade: undefined } };
      },
    },
  });
  render(
    <RuleVersion
      version={version}
      settings={{ rules: config(), bocUrl: DEFAULT_BOC_URL }}
      run={run}
      rulesChanged={async () => {
        changed++;
      }}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /有新的默认规则/ }));
  expect((screen.getByRole('button', { name: '保存选择' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await user.selectOptions(screen.getByRole('combobox'), 'mine');
  await user.click(screen.getByRole('button', { name: '保存选择' }));
  await waitFor(() => expect(changed).toBe(1));
  expect(chosen).toEqual({ 'thresholds.inventory.value': 'mine' });
});
it('设置内接受升级后，草稿和后续保存同步为新规则，不恢复旧值', async () => {
  const { Settings } = await import('../src/renderer/src/Settings.js');
  const old = config();
  old.thresholds.inventory.value = 900;
  const next = config();
  next.thresholds.inventory.value = 700;
  let saved = 0;
  Object.assign(window, {
    precheck: {
      resolveRuleUpgrade: async () => ({
        rules: next,
        version: { defaultsHash: 'b'.repeat(64), configHash: 'c', customized: 0 },
      }),
      saveSettings: async (settings: { rules: typeof old; bocUrl: string }) => {
        saved = settings.rules.thresholds.inventory.value;
        return settings;
      },
    },
  });
  render(
    <Settings
      initial={{ rules: old, bocUrl: DEFAULT_BOC_URL }}
      userData="/synthetic"
      run={run}
      changed={async () => {}}
      version={{
        defaultsHash: 'b'.repeat(64),
        configHash: 'a',
        customized: 1,
        upgrade: {
          fromHash: 'a',
          toHash: 'b',
          items: [
            {
              path: 'thresholds.inventory.value',
              oldDefault: 500,
              newDefault: 700,
              currentValue: 900,
            },
          ],
        },
      }}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /有新的默认规则/ }));
  await user.selectOptions(screen.getByRole('combobox'), 'default');
  await user.click(screen.getByRole('button', { name: '保存选择' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(saved).toBe(700);
});
