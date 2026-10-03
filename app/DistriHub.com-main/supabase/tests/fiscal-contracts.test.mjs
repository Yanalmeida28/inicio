import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from '../../node_modules/typescript/lib/typescript.js';

const moduleSource = await readFile(new URL('../../src/services/fiscalContracts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const contracts = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('fiscal cancellation sends the stored document type and branch only inside payload', () => {
  const args = contracts.buildFiscalCancellationRpcArgs(
    'doc-uuid',
    'nfce',
    'branch-uuid',
    'Solicitação de cancelamento',
  );
  assert.deepEqual(args, {
    p_document_id: 'doc-uuid',
    p_document_type: 'nfce',
    p_status: 'pending',
    p_document_number: null,
    p_access_key: null,
    p_payload: {
      branch_id: 'branch-uuid',
      cancellation_requested: true,
      cancellation_reason: 'Solicitação de cancelamento',
    },
  });
  assert.equal('p_user_id' in args, false);
  assert.equal('p_branch_id' in args, false);
  assert.equal(contracts.isFiscalDocumentType('nfe'), true);
  assert.equal(contracts.isFiscalDocumentType('nfce'), true);
  assert.equal(contracts.isFiscalDocumentType('unknown'), false);
});
