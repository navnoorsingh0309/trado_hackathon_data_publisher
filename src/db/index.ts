import { Pool } from "pg";
import { config } from "../config";

// Define a type for batch items
export interface BatchItem {
  topic: string;
  ltp: number;
  indexName?: string;
  type?: string;
  strike?: number;
}

// Initialize database connection pool
let pool: Pool;
let dataBatch: BatchItem[] = [];
let batchTimer: NodeJS.Timeout | null = null;

// Cache topic IDs to avoid repeated lookups
const topicCache = new Map<string, number>();

export function createPool(): Pool {
  return new Pool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
  });
}

export async function initialize(dbPool: Pool) {
  pool = dbPool;
  console.log("Database initialized");

  // TODO: Preload topic cache from database
  // Caching with key as topic_name and value as topic_id
  try {
    const res = await pool.query("SELECT topic_name, topic_id FROM topics");
    for (const row of res.rows) {
      topicCache.set(row.topic_name, row.topic_id);
    }
    console.log("Preloaded topic catch");
  } catch (err) {
    console.error("Error reading topics:", err);
    throw err;
  }
}

export async function getTopicId(
  topicName: string,
  indexName?: string,
  type?: string,
  strike?: number
): Promise<number> {
  // TODO: Implement this function
  // 1. Check if topic exists in cache
  if (topicCache.get(topicName)) {
    return topicCache.get(topicName)!;
  }
  // 2. If not in cache, check if it exists in database
  try {
    const res = await pool.query(
      "SELECT topic_id FROM topics WHERE topic_name = $1",
      [topicName]
    );

    if (res.rows.length > 0) {
      return res.rows[0].topic_id;
    }
  } catch (err) {
    console.error("Error checking topic existence:", err);
    throw err;
  }
  // 3. If not in database, insert it
  // 4. Return topic_id
  try {
    const insertRes = await pool.query(
      `INSERT INTO topics (topic_name, index_name, type, strike)
     VALUES ($1, $2, $3, $4)
     RETURNING topic_id`,
      [topicName, indexName, type, strike]
    );
    topicCache.set(topicName, insertRes.rows[0].topic_id);
    return insertRes.rows[0].topic_id;
  } catch (err) {
    console.error("Error inserting topic:", err);
    throw err;
  }
}

export function saveToDatabase(
  topic: string,
  ltp: number,
  indexName?: string,
  type?: string,
  strike?: number
) {
  // TODO: Implement this function
  // 1. Add item to batch
  // 2. If batch timer is not running, start it
  // 3. If batch size reaches threshold, flush batch

  console.log(`Saving to database: ${topic}, LTP: ${ltp}`);
}

export async function flushBatch() {
  // TODO: Implement this function
  // 1. Clear timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  // 2. If batch is empty, return
  if (dataBatch.length === 0) return;
  const batchToProcess = [...dataBatch];
  // Reseting batch initially to process more data in events
  dataBatch = [];
  // 3. Process batch items (get topic IDs)
  const topicIdMap = new Map<string, number>();
  for (const item of batchToProcess) {
    if (!topicIdMap.has(item.topic)) {
      const topicId = await getTopicId(
        item.topic,
        item.indexName,
        item.type,
        item.strike
      );
      topicIdMap.set(item.topic, topicId);
    }
  }
  // 4. Insert data in a transaction
  // Begin transaction
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Insert LTP values into quotes table (or similar)
    for (const item of batchToProcess) {
      const topicId = topicIdMap.get(item.topic)!;
      await client.query(
        `INSERT INTO ltp_data (topic_id, ltp, received_at)
       VALUES ($1, $2, NOW())`,
        [topicId, item.ltp]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("Transaction failed:", err);
  } finally {
    if (client) {
      client.release();
    }
  }
  console.log(`Flushing batch of ${batchToProcess.length} items`);
}

export async function cleanupDatabase() {
  // Flush any remaining items in the batch
  if (dataBatch.length > 0) {
    await flushBatch();
  }

  // Close the database pool
  if (pool) {
    await pool.end();
  }

  console.log("Database cleanup completed");
}
