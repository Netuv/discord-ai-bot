import { D1Client } from '../core/d1';

export async function getTotalArticles(db: D1Client): Promise<number> {
  const result = await db.query(`SELECT COUNT(*) as count FROM content_history`);
  return (result[0] as any).count as number;
}

export async function getProviderHealth(db: D1Client) {
  return db.query(`SELECT * FROM provider_health`);
}
