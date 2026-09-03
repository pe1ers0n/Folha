// routes/cadastros.js
// Cadastros de leitura (empresas, estabelecimentos, CC, lotações) + histórico
// de encargos por estabelecimento, vínculos lotação-gestor e o diretório de
// gestores (Cadastros > Gestores). Protegido por requireMenu('cadastros') em server.js.


const express = require('express');
const { dbDW, dbApp, handleError } = require('./_shared');

const router = express.Router();


router.get('/cadastro/empresas', async (req, res) => {
    try {
        // ATENÇÃO: Adicionado prefixo 'gold.'
        const { rows } = await dbDW.query('SELECT DISTINCT empresa AS nome_empresa FROM gold.d_fortes_empresa ORDER BY nome_empresa');
        res.json(rows.map(r => r.nome_empresa));
    } catch (error) {
        handleError(res, error, `Erro ao buscar dados de empresas.`);
    }
});

router.get('/cadastro/estabelecimentos', async (req, res) => {
    try {
        // Em vez de ler a f_fortes_pagamento (gigante), lemos as tabelas de dimensão (pequenas)
        const query = `
            SELECT DISTINCT 
                est.id_estabelecimento,
                est.estabelecimento AS nome_estabelecimento,
                emp.empresa AS nome_empresa
            FROM gold.d_fortes_estabelecimento est
            LEFT JOIN gold.d_fortes_empresa emp 
                -- Tenta vincular pela empresa se houver chave, senão traz o estabelecimento igual
                ON TRIM(CAST(est.id_empresa AS TEXT)) = TRIM(CAST(emp.id_empresa AS TEXT))
            WHERE est.estabelecimento IS NOT NULL
            ORDER BY emp.empresa, est.estabelecimento
        `;
        
        const { rows } = await dbDW.query(query);
        res.json(rows);

    } catch (error) {
        handleError(res, error, 'Erro ao buscar estabelecimentos (Otimizado).');
    }
});

router.get('/cadastro/estabelecimentos/:id/historico', async (req, res) => {
    const { id } = req.params;
    try {
        // MySQL usa '?' como placeholder, e DATE_FORMAT para formatar data
        const [rows] = await dbApp.query(`
            SELECT 
                id,
                DATE_FORMAT(competencia_inicio, '%Y-%m-%d') as competencia_inicio,
                aliq_patronal,
                rat,
                fap,
                aliq_terceiros
            FROM historico_encargos_estabelecimento
            WHERE TRIM(id_estabelecimento) = TRIM(?)
            ORDER BY competencia_inicio DESC
        `, [id]);
        
        res.json(rows);
    } catch (error) {
        console.error("Erro MySQL GET:", error.message);
        // Se a tabela não existir, o código de erro do MySQL é diferente do Postgres
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.json([]);
        }
        handleError(res, error, 'Erro ao buscar histórico.');
    }
});

router.post('/cadastro/estabelecimentos/historico', async (req, res) => {
    // Desestrutura
    let { id_estabelecimento, nome_estabelecimento, competencia, patronal, rat, fap, terceiros } = req.body;
    
    // --- INÍCIO DA CORREÇÃO ---
    // Garante que o ID salvo no MySQL não tenha espaços
    if (id_estabelecimento) {
        id_estabelecimento = id_estabelecimento.trim();
    }
    // --- FIM DA CORREÇÃO ---
    
    console.log("Salvando no MySQL (com TRIM):", { id_estabelecimento, competencia });

    try {
        const dataInicio = `${competencia}-01`; 

        // Sintaxe de "Upsert" do MySQL
        const query = `
            INSERT INTO historico_encargos_estabelecimento 
            (id_estabelecimento, nome_estabelecimento, competencia_inicio, aliq_patronal, rat, fap, aliq_terceiros, data_cadastro)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                aliq_patronal = VALUES(aliq_patronal),
                rat = VALUES(rat),
                fap = VALUES(fap),
                aliq_terceiros = VALUES(aliq_terceiros),
                data_cadastro = NOW()
        `;

        const values = [
            id_estabelecimento, // <-- Agora está sem espaços
            nome_estabelecimento, 
            dataInicio, 
            patronal, 
            rat, 
            fap, 
            terceiros
        ];

        await dbApp.query(query, values);

        res.json({ message: 'Dados salvos no MySQL com sucesso!' });
    } catch (error) {
        console.error("Erro MySQL POST:", error.message);
        handleError(res, error, 'Erro ao salvar histórico de encargos.');
    }
});

router.put('/cadastro/:type', async (req, res) => {
    res.status(403).json({ message: 'Este cadastro é apenas para leitura e é gerenciado pelo banco de dados principal.' });
});
router.delete('/cadastro/:type', async (req, res) => {
     res.status(403).json({ message: 'Este cadastro é apenas para leitura e é gerenciado pelo banco de dados principal.' });
});

router.get('/cc', async (req, res) => {
    try {
        const { rows } = await dbDW.query(
            `SELECT 
                l.centro_custo_protheus AS nome_cc,
                MAX(cc.id_centro_custo) AS id_cc, -- Busca o ID
                json_agg(DISTINCT l.nome_lotacao) AS lotacoes
             FROM gold.d_fortes_lotacao l
             LEFT JOIN gold.d_protheus_centro_custo cc 
                ON l.centro_custo_protheus = cc.descricao -- Liga pelo nome para achar o ID
             WHERE l.centro_custo_protheus IS NOT NULL
             GROUP BY l.centro_custo_protheus
             ORDER BY nome_cc`
        );
        
        const result = rows.map(row => ({
            id: row.id_cc || '', // Envia o ID para o front
            nome: row.nome_cc,
            lotacoes: row.lotacoes || [] 
        }));
        res.json(result);

    } catch (error) {
        handleError(res, error, 'Erro ao buscar centros de custo.');
    }
});

// Rotas POST e DELETE para CC (desabilitadas)
router.post('/cc', (req, res) => {
    res.status(403).json({ message: 'Centros de Custo são lidos diretamente do banco de dados e não podem ser criados por aqui.' });
});
router.delete('/cc/:name', (req, res) => {
    res.status(403).json({ message: 'Centros de Custo são lidos diretamente do banco de dados e não podem ser removidos por aqui.' });
});

router.get('/lotacoes', async (req, res) => {
    try {
        // Otimização: Lê direto das tabelas de cadastro (d_), sem tocar na tabela de fatos (f_)
        const { rows } = await dbDW.query(
            `SELECT DISTINCT 
                l.nome_lotacao, 
                e.empresa, 
                es.estabelecimento 
             FROM gold.d_fortes_lotacao l
             LEFT JOIN gold.d_fortes_empresa e ON l.id_empresa = e.id_empresa
             LEFT JOIN gold.d_fortes_estabelecimento es ON l.id_estabelecimento = es.id_estabelecimento
             WHERE l.nome_lotacao IS NOT NULL
             ORDER BY l.nome_lotacao`
        );
        
        const result = rows.map(row => ({
            id: `${row.nome_lotacao} | ${row.empresa || 'S/E'} - ${row.estabelecimento || 'S/E'}`,
            nome: row.nome_lotacao,
            empresa: row.empresa,
            estabelecimento: row.estabelecimento
        }));
        res.json(result);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar lotações.');
    }
});

// ATUALIZADO: Esta rota (para Cadastros) usa a lógica ORIGINAL (Filho).
router.get('/lotacoes/status', async (req, res) => {
     try {
        // PERFORMANCE: esta consulta faz DISTINCT varrendo a tabela de fatos
        // inteira (sem filtro de data) só para descobrir as combinações de
        // lotação/empresa/estabelecimento/CC - por isso os ~9-10s vistos nos
        // logs de "consulta lenta". Essas combinações só mudam quando chega
        // carga nova no DW, então cacheamos por alguns minutos (mesmo padrão
        // já usado em /dashboard e /reports/filters). O e-mail do gestor NÃO
        // entra nesse cache (ver abaixo) para continuar sempre atualizado
        // logo após salvar em Cadastros > Lotações.
        const { rows } = await cache.getOrSet('lotacoes:status-dw', FILTER_OPTIONS_CACHE_MS, () =>
            dbDW.query(
                `SELECT DISTINCT
                    l.nome_lotacao,
                    e.empresa,
                    es.estabelecimento,
                    l.centro_custo_protheus
                 FROM gold.f_fortes_pagamento f
                 LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
                 LEFT JOIN gold.d_fortes_empresa e ON f.id_empresa = e.id_empresa
                 LEFT JOIN gold.d_fortes_estabelecimento es ON f.id_estabelecimento = es.id_estabelecimento`
            )
        );

        // Gestores de cada lotação vivem no MySQL (dbApp), não no DW - busca à
        // parte (rápida) e mescla em memória pelo nome da lotação. Fica de
        // fora do cache acima de propósito. Uma lotação pode ter VÁRIOS
        // gestores agora (tabela lotacao_gestores_vinculos, ver database.js),
        // por isso "gestores" vem como lista, não mais um único objeto.
        let gestoresPorLotacao = {};
        try {
            const [vinculos] = await dbApp.query(
                'SELECT nome_lotacao, id_gestor, email_gestor, nome_gestor FROM lotacao_gestores_vinculos ORDER BY nome_gestor, email_gestor'
            );
            vinculos.forEach((v) => {
                if (!gestoresPorLotacao[v.nome_lotacao]) gestoresPorLotacao[v.nome_lotacao] = [];
                gestoresPorLotacao[v.nome_lotacao].push({ id: v.id_gestor, nome: v.nome_gestor, email: v.email_gestor });
            });
        } catch (gErr) {
            console.error('Erro ao buscar gestores das lotações (seguindo sem eles):', gErr.message);
        }

        const result = rows.map(l => {
            const id = `${l.nome_lotacao} | ${l.empresa} - ${l.estabelecimento}`;
            const associatedCc = l.centro_custo_protheus; // Usa o CC Filho (Protheus)
            return {
                id: id,
                nome: l.nome_lotacao,
                empresa: l.empresa,
                estabelecimento: l.estabelecimento,
                isAssociated: !!associatedCc,
                centroCusto: associatedCc || null,
                gestores: gestoresPorLotacao[l.nome_lotacao] || []
            };
        });
        res.json(result);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar status das lotações.');
    }
});

router.put('/lotacoes/gestores', async (req, res) => {
    const { nome_lotacao, id_gestor } = req.body;

    if (!nome_lotacao || !id_gestor) {
        return res.status(400).json({ message: 'Informe a lotação e o gestor.' });
    }

    try {
        const [gestorRows] = await dbApp.query(
            'SELECT nome_gestor, email_gestor FROM gestores WHERE id = ?',
            [id_gestor]
        );
        if (gestorRows.length === 0) {
            return res.status(404).json({ message: 'Gestor não encontrado. Cadastre-o em Cadastros > Gestores.' });
        }
        const gestor = gestorRows[0];

        await dbApp.query(
            `INSERT INTO lotacao_gestores_vinculos (nome_lotacao, id_gestor, email_gestor, nome_gestor)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                email_gestor = VALUES(email_gestor),
                nome_gestor = VALUES(nome_gestor),
                atualizado_em = NOW()`,
            [nome_lotacao, id_gestor, gestor.email_gestor, gestor.nome_gestor]
        );
        res.json({ message: 'Gestor vinculado com sucesso!' });
    } catch (error) {
        handleError(res, error, 'Erro ao vincular gestor à lotação.');
    }
});

// --- REMOVE O VÍNCULO DE UM GESTOR ESPECÍFICO DE UMA LOTAÇÃO ---
// Não exclui o gestor do diretório (Cadastros > Gestores) nem afeta os
// outros gestores vinculados à mesma lotação - só apaga essa combinação
// específica de lotação+gestor.
router.delete('/lotacoes/gestores', async (req, res) => {
    const { nome_lotacao, id_gestor } = req.body;

    if (!nome_lotacao || !id_gestor) {
        return res.status(400).json({ message: 'Informe a lotação e o gestor.' });
    }

    try {
        await dbApp.query(
            'DELETE FROM lotacao_gestores_vinculos WHERE nome_lotacao = ? AND id_gestor = ?',
            [nome_lotacao, id_gestor]
        );
        res.json({ message: 'Gestor removido da lotação.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover gestor da lotação.');
    }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/gestores', async (req, res) => {
    try {
        const [rows] = await dbApp.query(
            'SELECT id, nome_gestor, email_gestor FROM gestores ORDER BY nome_gestor, email_gestor'
        );
        res.json(rows.map((g) => ({ id: g.id, nome: g.nome_gestor || '', email: g.email_gestor })));
    } catch (error) {
        handleError(res, error, 'Erro ao buscar gestores.');
    }
});

router.post('/gestores', async (req, res) => {
    const { nome_gestor, email_gestor } = req.body;
    if (!nome_gestor || !email_gestor) {
        return res.status(400).json({ message: 'Informe o nome e o e-mail do gestor.' });
    }
    if (!EMAIL_REGEX.test(email_gestor)) {
        return res.status(400).json({ message: 'E-mail do gestor inválido.' });
    }
    try {
        await dbApp.query('INSERT INTO gestores (nome_gestor, email_gestor) VALUES (?, ?)', [nome_gestor, email_gestor]);
        res.json({ message: 'Gestor cadastrado com sucesso!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Já existe um gestor cadastrado com esse e-mail.' });
        }
        handleError(res, error, 'Erro ao cadastrar gestor.');
    }
});

router.put('/gestores/:id', async (req, res) => {
    const { id } = req.params;
    const { nome_gestor, email_gestor } = req.body;
    if (!nome_gestor || !email_gestor) {
        return res.status(400).json({ message: 'Informe o nome e o e-mail do gestor.' });
    }
    if (!EMAIL_REGEX.test(email_gestor)) {
        return res.status(400).json({ message: 'E-mail do gestor inválido.' });
    }
    try {
        await dbApp.query('UPDATE gestores SET nome_gestor = ?, email_gestor = ? WHERE id = ?', [nome_gestor, email_gestor, id]);

        // Propaga a mudança pra todas as lotações já vinculadas a este gestor
        // (id_gestor) - sem isso, o nome/e-mail salvo em
        // lotacao_gestores_vinculos (usado por Movimentações de Setor)
        // ficaria desatualizado até alguém reabrir cada lotação e escolher o
        // gestor de novo.
        await dbApp.query(
            'UPDATE lotacao_gestores_vinculos SET nome_gestor = ?, email_gestor = ? WHERE id_gestor = ?',
            [nome_gestor, email_gestor, id]
        );

        res.json({ message: 'Gestor atualizado com sucesso!' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Já existe outro gestor cadastrado com esse e-mail.' });
        }
        handleError(res, error, 'Erro ao atualizar gestor.');
    }
});

// PROTEÇÃO: se o gestor já estiver vinculado a alguma lotação, a exclusão é
// bloqueada - excluir sem querer apagaria a referência usada por
// Movimentações de Setor sem o RH perceber. Precisa desvincular nas
// lotações primeiro (escolher outro gestor ali) antes de conseguir excluir.
router.delete('/gestores/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [emUso] = await dbApp.query('SELECT COUNT(*) AS total FROM lotacao_gestores_vinculos WHERE id_gestor = ?', [id]);
        if (emUso[0].total > 0) {
            return res.status(409).json({
                message: `Este gestor está vinculado a ${emUso[0].total} lotação(ões). Escolha outro gestor para elas em Cadastros > Lotações antes de excluir.`
            });
        }
        await dbApp.query('DELETE FROM gestores WHERE id = ?', [id]);
        res.json({ message: 'Gestor removido.' });
    } catch (error) {
        handleError(res, error, 'Erro ao remover gestor.');
    }
});

// --- CONFIGURAÇÃO DE ENCARGOS (% sobre a massa salarial) ---
// Percentual único usado pelo relatório de Impacto na Folha para estimar o
// custo total de pessoal (custo = bruto + bruto * percentual / 100).
router.get('/config/encargos', async (req, res) => {
    try {
        const [rows] = await dbApp.query('SELECT percentual FROM config_encargos WHERE id = 1');
        const percentual = rows.length ? parseFloat(rows[0].percentual) : 0;
        res.json({ percentual });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar a configuração de encargos.');
    }
});

router.put('/config/encargos', async (req, res) => {
    let { percentual } = req.body;
    percentual = parseFloat(percentual);
    if (isNaN(percentual) || percentual < 0 || percentual > 1000) {
        return res.status(400).json({ message: 'Informe um percentual válido (0 a 1000).' });
    }
    try {
        await dbApp.query(
            'INSERT INTO config_encargos (id, percentual) VALUES (1, ?) ON DUPLICATE KEY UPDATE percentual = VALUES(percentual)',
            [percentual]
        );
        res.json({ message: 'Percentual de encargos salvo com sucesso!', percentual });
    } catch (error) {
        handleError(res, error, 'Erro ao salvar a configuração de encargos.');
    }
});

module.exports = router;
