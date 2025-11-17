// routes.js
// ATENÇÃO: Este ficheiro foi significativamente modificado para funcionar com POSTGRES.
// A sintaxe SQL (placeholders $1, $2...) e funções (json_agg) são diferentes do MySQL.

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { dbDW, dbApp } = require('./database'); // Importa a conexão com o banco de dados (agora Postgres).

const router = express.Router();

// --- MAPA DE MESES PARA CONSULTAS ---
const MONTH_MAP = {
    'Janeiro': 1, 'Fevereiro': 2, 'Março': 3, 'Abril': 4, 'Maio': 5, 'Junho': 6,
    'Julho': 7, 'Agosto': 8, 'Setembro': 9, 'Outubro': 10, 'Novembro': 11, 'Dezembro': 12
};
const MONTH_NAME_MAP = [
    null, 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Função auxiliar para tratamento de erros
const handleError = (res, error, message = 'Ocorreu um erro no servidor.') => {
  console.error('Erro na API:', error);
  res.status(500).json({ message, error: error.message });
};

// --- ROTAS DE CADASTRO (Genéricas) ---
// Modificadas para ler das tabelas de dimensão (d_...)

// Empresas
router.get('/cadastro/empresas', async (req, res) => {
    try {
        // ATENÇÃO: Adicionado prefixo 'gold.'
        const { rows } = await dbDW.query('SELECT DISTINCT empresa AS nome_empresa FROM gold.d_fortes_empresa ORDER BY nome_empresa');
        res.json(rows.map(r => r.nome_empresa));
    } catch (error) {
        handleError(res, error, `Erro ao buscar dados de empresas.`);
    }
});

// --- GESTÃO DE ESTABELECIMENTOS E ENCARGOS ---

// 1. Listar Estabelecimentos (Versão Definitiva com Logs e Tratamento de Texto)
router.get('/cadastro/estabelecimentos', async (req, res) => {
    console.log("--- [DEBUG] Iniciando rota /cadastro/estabelecimentos ---");

    try {
        /* TENTATIVA 1: JOIN ROBUSTO
           - CAST(... AS TEXT): Força tudo virar texto.
           - TRIM(...): Remove espaços vazios antes e depois.
           Isso garante que ' 1 ' seja igual a '1'.
        */
        const queryPrincipal = `
            SELECT DISTINCT 
                est.id_estabelecimento,
                est.estabelecimento AS nome_estabelecimento,
                emp.empresa AS nome_empresa
            FROM gold.f_fortes_pagamento f
            JOIN gold.d_fortes_empresa emp 
                ON TRIM(CAST(f.id_empresa AS TEXT)) = TRIM(CAST(emp.id_empresa AS TEXT))
            JOIN gold.d_fortes_estabelecimento est 
                ON TRIM(CAST(f.id_estabelecimento AS TEXT)) = TRIM(CAST(est.id_estabelecimento AS TEXT))
            ORDER BY emp.empresa, est.estabelecimento
        `;
        
        const { rows } = await dbDW.query(queryPrincipal);
        
        console.log(`[DEBUG] Sucesso no JOIN Principal! ${rows.length} registros encontrados.`);
        res.json(rows);

    } catch (error) {
        console.error("[ERRO CRÍTICO] Falha no JOIN Principal:", error.message);
        console.log("[DEBUG] Tentando Plano B (Ler apenas cadastro de estabelecimentos)...");
        
        /* PLANO B: BUSCA SIMPLES
           Se o JOIN falhar (por causa de dados sujos na tabela de pagamentos),
           pelo menos carregamos a lista de nomes para o menu não travar.
        */
        try {
            const queryFallback = `
                SELECT DISTINCT
                    id_estabelecimento, 
                    estabelecimento AS nome_estabelecimento
                FROM gold.d_fortes_estabelecimento
                WHERE estabelecimento IS NOT NULL
                ORDER BY estabelecimento
            `;
            
            const { rows } = await dbDW.query(queryFallback);
            
            // Adiciona um nome de empresa fictício para o frontend não quebrar
            const dadosTratados = rows.map(r => ({
                id_estabelecimento: r.id_estabelecimento,
                nome_estabelecimento: r.nome_estabelecimento,
                nome_empresa: "Empresa não identificada" 
            }));

            console.log(`[DEBUG] Sucesso no Plano B! ${rows.length} registros recuperados.`);
            res.json(dadosTratados);

        } catch (fallbackError) {
            console.error("[ERRO FATAL] O Plano B também falhou:", fallbackError.message);
            res.status(500).json({ 
                message: 'Erro ao buscar estabelecimentos. Verifique o terminal para detalhes.',
                error: fallbackError.message 
            });
        }
    }
});

// --- ROTAS DE HISTÓRICO (MySQL) ---

// --- ROTAS DE HISTÓRICO (MySQL) ---

// 2. Obter Histórico (GET) - Adaptado para MySQL
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

// 3. Salvar Histórico (POST) - Adaptado para MySQL
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

// Rotas de PUT / DELETE para cadastros genéricos (desabilitadas)
router.put('/cadastro/:type', async (req, res) => {
    res.status(403).json({ message: 'Este cadastro é apenas para leitura e é gerenciado pelo banco de dados principal.' });
});
router.delete('/cadastro/:type', async (req, res) => {
     res.status(403).json({ message: 'Este cadastro é apenas para leitura e é gerenciado pelo banco de dados principal.' });
});


// --- ROTAS PARA CENTRO DE CUSTO (CC) ---
// ATUALIZADO: Esta rota (para Cadastros) usa a lógica ORIGINAL (Filho).
router.get('/cc', async (req, res) => {
    try {
        const { rows } = await dbDW.query(
            `SELECT 
                centro_custo_protheus AS nome_cc,
                json_agg(DISTINCT nome_lotacao) AS lotacoes
             FROM gold.d_fortes_lotacao
             WHERE centro_custo_protheus IS NOT NULL
             GROUP BY centro_custo_protheus
             ORDER BY nome_cc`
        );
        
        // O driver 'pg' já retorna 'lotacoes' como um array JS.
        const result = rows.map(row => ({
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

// --- ROTAS PARA LOTAÇÕES ---
router.get('/lotacoes', async (req, res) => {
    try {
        const { rows } = await dbDW.query(
            `SELECT DISTINCT 
                l.nome_lotacao, 
                e.empresa, 
                es.estabelecimento 
             FROM gold.f_fortes_pagamento f
             JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
             JOIN gold.d_fortes_empresa e ON f.id_empresa = e.id_empresa
             JOIN gold.d_fortes_estabelecimento es ON f.id_estabelecimento = es.id_estabelecimento`
        );
        const result = rows.map(row => ({
            id: `${row.nome_lotacao} | ${row.empresa} - ${row.estabelecimento}`,
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
        const { rows } = await dbDW.query(
            `SELECT DISTINCT
                l.nome_lotacao,
                e.empresa,
                es.estabelecimento,
                l.centro_custo_protheus
             FROM gold.f_fortes_pagamento f
             LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
             LEFT JOIN gold.d_fortes_empresa e ON f.id_empresa = e.id_empresa
             LEFT JOIN gold.d_fortes_estabelecimento es ON f.id_estabelecimento = es.id_estabelecimento`
        );
        
        const result = rows.map(l => {
            const id = `${l.nome_lotacao} | ${l.empresa} - ${l.estabelecimento}`;
            const associatedCc = l.centro_custo_protheus; // Usa o CC Filho (Protheus)
            return {
                id: id,
                nome: l.nome_lotacao,
                empresa: l.empresa,
                estabelecimento: l.estabelecimento,
                isAssociated: !!associatedCc,
                centroCusto: associatedCc || null
            };
        });
        res.json(result);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar status das lotações.');
    }
});

// --- FUNÇÃO AUXILIAR PARA CONSTRUIR WHERE CLAUSE (Totalmente reescrita para POSTGRES) ---
// ATUALIZADO: Esta função (para Dashboard/Relatórios) usa a lógica NOVA (Pai).
// CORREÇÃO: Usa um LEFT JOIN em uma subconsulta (cc_map) com DISTINCT ON para prevenir duplicação de linhas.
const buildWhereClause = (filters, startIndex = 1) => {
    let joinClauses = [
        'LEFT JOIN gold.d_fortes_empresa d_emp ON f.id_empresa = d_emp.id_empresa',
        'LEFT JOIN gold.d_fortes_lotacao d_lot ON f.id_lotacao = d_lot.id_lotacao',
        'LEFT JOIN gold.d_fortes_estabelecimento d_est ON f.id_estabelecimento = d_est.id_estabelecimento',
        'LEFT JOIN gold.d_fortes_evento d_evt ON f.id_evento = d_evt.id_evento',
        'LEFT JOIN gold.d_fortes_tipo_folha d_tf ON f.id_folha = d_tf.id_folha',
        `LEFT JOIN (
            SELECT DISTINCT ON (dcc.descricao)
                dcc.descricao AS cc_filho_nome,
                pai.descricao AS cc_pai_nome
            FROM gold.d_protheus_centro_custo dcc
            LEFT JOIN gold.d_protheus_centro_custo pai
                ON LEFT(dcc.id_centro_custo::text, 3) = pai.id_centro_custo::text
               AND CHAR_LENGTH(pai.id_centro_custo::text) = 3
        ) AS cc_map ON d_lot.centro_custo_protheus = cc_map.cc_filho_nome`
    ];
    let whereClauses = [];
    let params = [];
    let paramIndex = startIndex; 

    if (filters.year && filters.year !== 'Todos') { 
        whereClauses.push(`EXTRACT(YEAR FROM f.data) = $${paramIndex++}`); 
        params.push(filters.year); 
    }
    
    // --- INÍCIO DA CORREÇÃO (MÊS) ---
    // Verifica se o filtro de mês existe e se NÃO é "Todos" ou "Todos os Meses"
    if (filters.month && filters.month !== 'Todos' && filters.month !== 'Todos os Meses') {
        const monthNumber = MONTH_MAP[filters.month];
        if(monthNumber) {
            whereClauses.push(`EXTRACT(MONTH FROM f.data) = $${paramIndex++}`); 
            params.push(monthNumber); 
        }
    } 
    // --- FIM DA CORREÇÃO ---

    // Aceita array para Empresa
    if (filters.company && filters.company.length > 0) { 
        const placeholders = filters.company.map(() => `$${paramIndex++}`);
        whereClauses.push(`d_emp.empresa IN (${placeholders.join(',')})`); 
        params.push(...filters.company); 
    }
    
    // Aceita array para Centro de Custo
    if (filters.costCenter && filters.costCenter.length > 0) {
        const placeholders = filters.costCenter.map(() => `$${paramIndex++}`);
        whereClauses.push(`cc_map.cc_pai_nome IN (${placeholders.join(',')})`);
        params.push(...filters.costCenter);
    }

    if (filters.payrollTypes && filters.payrollTypes.length > 0) { 
        const placeholders = filters.payrollTypes.map(() => `$${paramIndex++}`);
        whereClauses.push(`d_tf.descricao IN (${placeholders.join(',')})`); 
        params.push(...filters.payrollTypes); 
    }

    if (filters.lotations && filters.lotations.length > 0) {
        const lotationNames = filters.lotations.map(l => l.split(' | ')[0]);
        const placeholders = lotationNames.map(() => `$${paramIndex++}`);
        whereClauses.push(`d_lot.nome_lotacao IN (${placeholders.join(',')})`);
        params.push(...lotationNames);
    }
    
    if (filters.events && filters.events.length > 0) {
        const placeholders = filters.events.map(() => `$${paramIndex++}`);
        whereClauses.push(`d_evt.evento IN (${placeholders.join(',')})`);
        params.push(...filters.events);
    }

    if (filters.valueType === 'Proventos') {
        whereClauses.push(`d_tf.descricao NOT ILIKE '%ADIANTAMENTO%'`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const joinSql = joinClauses.join(' ');
    
    return { whereSql, joinSql, params, nextParamIndex: paramIndex }; 
};

// --- ROTA DO DASHBOARD (Otimizada) ---
// ATUALIZADO: Esta rota (para Início) usa a lógica NOVA (Pai).
router.post('/dashboard', async (req, res) => {
    const filters = req.body;
    try {
        const [
            tiposFolhaDb, 
            datasDb,
            ccsDb
        ] = await Promise.all([
            dbDW.query('SELECT DISTINCT descricao AS descricao_tipo_folha FROM gold.d_fortes_tipo_folha ORDER BY descricao_tipo_folha'),
            dbDW.query('SELECT DISTINCT EXTRACT(YEAR FROM data) AS ano, EXTRACT(MONTH FROM data) AS mes_num FROM gold.f_fortes_pagamento'), 
            // ATUALIZADO: Popula o filtro com os CCs Pai
            dbDW.query(`
                SELECT DISTINCT pai.descricao AS nome_cc
                FROM gold.d_protheus_centro_custo dcc
                LEFT JOIN gold.d_protheus_centro_custo pai
                    ON LEFT(dcc.id_centro_custo::text, 3) = pai.id_centro_custo::text
                   AND CHAR_LENGTH(pai.id_centro_custo::text) = 3
                WHERE pai.descricao IS NOT NULL
                ORDER BY nome_cc
            `)
        ]);
        
        const anosSet = new Set();
        const mesesSet = new Set();
        datasDb.rows.forEach(r => {
            anosSet.add(r.ano);
            mesesSet.add(r.mes_num);
        });
        const anos = [...anosSet].sort((a, b) => b - a);
        const meses = [...mesesSet].map(num => MONTH_NAME_MAP[num]).filter(Boolean);

        // Constrói a consulta principal
        const { whereSql, joinSql, params } = buildWhereClause(filters); 
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        // ATUALIZADO: Seleciona e agrupa por cc_map.cc_pai_nome
        const sql = `
            SELECT 
                d_emp.empresa,
                cc_map.cc_pai_nome AS centro_custo_pai,
                d_tf.descricao AS tipo_folha,
                SUM(f.${valueField}) as total_valor
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY 
                d_emp.empresa,
                cc_map.cc_pai_nome,
                d_tf.descricao
        `;

        const { rows: filteredData } = await dbDW.query(sql, params); 

        // Processa os dados
        const byEmpresa = {};
        const byCentroCusto = {};
        const payrollHeaders = new Set(); 

        filteredData.forEach(row => {
            const empresa = row.empresa || 'Não especificada';
            const tipo_folha = row.tipo_folha ? row.tipo_folha.trim() : 'Não especificado';
            const valueToSum = parseFloat(row.total_valor) || 0;
            
            payrollHeaders.add(tipo_folha);
            
            // ATUALIZADO: Usa o centro_custo_pai
            const cc = row.centro_custo_pai || 'Sem Centro de Custo';

            if (!byEmpresa[empresa]) byEmpresa[empresa] = {};
            if (!byEmpresa[empresa][tipo_folha]) byEmpresa[empresa][tipo_folha] = 0;
            byEmpresa[empresa][tipo_folha] += valueToSum;

            if (!byCentroCusto[cc]) byCentroCusto[cc] = {};
            if (!byCentroCusto[cc][tipo_folha]) byCentroCusto[cc][tipo_folha] = 0;
            byCentroCusto[cc][tipo_folha] += valueToSum;
        });

        const standardMonths = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const allAvailableMonths = [...new Set([...standardMonths, ...meses].filter(Boolean))]; 
        allAvailableMonths.sort((a, b) => MONTH_MAP[a] - MONTH_MAP[b]);

        res.json({
            availableYears: ['Todos', ...anos],
            availableMonths: ['Todos', ...allAvailableMonths],
            availablePayrollTypes: tiposFolhaDb.rows.map(r => r.descricao_tipo_folha),
            payrollHeaders: Array.from(payrollHeaders).sort(),
            empresaData: byEmpresa,
            ccData: byCentroCusto,
            // ATUALIZADO: Envia a lista de CCs Pai para o filtro do dashboard
            availableCostCenters: ['Todos', ...ccsDb.rows.map(r => r.nome_cc)]
        });

    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados para o dashboard.');
    }
});


// --- ROTA DE RELATÓRIOS (Otimizada) ---
// ATUALIZADO: Esta rota (para Relatórios) usa a lógica NOVA (Pai).
router.post('/reports', async (req, res) => {
    const filters = req.body;
    try {
        // Constrói a consulta principal de agregação
        const { whereSql, joinSql, params } = buildWhereClause(filters);
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        // ATUALIZADO: Seleciona e agrupa por cc_map.cc_pai_nome
        const sql = `
            SELECT 
                EXTRACT(YEAR FROM f.data) AS ano,
                EXTRACT(MONTH FROM f.data) AS mes_num,
                d_emp.empresa,
                cc_map.cc_pai_nome AS centro_custo_pai,
                d_lot.nome_lotacao,
                d_est.estabelecimento,
                d_evt.evento,
                d_tf.descricao AS tipo_folha,
                SUM(f.provento) as total_proventos,
                SUM(f.desconto) as total_descontos,
                SUM(f.liquido) as total_liquido,
                SUM(f.informacao) as total_informacao,
                SUM(f.${valueField}) as total_valor_filtrado
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY 
                ano, mes_num, d_emp.empresa, cc_map.cc_pai_nome,
                d_lot.nome_lotacao, d_est.estabelecimento, d_evt.evento, d_tf.descricao
        `;
        
        const { rows: filteredData } = await dbDW.query(sql, params);

        // Processamento para cada tipo de relatório
        const byYear = {};
        const byMonthInYear = {}; 
        const byCompany = {};
        const byCostCenter = {};
        const byAllocation = {};
        const byPayrollType = {};
        const byEvents = {};
        const byValuesOverYear = {};
        const byValuesOverMonthInYear = {}; 
        const byEventsByTypeAndLotation = {};

        filteredData.forEach(row => {
            const value = parseFloat(row.total_valor_filtrado) || 0;
            const year = row.ano;
            const month = MONTH_NAME_MAP[row.mes_num]; 
            const company = row.empresa || 'Não especificada';
            const event = row.evento || 'Não especificado'; 
            const payrollType = row.tipo_folha || 'Não especificado';
            const lotacaoId = `${row.nome_lotacao || 'N/A'} | ${row.empresa || 'N/A'} - ${row.estabelecimento || 'N/A'}`;
            // ATUALIZADO: Usa o centro_custo_pai
            const ccName = row.centro_custo_pai || 'Sem Centro de Custo';

            byYear[year] = (byYear[year] || 0) + value;
            if (year && !byMonthInYear[year]) byMonthInYear[year] = {};
            if (year && month) byMonthInYear[year][month] = (byMonthInYear[year][month] || 0) + value;
            byCompany[company] = (byCompany[company] || 0) + value;
            byCostCenter[ccName] = (byCostCenter[ccName] || 0) + value;
            byAllocation[lotacaoId] = (byAllocation[lotacaoId] || 0) + value;
            byPayrollType[payrollType] = (byPayrollType[payrollType] || 0) + value;
            byEvents[event] = (byEvents[event] || 0) + value; 

            if (!byEventsByTypeAndLotation[event]) byEventsByTypeAndLotation[event] = {};
            if (!byEventsByTypeAndLotation[event][payrollType]) byEventsByTypeAndLotation[event][payrollType] = {};
            if (!byEventsByTypeAndLotation[event][payrollType][lotacaoId]) { 
                byEventsByTypeAndLotation[event][payrollType][lotacaoId] = {
                    totalProventos: 0, totalDescontos: 0, totalLiquido: 0, totalInformacao: 0 
                };
            }
            byEventsByTypeAndLotation[event][payrollType][lotacaoId].totalProventos += parseFloat(row.total_proventos) || 0;
            byEventsByTypeAndLotation[event][payrollType][lotacaoId].totalDescontos += parseFloat(row.total_descontos) || 0;
            byEventsByTypeAndLotation[event][payrollType][lotacaoId].totalLiquido += parseFloat(row.total_liquido) || 0;
            byEventsByTypeAndLotation[event][payrollType][lotacaoId].totalInformacao += parseFloat(row.total_informacao) || 0;

            if (year) {
                if (!byValuesOverYear[year]) byValuesOverYear[year] = { proventos: 0, descontos: 0, liquido: 0 };
                byValuesOverYear[year].proventos += parseFloat(row.total_proventos) || 0;
                byValuesOverYear[year].descontos += parseFloat(row.total_descontos) || 0;
                byValuesOverYear[year].liquido += parseFloat(row.total_liquido) || 0;
            }
            if (year && month) {
                if (!byValuesOverMonthInYear[year]) byValuesOverMonthInYear[year] = {};
                if (!byValuesOverMonthInYear[year][month]) byValuesOverMonthInYear[year][month] = { proventos: 0, descontos: 0, liquido: 0 };
                byValuesOverMonthInYear[year][month].proventos += parseFloat(row.total_proventos) || 0;
                byValuesOverMonthInYear[year][month].descontos += parseFloat(row.total_descontos) || 0;
                byValuesOverMonthInYear[year][month].liquido += parseFloat(row.total_liquido) || 0;
            }
        });
        
        res.json({
            processedData: {
                byYear, byMonthInYear, byCompany, byCostCenter, byAllocation, 
                byPayrollType, byEvents, byEventsByTypeAndLotation,
                byValuesOverYear, byValuesOverMonthInYear 
            }
        });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados para os relatórios.');
    }
});

// --- ROTA: CARREGAR FILTROS DE RELATÓRIOS (NOVO E OTIMIZADO) ---
// ATUALIZADO: Esta rota (para Relatórios) usa a lógica NOVA (Pai).
router.get('/reports/filters', async (req, res) => {
    try {
        const [
            datasDb, empresasDb, tiposFolhaDb, eventosDb, ccsDb, lotacoesDb
        ] = await Promise.all([
            dbDW.query('SELECT DISTINCT EXTRACT(YEAR FROM data) AS ano, EXTRACT(MONTH FROM data) AS mes_num FROM gold.f_fortes_pagamento'),
            dbDW.query('SELECT DISTINCT empresa AS nome_empresa FROM gold.d_fortes_empresa WHERE empresa IS NOT NULL ORDER BY nome_empresa'),
            dbDW.query('SELECT DISTINCT descricao AS descricao_tipo_folha FROM gold.d_fortes_tipo_folha ORDER BY descricao_tipo_folha'),
            dbDW.query('SELECT DISTINCT evento FROM gold.d_fortes_evento WHERE evento IS NOT NULL ORDER BY evento'),
            // ATUALIZADO: Popula o filtro com os CCs Pai
            dbDW.query(`
                SELECT DISTINCT pai.descricao AS nome_cc
                FROM gold.d_protheus_centro_custo dcc
                LEFT JOIN gold.d_protheus_centro_custo pai
                    ON LEFT(dcc.id_centro_custo::text, 3) = pai.id_centro_custo::text
                   AND CHAR_LENGTH(pai.id_centro_custo::text) = 3
                WHERE pai.descricao IS NOT NULL
                ORDER BY nome_cc
            `),
            dbDW.query(`
                SELECT DISTINCT 
                    l.nome_lotacao, 
                    e.empresa, 
                    es.estabelecimento 
                 FROM gold.f_fortes_pagamento f
                 LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
                 LEFT JOIN gold.d_fortes_empresa e ON f.id_empresa = e.id_empresa
                 LEFT JOIN gold.d_fortes_estabelecimento es ON f.id_estabelecimento = es.id_estabelecimento
                 WHERE l.nome_lotacao IS NOT NULL AND e.empresa IS NOT NULL AND es.estabelecimento IS NOT NULL
            `)
        ]);
        
        // Processa datas
        const anosSet = new Set();
        const mesesSet = new Set();
        datasDb.rows.forEach(r => {
            anosSet.add(r.ano);
            mesesSet.add(r.mes_num);
        });
        const anos = [...anosSet].sort((a, b) => b - a);
        const meses = [...mesesSet].map(num => MONTH_NAME_MAP[num]).filter(Boolean);

        const uniqueLotations = lotacoesDb.rows.map(row => 
            `${row.nome_lotacao} | ${row.empresa} - ${row.estabelecimento}`
        ).sort();
        const standardMonths = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const allAvailableMonths = [...new Set([...standardMonths, ...meses].filter(Boolean))]; 
        allAvailableMonths.sort((a, b) => MONTH_MAP[a] - MONTH_MAP[b]);

        // --- CORREÇÃO AQUI ---
        // Removido 'Todos' e 'Todas' das listas. O frontend irá adicionar isso.
        const filterOptions = {
            years: anos,
            months: allAvailableMonths, 
            companies: empresasDb.rows.map(r => r.nome_empresa),
            costCenters: ccsDb.rows.map(r => r.nome_cc).sort(),
            lotations: uniqueLotations,
            payrollTypes: tiposFolhaDb.rows.map(r => r.descricao_tipo_folha),
            events: (eventosDb.rows || []).map(r => r.evento)
        };
        // --- FIM DA CORREÇÃO ---
        
        res.json({ filterOptions });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar filtros de relatórios.');
    }
});

// --- ROTA: CUSTO DA FOLHA (DINÂMICA) (Adaptada para Postgres) ---
// ATUALIZADO: Esta rota (para Relatórios) usa a lógica NOVA (Pai).
router.post('/reports/payroll-cost', async (req, res) => {
    const filters = req.body;
    const { payrollTypes: tiposFolhaSelecionados } = filters; 

    if (!tiposFolhaSelecionados || tiposFolhaSelecionados.length === 0) {
        return res.json({ rows: [], headers: [], totals: {} });
    }

    try {
        let params = [];
        let paramIndex = 1;

        const selectClauses = tiposFolhaSelecionados.map(tipoFolha => {
            params.push(tipoFolha);
            const alias = tipoFolha.replace(/[^a-zA-Z0-9_]/g, '_');
            return `SUM(CASE WHEN d_tf.descricao = $${paramIndex++} THEN f.provento ELSE 0 END) as "${alias}"`;
        }).join(', ');
        
        const { whereSql, joinSql, params: whereParams, nextParamIndex } = buildWhereClause(filters, paramIndex);
        params.push(...whereParams);

        // ATUALIZADO: Seleciona e agrupa por cc_map.cc_pai_nome
        const sql = `
            SELECT 
                d_emp.empresa,
                d_lot.nome_lotacao,
                cc_map.cc_pai_nome AS centro_custo_pai,
                d_est.estabelecimento,
                ${selectClauses}
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY 
                d_emp.empresa, 
                d_lot.nome_lotacao, 
                cc_map.cc_pai_nome,
                d_est.estabelecimento
            ORDER BY d_emp.empresa, d_lot.nome_lotacao;
        `;

        const { rows } = await dbDW.query(sql, params);

        const aggregatedResult = {};
        const totals = {};
        tiposFolhaSelecionados.forEach(e => { totals[e] = 0; });

        rows.forEach(row => {
            const lotacaoId = `${row.nome_lotacao} | ${row.empresa} - ${row.estabelecimento}`;
            // ATUALIZADO: Usa o centro_custo_pai
            const centroCusto = row.centro_custo_pai || 'Sem Centro de Custo';
            const key = `${centroCusto}|${row.empresa}`;

            if (!aggregatedResult[key]) {
                aggregatedResult[key] = {
                    centroCusto,
                    empresa: row.empresa
                };
                tiposFolhaSelecionados.forEach(e => {
                    aggregatedResult[key][e] = 0;
                });
            }

            tiposFolhaSelecionados.forEach(tipoFolha => {
                const alias = tipoFolha.replace(/[^a-zA-Z0-9_]/g, '_');
                const value = parseFloat(row[alias]) || 0;
                aggregatedResult[key][tipoFolha] += value;
                totals[tipoFolha] += value;
            });
        });
        
        res.json({
            rows: Object.values(aggregatedResult).sort((a, b) => a.centroCusto.localeCompare(b.centroCusto)),
            headers: tiposFolhaSelecionados,
            totals: totals
        });

    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório de custo da folha.');
    }
});


// --- ROTA PARA COMPARATIVO DE PERÍODOS (Adaptada para Postgres) ---
// ATUALIZADO: Esta rota (para Relatórios) usa a lógica NOVA (Pai).
router.post('/reports/comparison', async (req, res) => {
    const { period1, period2, ...filters } = req.body;
    try {
        const processPeriod = async (period) => {
            const periodFilters = { ...filters, year: period.year, month: period.month };
            const { whereSql, joinSql, params } = buildWhereClause(periodFilters); 
            const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
            const valueField = valueTypeMap[filters.valueType] || 'provento';
            
            const sql = `
                SELECT SUM(f.${valueField}) as total 
                FROM gold.f_fortes_pagamento f
                ${joinSql}
                ${whereSql}`;
                
            const { rows } = await dbDW.query(sql, params);
            return rows[0].total || 0;
        };

        const [period1Value, period2Value] = await Promise.all([
            processPeriod(period1),
            processPeriod(period2)
        ]);
        
        res.json({ period1Value, period2Value });
    } catch (error) {
        handleError(res, error, 'Erro ao gerar dados comparativos.');
    }
});


// --- ROTA PARA COLABORADORES (NOVO) ---
// ATUALIZADO: Esta rota (para Colaboradores) usa a lógica ORIGINAL (Filho).
router.get('/colaboradores', async (req, res) => {
    try {
        const { rows } = await dbDW.query(`
            SELECT DISTINCT ON (f.id_funcionario)
                f.id_funcionario, f.cpf, f.funcionario AS nome, f.data_nascimento, f.idade, f.sexo, f.raca_cor, f.estado_civil, f.tempo_casa, f.logradouro, f.end_numero, f.bairro, f.cep, f.grau_instrucao, f.num_dependentes, f.data_admissao, f.data_rescisao, f.data_transferencia, f.hablitacao_categoria, f.hablitacao_numero, f.tem_deficiencia, f.participacao_cipa, f.deficiencia_auditiva, f.deficiencia_fisica, f.deficiencia_intelectual, f.deficiencia_mental, f.deficiencia_visual, f.e_transferido, f.status, f.possui_dependente, f.geracao, f.tempo_servico, f.faixa_etaria, f.tempo_servico_dias, f.cod_funcionario, f.iniciativa_rescisao,
                c.cargo, c.cargo_cbo,
                e.empresa,
                es.estabelecimento,
                l.nome_lotacao, l.centro_custo_protheus
            FROM gold.d_fortes_funcionario f
            LEFT JOIN gold.f_fortes_pagamento ffp ON f.id_funcionario = ffp.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON ffp.id_cargo = c.id_cargo
            LEFT JOIN gold.d_fortes_empresa e ON ffp.id_empresa = e.id_empresa
            LEFT JOIN gold.d_fortes_estabelecimento es ON ffp.id_estabelecimento = es.id_estabelecimento
            LEFT JOIN gold.d_fortes_lotacao l ON ffp.id_lotacao = l.id_lotacao
            ORDER BY f.id_funcionario, ffp.data DESC NULLS LAST
        `);
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados de colaboradores.');
    }
});

// --- ROTA PARA DETALHES DE UM COLABORADOR ESPECÍFICO ---
// ATUALIZADO: Esta rota (para Colaboradores) usa a lógica ORIGINAL (Filho).
router.get('/colaboradores/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await dbDW.query(`
            SELECT DISTINCT ON (f.id_funcionario)
                f.id_funcionario, f.cpf, f.funcionario AS nome, f.data_nascimento, f.idade, f.sexo, f.raca_cor, f.estado_civil, f.tempo_casa, f.logradouro, f.end_numero, f.bairro, f.cep, f.grau_instrucao, f.num_dependentes, f.data_admissao, f.data_rescisao, f.data_transferencia, f.hablitacao_categoria, f.hablitacao_numero, f.tem_deficiencia, f.participacao_cipa, f.deficiencia_auditiva, f.deficiencia_fisica, f.deficiencia_intelectual, f.deficiencia_mental, f.deficiencia_visual, f.e_transferido, f.status, f.possui_dependente, f.geracao, f.tempo_servico, f.faixa_etaria, f.tempo_servico_dias, f.cod_funcionario, f.iniciativa_rescisao,
                c.cargo, c.cargo_cbo,
                e.empresa,
                es.estabelecimento,
                l.nome_lotacao, l.centro_custo_protheus
            FROM gold.d_fortes_funcionario f
            LEFT JOIN gold.f_fortes_pagamento ffp ON f.id_funcionario = ffp.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON ffp.id_cargo = c.id_cargo
            LEFT JOIN gold.d_fortes_empresa e ON ffp.id_empresa = e.id_empresa
            LEFT JOIN gold.d_fortes_estabelecimento es ON ffp.id_estabelecimento = es.id_estabelecimento
            LEFT JOIN gold.d_fortes_lotacao l ON ffp.id_lotacao = l.id_lotacao
            WHERE f.id_funcionario = $1
            ORDER BY f.id_funcionario, ffp.data DESC NULLS LAST
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Colaborador não encontrado.' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar detalhes do colaborador.');
    }
});

// --- ROTA PARA FOLHA DE PAGAMENTO DE UM COLABORADOR ESPECÍFICO ---
router.get('/colaboradores/:id/folha', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await dbDW.query(`
            SELECT
                f.data,
                d_tf.descricao AS tipo_folha,
                SUM(f.provento) AS provento,
                SUM(f.desconto) AS desconto,
                SUM(f.liquido) AS liquido
            FROM gold.f_fortes_pagamento f
            LEFT JOIN gold.d_fortes_tipo_folha d_tf ON f.id_folha = d_tf.id_folha
            WHERE f.id_funcionario = $1
            GROUP BY f.data, d_tf.descricao
            ORDER BY f.data DESC
        `, [id]);
        
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar folha de pagamento do colaborador.');
    }
});

// --- ROTA PARA RESUMO DE FOLHA POR COLABORADOR ---
// ATUALIZADO: Esta rota (para Colaboradores) usa a lógica ORIGINAL (Filho).
router.post('/colaboradores/resumo-folha', async (req, res) => {
    try {
        const { year, month } = req.body;
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        if (year) {
            whereClauses.push(`EXTRACT(YEAR FROM f.data) = $${paramIndex++}`);
            params.push(year);
        }
        if (month) {
            whereClauses.push(`EXTRACT(MONTH FROM f.data) = $${paramIndex++}`);
            params.push(month);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const { rows } = await dbDW.query(`
            SELECT 
                f.id_funcionario,
                func.funcionario AS nome,
                func.cpf,
                c.cargo,
                e.empresa,
                l.nome_lotacao,
                SUM(f.provento) AS total_proventos,
                SUM(f.desconto) AS total_descontos,
                SUM(f.liquido) AS total_liquido,
                COUNT(*) AS quantidade_folhas
            FROM gold.f_fortes_pagamento f
            LEFT JOIN gold.d_fortes_funcionario func ON f.id_funcionario = func.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON f.id_cargo = c.id_cargo
            LEFT JOIN gold.d_fortes_empresa e ON f.id_empresa = e.id_empresa
            LEFT JOIN gold.d_fortes_lotacao l ON f.id_lotacao = l.id_lotacao
            ${whereSql}
            GROUP BY f.id_funcionario, func.funcionario, func.cpf, c.cargo, e.empresa, l.nome_lotacao
            ORDER BY func.funcionario
        `, params);
        
        res.json(rows);
    } catch (error) {
        handleError(res, error, 'Erro ao buscar resumo de folha dos colaboradores.');
    }
});

// --- ROTA: LOTAÇÃO X COLABORADOR X EVENTOS (ATUALIZADA) ---
// ATUALIZADO: Esta rota (para Relatórios) usa a lógica NOVA (Pai).
router.post('/reports/lotacao-colaborador-eventos', async (req, res) => {
    const filters = req.body;
    try {
        const { whereSql, joinSql, params } = buildWhereClause(filters);
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        // 1. Consulta SQL (ADICIONADO d_evt.id_evento)
        const sql = `
            SELECT 
                d_lot.nome_lotacao,
                func.id_funcionario,
                func.funcionario AS nome_colaborador,
                d_evt.id_evento, 
                d_evt.evento,
                SUM(f.${valueField}) as total_evento
            FROM 
                gold.f_fortes_pagamento f
            ${joinSql}
            LEFT JOIN gold.d_fortes_funcionario func ON f.id_funcionario = func.id_funcionario
            ${whereSql}
            AND d_lot.nome_lotacao IS NOT NULL
            AND func.funcionario IS NOT NULL
            AND d_evt.id_evento IS NOT NULL
            AND d_evt.evento IS NOT NULL
            GROUP BY 
                d_lot.nome_lotacao,
                func.id_funcionario,
                func.funcionario,
                d_evt.id_evento, 
                d_evt.evento
            HAVING 
                SUM(f.${valueField}) != 0
            ORDER BY
                d_lot.nome_lotacao, 
                func.funcionario, 
                d_evt.id_evento; 
        `;

        const { rows } = await dbDW.query(sql, params);

        // 2. Processar (Pivotar) os dados
        const lotacoes = {};
        
        rows.forEach(row => {
            const { nome_lotacao, id_funcionario, nome_colaborador, id_evento, evento, total_evento } = row;
            const valor = parseFloat(total_evento);

            if (!nome_lotacao || !nome_colaborador || !id_evento || !evento) return;

            if (!lotacoes[nome_lotacao]) {
                lotacoes[nome_lotacao] = {
                    nome: nome_lotacao,
                    colaboradores: {},
                    totalLotação: 0,
                    lotaçãoEventsSet: new Set() // Usará um Set de objetos stringificados
                };
            }
            if (!lotacoes[nome_lotacao].colaboradores[id_funcionario]) {
                lotacoes[nome_lotacao].colaboradores[id_funcionario] = {
                    id: id_funcionario,
                    nome: nome_colaborador,
                    eventos: {}, // Será preenchido com {id_evento: valor}
                    totalColaborador: 0
                };
            }

            // ATUALIZADO: Usar id_evento como chave e guardar objeto {id, name} no Set
            lotacoes[nome_lotacao].colaboradores[id_funcionario].eventos[id_evento] = valor;
            lotacoes[nome_lotacao].colaboradores[id_funcionario].totalColaborador += valor;
            lotacoes[nome_lotacao].totalLotação += valor;
            lotacoes[nome_lotacao].lotaçãoEventsSet.add(JSON.stringify({ id: id_evento, name: evento }));
        });

        // 3. Formatar a saída
        const finalData = Object.values(lotacoes).map(lotacao => {
            lotacao.colaboradores = Object.values(lotacao.colaboradores).sort((a, b) => a.nome.localeCompare(b.nome));
            // ATUALIZADO: Converter Set de strings de volta para objetos e ordenar pelo ID
            lotacao.lotaçãoHeaders = Array.from(lotacao.lotaçãoEventsSet).map(s => JSON.parse(s));
            lotacao.lotaçãoHeaders.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
            delete lotacao.lotaçãoEventsSet;
            return lotacao;
        }).sort((a, b) => a.nome.localeCompare(b.nome));

        res.json({ data: finalData });

    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório Lotação x Colaborador x Eventos.');
    }
});

// --- ROTA: CENTRO DE CUSTO X LOTAÇÃO X COLABORADOR (NOVO) ---
// ATUALIZADO: Esta rota (para Relatórios) usa a lógica NOVA (Pai).
router.post('/reports/cc-lotacao-colaborador', async (req, res) => {
    const filters = req.body;
    try {
        const { whereSql, joinSql, params } = buildWhereClause(filters);
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        // 1. Consulta SQL (ADICIONADO d_evt.id_evento e cc_map.cc_pai_nome)
        const sql = `
            SELECT 
                d_emp.empresa,
                cc_map.cc_pai_nome AS centro_custo_pai,
                d_lot.nome_lotacao,
                func.id_funcionario,
                func.funcionario AS nome_colaborador,
                c.cargo,
                d_evt.id_evento,
                d_evt.evento,
                SUM(f.${valueField}) as total_evento
            FROM 
                gold.f_fortes_pagamento f
            ${joinSql}
            LEFT JOIN gold.d_fortes_funcionario func ON f.id_funcionario = func.id_funcionario
            LEFT JOIN gold.d_fortes_cargo c ON f.id_cargo = c.id_cargo
            ${whereSql}
            AND cc_map.cc_pai_nome IS NOT NULL
            AND d_lot.nome_lotacao IS NOT NULL
            AND func.funcionario IS NOT NULL
            AND d_evt.id_evento IS NOT NULL
            AND d_evt.evento IS NOT NULL
            AND c.cargo IS NOT NULL
            GROUP BY 
                d_emp.empresa,
                cc_map.cc_pai_nome,
                d_lot.nome_lotacao,
                func.id_funcionario,
                func.funcionario,
                c.cargo,
                d_evt.id_evento,
                d_evt.evento
            HAVING 
                SUM(f.${valueField}) != 0
            ORDER BY
                cc_map.cc_pai_nome, 
                d_lot.nome_lotacao, 
                func.funcionario, 
                d_evt.id_evento;
        `;

        const { rows } = await dbDW.query(sql, params);

        // 2. Processar (Pivotar) os dados
        const centrosDeCusto = {};
        const grandTotalEventos = {};
        const allEventsSet = new Set();
        const allColaboradoresSet = new Set();
        let grandTotalGeral = 0;

        rows.forEach(row => {
            const { 
                empresa, centro_custo_pai, nome_lotacao, 
                id_funcionario, nome_colaborador, cargo, 
                id_evento, evento, total_evento 
            } = row;
            const valor = parseFloat(total_evento);

            if (!centro_custo_pai || !nome_lotacao || !nome_colaborador || !id_evento || !evento) return;

            // --- Cálculos para o Resumo (ATUALIZADO) ---
            allEventsSet.add(JSON.stringify({ id: id_evento, name: evento }));
            allColaboradoresSet.add(id_funcionario);
            grandTotalEventos[id_evento] = (grandTotalEventos[id_evento] || 0) + valor; // Usar ID como chave
            grandTotalGeral += valor;

            // --- Estrutura Hierárquica ---
            // Nível 1: Centro de Custo (USA O PAI)
            if (!centrosDeCusto[centro_custo_pai]) {
                centrosDeCusto[centro_custo_pai] = {
                    nome: centro_custo_pai,
                    lotacoes: {},
                    totalCC: 0
                };
            }
            // Nível 2: Lotação
            if (!centrosDeCusto[centro_custo_pai].lotacoes[nome_lotacao]) {
                centrosDeCusto[centro_custo_pai].lotacoes[nome_lotacao] = {
                    nome: nome_lotacao,
                    colaboradores: {},
                    totalLotacao: 0,
                    lotaçãoEventsSet: new Set()
                };
            }
            // Nível 3: Colaborador
            if (!centrosDeCusto[centro_custo_pai].lotacoes[nome_lotacao].colaboradores[id_funcionario]) {
                centrosDeCusto[centro_custo_pai].lotacoes[nome_lotacao].colaboradores[id_funcionario] = {
                    id: id_funcionario, nome: nome_colaborador, empresa: empresa,
                    cargo: cargo, eventos: {}, totalColaborador: 0
                };
            }

            // Atribui os valores (ATUALIZADO)
            const cc = centrosDeCusto[centro_custo_pai];
            const lotacao = cc.lotacoes[nome_lotacao];
            const colab = lotacao.colaboradores[id_funcionario];

            colab.eventos[id_evento] = valor; // Usar ID como chave
            colab.totalColaborador += valor;
            lotacao.totalLotacao += valor;
            lotacao.lotaçãoEventsSet.add(JSON.stringify({ id: id_evento, name: evento }));
            cc.totalCC += valor;
        });

        // ATUALIZADO: Converter Set de strings de volta para objetos e ordenar pelo ID
        const allEventHeaders = Array.from(allEventsSet).map(s => JSON.parse(s));
        allEventHeaders.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));

        // 3. Formatar a saída
        const finalData = Object.values(centrosDeCusto).map(cc => {
            cc.lotacoes = Object.values(cc.lotacoes).map(lotacao => {
                lotacao.colaboradores = Object.values(lotacao.colaboradores).sort((a, b) => a.nome.localeCompare(b.nome));
                // ATUALIZADO: Converter Set de strings de volta para objetos e ordenar pelo ID
                lotacao.lotaçãoHeaders = Array.from(lotacao.lotaçãoEventsSet).map(s => JSON.parse(s));
                lotacao.lotaçãoHeaders.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
                delete lotacao.lotaçãoEventsSet;
                return lotacao;
            }).sort((a, b) => a.nome.localeCompare(b.nome));
            return cc;
        }).sort((a, b) => a.nome.localeCompare(b.nome));

        res.json({
            data: finalData,
            summary: {
                totalColaboradores: allColaboradoresSet.size,
                grandTotalEventos: grandTotalEventos,
                allEventHeaders: allEventHeaders,
                grandTotalGeral: grandTotalGeral
            }
        });

    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório CC x Colaborador x Eventos.');
    }
});

// --- ROTA: RELATÓRIO VALORES FOLHA VS COLABORADORES (NOVO) ---
router.post('/reports/folha-vs-colaboradores', async (req, res) => {
    const filters = req.body;
    try {
        // Usa a mesma função de filtros dos outros relatórios (já com a lógica de CC Pai)
        const { whereSql, joinSql, params } = buildWhereClause(filters);
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        // 1. Consulta SQL para buscar os dois indicadores por mês
        const sql = `
            SELECT 
                EXTRACT(MONTH FROM f.data) AS mes_num,
                SUM(f.${valueField}) as total_valor,
                COUNT(DISTINCT f.id_funcionario) as total_colaboradores
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            AND EXTRACT(MONTH FROM f.data) IS NOT NULL
            GROUP BY mes_num
            ORDER BY mes_num;
        `;

        const { rows } = await dbDW.query(sql, params);

        // 2. Processar os dados para o gráfico
        const processed = {
            labels: [],
            valorData: [],
            qtdData: []
        };
        const monthData = {};
        rows.forEach(r => {
            monthData[r.mes_num] = {
                valor: parseFloat(r.total_valor),
                qtd: parseInt(r.total_colaboradores, 10)
            };
        });

        // Garante que todos os 12 meses apareçam no gráfico
        for (let i = 1; i <= 12; i++) {
            processed.labels.push(MONTH_NAME_MAP[i]); // MONTH_NAME_MAP já existe no seu routes.js
            if (monthData[i]) {
                processed.valorData.push(monthData[i].valor);
                processed.qtdData.push(monthData[i].qtd);
            } else {
                processed.valorData.push(0);
                processed.qtdData.push(0);
            }
        }
        
        res.json(processed);

    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório Valores Folha x Colaboradores.');
    }
});

// --- ROTAS DE LANÇAMENTO DE ENCARGOS ---

    // 1. Buscar dados para a tela de Lançamentos (Lista empresas e valores salvos)
router.get('/lancamentos/encargos', async (req, res) => {
    const { mes, ano } = req.query;
    
    if (!mes || !ano) return res.status(400).json({ message: 'Mês e Ano são obrigatórios.' });

    const competencia = `${ano}-${mes}-01`;

    try {
        const queryDW = `
            SELECT DISTINCT 
                emp.id_empresa, 
                emp.empresa AS nome_empresa
            FROM gold.f_fortes_pagamento f
            JOIN gold.d_fortes_empresa emp 
                ON TRIM(CAST(f.id_empresa AS TEXT)) = TRIM(CAST(emp.id_empresa AS TEXT))
            WHERE EXTRACT(MONTH FROM f.data) = $1 
              AND EXTRACT(YEAR FROM f.data) = $2
            ORDER BY emp.empresa
        `;
        const { rows: empresasDW } = await dbDW.query(queryDW, [mes, ano]);

        if (empresasDW.length === 0) {
            return res.json([]); 
        }

        // Query MySQL atualizada (não busca 'valor_recolhimento')
        const [lancamentosSalvos] = await dbApp.query(`
            SELECT id_empresa, valor_compensacao 
            FROM lancamentos_encargos_empresa 
            WHERE competencia = ?
        `, [competencia]);

        const resultado = empresasDW.map(emp => {
            const salvo = lancamentosSalvos.find(l => String(l.id_empresa) === String(emp.id_empresa));
            
            return {
                id_empresa: emp.id_empresa,
                nome_empresa: emp.nome_empresa,
                compensacao: salvo ? parseFloat(salvo.valor_compensacao) : 0.00,
                // Linha de 'recolhimento' removida
            };
        });

        res.json(resultado);

    } catch (error) {
        handleError(res, error, 'Erro ao buscar lançamentos de encargos.');
    }
});

// 2. Salvar Lançamentos (Apenas Compensação)
router.post('/lancamentos/encargos', async (req, res) => {
    const { lancamentos, mes, ano } = req.body;
    const competencia = `${ano}-${mes}-01`;
    
    try {
        for (const item of lancamentos) {
            // Query MySQL atualizada (não salva 'valor_recolhimento')
            await dbApp.query(`
                INSERT INTO lancamentos_encargos_empresa 
                (id_empresa, nome_empresa, competencia, valor_compensacao, data_atualizacao)
                VALUES (?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    valor_compensacao = VALUES(valor_compensacao),
                    data_atualizacao = NOW()
            `, [item.id_empresa, item.nome_empresa, competencia, item.compensacao]); // <-- 'recolhimento' removido do array
        }
        res.json({ message: 'Lançamentos salvos com sucesso!' });
    } catch (error) {
        handleError(res, error, 'Erro ao salvar lançamentos.');
    }
});

// --- ROTA DO RELATÓRIO DE ENCARGOS (CÁLCULO FINAL) ---
// SUBSTITUA A SUA ROTA INTEIRA POR ESTA:
router.post('/reports/analise-encargos', async (req, res) => {
    
    const filters = req.body; 
    const { year } = filters; 
    
    try {
        const { whereSql, joinSql, params } = buildWhereClause(filters);

        // PASSO 1: Buscar Totais de Folha e FGTS no DW
        const sqlDW = `
            SELECT 
                d_emp.id_empresa,
                d_emp.empresa AS nome_empresa,
                d_est.id_estabelecimento,
                EXTRACT(MONTH FROM f.data) as mes,
                EXTRACT(YEAR FROM f.data) as ano,
                
                SUM(f.provento) as total_folha,
                SUM(CASE WHEN d_evt.evento ILIKE '%FGTS%' THEN f.informacao ELSE 0 END) as total_fgts

            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY d_emp.id_empresa, d_emp.empresa, d_est.id_estabelecimento, mes, ano
        `;
        
        const { rows: dadosDW } = await dbDW.query(sqlDW, params);

        // PASSO 2: Buscar Histórico de Alíquotas no Banco Local (MySQL)
        const [regrasAliquota] = await dbApp.query(`
            SELECT id_estabelecimento, competencia_inicio, aliq_patronal, rat, fap, aliq_terceiros
            FROM historico_encargos_estabelecimento
            ORDER BY competencia_inicio DESC
        `);

        // PASSO 3: Buscar Compensações/Recolhimentos manuais
        const yearForMySQL = (year && year !== 'Todos') ? year : new Date().getFullYear();
            
        const [lancamentosManuais] = await dbApp.query(`
            SELECT id_empresa, competencia, valor_compensacao
            FROM lancamentos_encargos_empresa
            WHERE YEAR(competencia) = ?
        `, [yearForMySQL]); // Só precisamos da compensação

        // PASSO 4: Processamento em Memória (Node.js)
        const consolidado = {}; 
        dadosDW.forEach(row => {
            const chave = `${row.ano}|${row.mes}`;
            const dataMovimento = new Date(row.ano, row.mes - 1, 1); 
            
            const regra = regrasAliquota.find(r => 
                String(r?.id_estabelecimento).trim() == String(row?.id_estabelecimento).trim() && 
                new Date(r.competencia_inicio) <= dataMovimento
            );
            
            const patronal = regra ? parseFloat(regra.aliq_patronal) : 20.0;
            const rat = regra ? parseFloat(regra.rat) : 0.0;
            const fap = regra ? parseFloat(regra.fap) : 1.0;
            const terceiros = regra ? parseFloat(regra.aliq_terceiros) : 0.0;
            const isEncargoZero = (regra && patronal === 0 && rat === 0 && terceiros === 0);
            const percentualTotal = patronal + terceiros + (rat * fap);
            const valorINSS = (parseFloat(row.total_folha) * percentualTotal) / 100;

            if (!consolidado[chave]) {
                consolidado[chave] = {
                    mes: row.mes,
                    ano: row.ano,
                    folha: 0,
                    fgts: 0,
                    inss: 0
                };
            }
            
            consolidado[chave].folha += parseFloat(row.total_folha);
            consolidado[chave].inss += valorINSS; 
            if (!isEncargoZero) {
                consolidado[chave].fgts += parseFloat(row.total_fgts);
            }
        });

        // PASSO 5: Unir com Lançamentos Manuais e Formatar Saída
        const relatorioFinal = Object.values(consolidado).map(item => {
            const dataComp = new Date(item.ano, item.mes - 1, 1).toISOString().slice(0, 10);
            const manuaisDoMes = lancamentosManuais.filter(l => 
                new Date(l.competencia).toISOString().slice(0, 10) === dataComp
            );
            
            // --- CORREÇÃO DA LÓGICA ---
            // Compensação é o valor lançado
            const compensacao = manuaisDoMes.reduce((acc, m) => acc + parseFloat(m.valor_compensacao), 0);
            // Recolhimento é o cálculo
            const recolhimento = item.inss - compensacao; 
            const totalEncargos = item.inss + item.fgts;
            // --- FIM DA CORREÇÃO ---

            return {
                ...item,
                total_encargos: totalEncargos,
                compensacao: compensacao,
                recolhimento: recolhimento, // <-- Envia o valor calculado
            };
        });

        res.json(relatorioFinal);

    } catch (error) {
        handleError(res, error, 'Erro ao gerar relatório de encargos.');
    }
});

module.exports = router;