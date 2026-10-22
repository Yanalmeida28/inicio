import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('production photo constraint reproduces the failure; migration permits entry/exit and safe retries', async () => {
  const db = new PGlite();
  const [owner, other, order, branch, photo] = Array.from({length:5},()=>randomUUID());
  const path = `${owner}/${order}/${photo}.webp`;
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA partner_operations_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('test.actor')::uuid$$;
      CREATE TABLE service_orders(id uuid PRIMARY KEY,user_id uuid,branch_id uuid);
      CREATE TABLE service_order_photos(id uuid PRIMARY KEY,service_order_id uuid,user_id uuid,branch_id uuid,photo_type text NOT NULL CONSTRAINT service_order_photos_photo_type_check CHECK(photo_type IN ('entrada','saida','legacy')),operation_type text,label text,storage_path text);
      CREATE TABLE storage.objects(bucket_id text,name text);
      CREATE FUNCTION partner_operations_private.authorize_branch(uuid,text) RETURNS uuid LANGUAGE sql AS $$SELECT auth.uid()$$;
      CREATE FUNCTION partner_operations_private.can_access_os_file(text) RETURNS boolean LANGUAGE sql AS $$SELECT split_part($1,'/',1)=auth.uid()::text$$;`);
    await db.query("SELECT set_config('test.actor',$1,false)",[owner]);
    await db.query('INSERT INTO service_orders VALUES($1,$2,$3)',[order,owner,branch]);
    await db.query("INSERT INTO storage.objects VALUES('service-order-photos',$1)",[path]);
    const source = await readFile(new URL('../migrations/20261012195624_fix_audited_operations.sql',import.meta.url),'utf8');
    const start = source.indexOf('CREATE FUNCTION public.save_service_order_photo(');
    await db.exec(source.slice(start, source.indexOf('END $fn$;', start) + 'END $fn$;'.length));
    const save = (id=photo,type='entry',filePath=path) => db.query('SELECT save_service_order_photo($1,$2,$3,$4,$5) saved',[order,id,filePath,type,'Parte da frente']);
    await assert.rejects(save(), /service_order_photos_photo_type_check/);
    await db.exec(await readFile(new URL('../migrations/20261022193636_fix_service_order_photo_types.sql',import.meta.url),'utf8'));
    assert.equal((await save()).rows[0].saved,true);
    assert.equal((await save()).rows[0].saved,true);
    assert.equal((await db.query('SELECT count(*)::int n FROM service_order_photos')).rows[0].n,1);
    const exitId = randomUUID(), exitPath = `${owner}/${order}/${exitId}.webp`;
    await db.query("INSERT INTO storage.objects VALUES('service-order-photos',$1)",[exitPath]);
    await save(exitId,'exit',exitPath);
    await assert.rejects(save(photo,'exit'), /Identificador de foto/);
    for (const type of ['entrada','saida','legacy']) await db.query('INSERT INTO service_order_photos(id,photo_type) VALUES($1,$2)',[randomUUID(),type]);
    await assert.rejects(db.query("INSERT INTO service_order_photos(id,photo_type) VALUES($1,'invalid')",[randomUUID()]), /photo_type_check/);
    await db.query("SELECT set_config('test.actor',$1,false)",[other]);
    await assert.rejects(save(), /autorizada/);
  } finally { await db.close(); }
});
