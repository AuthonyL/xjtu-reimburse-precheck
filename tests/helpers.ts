import type { Batch, Finding, Invoice, InvoiceLine, AttachmentType } from '../src/core/types.js';
import { withFindingId } from '../src/core/domain/finding-id.js';
import { loadConfig } from '../src/core/rules/config.js';

export const config = () =>
  loadConfig({ buyer: { name: '合成大学', taxId: 'SYNTHBUYER00000001' } });
export function finding(overrides: Partial<Finding> = {}, baseDir = '/synthetic'): Finding {
  return withFindingId(
    {
      ruleId: 'R1',
      severity: 'warning',
      message: '合成问题',
      action: '补交',
      invoiceNumbers: [],
      files: [],
      ...overrides,
    },
    baseDir,
  );
}
export function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    name: '*电子元件*器件',
    taxCategory: '电子元件',
    specification: 'M1',
    unit: '个',
    quantity: 1,
    unitPrice: 100,
    amount: 100,
    taxRate: 0,
    tax: 0,
    grossUnitPrice: 100,
    ...overrides,
  };
}
export function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    number: 'SYNTH-001',
    date: '2026-01-02',
    kind: 'domestic',
    invoiceType: 'digital',
    buyer: { name: '合成大学', taxId: 'SYNTHBUYER00000001' },
    seller: { name: '合成公司', taxId: 'SYNTHSELLER0000001' },
    lines: [line()],
    total: 100,
    currency: 'CNY',
    sources: [{ path: '/synthetic/根目录/a.pdf', relativePath: 'a.pdf', format: 'pdf' }],
    warnings: [],
    ...overrides,
  };
}
export function batch(
  invoices: Invoice[] = [invoice()],
  name = '根目录',
  attachments: AttachmentType[] = [],
): Batch {
  return {
    id: '20260102',
    dir: '/synthetic',
    invoices,
    attachments: attachments.map((type, n) => ({
      type,
      path: `/synthetic/${name}/${n}.jpg`,
      relativePath: `${name}/${n}.jpg`,
      directory: `/synthetic/${name}`,
    })),
    unidentified: [],
    diagnostics: [],
    manual: { version: 1, entries: [] },
    submitted: false,
    groups: [
      {
        id: name,
        name,
        dir: `/synthetic/${name}`,
        invoiceNumbers: invoices.map((i) => i.number),
        flags: {
          deferred: name.includes('暂缓'),
          bankTransfer: name.includes('公转'),
          outsourced: name.includes('外包'),
          ai: name === 'AI' || invoices.some((i) => i.currency !== 'CNY'),
        },
      },
    ],
  };
}
