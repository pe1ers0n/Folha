// routes/dashboard.js
// Tela de Início (Dashboard): agregações por empresa e centro de custo.


const express = require('express');
const { dbDW, cache, FILTER_OPTIONS_CACHE_MS, MONTH_MAP, MONTH_NAME_MAP, handleError, buildWhereClause } = require('./_shared');

const router = express.Router();


router.post('/dashboard', async (req, res) => {
    const filters = req.body;
    try {
        // ANTES: essas 3 consultas (que não dependem dos filtros do usuário) rodavam
        // do zero a cada POST /dashboard, incluindo um self-join pesado e não indexável
        // (LEFT(...)::text) sobre a tabela de centro de custo. Agora ficam em cache por
        // alguns minutos, já que essas listas só mudam quando entra carga nova no DW.
        const [tiposFolhaDb, datasDb, ccsDb] = await cache.getOrSet('dashboard:static-lookups', FILTER_OPTIONS_CACHE_MS, () => Promise.all([
            dbDW.query('SELECT DISTINCT descricao AS descricao_tipo_folha FROM gold.d_fortes_tipo_folha ORDER BY descricao_tipo_folha'),
            dbDW.query('SELECT DISTINCT EXTRACT(YEAR FROM data) AS ano, EXTRACT(MONTH FROM data) AS mes_num FROM gold.f_fortes_pagamento'),
            dbDW.query(`SELECT DISTINCT pai.descricao AS nome_cc FROM gold.d_protheus_centro_custo dcc LEFT JOIN gold.d_protheus_centro_custo pai ON LEFT(dcc.id_centro_custo::text, 3) = pai.id_centro_custo::text AND CHAR_LENGTH(pai.id_centro_custo::text) = 3 WHERE pai.descricao IS NOT NULL ORDER BY nome_cc`)
        ]));

        const anos = [...new Set(datasDb.rows.map(r => r.ano))].sort((a, b) => b - a);
        const meses = [...new Set(datasDb.rows.map(r => r.mes_num))].map(num => MONTH_NAME_MAP[num]).filter(Boolean);

        const { whereSql, joinSql, params } = buildWhereClause(filters); 
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        const sql = `
            SELECT 
                d_emp.empresa,
                cc_map.cc_pai_nome AS centro_custo_pai,
                cc_map.cc_pai_id AS centro_custo_pai_id,
                cc_map.cc_filho_nome AS centro_custo_filho,
                cc_map.cc_filho_id AS centro_custo_filho_id, -- NOVO
                d_tf.descricao AS tipo_folha,
                SUM(f.${valueField}) as total_valor
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY 
                d_emp.empresa,
                cc_map.cc_pai_nome,
                cc_map.cc_pai_id,
                cc_map.cc_filho_nome,
                cc_map.cc_filho_id, -- NOVO
                d_tf.descricao
        `;

        const { rows: filteredData } = await dbDW.query(sql, params); 

        const byEmpresa = {};
        const byCentroCusto = {};
        const payrollHeaders = new Set(); 

        filteredData.forEach(row => {
            const empresa = row.empresa || 'Não especificada';
            const tipo_folha = row.tipo_folha ? row.tipo_folha.trim() : 'Não especificado';
            const valueToSum = parseFloat(row.total_valor) || 0;
            payrollHeaders.add(tipo_folha);
            
            // Pai (Chave Composta)
            const ccPaiName = row.centro_custo_pai || 'Sem Centro de Custo';
            const ccPaiId = row.centro_custo_pai_id || '';
            const ccPaiKey = ccPaiId ? `${ccPaiName}|||${ccPaiId}` : ccPaiName;

            // Filho (Chave Composta - NOVO)
            const ccFilhoName = row.centro_custo_filho || 'Indefinido';
            const ccFilhoId = row.centro_custo_filho_id || '';
            const ccFilhoKey = ccFilhoId ? `${ccFilhoName}|||${ccFilhoId}` : ccFilhoName;

            // Agrupamento Empresa
            if (!byEmpresa[empresa]) byEmpresa[empresa] = {};
            if (!byEmpresa[empresa][tipo_folha]) byEmpresa[empresa][tipo_folha] = 0;
            byEmpresa[empresa][tipo_folha] += valueToSum;

            // Agrupamento CC
            if (!byCentroCusto[ccPaiKey]) {
                byCentroCusto[ccPaiKey] = { isHierarchy: true, totals: {}, children: {} };
            }
            // Soma Pai
            if (!byCentroCusto[ccPaiKey].totals[tipo_folha]) byCentroCusto[ccPaiKey].totals[tipo_folha] = 0;
            byCentroCusto[ccPaiKey].totals[tipo_folha] += valueToSum;

            // Soma Filho (Usando a chave composta)
            if (!byCentroCusto[ccPaiKey].children[ccFilhoKey]) byCentroCusto[ccPaiKey].children[ccFilhoKey] = {};
            if (!byCentroCusto[ccPaiKey].children[ccFilhoKey][tipo_folha]) byCentroCusto[ccPaiKey].children[ccFilhoKey][tipo_folha] = 0;
            byCentroCusto[ccPaiKey].children[ccFilhoKey][tipo_folha] += valueToSum;
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
            availableCostCenters: ['Todos', ...ccsDb.rows.map(r => r.nome_cc)]
        });

    } catch (error) {
        handleError(res, error, 'Erro ao buscar dados para o dashboard.');
    }
});

module.exports = router;
