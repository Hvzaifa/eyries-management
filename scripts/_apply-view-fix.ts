import 'dotenv/config';
import { Client } from 'pg';

const sql = `
create or replace view dashboard_totals as
select
  (select count(*) from pnrs where status = 'active') as active_pnrs,
  (select coalesce(sum(seats), 0) from pnrs where status = 'active') as total_seats,
  (select coalesce(sum(total_emd_value), 0) from pnrs where status = 'active') as total_emd_value,
  (select coalesce(sum(er.emd_amount), 0)
     from emd_rounds er join pnrs p on p.id = er.pnr_id
    where p.status = 'active' and er.status in ('paid', 'refund_requested', 'refunded')) as total_paid,
  (select coalesce(sum(er.refund_amount), 0)
     from emd_rounds er join pnrs p on p.id = er.pnr_id
    where p.status = 'active' and er.status = 'refunded') as total_refunded;
`;

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is not set');

  const client = new Client({ connectionString });
  await client.connect();
  await client.query(sql);

  const { rows } = await client.query('select * from dashboard_totals');
  console.log('dashboard_totals updated. Current contents:');
  console.log(rows[0]);

  await client.end();
}

main().catch((err) => {
  console.error('View update failed:', err);
  process.exit(1);
});
