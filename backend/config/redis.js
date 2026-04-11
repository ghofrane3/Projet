import { createClient } from 'redis';

let redisClient = null;
let isConnecting = false;

export const connectRedis = async () => {
  if (isConnecting) return redisClient;
  isConnecting = true;

  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        // ✅ FIX — Reconnexion automatique si Redis redémarre
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ Redis : trop de tentatives de reconnexion — abandon');
            return new Error('Redis reconnect limit reached');
          }
          const delay = Math.min(retries * 200, 3000);
          console.log(`🔄 Redis reconnexion dans ${delay}ms (tentative ${retries})`);
          return delay;
        },
        connectTimeout: 5000,
        keepAlive: 5000,
      }
    });

    redisClient.on('error', (err) => {
      // ✅ FIX — Ne pas crasher le process sur une erreur Redis
      console.error('❌ Redis Error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connecté');
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis reconnexion en cours...');
    });

    redisClient.on('ready', async () => {
      console.log('✅ Redis prêt');
      // ✅ FIX — Vérifier la persistance au démarrage
      await _checkPersistence();
    });

    redisClient.on('end', () => {
      console.warn('⚠️  Redis connexion fermée');
    });

    await redisClient.connect();
    isConnecting = false;
    return redisClient;

  } catch (error) {
    isConnecting = false;
    console.error('❌ Erreur connexion Redis:', error.message);
    redisClient = null;
    return null;
  }
};

// ════════════════════════════════════════════════════════════
// ✅ FIX PRINCIPAL — Activer la persistance Redis au démarrage
// C'est la cause racine du bug L2 : Redis vide après redémarrage
// ════════════════════════════════════════════════════════════
async function _checkPersistence() {
  if (!redisClient) return;

  try {
    // Vérifier le nombre de clés existantes
    const keyCount = await redisClient.dbSize();
    console.log(`📊 Redis : ${keyCount} clés en mémoire`);

    // Lire la config de persistance actuelle
    const appendonly = await redisClient.configGet('appendonly');
    const saveConfig = await redisClient.configGet('save');

    const isAppendOnly = appendonly?.appendonly === 'yes';
    const hasSave      = saveConfig?.save && saveConfig.save !== '';

    if (!isAppendOnly && !hasSave) {
      // ✅ Activer AOF (Append Only File) à chaud — survit aux redémarrages
      console.warn('⚠️  Redis sans persistance détecté — activation AOF...');

      try {
        await redisClient.configSet('appendonly', 'yes');
        await redisClient.configSet('appendfsync', 'everysec');
        await redisClient.configRewrite();
        console.log('✅ Redis persistance AOF activée (appendonly yes, appendfsync everysec)');
      } catch (configErr) {
        // configRewrite peut échouer si redis.conf est en read-only
        // Dans ce cas activer en mémoire seulement (dure jusqu'au prochain arrêt)
        console.warn('⚠️  Impossible d\'écrire redis.conf — persistance active pour cette session seulement');
        console.warn('   Solution permanente : ajouter "appendonly yes" dans redis.conf');
      }
    } else {
      console.log(`✅ Redis persistance OK (appendonly: ${isAppendOnly ? 'yes' : 'no'}, save: ${hasSave ? 'yes' : 'no'})`);
    }

    if (keyCount === 0 && (isAppendOnly || hasSave)) {
      console.warn('⚠️  Redis vide malgré la persistance — premier démarrage ou données effacées');
    }

  } catch (err) {
    console.error('❌ Erreur vérification persistance Redis:', err.message);
  }
}

// ════════════════════════════════════════════════════════════
// GETTERS
// ════════════════════════════════════════════════════════════

export const getRedisClient = () => redisClient;

// ✅ FIX — Helper sécurisé : vérifie que le client est connecté
export const getRedisClientSafe = () => {
  if (!redisClient) return null;
  // isOpen = true si connecté, false si déconnecté/en cours de reconnexion
  if (!redisClient.isOpen) return null;
  return redisClient;
};

// ════════════════════════════════════════════════════════════
// HELPERS CACHE — tous sécurisés
// ════════════════════════════════════════════════════════════

export const getCache = async (key) => {
  const client = getRedisClientSafe();
  if (!client) return null;

  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Erreur lecture cache:', error.message);
    return null;
  }
};

export const setCache = async (key, data, expireSeconds = 3600) => {
  const client = getRedisClientSafe();
  if (!client) return false;

  try {
    await client.setEx(key, expireSeconds, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Erreur écriture cache:', error.message);
    return false;
  }
};

export const deleteCache = async (key) => {
  const client = getRedisClientSafe();
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Erreur suppression cache:', error.message);
    return false;
  }
};

export const clearCachePattern = async (pattern) => {
  const client = getRedisClientSafe();
  if (!client) return false;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(keys);
    return true;
  } catch (error) {
    console.error('Erreur clear pattern:', error.message);
    return false;
  }
};

export default {
  connectRedis,
  getRedisClient,
  getRedisClientSafe,
  getCache,
  setCache,
  deleteCache,
  clearCachePattern,
};
