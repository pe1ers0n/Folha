// routes.js
// Agregador das rotas da API. O arquivo monolítico anterior (~1800 linhas) foi
// dividido em módulos por domínio dentro de routes/. Cada módulo é um
// express.Router() com caminhos absolutos, então todos são montados aqui em '/'
// e o server.js continua usando require('./routes') sem alteração.
//
// Helpers compartilhados (conexões de banco, cache, tratamento de erro,
// permissões de relatório e montagem de consulta) ficam em routes/_shared.js.

const express = require('express');
const router = express.Router();

router.use(require('./routes/cadastros'));      // empresas, estabelecimentos, CC, lotações, gestores
router.use(require('./routes/dashboard'));      // tela de Início
router.use(require('./routes/reports'));        // relatórios e filtros
router.use(require('./routes/colaboradores'));  // colaboradores e folha individual
router.use(require('./routes/lancamentos'));    // lançamento de encargos
router.use(require('./routes/usuarios'));       // gestão de usuários

module.exports = router;
