// // middleware/cache.js
// import crypto from 'crypto';
// import RedisClient from '../utils/RedisClient.js';

// const CacheMiddleware = (groupKey, groupIdGetter, ttl = 60) => {
//   return async (req, res, next) => {
//     try {
//       const groupId = groupIdGetter(req); // e.g., req.params.agencyID
//       const cacheKey = `${groupKey}:${groupId}`;

//       const cachedData = await RedisClient.get(cacheKey);
//       if (cachedData) {
//         return res.status(200).json(JSON.parse(cachedData));
//       }

//       // Override res.json to store response in Redis
//       const originalJson = res.json.bind(res);
//       res.json = (data) => {
//         RedisClient.setEx(cacheKey, ttl, JSON.stringify(data));
//         return originalJson(data);
//       };

//       next();
//     } catch (err) {
//       console.error("Redis cache error:", err);
//       next(); // fallback to normal flow if Redis fails
//     }
//   };
// };




// export default CacheMiddleware;

// middleware/cache.js
import crypto from 'crypto';
import RedisClient from '../utils/RedisClient.js';

const CacheMiddleware = (groupKey, groupIdGetter = () => '', ttl = 60) => {
  return async (req, res, next) => {
    try {
      const groupId = groupIdGetter(req); // Can be based on params, query, or anything else
      const queryString = JSON.stringify(req.query || {});
      const queryHash = crypto.createHash('md5').update(queryString).digest('hex');

      const cacheKey = `${groupKey}:${groupId}:${queryHash}`;

      const cachedData = await RedisClient.get(cacheKey);
      if (cachedData) {
        return res.status(200).json(JSON.parse(cachedData));
      }

      const originalJson = res.json.bind(res);
      res.json = (data) => {
        RedisClient.setEx(cacheKey, ttl, JSON.stringify(data));
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.error("Redis cache error:", err);
      next(); // fallback to normal flow
    }
  };
};

export default CacheMiddleware;
