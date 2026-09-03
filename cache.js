// cache.js
// Cache simples em memória, com expiração (TTL), para consultas pesadas que
// não dependem dos filtros do usuário e mudam raramente (ex.: listas de opções
// de filtro, que hoje escaneiam a tabela de fatos inteira a cada requisição).
//
// Uso:
//   const cache = require('./cache');
//   const dados = await cache.getOrSet('reports:filters', 5 * 60 * 1000, async () => {
//       return await consultaPesada();
//   });

const store = new Map();

function getOrSet(key, ttlMs, producer) {
    const cached = store.get(key);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
        return Promise.resolve(cached.value);
    }

    const promise = Promise.resolve()
        .then(producer)
        .then((value) => {
            store.set(key, { value, expiresAt: Date.now() + ttlMs });
            return value;
        })
        .catch((err) => {
            // Não deixa entrada quebrada em cache
            store.delete(key);
            throw err;
        });

    // Guarda a promise em voo para evitar disparar a mesma consulta pesada
    // várias vezes em paralelo (ex.: vários usuários abrindo a tela ao mesmo tempo).
    store.set(key, { value: promise, expiresAt: now + ttlMs, pending: true });
    return promise;
}

function invalidate(key) {
    store.delete(key);
}

function clearAll() {
    store.clear();
}

module.exports = { getOrSet, invalidate, clearAll };
