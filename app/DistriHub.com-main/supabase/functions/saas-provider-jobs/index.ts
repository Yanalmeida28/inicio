import { adminClient, env, json, mp } from '../_shared/saasRuntime.ts';

type Job = { id: string; lease_token: string; kind: string; provider_id: string };
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    if (request.headers.get('x-saas-job-secret') !== env('SAAS_JOB_SECRET')) return json({ error: 'Não autorizado.' }, 401);
    env('MERCADO_PAGO_ACCESS_TOKEN');
    const admin = adminClient();
    const { data: jobs, error } = await admin.rpc('claim_saas_provider_jobs', { p_limit: 3 });
    if (error) throw error;
    let completed = 0;
    for (const job of (jobs ?? []) as Job[]) {
      try {
        if (job.kind === 'cancel_subscription') {
          const remote = await mp<{ status: string }>(`/preapproval/${encodeURIComponent(job.provider_id)}`);
          if (remote.status !== 'cancelled') await mp(`/preapproval/${encodeURIComponent(job.provider_id)}`, 'PUT', { status: 'cancelled' });
        } else {
          const payment = await mp<{ status: string }>(`/v1/payments/${encodeURIComponent(job.provider_id)}`);
          if (payment.status !== 'cancelled' && payment.status !== 'rejected') {
            if (!['pending', 'in_process', 'authorized'].includes(payment.status)) throw new Error('Pagamento recebido: confira a cobrança e faça o estorno no Mercado Pago.');
            await mp(`/v1/payments/${encodeURIComponent(job.provider_id)}`, 'PUT', { status: 'cancelled' });
          }
        }
        const { data: accepted, error: finishError } = await admin.rpc('finish_saas_provider_job', {
          p_job_id: job.id, p_lease_token: job.lease_token, p_success: true,
        });
        if (finishError) throw finishError;
        if (accepted) completed++;
      } catch (failure) {
        const { error: finishError } = await admin.rpc('finish_saas_provider_job', {
          p_job_id: job.id, p_lease_token: job.lease_token, p_success: false,
          p_error: failure instanceof Error ? failure.message : 'Falha no gateway.',
        });
        if (finishError) throw finishError;
      }
    }
    return json({ completed, claimed: jobs?.length ?? 0 });
  } catch { return json({ error: 'Falha ao processar cancelamentos.' }, 500); }
});
