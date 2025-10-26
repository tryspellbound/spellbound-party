import { createClient, RedisClientType } from "redis";

type RedisClient = RedisClientType<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>
>;

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: RedisClient | undefined;
  // eslint-disable-next-line no-var
  var _redisPromise: Promise<RedisClient> | undefined;
}

const requiredEnv = ["REDIS_HOST", "REDIS_PORT", "REDIS_USERNAME", "REDIS_PASSWORD"] as const;

const validateEnv = () => {
  requiredEnv.forEach((key) => {
    if (!process.env[key]) {
      throw new Error(`Missing ${key} in environment`);
    }
  });
};

export async function getRedisClient(): Promise<RedisClient> {
  if (global._redisClient && global._redisClient.isOpen) {
    return global._redisClient;
  }

  if (global._redisPromise) {
    return global._redisPromise;
  }

  validateEnv();

  const client: RedisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  });

  client.on("error", (err) => {
    console.error("Redis Client Error", err);
  });

  global._redisPromise = client.connect().then(() => {
    global._redisClient = client;
    return client;
  });

  return global._redisPromise;
}

