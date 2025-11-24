// server.js
// Ponto de entrada principal da sua aplicação Node.js.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const jwt = require('jsonwebtoken'); // Necessário para validar o token
const apiRoutes = require('./routes'); // Importa as rotas da API.
const authModule = require('./auth'); // Importa o módulo de autenticação

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; 

// --- Configuração dos Middlewares Básicos ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// --- MIDDLEWARE DE AUTENTICAÇÃO (SEGURANÇA) ---
const authenticateToken = (req, res, next) => {
    // 1. Permitir rotas públicas (não exigem login)
    // Permite: Raiz, qualquer coisa em /auth/ (login, register, reset) e requisições OPTIONS (CORS)
    if (req.path === '/' || req.path.startsWith('/auth/') || req.method === 'OPTIONS') {
        return next();
    }

    // 2. Ler o cabeçalho de autorização
    const authHeader = req.headers['authorization'];
    // O formato padrão é: "Bearer <TOKEN>"
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    // 3. Verificar a validade do token
    jwt.verify(token, authModule.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Sessão inválida ou expirada. Faça login novamente.' });
        }
        // Se válido, anexa os dados do usuário à requisição e permite continuar
        req.user = user;
        next();
    });
};

// Aplica a proteção em todas as rotas abaixo desta linha
app.use(authenticateToken);

// --- Rotas da API ---
app.get('/', (req, res) => {
  res.send('API de Folha de Pagamento está no ar!');
});

// Rotas de Autenticação (Login, Cadastro, Recuperação)
app.use('/', authModule.router);

// Rotas do Sistema (Dashboard, Relatórios, Lançamentos) - AGORA PROTEGIDAS
app.use('/', apiRoutes);

// --- Função para obter o endereço IP local ---
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const { address, family, internal } = iface;
            if (family === 'IPv4' && !internal) {
                return address;
            }
        }
    }
    return null;
}

// --- Inicialização do Servidor ---
app.listen(PORT, HOST, () => {
  const localIp = getLocalIpAddress();
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse localmente em: http://localhost:${PORT}`);
  if (localIp) {
    console.log(`Acesse na sua rede em: http://${localIp}:${PORT}`);
  }
});