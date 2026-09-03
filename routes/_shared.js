// routes/_shared.js
// Helpers e utilitários compartilhados por todos os módulos de rota.
// Centraliza o que antes vivia no topo do antigo routes.js monolítico:
// conexões de banco, cache, tratamento de erro, permissões de relatório,
// mapas de meses e as funções de montagem de consulta (buildWhereClause /
// buildReportFilterOptions) usadas por Dashboard e Relatórios.

const { dbDW, dbApp } = require('../database'); // Postgres (DW) + MySQL (App)
const cache = require('../cache'); // Cache em memória para consultas pesadas e pouco voláteis

// Tempo de vida do cache das listas de filtro (anos, empresas, tipos de folha, etc.).
// Esses dados só mudam quando chega uma nova carga de folha de pagamento no DW,
// então cachear por alguns minutos evita escanear a tabela de fatos inteira a
// cada vez que alguém abre a tela de Início/Relatórios ou muda um filtro.
const FILTER_OPTIONS_CACHE_MS = 5 * 60 * 1000; // 5 minutos

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

// --- SEGURANÇA: PERMISSÃO POR RELATÓRIO ESPECÍFICO ---
// O middleware requireMenu (em server.js) só garante que o usuário tem acesso
// ao menu "Relatórios" como um todo. Esta função confere a permissão fina de
// cada relatório individual (campo relatorios_permitidos do usuário).
const hasReportPermission = (req, reportType) => {
    if (!req.user) return false;
    if (req.user.is_admin) return true;
    const permitidos = (req.user.relatorios_permitidos || '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
    return permitidos.includes(reportType);
};

const requireReportPermission = (reportType) => (req, res, next) => {
    if (!hasReportPermission(req, reportType)) {
        return res.status(403).json({ message: 'Você não tem permissão para este relatório.' });
    }
    next();
};

// --- FUNÇÃO AUXILIAR PARA CONSTRUIR WHERE CLAUSE (Postgres / DW) ---
// Usa um LEFT JOIN em uma subconsulta (cc_map) com DISTINCT ON para prevenir
// duplicação de linhas, e intervalo de datas (BETWEEN) em vez de EXTRACT para
// ativar o índice de data do banco.
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
                dcc.id_centro_custo AS cc_filho_id,
                pai.descricao AS cc_pai_nome,
                pai.id_centro_custo AS cc_pai_id
            FROM gold.d_protheus_centro_custo dcc
            LEFT JOIN gold.d_protheus_centro_custo pai
                ON LEFT(dcc.id_centro_custo::text, 3) = pai.id_centro_custo::text
               AND CHAR_LENGTH(pai.id_centro_custo::text) = 3
        ) AS cc_map ON d_lot.centro_custo_protheus = cc_map.cc_filho_nome`
    ];

    let whereClauses = [];
    let params = [];
    let paramIndex = startIndex;

    // --- OTIMIZAÇÃO DE DATA (CRÍTICO) ---
    // Em vez de EXTRACT, usamos intervalo (BETWEEN) para ativar o índice do banco
    if (filters.year && filters.year !== 'Todos') {
        let startDate, endDate;
        const year = parseInt(filters.year);

        if (filters.month && filters.month !== 'Todos' && filters.month !== 'Todos os Meses' && filters.month !== 'Ano Completo') {
            if (filters.month.includes('Trimestre') || filters.month.includes('Q')) {
                // Lógica de Trimestres (Q1, Q2, Q3, Q4)
                let startMonth, endMonth;
                if (filters.month.includes('Q1')) { startMonth = '01'; endMonth = '03'; }
                else if (filters.month.includes('Q2')) { startMonth = '04'; endMonth = '06'; }
                else if (filters.month.includes('Q3')) { startMonth = '07'; endMonth = '09'; }
                else if (filters.month.includes('Q4')) { startMonth = '10'; endMonth = '12'; }

                const lastDay = new Date(year, parseInt(endMonth), 0).getDate();
                startDate = `${year}-${startMonth}-01`;
                endDate = `${year}-${endMonth}-${lastDay}`;

            } else if (filters.month.includes('Semestre') || filters.month.includes('S')) {
                // --- LÓGICA DE SEMESTRES (S1, S2) ---
                let startMonth, endMonth;
                if (filters.month.includes('1º') || filters.month.includes('S1')) {
                    startMonth = '01'; endMonth = '06';
                } else if (filters.month.includes('2º') || filters.month.includes('S2')) {
                    startMonth = '07'; endMonth = '12';
                }

                const lastDay = new Date(year, parseInt(endMonth), 0).getDate();
                startDate = `${year}-${startMonth}-01`;
                endDate = `${year}-${endMonth}-${lastDay}`;

            } else {
                // Filtro de Mês Específico (ex: 2025-02-01 a 2025-02-28)
                const monthNum = MONTH_MAP[filters.month];
                startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
                const lastDay = new Date(year, monthNum, 0).getDate();
                endDate = `${year}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
            }
        } else {
            // Filtro de Ano Inteiro (ex: 2025-01-01 a 2025-12-31)
            startDate = `${year}-01-01`;
            endDate = `${year}-12-31`;
        }

        whereClauses.push(`f.data >= $${paramIndex++} AND f.data <= $${paramIndex++}`);
        params.push(startDate, endDate);
    }

    if (filters.company && filters.company.length > 0) {
        const placeholders = filters.company.map(() => `$${paramIndex++}`);
        whereClauses.push(`d_emp.empresa IN (${placeholders.join(',')})`);
        params.push(...filters.company);
    }

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

    // Ignora o Adiantamento (001) quando o tipo de valor é Proventos
    if (filters.valueType === 'Proventos') {
        whereClauses.push(`TRIM(f.id_evento) != '001'`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const joinSql = joinClauses.join(' ');

    return { whereSql, joinSql, params, nextParamIndex: paramIndex };
};

// Monta as listas de opções dos filtros de Relatórios (anos, meses, empresas,
// centros de custo, lotações, tipos de folha, eventos). Fica em cache na rota.
async function buildReportFilterOptions() {
    const [
        datasDb, empresasDb, tiposFolhaDb, eventosDb, ccsDb, lotacoesDb
    ] = await Promise.all([
        dbDW.query('SELECT DISTINCT EXTRACT(YEAR FROM data) AS ano, EXTRACT(MONTH FROM data) AS mes_num FROM gold.f_fortes_pagamento'),
        dbDW.query('SELECT DISTINCT empresa AS nome_empresa FROM gold.d_fortes_empresa WHERE empresa IS NOT NULL ORDER BY nome_empresa'),
        dbDW.query('SELECT DISTINCT descricao AS descricao_tipo_folha FROM gold.d_fortes_tipo_folha ORDER BY descricao_tipo_folha'),
        dbDW.query('SELECT DISTINCT evento FROM gold.d_fortes_evento WHERE evento IS NOT NULL ORDER BY evento'),
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

    // 'Todos'/'Todas' são adicionados pelo frontend, não aqui.
    return {
        years: anos,
        months: allAvailableMonths,
        companies: empresasDb.rows.map(r => r.nome_empresa),
        costCenters: ccsDb.rows.map(r => r.nome_cc).sort(),
        lotations: uniqueLotations,
        payrollTypes: tiposFolhaDb.rows.map(r => r.descricao_tipo_folha),
        events: (eventosDb.rows || []).map(r => r.evento)
    };
}

module.exports = {
    dbDW,
    dbApp,
    cache,
    FILTER_OPTIONS_CACHE_MS,
    MONTH_MAP,
    MONTH_NAME_MAP,
    handleError,
    hasReportPermission,
    requireReportPermission,
    buildWhereClause,
    buildReportFilterOptions,
};
