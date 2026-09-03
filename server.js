// server.js
// Ponto de entrada principal da sua aplicação Node.js.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // Cabeçalhos de segurança HTTP
const rateLimit = require('express-rate-limit'); // Limite de tentativas (anti força-bruta)
const bodyParser = require('body-parser');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken'); // Necessário para validar o token
const apiRoutes = require('./routes'); // Importa as rotas da API.
const authModule = require('./auth'); // Importa o módulo de autenticação
const movimentacoesSetorModule = require('./movimentacoesSetor'); // Movimentações de Setor (e-mail aos gestores)

const app = express();
const PORT = process.env.PORT || 8010;
const HOST = '0.0.0.0';

// --- Configuração dos Middlewares Básicos ---
// SEGURANÇA: helmet adiciona cabeçalhos HTTP de proteção (X-Frame-Options,
// X-Content-Type-Options, HSTS, etc.). A Content-Security-Policy vem
// DESABILITADA de propósito: o frontend carrega Tailwind, FontAwesome e fontes
// de CDNs externas, e uma CSP padrão bloquearia esses recursos. Se um dia o
// frontend passar a servir tudo localmente, vale reativar a CSP.
app.use(helmet({ contentSecurityPolicy: false }));

// SEGURANÇA: CORS restrito por variável de ambiente (antes aceitava QUALQUER
// origem). Como o próprio servidor já serve o frontend (express.static abaixo),
// o uso normal é mesma-origem e nem precisa de CORS. Configure CORS_ORIGIN no
// .env com a(s) origem(ns) permitida(s), separadas por vírgula. Deixe '*' só se
// realmente precisar liberar geral (não recomendado para dados de folha).
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
    origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((o) => o.trim()).filter(Boolean)
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// --- ARQUIVOS ESTÁTICOS DO FRONTEND (HTML/CSS/JS) ---
// BUG CORRIGIDO: não havia NENHUM serviço de arquivos estáticos configurado
// aqui. Isso quebrava qualquer link que apontasse pro próprio servidor num
// formato "http://<host>:8010/algumapagina.html?token=..." - por exemplo, o
// link de redefinir senha (auth.js) e o link de resposta do gestor em
// Movimentações de Setor. Sem essa linha, essas URLs caíam direto no
// middleware de autenticação abaixo (que exige token JWT) e retornavam
// "Acesso negado", mesmo a página existindo em frontend/. Fica ANTES do
// authenticateToken de propósito, pra essas páginas não precisarem de login
// pra carregar (a segurança de cada uma é feita por dentro: localStorage no
// caso do app principal, ou o token da URL no caso da resposta do gestor).
// { index: false } evita que isso mude a resposta da rota "/" (que continua
// sendo a mensagem de status da API, como já era antes).
app.use(express.static(path.join(__dirname, 'frontend'), { index: false }));

// --- MONITORAMENTO DE TEMPO DE RESPOSTA (SEGURANÇA/DIAGNÓSTICO) ---
// Mede quanto tempo cada requisição leva (da entrada até a resposta) e avisa
// no console quando uma rota estiver demorando (possível filtro/consulta pesada).
// Serve de complemento ao log de consultas SQL lentas em database.js: aqui
// medimos a requisição inteira (SQL + processamento em Node.js).
const SLOW_REQUEST_MS = parseInt(process.env.SLOW_REQUEST_MS || '800', 10);
app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        if (durationMs >= SLOW_REQUEST_MS) {
            console.warn(`[REQ] 🐢 ${req.method} ${req.originalUrl} demorou ${durationMs.toFixed(0)}ms`);
        } else if (process.env.DEBUG_REQUESTS === '1') {
            console.log(`[REQ] ${req.method} ${req.originalUrl} - ${durationMs.toFixed(0)}ms`);
        }
    });
    next();
});

// --- MIDDLEWARE DE AUTENTICAÇÃO (SEGURANÇA) ---
const authenticateToken = (req, res, next) => {
    // 1. Permitir rotas públicas (não exigem login)
    // Permite: Raiz, qualquer coisa em /auth/ (login, register, reset), requisições
    // OPTIONS (CORS) e a resposta do gestor de Movimentações de Setor (o gestor
    // não tem login no sistema - a autenticação dele é só o token do link do e-mail).
    if (
        req.path === '/' ||
        req.path.startsWith('/auth/') ||
        req.path.startsWith('/movimentacoes-setor/responder/') ||
        // Lista de cargos/setores existentes (autocomplete dos campos
        // "Para qual setor?"/"Qual o novo cargo?" na página pública do
        // gestor) - também sem login, mesma lógica da rota acima.
        req.path === '/movimentacoes-setor/opcoes' ||
        req.method === 'OPTIONS'
    ) {
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

// --- MIDDLEWARE DE AUTORIZAÇÃO (SOMENTE ADMIN) ---
// SEGURANÇA: antes, qualquer usuário autenticado (mesmo o de nível mais baixo)
// podia listar, criar, editar ou excluir outros usuários chamando a API
// diretamente. Agora, tudo em /usuarios exige que o token tenha is_admin = true
// (o campo é incluído no token no momento do login, em auth.js).
const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ message: 'Acesso restrito a administradores.' });
    }
    next();
};
app.use('/usuarios', requireAdmin);

// --- MIDDLEWARE DE AUTORIZAÇÃO POR MENU ---
// SEGURANÇA: o cadastro de usuários já permitia marcar quais menus (Cadastros,
// Relatórios, Lançamento de Encargos) cada pessoa pode ver, mas isso só era
// aplicado no frontend (esconder link / tela de "Acesso Bloqueado"). Um usuário
// que soubesse a URL da API podia chamar as rotas direto e pegar os dados de
// qualquer menu, mesmo sem permissão. Este middleware fecha essa brecha no
// backend, usando o campo menus_permitidos que vai dentro do token (auth.js).
//
// OBS.: a permissão por relatório individual (relatorios_permitidos) não é
// verificada aqui porque a rota POST /reports serve vários relatórios
// diferentes (Por Empresa, Por Centro de Custo, Por Lotação, etc.) sem indicar
// no corpo da requisição qual deles está sendo pedido - o backend não tem como
// saber qual checar. A permissão por menu (nível "Relatórios" como um todo)
// já é aplicada abaixo; para restringir relatório por relatório também no
// backend, o frontend precisaria passar o tipo do relatório em cada chamada.
const requireMenu = (menuKey) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }
    if (req.user.is_admin) return next(); // administrador sempre tem acesso a tudo

    const menusPermitidos = (req.user.menus_permitidos || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

    if (!menusPermitidos.includes(menuKey)) {
        return res.status(403).json({ message: 'Você não tem permissão para acessar esta área.' });
    }
    next();
};

app.use(['/cadastro', '/cc', '/lotacoes', '/gestores', '/config'], requireMenu('cadastros'));
app.use(['/reports', '/colaboradores'], requireMenu('relatorios'));
app.use('/lancamentos', requireMenu('lancamentos'));
// A tela de administração das Movimentações de Setor (listar envios, disparar
// e-mails do mês) tem seu próprio menu/permissão. As rotas públicas de resposta
// do gestor (/movimentacoes-setor/responder/*) NÃO usam o prefixo /admin, então
// não são afetadas por esta regra (e já foram liberadas do login acima).
app.use(['/movimentacoes-setor/admin'], requireMenu('movimentacoes-setor'));

// --- Rotas da API ---
app.get('/', (req, res) => {
  res.send('API de Folha de Pagamento está no ar!');
});

// SEGURANÇA (anti força-bruta): limita tentativas nas rotas sensíveis de
// autenticação (login, esqueci/redefinir senha, cadastro). Sem isso, um
// atacante poderia testar senhas indefinidamente. 20 requisições por IP a cada
// 15 min é folgado para uso legítimo e corta ataques automatizados.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});
app.use('/auth', authLimiter);

// Rotas de Autenticação (Login, Cadastro, Recuperação)
app.use('/', authModule.router);

// Rotas do Sistema (Dashboard, Relatórios, Lançamentos) - AGORA PROTEGIDAS
app.use('/', apiRoutes);

// Rotas de Movimentações de Setor (admin + resposta pública do gestor)
app.use('/', movimentacoesSetorModule.router);

// --- AGENDAMENTO AUTOMÁTICO: Movimentações de Setor (mensal) ---
// Todo dia, verifica se já passou do dia configurado (MOVIMENTACAO_DISPATCH_DAY)
// do mês atual; se sim, garante que os e-mails do mês anterior (folha já
// fechada) foram gerados. gerarEnviosDoMes é idempotente (não duplica envios
// já existentes pra mesma lotação/período), então repetir a checagem todo dia
// depois do dia configurado não reenvia nada - só a primeira vez efetivamente
// dispara e-mail. Isso funciona junto com o botão manual (POST
// /movimentacoes-setor/admin/enviar) na tela de Movimentações de Setor.
const MOVIMENTACAO_DISPATCH_DAY = parseInt(process.env.MOVIMENTACAO_DISPATCH_DAY || '5', 10);

async function checarEnvioAutomaticoMovimentacoes() {
    try {
        const hoje = new Date();
        if (hoje.getDate() < MOVIMENTACAO_DISPATCH_DAY) return; // ainda não chegou o dia do mês

        // Mês anterior ao atual (a folha do mês corrente normalmente só fecha
        // depois que ele termina, então o disparo automático olha pra trás).
        // hoje.getMonth() é 0-indexado, então numericamente já é o "mês atual
        // em base 1, menos 1" - ou seja, o mês anterior em base 1.
        let mesAnterior = hoje.getMonth();
        let anoAnterior = hoje.getFullYear();
        if (mesAnterior === 0) { mesAnterior = 12; anoAnterior -= 1; }

        const resultado = await movimentacoesSetorModule.gerarEnviosDoMes(anoAnterior, mesAnterior);
        if (resultado.criados > 0) {
            console.log(`[Movimentações de Setor] Disparo automático (${mesAnterior}/${anoAnterior}): ${resultado.criados} e-mail(s) enviado(s).`);
        }
    } catch (err) {
        console.error('[Movimentações de Setor] Erro no disparo automático:', err.message);
    }
}

// Roda uma vez ao iniciar (cobre o caso do servidor estar desligado no dia
// configurado) e depois a cada 24h. O atraso inicial dá tempo da conexão com
// os bancos (database.js) se estabilizar antes da primeira checagem.
setTimeout(checarEnvioAutomaticoMovimentacoes, 15000);
setInterval(checarEnvioAutomaticoMovimentacoes, 24 * 60 * 60 * 1000);

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