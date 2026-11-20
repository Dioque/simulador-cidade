import pg from 'pg';
export const db = new pg.Pool({connectionString:process.env.DATABASE_URL, max:10});
db.on('error', () => console.error('A conexão ociosa com o banco foi encerrada.'));

export async function transaction<T>(action:(client:pg.PoolClient)=>Promise<T>):Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
