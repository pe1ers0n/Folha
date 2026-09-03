// database.js
require('dotenv').config();
const { Pool } = require('pg'); // Driver do Postgres (para o DW)
const mysql = require('mysql2/promise'); // Driver do MySQL (para o App Local)

// --- SEGURANÇA: credenciais vêm agora do arquivo .env (nunca do código-fonte) ---
// Se alguma variável obrigatória estiver faltando, falha rápido e explica o motivo,
// em vez de deixar o servidor subir "quebrado" silenciosamente.
const REQUIRED_ENV_VARS = [
    'DB_DW_USER', 'DB_DW_HOST', 'DB_DW_NAME', 'DB_DW_PASSWORD',
    'DB_APP_HOST', 'DB_APP_USER', 'DB_APP_PASSWORD', 'DB_APP_NAME',
];
const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error(
        `[CONFIG] Variáveis de ambiente ausentes no .env: ${missing.join(', ')}. ` +
        `Copie .env.example para .env e preencha os valores antes de iniciar o servidor.`
    );
    process.exit(1);
}

// --- CONEXÃO 1: DATA WAREHOUSE (Remoto - Postgres) ---
const poolDW = new Pool({
  user: process.env.DB_DW_USER,
  host: process.env.DB_DW_HOST,
  database: process.env.DB_DW_NAME,
  password: process.env.DB_DW_PASSWORD,
  port: parseInt(process.env.DB_DW_PORT || '5432', 10),
  connectionTimeoutMillis: 2000,
});

// --- CONEXÃO 2: BANCO DA APLICAÇÃO (Local - MySQL) ---
const poolApp = mysql.createPool({
  host: process.env.DB_APP_HOST,
  user: process.env.DB_APP_USER,
  password: process.env.DB_APP_PASSWORD,
  database: process.env.DB_APP_NAME,
  port: parseInt(process.env.DB_APP_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Testes de Conexão (Logs no terminal)
poolDW.query('SELECT NOW()', (err) => {
    if (err) console.error('[ERRO DW] Falha ao conectar no Postgres:', err.code);
    else console.log('[OK] Conectado ao Data Warehouse (Postgres).');
});

// Teste assíncrono para MySQL
(async () => {
    try {
        const connection = await poolApp.getConnection();
        console.log('[OK] Conectado ao Banco Local (MySQL).');
        connection.release();
        await ensureAppTables();
    } catch (err) {
        console.error('[ERRO APP] Falha ao conectar no MySQL Local:', err.message);
    }
})();

// --- CRIAÇÃO AUTOMÁTICA DE TABELAS NOVAS (MySQL/App) ---
// Este projeto não tem um sistema de migração formal (as tabelas existentes,
// como "usuarios", foram criadas manualmente no banco). Para as tabelas novas
// da funcionalidade de "Movimentações de Setor", usamos CREATE TABLE IF NOT
// EXISTS aqui para que o próprio servidor crie o que faltar ao iniciar, sem
// exigir que alguém rode um script SQL manualmente no servidor de produção.
async function ensureAppTables() {
    try {
        // E-mail do gestor de cada lotação (cadastrado na tela Cadastros > Lotações).
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS lotacoes_gestores (
                nome_lotacao VARCHAR(255) NOT NULL PRIMARY KEY,
                email_gestor VARCHAR(255) NOT NULL,
                nome_gestor VARCHAR(255) NULL,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Diretório de gestores (nome + e-mail), cadastrado na tela própria
        // Cadastros > Gestores (rotas GET/POST/PUT/DELETE /gestores). Antes,
        // o mesmo gestor que administra várias lotações tinha o nome/e-mail
        // redigitado em cada linha de "Cadastros > Lotações" (repetido e
        // sujeito a erro de digitação/e-mail divergente entre linhas) - agora
        // a tela de lotações só permite ESCOLHER um gestor já cadastrado
        // aqui (dropdown, ver id_gestor mais abaixo). NÃO substitui
        // lotacoes_gestores (que continua sendo a fonte usada por
        // Movimentações de Setor) - lotacoes_gestores guarda uma cópia
        // (email_gestor/nome_gestor) do gestor escolhido para cada lotação.
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS gestores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome_gestor VARCHAR(255) NULL,
                email_gestor VARCHAR(255) NOT NULL,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_email_gestor (email_gestor)
            )
        `);

        // BACKFILL: quem já tinha e-mails de gestor cadastrados em
        // lotacoes_gestores antes desta tabela existir não precisa recadastrar
        // nada - copia (uma vez, de forma idempotente) o que já existe pra
        // popular o diretório logo de cara, sem esperar cada linha ser salva
        // de novo manualmente. ON DUPLICATE KEY UPDATE torna esse INSERT
        // seguro de rodar toda vez que o servidor sobe (não duplica nada).
        try {
            await poolApp.query(`
                INSERT INTO gestores (nome_gestor, email_gestor)
                SELECT nome_gestor, email_gestor FROM lotacoes_gestores
                ON DUPLICATE KEY UPDATE
                    nome_gestor = COALESCE(nome_gestor, VALUES(nome_gestor))
            `);
        } catch (backfillErr) {
            console.error('[ERRO APP] Falha ao popular diretório de gestores a partir de lotacoes_gestores:', backfillErr.message);
        }

        // UPGRADE: coluna "id_gestor" - vínculo de verdade entre uma lotação e
        // um registro da tabela "gestores" (agora a tela Cadastros > Lotações
        // só permite ESCOLHER um gestor já cadastrado, em vez de digitar
        // nome/e-mail direto ali). "email_gestor"/"nome_gestor" continuam
        // existindo em lotacoes_gestores como cópia (o resto do sistema, como
        // Movimentações de Setor, lê só essas duas colunas) - id_gestor é só
        // a referência usada pra manter essa cópia sincronizada quando o
        // gestor for editado na tela de Gestores. ON DELETE SET NULL: se o
        // gestor for excluído do diretório, a lotação não quebra - só perde a
        // referência (o e-mail/nome que já estava copiado continua valendo).
        try {
            await poolApp.query(`ALTER TABLE lotacoes_gestores ADD COLUMN id_gestor INT NULL`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna id_gestor:', alterErr.message);
            }
        }
        try {
            await poolApp.query(`
                ALTER TABLE lotacoes_gestores
                ADD CONSTRAINT fk_lotacoes_gestores_id_gestor
                FOREIGN KEY (id_gestor) REFERENCES gestores(id) ON DELETE SET NULL
            `);
        } catch (alterErr) {
            // Reexecuta a cada subida do servidor - se a constraint já existe,
            // ignora (mensagem de "Duplicate" varia entre versões do MySQL).
            if (!/duplicate/i.test(alterErr.message)) {
                console.error('[ERRO APP] Falha ao adicionar FK id_gestor -> gestores:', alterErr.message);
            }
        }

        // NOVA TABELA: "lotacoes_gestores" (acima) tinha nome_lotacao como
        // PRIMARY KEY - só permitia UM gestor por lotação. Pra permitir VÁRIOS
        // gestores na mesma lotação (e dar a opção de remover um vínculo sem
        // apagar os outros), criamos esta tabela de vínculo separada, em vez
        // de arriscar uma migração de PRIMARY KEY numa tabela já em uso em
        // produção. A partir de agora, é esta tabela (não mais
        // "lotacoes_gestores") que Cadastros > Lotações e Movimentações de
        // Setor leem/gravam - "lotacoes_gestores" fica só como histórico
        // (não é mais escrita pelo app), sem risco de perder o que já tinha.
        // ON DELETE CASCADE: se um gestor for excluído do diretório (só é
        // permitido se ele não estiver mais vinculado a nenhuma lotação - ver
        // DELETE /gestores/:id em routes.js), não sobra vínculo órfão aqui.
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS lotacao_gestores_vinculos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome_lotacao VARCHAR(255) NOT NULL,
                id_gestor INT NOT NULL,
                email_gestor VARCHAR(255) NOT NULL,
                nome_gestor VARCHAR(255) NULL,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_lotacao_gestor (nome_lotacao, id_gestor),
                KEY idx_nome_lotacao (nome_lotacao),
                FOREIGN KEY (id_gestor) REFERENCES gestores(id) ON DELETE CASCADE
            )
        `);

        // BACKFILL: migra o vínculo único que já existia em lotacoes_gestores
        // (só as linhas que já tinham id_gestor preenchido, ou seja,
        // cadastradas depois que a tela de Lotações passou a usar o dropdown
        // de gestor) pra esta tabela nova - ninguém perde o gestor que já
        // tinha configurado. Idempotente (ON DUPLICATE KEY UPDATE), seguro de
        // rodar toda vez que o servidor sobe.
        try {
            await poolApp.query(`
                INSERT INTO lotacao_gestores_vinculos (nome_lotacao, id_gestor, email_gestor, nome_gestor)
                SELECT nome_lotacao, id_gestor, email_gestor, nome_gestor
                FROM lotacoes_gestores
                WHERE id_gestor IS NOT NULL
                ON DUPLICATE KEY UPDATE
                    email_gestor = VALUES(email_gestor),
                    nome_gestor = VALUES(nome_gestor)
            `);
        } catch (backfillErr) {
            console.error('[ERRO APP] Falha ao popular vínculos lotação-gestor a partir de lotacoes_gestores:', backfillErr.message);
        }

        // Um registro por "movimentação de setor" disparada a um gestor.
        // "bloqueado_edicao": trava manual do admin - enquanto marcado, o gestor
        // não consegue responder/editar pelo link, mesmo que o status normal
        // (aguardando/ok/pendencias) permitiria.
        // CONSOLIDAÇÃO POR GESTOR: agora um envio cobre TODAS as lotações de
        // um gestor no mês (não uma só), então "nome_lotacao"/"empresa" aqui
        // viram opcionais - só continuam preenchidos em envios antigos (de
        // antes dessa mudança, um por lotação). Envios novos guardam a lista
        // de lotações/empresas em movimentacoes_setor_colaboradores (cada
        // colaborador sabe de qual lotação/empresa ele é).
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS movimentacoes_setor_envios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                token VARCHAR(64) NOT NULL,
                nome_lotacao VARCHAR(255) NULL,
                email_gestor VARCHAR(255) NOT NULL,
                ano INT NOT NULL,
                mes INT NOT NULL,
                valor_proventos DECIMAL(13,2) DEFAULT 0,
                valor_descontos DECIMAL(13,2) DEFAULT 0,
                valor_liquido DECIMAL(13,2) DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'aguardando',
                bloqueado_edicao TINYINT(1) NOT NULL DEFAULT 0,
                empresa VARCHAR(255) NULL,
                data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
                data_resposta DATETIME NULL,
                UNIQUE KEY uq_lotacao_periodo (nome_lotacao, ano, mes),
                UNIQUE KEY uq_gestor_periodo (email_gestor, ano, mes),
                UNIQUE KEY uq_token (token)
            )
        `);

        // UPGRADE: mesma lógica do "proventos" abaixo, mas pra quem já tinha a
        // tabela de envios criada antes desta coluna existir.
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_envios ADD COLUMN bloqueado_edicao TINYINT(1) NOT NULL DEFAULT 0`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna bloqueado_edicao:', alterErr.message);
            }
        }

        // UPGRADE: coluna "empresa" (mostrada ao lado do nome da lotação na tela
        // de admin, e usada como filtro). Envios criados antes desta coluna
        // existir ficam com empresa NULL (a tela mostra "-" nesse caso).
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_envios ADD COLUMN empresa VARCHAR(255) NULL`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna empresa:', alterErr.message);
            }
        }

        // UPGRADE: quem já tinha a tabela criada antes da consolidação por
        // gestor tinha "nome_lotacao" como NOT NULL - agora precisa aceitar
        // NULL (envios novos cobrem várias lotações, não uma só).
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_envios MODIFY COLUMN nome_lotacao VARCHAR(255) NULL`);
        } catch (alterErr) {
            console.error('[ERRO APP] Falha ao tornar nome_lotacao opcional:', alterErr.message);
        }

        // UPGRADE: nova chave única por gestor/período (email_gestor, ano, mes)
        // - é ela que agora garante que não se gera 2 envios pro mesmo gestor
        // no mesmo mês (a antiga, por lotação, continua existindo só por
        // compatibilidade com envios antigos).
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_envios ADD UNIQUE KEY uq_gestor_periodo (email_gestor, ano, mes)`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_KEYNAME') {
                console.error('[ERRO APP] Falha ao adicionar chave única uq_gestor_periodo:', alterErr.message);
            }
        }

        // Snapshot dos colaboradores mostrados ao gestor naquele envio, com a
        // observação/flag de "não faz parte do setor" preenchida na resposta.
        // "proventos" é o valor individual do colaborador naquele mês, mostrado
        // ao lado do nome dele na página de resposta do gestor. "nome_lotacao"
        // e "empresa" aqui (por colaborador, não só no envio) são o que permite
        // um envio único reunir colaboradores de várias lotações/empresas do
        // mesmo gestor.
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS movimentacoes_setor_colaboradores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_envio INT NOT NULL,
                id_funcionario VARCHAR(255) NULL,
                nome_funcionario VARCHAR(255) NULL,
                cargo VARCHAR(255) NULL,
                nome_lotacao VARCHAR(255) NULL,
                empresa VARCHAR(255) NULL,
                proventos DECIMAL(13,2) DEFAULT 0,
                fora_setor TINYINT(1) NOT NULL DEFAULT 0,
                observacao TEXT NULL,
                FOREIGN KEY (id_envio) REFERENCES movimentacoes_setor_envios(id) ON DELETE CASCADE
            )
        `);

        // UPGRADE: quem já tinha essa tabela criada (CREATE TABLE IF NOT EXISTS
        // acima não adiciona coluna em tabela já existente) ganha a coluna nova
        // aqui. Se ela já existir (ER_DUP_FIELDNAME), ignora - não é um erro real.
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_colaboradores ADD COLUMN proventos DECIMAL(13,2) DEFAULT 0`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna proventos:', alterErr.message);
            }
        }

        // UPGRADE: coluna "cargo" (mostrada ao lado do nome do colaborador na
        // página de resposta do gestor).
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_colaboradores ADD COLUMN cargo VARCHAR(255) NULL`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna cargo:', alterErr.message);
            }
        }

        // UPGRADE: colunas "nome_lotacao" e "empresa" por colaborador -
        // necessárias pra consolidação por gestor (um envio agora pode ter
        // colaboradores de várias lotações misturados).
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_colaboradores ADD COLUMN nome_lotacao VARCHAR(255) NULL`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna nome_lotacao (colaboradores):', alterErr.message);
            }
        }
        try {
            await poolApp.query(`ALTER TABLE movimentacoes_setor_colaboradores ADD COLUMN empresa VARCHAR(255) NULL`);
        } catch (alterErr) {
            if (alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.error('[ERRO APP] Falha ao adicionar coluna empresa (colaboradores):', alterErr.message);
            }
        }

        // Subtotal por lotação (setor) de cada envio - proventos/descontos/
        // líquido somados só daquele setor, calculados uma vez na geração do
        // envio (gerarEnviosDoMes já soma isso por lotação antes de juntar no
        // total do gestor) e gravados aqui pra não precisar refazer a conta
        // depois. É o que permite mostrar o subtotal de cada setor na página
        // de resposta do gestor, além do total geral. Envios antigos (de
        // antes desta tabela existir) não têm linha aqui - a rota que lê isso
        // tem fallback pros dados já salvos por colaborador/envio.
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS movimentacoes_setor_lotacoes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_envio INT NOT NULL,
                nome_lotacao VARCHAR(255) NOT NULL,
                empresa VARCHAR(255) NULL,
                valor_proventos DECIMAL(13,2) DEFAULT 0,
                valor_descontos DECIMAL(13,2) DEFAULT 0,
                valor_liquido DECIMAL(13,2) DEFAULT 0,
                FOREIGN KEY (id_envio) REFERENCES movimentacoes_setor_envios(id) ON DELETE CASCADE
            )
        `);

        // Configuração de ENCARGOS: percentual único aplicado sobre a massa
        // salarial bruta (proventos) para estimar o custo total de pessoal no
        // relatório de Impacto na Folha. Guardamos uma única linha (id = 1) e
        // garantimos que ela exista com um valor padrão.
        await poolApp.query(`
            CREATE TABLE IF NOT EXISTS config_encargos (
                id INT PRIMARY KEY,
                percentual DECIMAL(6,2) NOT NULL DEFAULT 0,
                atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await poolApp.query(`INSERT IGNORE INTO config_encargos (id, percentual) VALUES (1, 0)`);

        console.log('[OK] Tabelas de Movimentações de Setor verificadas/criadas.');
    } catch (err) {
        console.error('[ERRO APP] Falha ao criar tabelas de Movimentações de Setor:', err.message);
    }
}

// --- MONITORAMENTO DE PERFORMANCE DAS CONSULTAS ---
// Envolve o método .query dos dois bancos para medir a duração de cada
// consulta e avisar no console quando uma consulta estiver "pesada" (lenta).
// Não muda a assinatura nem o retorno de .query, só mede o tempo ao redor dele.
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || '500', 10);

function wrapQueryWithTiming(pool, label) {
    const originalQuery = pool.query.bind(pool);

    pool.query = function (...args) {
        const start = process.hrtime.bigint();
        // Pega só o texto do SQL para o log (primeiros 140 caracteres, sem quebras de linha)
        const sqlText = (typeof args[0] === 'string' ? args[0] : (args[0] && args[0].sql) || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140);

        const result = originalQuery(...args);

        // originalQuery pode retornar Promise (uso comum neste projeto) ou aceitar callback.
        if (result && typeof result.then === 'function') {
            return result.then(
                (res) => {
                    logQueryDuration(label, sqlText, start);
                    return res;
                },
                (err) => {
                    logQueryDuration(label, sqlText, start, err);
                    throw err;
                }
            );
        }
        return result;
    };
}

function logQueryDuration(label, sqlText, start, err) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const durationStr = durationMs.toFixed(1);

    recentQueries.unshift({
        label,
        sql: sqlText,
        durationMs: Math.round(durationMs),
        at: new Date().toISOString(),
        error: err ? err.message : null,
    });
    if (recentQueries.length > 100) recentQueries.length = 100;

    if (err) {
        console.error(`[DB:${label}] ERRO após ${durationStr}ms -> ${sqlText}`);
        return;
    }
    if (durationMs >= SLOW_QUERY_MS) {
        console.warn(`[DB:${label}] 🐢 CONSULTA LENTA: ${durationStr}ms -> ${sqlText}`);
    } else if (process.env.DEBUG_SQL === '1') {
        console.log(`[DB:${label}] ${durationStr}ms -> ${sqlText}`);
    }
}

// Guarda as últimas consultas (com duração) em memória para diagnóstico via /debug/queries.
const recentQueries = [];

wrapQueryWithTiming(poolDW, 'DW');
wrapQueryWithTiming(poolApp, 'APP');

module.exports = {
    dbDW: poolDW,
    dbApp: poolApp,
    getRecentQueries: () => recentQueries,
};