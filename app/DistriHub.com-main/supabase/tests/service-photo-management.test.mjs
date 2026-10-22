import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from '../../node_modules/typescript/lib/typescript.js';
import { PGlite } from '@electric-sql/pglite';

const service = {};
vm.runInNewContext(ts.transpileModule(await readFile(new URL('../../src/lib/serviceOrders.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: service, crypto: { randomUUID }, Error });
const photo = { id: 'photo', user_id: 'owner', service_order_id: 'order', storage_path: 'owner/order/old.webp' };
test('replacement uploads before linking and only removes the old file after confirmed metadata', async () => {
  const calls = []; let uploadError = true, rpcError = false, confirmed = true, cleanupError = false;
  const client = { storage: { from: () => ({
    upload: async path => { calls.push(['upload', path]); return { error: uploadError ? { message: 'offline' } : null }; },
    remove: async paths => { calls.push(['remove', paths]); return { error: cleanupError ? { message: 'offline' } : null }; },
  }) }, rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: confirmed, error: rpcError ? { message: 'Filial não autorizada' } : null }; } };
  const file = { name: 'nova.webp', type: 'image/webp' };
  await assert.rejects(service.changeServicePhoto(client, photo, file), /foto atual foi mantida/);
  assert.deepEqual(calls.map(call => call[0]), ['upload']);
  uploadError = false; rpcError = true; calls.length = 0;
  await assert.rejects(service.changeServicePhoto(client, photo, file), /Filial não autorizada/);
  assert.deepEqual(calls.map(call => call[0]), ['upload', 'rpc']);
  rpcError = false; confirmed = false; calls.length = 0;
  await assert.rejects(service.changeServicePhoto(client, photo), /não confirmada/);
  assert.deepEqual(calls.map(call => call[0]), ['rpc']);
  confirmed = true; calls.length = 0;
  await service.changeServicePhoto(client, photo, file);
  assert.deepEqual(calls.map(call => call[0]), ['upload', 'rpc', 'remove']);
  assert.equal(calls[1][2].p_expected_path, photo.storage_path);
  assert.equal(calls[1][2].p_new_path, calls[0][1]);
  assert.notEqual(calls[0][1], photo.storage_path);
  assert.deepEqual(Array.from(calls[2][1]), [photo.storage_path]);
  calls.length = 0; cleanupError = true;
  assert.equal((await service.changeServicePhoto(client, photo)).cleanupPending, true);
  assert.equal(calls[0][2].p_new_path, null);
});

test('database photo changes enforce branch access, preserve identity, reject stale or missing uploads, and retry removal safely', async () => {
  const db = new PGlite();
  const [owner, employee, stranger, branch, otherBranch, order, otherOrder, photoId] = Array.from({ length: 8 }, () => randomUUID());
  const oldPath = `${owner}/${order}/old.webp`, newPath = `${owner}/${order}/new.webp`;
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA partner_operations_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
      CREATE TABLE service_orders(id uuid PRIMARY KEY,user_id uuid,branch_id uuid,status text);
      CREATE TABLE service_order_photos(id uuid PRIMARY KEY,service_order_id uuid,user_id uuid,branch_id uuid,photo_type text,label text,storage_path text);
      CREATE TABLE storage.objects(bucket_id text,name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage,partner_operations_private TO authenticated;
      GRANT SELECT,DELETE ON storage.objects TO authenticated; GRANT SELECT ON service_order_photos TO authenticated;
      CREATE POLICY read_objects ON storage.objects FOR SELECT TO authenticated USING(true);
      CREATE FUNCTION partner_operations_private.authorize_branch(uuid,text) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
      DECLARE o service_orders%ROWTYPE; BEGIN SELECT * INTO o FROM service_orders WHERE branch_id=$1 LIMIT 1;
      IF current_setting('test.entitled',true) IS DISTINCT FROM 'yes' OR NOT(auth.uid()=o.user_id OR (auth.uid()='${employee}' AND $1='${branch}')) THEN RAISE EXCEPTION 'Filial não autorizada'; END IF;
      RETURN o.user_id; END$$;
      CREATE FUNCTION partner_operations_private.can_access_os_file(text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT split_part($1,'/',1)='${owner}' AND split_part($1,'/',2)='${order}' AND auth.uid() IN ('${owner}','${employee}')$$;`);
    await db.query('INSERT INTO service_orders VALUES($1,$2,$3,$4),($5,$2,$6,$4)', [order, owner, branch, 'aberta', otherOrder, otherBranch]);
    await db.query("INSERT INTO service_order_photos VALUES($1,$2,$3,$4,'entrada','Frente',$5)", [photoId, order, owner, branch, oldPath]);
    await db.query("INSERT INTO storage.objects VALUES('service-order-photos',$1)", [oldPath]);
    await db.exec(await readFile(new URL('../migrations/20261022205209_manage_service_order_photos.sql', import.meta.url), 'utf8'));
    const actor = async value => { await db.query("SELECT set_config('test.actor',$1,false),set_config('test.entitled','yes',false)", [value]); };
    const change = (expected = oldPath, next = newPath, orderId = order) => db.query('SELECT manage_service_order_photo($1,$2,$3,$4,$5) saved', [orderId, photoId, expected, next, 'Nova frente']);
    await actor(stranger); await assert.rejects(change(), /autorizada/);
    await actor(employee); await assert.rejects(change(oldPath, newPath, otherOrder), /autorizada/);
    await db.query("SELECT set_config('test.entitled','no',false)"); await assert.rejects(change(), /autorizada/);
    await actor(owner); await assert.rejects(change(), /Envie a nova foto/);
    assert.equal((await db.query('SELECT storage_path FROM service_order_photos')).rows[0].storage_path, oldPath);
    await db.query("INSERT INTO storage.objects VALUES('service-order-photos',$1)", [newPath]);
    await actor(employee); assert.equal((await change()).rows[0].saved, true);
    const saved = (await db.query('SELECT * FROM service_order_photos')).rows[0];
    assert.equal(saved.id, photoId); assert.equal(saved.photo_type, 'entrada'); assert.equal(saved.storage_path, newPath);
    assert.equal((await change()).rows[0].saved, true);
    await assert.rejects(change(oldPath, null), /foi alterada/);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name', [newPath])).rows.length, 0);
    assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name', [oldPath])).rows.length, 1);
    await db.exec('RESET ROLE');
    await db.query("UPDATE service_orders SET status='cancelada' WHERE id=$1", [order]);
    await assert.rejects(change(newPath, null), /cancelada/);
    await db.query("UPDATE service_orders SET status='finalizada' WHERE id=$1", [order]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await change(newPath, null)).rows[0].saved, true);
    assert.equal((await change(newPath, null)).rows[0].saved, true);
    assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1 RETURNING name', [newPath])).rows.length, 1);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int n FROM service_order_photos')).rows[0].n, 0);
    await db.exec('SET ROLE anon'); await assert.rejects(change(newPath, null), /permission denied/); await db.exec('RESET ROLE');
  } finally { await db.close(); }
});
