// utils/redisCache.js
import RedisClient from './RedisClient.js';

const invalidateCacheGroup = async (groupKey, groupId) => {
    const pattern = `${groupKey}:${groupId}:*`;
    const keys = await RedisClient.keys(pattern);
    if (keys.length > 0) {
        await RedisClient.del(keys);
    }
};

export default invalidateCacheGroup