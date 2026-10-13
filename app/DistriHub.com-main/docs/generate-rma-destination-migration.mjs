import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../supabase/migrations/', import.meta.url);
const original = await readFile(new URL('20261006165722_link_rma_sale_items_and_stock.sql', root), 'utf8');
let guard = original.slice(original.indexOf('CREATE FUNCTION partner_rma_private.guard_return()'), original.indexOf('CREATE TRIGGER guard_rma_sale_return'));
guard = guard.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
guard = guard.replace("  IF TG_OP = 'INSERT' THEN", `  IF TG_OP = 'UPDATE' THEN
    -- Compatibility with old clients; destination changes use their own field.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('retornou_fornecedor','reintegrado_estoque')
      AND NEW.destination IS NOT DISTINCT FROM OLD.destination THEN
      NEW.destination := CASE NEW.status WHEN 'retornou_fornecedor' THEN 'fornecedor' ELSE 'estoque' END;
    END IF;
    IF OLD.destination = 'estoque' AND NEW.destination <> 'estoque' THEN
      RAISE EXCEPTION 'Peca ja reintegrada ao estoque; destino nao pode ser alterado';
    END IF;
    IF OLD.credit_amount > 0 AND NEW.status <> 'credito_gerado' THEN
      RAISE EXCEPTION 'Credito ja gerado deve permanecer no historico';
    END IF;
    IF NEW.status <> 'credito_gerado' THEN
      NEW.status := CASE NEW.destination WHEN 'estoque' THEN 'reintegrado_estoque'
        WHEN 'fornecedor' THEN 'retornou_fornecedor' ELSE 'aguardando_troca' END;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.destination <> 'avaliacao' THEN RAISE EXCEPTION 'Nova devolucao deve iniciar em avaliacao'; END IF;`);
const transition = /    IF NEW.status IS DISTINCT FROM OLD.status AND NOT \([\s\S]*?THEN RAISE EXCEPTION 'Transicao de devolucao invalida'; END IF;/;
if (!transition.test(guard)) throw new Error('Transition block not found');
guard = guard.replace(transition, '');
guard = guard.replace("OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'reintegrado_estoque'", "OLD.destination IS DISTINCT FROM NEW.destination AND NEW.destination = 'estoque'");
const creditSource = await readFile(new URL('20261010200046_add_rma_customer_credits.sql', root), 'utf8');
let credit = creditSource.slice(creditSource.indexOf('CREATE FUNCTION partner_rma_private.guard_credit()'), creditSource.indexOf('CREATE TRIGGER zz_guard_rma_customer_credit'));
credit = credit.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(" OR OLD.status NOT IN ('reintegrado_estoque','credito_gerado')", '');
const sql = `BEGIN;
LOCK TABLE public.rma_requests_v2 IN ACCESS EXCLUSIVE MODE NOWAIT;
ALTER TABLE public.rma_requests_v2 ADD COLUMN destination text NOT NULL DEFAULT 'avaliacao'
  CHECK (destination IN ('avaliacao','avaria','fornecedor','estoque'));
-- Backfill without replaying stock movements. Keep unknown legacy destinations in evaluation.
ALTER TABLE public.rma_requests_v2 DISABLE TRIGGER guard_rma_sale_return;
UPDATE public.rma_requests_v2 SET destination = CASE
  WHEN stock_restored_at IS NOT NULL OR status='reintegrado_estoque' THEN 'estoque'
  WHEN status='retornou_fornecedor' THEN 'fornecedor' ELSE 'avaliacao' END;
ALTER TABLE public.rma_requests_v2 ENABLE TRIGGER guard_rma_sale_return;
${guard}
${credit}
COMMIT;
`;
await writeFile(new URL('20261013190034_separate_rma_destination_and_credit.sql', root), sql);
