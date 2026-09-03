// routes/reports.js
// Todos os relatórios do menu Relatórios + os filtros da tela. Protegido por
// requireMenu('relatorios') em server.js; cada relatório checa também a
// permissão fina via requireReportPermission / hasReportPermission.


const express = require('express');
const { dbDW, dbApp, cache, FILTER_OPTIONS_CACHE_MS, MONTH_MAP, MONTH_NAME_MAP, handleError, hasReportPermission, requireReportPermission, buildWhereClause, buildReportFilterOptions } = require('./_shared');

const router = express.Router();


router.post('/reports', async (req, res) => {
    const filters = req.body;

    // SEGURANÇA: esta rota atende vários relatórios diferentes (Por Empresa,
    // Por Centro de Custo, Por Lotação, Por Tipo de Folha, Por Evento, Folha
    // por Ano/Mês, Relatório por Valores). O frontend informa qual deles está
    // sendo pedido em filters.reportType; sem isso não é possível saber qual
    // permissão checar.
    if (!filters.reportType || !hasReportPermission(req, filters.reportType)) {
        return res.status(403).json({ message: 'Você não tem permissão para este relatório.' });
    }

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

router.get('/reports/filters', async (req, res) => {
    try {
        // Esta rota não recebe filtros (é sempre a lista completa de opções) e faz
        // 6 consultas, várias delas escaneando a tabela de fatos inteira. Antes rodava
        // isso a cada carregamento de tela; agora fica em cache por alguns minutos.
        const filterOptions = await cache.getOrSet('reports:filter-options', FILTER_OPTIONS_CACHE_MS, () => buildReportFilterOptions());
        res.json({ filterOptions });
    } catch (error) {
        handleError(res, error, 'Erro ao buscar filtros de relatórios.');
    }
});

router.post('/reports/payroll-cost', requireReportPermission('custo-folha'), async (req, res) => {
    const filters = req.body;
    const { payrollTypes: tiposFolhaSelecionados } = filters; 

    if (!tiposFolhaSelecionados || tiposFolhaSelecionados.length === 0) {
        return res.json({ rows: [], headers: [], totals: {} });
    }

    try {
        let params = [];
        let paramIndex = 1;

        // Constrói as colunas dinâmicas (Pivot)
        const selectClauses = tiposFolhaSelecionados.map(tipoFolha => {
            params.push(tipoFolha);
            const alias = tipoFolha.replace(/[^a-zA-Z0-9_]/g, '_');
            return `SUM(CASE WHEN d_tf.descricao = $${paramIndex++} THEN f.provento ELSE 0 END) as "${alias}"`;
        }).join(', ');
        
        const { whereSql, joinSql, params: whereParams } = buildWhereClause(filters, paramIndex);
        params.push(...whereParams);

        const sql = `
            SELECT 
                d_emp.empresa,
                cc_map.cc_pai_nome AS centro_custo_pai, -- Agrupa pelo Pai
                ${selectClauses}
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY 
                d_emp.empresa, 
                cc_map.cc_pai_nome
            ORDER BY d_emp.empresa, cc_map.cc_pai_nome;
        `;

        const { rows } = await dbDW.query(sql, params);

        const totals = {};
        tiposFolhaSelecionados.forEach(e => { totals[e] = 0; });

        // Processamento leve no Node.js (apenas formatação)
        const processedRows = rows.map(row => {
            const centroCusto = row.centro_custo_pai || 'Sem Centro de Custo';
            const empresa = row.empresa || 'Indefinida';
            
            const rowData = { centroCusto, empresa };
            
            tiposFolhaSelecionados.forEach(tipoFolha => {
                const alias = tipoFolha.replace(/[^a-zA-Z0-9_]/g, '_');
                const value = parseFloat(row[alias]) || 0;
                rowData[tipoFolha] = value;
                totals[tipoFolha] += value;
            });
            return rowData;
        });
        
        res.json({
            rows: processedRows,
            headers: tiposFolhaSelecionados,
            totals: totals
        });

    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório de custo da folha.');
    }
});

router.post('/reports/extrato', requireReportPermission('extrato'), async (req, res) => {
    const filters = req.body;

    // SEGURANÇA/PERFORMANCE: sem um mês específico, esta consulta varre a folha
    // inteira (todas as empresas, todos os meses). Exigimos ano e mês específicos
    // aqui também (não só no frontend), pra rota não poder ser chamada direto
    // sem esse filtro.
    if (!filters.year || filters.year === 'Todos' || !filters.month || !MONTH_MAP[filters.month]) {
        return res.status(400).json({
            message: 'Selecione um Ano e um Mês específicos para gerar o Extrato.',
        });
    }

    try {
        const { whereSql, joinSql, params } = buildWhereClause(filters);
        // Garante "WHERE ... AND evento IS NOT NULL" mesmo quando nenhum filtro
        // foi selecionado (whereSql viria vazio nesse caso).
        const finalWhere = whereSql
            ? `${whereSql} AND d_evt.evento IS NOT NULL`
            : 'WHERE d_evt.evento IS NOT NULL';

        const sql = `
            SELECT
                d_evt.id_evento,
                d_evt.evento,
                SUM(f.provento) as total_provento,
                SUM(f.desconto) as total_desconto,
                SUM(f.liquido) as total_liquido
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${finalWhere}
            GROUP BY d_evt.id_evento, d_evt.evento
            ORDER BY d_evt.evento
        `;

        const { rows } = await dbDW.query(sql, params);

        const data = rows.map((r) => ({
            codigo: r.id_evento,
            evento: r.evento,
            proventos: parseFloat(r.total_provento) || 0,
            descontos: parseFloat(r.total_desconto) || 0,
            liquido: parseFloat(r.total_liquido) || 0,
        }));

        const totals = data.reduce(
            (acc, r) => {
                acc.proventos += r.proventos;
                acc.descontos += r.descontos;
                acc.liquido += r.liquido;
                return acc;
            },
            { proventos: 0, descontos: 0, liquido: 0 }
        );

        res.json({ rows: data, totals });
    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório de Extrato.');
    }
});

router.post('/reports/comparison', requireReportPermission('comparativo-periodos'), async (req, res) => {
    const { period1, period2, ...globalFilters } = req.body;
    try {
        const processPeriod = async (period) => {
            const periodFilters = { ...globalFilters, year: period.year, month: period.month };
            const { whereSql, joinSql, params } = buildWhereClause(periodFilters); 
            const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
            const valueField = valueTypeMap[globalFilters.valueType] || 'provento';
            
            const sql = `
                SELECT 
                    COALESCE(d_tf.descricao, 'Não Especificado') AS tipo_folha,
                    SUM(f.${valueField}) as total 
                FROM gold.f_fortes_pagamento f
                ${joinSql}
                ${whereSql}
                GROUP BY d_tf.descricao
            `;
                
            const { rows } = await dbDW.query(sql, params);
            
            let grandTotal = 0;
            const breakdown = {};
            rows.forEach(r => {
                const val = parseFloat(r.total) || 0;
                breakdown[r.tipo_folha] = val;
                grandTotal += val;
            });

            return { grandTotal, breakdown };
        };

        const [p1Data, p2Data] = await Promise.all([
            processPeriod(period1),
            processPeriod(period2)
        ]);
        
        res.json({ period1: p1Data, period2: p2Data });
    } catch (error) {
        handleError(res, error, 'Erro ao gerar dados comparativos.');
    }
});

router.post('/reports/lotacao-colaborador-eventos', requireReportPermission('lotacao-colaborador-eventos'), async (req, res) => {
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

router.post('/reports/cc-lotacao-colaborador', requireReportPermission('cc-lotacao-colaborador'), async (req, res) => {
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

router.post('/reports/folha-vs-colaboradores', requireReportPermission('folha-vs-colaboradores'), async (req, res) => {
    const filters = req.body;
    try {
        const { whereSql, joinSql, params } = buildWhereClause(filters);
        const valueTypeMap = { 'Líquido': 'liquido', 'Descontos': 'desconto', 'Proventos': 'provento', 'Informação': 'informacao' };
        const valueField = valueTypeMap[filters.valueType] || 'provento';

        // 1. Consulta Principal: Valores quebrados por Tipo de Folha e Mês
        // ATENÇÃO: Removi "AND EXTRACT(MONTH FROM f.data) IS NOT NULL" pois já está implícito
        const sqlValues = `
            SELECT 
                EXTRACT(MONTH FROM f.data) AS mes_num,
                d_tf.descricao AS tipo_folha,
                SUM(f.${valueField}) as total_valor
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY mes_num, d_tf.descricao
            ORDER BY mes_num, d_tf.descricao;
        `;

        // 2. Consulta Secundária: Qtd de Colaboradores
        const sqlCount = `
            SELECT 
                EXTRACT(MONTH FROM f.data) AS mes_num,
                COUNT(DISTINCT f.id_funcionario) as total_colaboradores
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY mes_num;
        `;

        // Executa em paralelo
        const [resValues, resCount] = await Promise.all([
            dbDW.query(sqlValues, params),
            dbDW.query(sqlCount, params)
        ]);

        // --- Processamento dos Dados ---
        
        const countMap = {};
        resCount.rows.forEach(r => countMap[r.mes_num] = parseInt(r.total_colaboradores));

        const valuesMap = {}; 
        const allTypes = new Set();

        resValues.rows.forEach(r => {
            const m = r.mes_num;
            const t = r.tipo_folha;
            const v = parseFloat(r.total_valor);
            
            if (!valuesMap[m]) valuesMap[m] = {};
            valuesMap[m][t] = v;
            allTypes.add(t); // Guarda todos os tipos encontrados
        });

        const uniqueTypes = Array.from(allTypes).sort(); // Ordena alfabeticamente
        const labels = [];
        const qtdData = [];
        
        // Cria a estrutura de datasets vazia para cada tipo encontrado
        const datasets = uniqueTypes.map(type => ({
            label: type,
            data: []
        }));

        // Preenche os 12 meses
        for (let i = 1; i <= 12; i++) {
            labels.push(MONTH_NAME_MAP[i]);
            qtdData.push(countMap[i] || 0);
            
            datasets.forEach(ds => {
                // Se existir valor para este mês e este tipo, usa. Senão, zero.
                const val = valuesMap[i] ? (valuesMap[i][ds.label] || 0) : 0;
                ds.data.push(val);
            });
        }
        
        res.json({
            labels,
            qtdData,
            datasets,
            // Envia totais para o card de resumo
            valorData: datasets.reduce((acc, ds) => { // Recria o vetor de soma total para o card
                ds.data.forEach((v, i) => acc[i] = (acc[i] || 0) + v);
                return acc;
            }, [])
        });

    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório Valores Folha x Colaboradores.');
    }
});

router.post('/reports/analise-encargos', requireReportPermission('analise-encargos'), async (req, res) => {
    const filters = req.body; 
    const { year, company } = filters; // Extraímos também o 'company' dos filtros
    
    try {
        // 1. DATA WAREHOUSE (Folha e FGTS)
        // O buildWhereClause já cuida de filtrar a empresa na tabela Fato do DW
        const { whereSql, joinSql, params } = buildWhereClause(filters);

        const sqlDW = `
            SELECT 
                EXTRACT(MONTH FROM f.data) as mes,
                EXTRACT(YEAR FROM f.data) as ano,
                SUM(CASE 
                    WHEN d_tf.descricao NOT ILIKE '%ADIANTAMENTO%' THEN f.provento 
                    ELSE 0 
                END) as total_folha,
                SUM(CASE WHEN d_evt.evento ILIKE '%FGTS%' THEN f.informacao ELSE 0 END) as total_fgts
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereSql}
            GROUP BY mes, ano
            ORDER BY ano, mes
        `;
        
        const { rows: dadosDW } = await dbDW.query(sqlDW, params);

        // 2. MYSQL (Lançamentos Manuais: INSS, Compensação, Retenção)
        const yearForMySQL = (year && year !== 'Todos') ? year : new Date().getFullYear();
        
        let mysqlQuery = `
            SELECT 
                id_empresa, competencia, valor_inss, valor_compensacao, valor_retencao_1162
            FROM lancamentos_encargos_empresa
            WHERE YEAR(competencia) = ?
        `;
        
        const mysqlParams = [yearForMySQL];

        // --- CORREÇÃO AQUI: Filtro Dinâmico por Empresa no MySQL ---
        // Se o usuário selecionou empresas específicas, adicionamos ao WHERE
        if (company && company.length > 0) {
            // Cria placeholders (?, ?, ?) baseado na quantidade de empresas selecionadas
            const placeholders = company.map(() => '?').join(',');
            mysqlQuery += ` AND nome_empresa IN (${placeholders})`;
            mysqlParams.push(...company);
        }
        // -----------------------------------------------------------

        const [lancamentosManuais] = await dbApp.query(mysqlQuery, mysqlParams);

        // 3. CONSOLIDAÇÃO (Merge dos dados)
        const consolidado = {};

        // 3.1 Dados do DW
        dadosDW.forEach(row => {
            const chave = `${row.ano}|${row.mes}`;
            consolidado[chave] = {
                mes: row.mes,
                ano: row.ano,
                folha: parseFloat(row.total_folha),
                fgts: parseFloat(row.total_fgts),
                inss: 0,
                compensacao: 0,
                retencao: 0
            };
        });

        // 3.2 Soma dados do MySQL (Agora já filtrados por empresa)
        lancamentosManuais.forEach(lanc => {
            const data = new Date(lanc.competencia);
            const ano = data.getFullYear();
            const mes = data.getMonth() + 1;
            const chave = `${ano}|${mes}`;

            if (!consolidado[chave]) {
                 if (year !== 'Todos' && String(ano) !== String(year)) return;
                 consolidado[chave] = { mes, ano, folha: 0, fgts: 0, inss: 0, compensacao: 0, retencao: 0 };
            }

            consolidado[chave].inss += parseFloat(lanc.valor_inss || 0);
            consolidado[chave].compensacao += parseFloat(lanc.valor_compensacao || 0);
            consolidado[chave].retencao += parseFloat(lanc.valor_retencao_1162 || 0);
        });

        // 4. CÁLCULO FINAL
        const relatorioFinal = Object.values(consolidado)
            .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
            .map(item => {
                const totalEncargos = item.inss + item.fgts + item.retencao;
                const recolhimento = totalEncargos - item.compensacao; 

                return {
                    ...item,
                    total_encargos: totalEncargos,
                    recolhimento: recolhimento
                };
        });

        res.json(relatorioFinal);

    } catch (error) {
        handleError(res, error, 'Erro ao gerar relatório de encargos (Filtrado por Empresa).');
    }
});

// --- ROTA: COLABORADORES POR SETOR (Centro de Custo > Lotação, mês a mês) ---
// Relatório em tabela com drill-down: para o ANO escolhido, mostra a QUANTIDADE
// DE COLABORADORES por Centro de Custo (pai) e, dentro dele, por Lotação, em
// cada mês (Jan..Dez). O frontend calcula a variação % de um mês para o outro.
//
// REGRA IMPORTANTE (não contar em duplicidade): um colaborador que aparece em
// mais de uma folha no mesmo mês/lotação é contado UMA ÚNICA VEZ. Isso é
// garantido pelo COUNT(DISTINCT f.id_funcionario). A contagem do Centro de
// Custo (linha pai) é calculada à parte, também com DISTINCT, para que um
// colaborador que esteja em duas lotações do mesmo CC não seja somado duas
// vezes no total do CC.
router.post('/reports/colaboradores-por-setor', requireReportPermission('colaboradores-por-setor'), async (req, res) => {
    const filters = req.body;

    try {
        const MESES_ABR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const analise = (filters.analise === 'anual') ? 'anual' : 'mensal';

        // --- CORTE: só considerar MESES ENCERRADOS ---
        // O mês atual (ainda em andamento) e os futuros não entram — a folha
        // deles ainda não fechou (ex.: em 03/09, Setembro está parcial). O corte
        // é o primeiro dia do mês atual; tudo ANTES dele é mês fechado. Usa o
        // relógio do servidor (máquina do usuário), no fuso local.
        const agora = new Date();
        const curY = agora.getFullYear();
        const curM = agora.getMonth() + 1; // 1..12
        const cutoff = `${curY}-${String(curM).padStart(2, '0')}-01`;
        const fechado = (ano, mes) => (ano < curY) || (ano === curY && mes < curM);

        // No modo ANUAL comparamos ano a ano (todos os anos); o filtro de Ano só
        // vale no modo MENSAL.
        const ehAnoEspecifico = analise === 'mensal' && filters.year && filters.year !== 'Todos';
        const anoSel = ehAnoEspecifico ? parseInt(filters.year, 10) : null;

        const filtrosBase = Object.assign({}, filters, { year: 'Todos', month: 'Todos' });
        const { whereSql, joinSql, params, nextParamIndex } = buildWhereClause(filtrosBase);

        // WHERE final: filtros + corte do mês encerrado (+ intervalo do ano no
        // mensal por ano específico, incluindo Dez do ano anterior p/ Janeiro).
        const conds = [];
        let pIdx = nextParamIndex;
        conds.push(`f.data < $${pIdx}`); params.push(cutoff); pIdx++;
        if (ehAnoEspecifico) {
            conds.push(`f.data >= $${pIdx}`); params.push(`${anoSel - 1}-12-01`); pIdx++;
            conds.push(`f.data <= $${pIdx}`); params.push(`${anoSel}-12-31`); pIdx++;
        }
        const condSql = conds.join(' AND ');
        const finalWhere = whereSql ? `${whereSql} AND ${condSql}` : `WHERE ${condSql}`;

        // Agrupamento temporal: por (ano, mês) no mensal; só por ano no anual.
        const selPeriodo = analise === 'anual'
            ? 'EXTRACT(YEAR FROM f.data)::int AS ano'
            : 'EXTRACT(YEAR FROM f.data)::int AS ano, EXTRACT(MONTH FROM f.data)::int AS mes';
        const grpLot = analise === 'anual' ? 'GROUP BY 1, 2, 3' : 'GROUP BY 1, 2, 3, 4';
        const grpCC = analise === 'anual' ? 'GROUP BY 1, 2' : 'GROUP BY 1, 2, 3';
        const grpTot = analise === 'anual' ? 'GROUP BY 1' : 'GROUP BY 1, 2';

        const sqlLotacao = `
            SELECT
                COALESCE(cc_map.cc_pai_nome, 'Sem Centro de Custo') AS centro_custo,
                COALESCE(d_lot.nome_lotacao, 'Sem Lotação') AS lotacao,
                ${selPeriodo},
                COUNT(DISTINCT f.id_funcionario) AS qtd
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${finalWhere}
            ${grpLot}
        `;
        const sqlCentroCusto = `
            SELECT
                COALESCE(cc_map.cc_pai_nome, 'Sem Centro de Custo') AS centro_custo,
                ${selPeriodo},
                COUNT(DISTINCT f.id_funcionario) AS qtd
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${finalWhere}
            ${grpCC}
        `;
        const sqlTotalGeral = `
            SELECT
                ${selPeriodo},
                COUNT(DISTINCT f.id_funcionario) AS qtd
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${finalWhere}
            ${grpTot}
        `;

        const [resLotacao, resCentroCusto, resTotalGeral] = await Promise.all([
            dbDW.query(sqlLotacao, params),
            dbDW.query(sqlCentroCusto, params),
            dbDW.query(sqlTotalGeral, params)
        ]);

        const dois = (a) => String(a).slice(-2);
        const mesDe = (r) => analise === 'anual' ? 0 : (parseInt(r.mes, 10) || 0);

        // --- Monta PERÍODOS (colunas) ---
        let periodos = [];
        if (analise === 'anual') {
            const anos = [...new Set(resTotalGeral.rows.map((r) => parseInt(r.ano, 10)))].sort((a, b) => a - b);
            anos.forEach((ano) => periodos.push({ ano, mes: 0, ref: false, label: String(ano) }));
        } else if (ehAnoEspecifico) {
            if (fechado(anoSel - 1, 12)) {
                periodos.push({ ano: anoSel - 1, mes: 12, ref: true, label: `Dez/${dois(anoSel - 1)}` });
            }
            for (let m = 1; m <= 12; m++) {
                if (fechado(anoSel, m)) periodos.push({ ano: anoSel, mes: m, ref: false, label: MESES_ABR[m - 1] });
            }
        } else {
            let min = null, max = null;
            resTotalGeral.rows.forEach((r) => {
                const v = parseInt(r.ano, 10) * 12 + (parseInt(r.mes, 10) - 1);
                if (min === null || v < min) min = v;
                if (max === null || v > max) max = v;
            });
            for (let v = min; v !== null && v <= max; v++) {
                const ano = Math.floor(v / 12);
                const mes = (v % 12) + 1;
                periodos.push({ ano, mes, ref: false, label: `${MESES_ABR[mes - 1]}/${dois(ano)}` });
            }
        }

        const chave = (ano, mes) => `${ano}-${mes}`;
        const idxDe = {};
        periodos.forEach((p, i) => { idxDe[chave(p.ano, p.mes)] = i; });
        const N = periodos.length;
        const zeros = () => Array(N).fill(0);

        const centros = {};
        const getCentro = (nome) => {
            if (!centros[nome]) centros[nome] = { centroCusto: nome, total: zeros(), lotacoes: {} };
            return centros[nome];
        };
        resCentroCusto.rows.forEach((r) => {
            const i = idxDe[chave(parseInt(r.ano, 10), mesDe(r))];
            if (i !== undefined) getCentro(r.centro_custo).total[i] = parseInt(r.qtd, 10) || 0;
        });
        resLotacao.rows.forEach((r) => {
            const c = getCentro(r.centro_custo);
            if (!c.lotacoes[r.lotacao]) c.lotacoes[r.lotacao] = { nome: r.lotacao, counts: zeros() };
            const i = idxDe[chave(parseInt(r.ano, 10), mesDe(r))];
            if (i !== undefined) c.lotacoes[r.lotacao].counts[i] = parseInt(r.qtd, 10) || 0;
        });

        const data = Object.values(centros)
            .map((c) => ({
                centroCusto: c.centroCusto,
                total: c.total,
                lotacoes: Object.values(c.lotacoes).sort((a, b) => a.nome.localeCompare(b.nome))
            }))
            .sort((a, b) => a.centroCusto.localeCompare(b.centroCusto));

        const totalGeral = zeros();
        resTotalGeral.rows.forEach((r) => {
            const i = idxDe[chave(parseInt(r.ano, 10), mesDe(r))];
            if (i !== undefined) totalGeral[i] = parseInt(r.qtd, 10) || 0;
        });

        res.json({
            analise,
            mode: ehAnoEspecifico ? 'ano' : (analise === 'anual' ? 'anual' : 'todos'),
            year: filters.year || 'Todos',
            periodos,
            data,
            totalGeral
        });
    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório de Colaboradores por Setor.');
    }
});

// --- ROTA: IMPACTO NA FOLHA POR MOVIMENTAÇÃO DE HEADCOUNT ---
// Para um MÊS específico, cruza a movimentação de quadro (headcount) com o
// custo de pessoal, por Centro de Custo > Lotação. Colunas:
//   HC início | Admissões | Desligamentos | HC fim | Massa salarial |
//   Encargos (%) | Custo total | Salário médio.
// - Admissões/Desligamentos são calculados por MOVIMENTAÇÃO: quem está presente
//   no mês e não estava no mês anterior conta como admissão (inclui transferido
//   PARA o setor); o inverso conta como desligamento (inclui transferido para
//   fora) — exatamente a definição pedida.
// - Custo total = massa salarial (proventos) + encargos, sendo encargos um
//   percentual configurável (cadastro de Encargos).
router.post('/reports/impacto-headcount', requireReportPermission('impacto-headcount'), async (req, res) => {
    const filters = req.body;
    if (!filters.year || filters.year === 'Todos' || !filters.month || !MONTH_MAP[filters.month]) {
        return res.status(400).json({ message: 'Selecione um Ano e um Mês específicos para este relatório.' });
    }

    try {
        const anoSel = parseInt(filters.year, 10);
        const mesNum = MONTH_MAP[filters.month];

        // Percentual de encargos configurado (cadastro de Encargos).
        let pctEncargos = 0;
        try {
            const [cfg] = await dbApp.query('SELECT percentual FROM config_encargos WHERE id = 1');
            if (cfg.length) pctEncargos = parseFloat(cfg[0].percentual) || 0;
        } catch (e) { /* sem config: segue com 0% */ }

        // Intervalo do mês selecionado (M) e do mês anterior (M-1).
        const ultimoDia = (a, m) => new Date(a, m, 0).getDate();
        const p2 = (n) => String(n).padStart(2, '0');
        const iniM = `${anoSel}-${p2(mesNum)}-01`;
        const fimM = `${anoSel}-${p2(mesNum)}-${ultimoDia(anoSel, mesNum)}`;
        let anoPrev = anoSel, mesPrev = mesNum - 1;
        if (mesPrev === 0) { mesPrev = 12; anoPrev = anoSel - 1; }
        const iniP = `${anoPrev}-${p2(mesPrev)}-01`;
        const fimP = `${anoPrev}-${p2(mesPrev)}-${ultimoDia(anoPrev, mesPrev)}`;

        // Filtros (empresa/cc/lotação/etc.) sem data; a data entra à parte.
        const filtrosBase = Object.assign({}, filters, { year: 'Todos', month: 'Todos' });
        const { whereSql, joinSql, params, nextParamIndex } = buildWhereClause(filtrosBase);
        const dateCond = `f.data >= $${nextParamIndex} AND f.data <= $${nextParamIndex + 1}`;
        const whereData = whereSql ? `${whereSql} AND ${dateCond}` : `WHERE ${dateCond}`;
        const paramsM = params.concat([iniM, fimM]);
        const paramsP = params.concat([iniP, fimP]);

        // Presença: um registro por (cc, lotacao, colaborador) no período.
        // Presença + salário por colaborador no período: um registro por
        // cc/lotacao/colaborador com a soma dos proventos daquele colaborador.
        // Assim conseguimos, além do headcount, o custo individual — necessário
        // para separar quanto as ADMISSÕES somaram e quanto os DESLIGAMENTOS
        // tiraram da folha.
        const sqlPresenca = `
            SELECT
                COALESCE(cc_map.cc_pai_nome, 'Sem Centro de Custo') AS centro_custo,
                COALESCE(d_lot.nome_lotacao, 'Sem Lotação') AS lotacao,
                f.id_funcionario AS id,
                COALESCE(SUM(f.provento), 0) AS provento
            FROM gold.f_fortes_pagamento f
            ${joinSql}
            ${whereData}
            GROUP BY 1, 2, 3
        `;

        const [resM, resP] = await Promise.all([
            dbDW.query(sqlPresenca, paramsM),
            dbDW.query(sqlPresenca, paramsP)
        ]);

        const chaveLot = (cc, lot) => cc + '||' + lot;
        const nomesLot = {};
        // Mapas id -> provento por lotação, por CC e no total, para o mês (M) e
        // o mês anterior (P).
        const lotM = {}, lotP = {}, ccM = {}, ccP = {};
        const totM = new Map(), totP = new Map();
        const putMap = (obj, key, id, prov) => {
            const m = obj[key] || (obj[key] = new Map());
            m.set(id, (m.get(id) || 0) + prov);
        };
        const putTot = (m, id, prov) => m.set(id, (m.get(id) || 0) + prov);

        resM.rows.forEach((r) => {
            const k = chaveLot(r.centro_custo, r.lotacao);
            nomesLot[k] = { cc: r.centro_custo, lot: r.lotacao };
            const prov = parseFloat(r.provento) || 0;
            putMap(lotM, k, r.id, prov);
            putMap(ccM, r.centro_custo, r.id, prov);
            putTot(totM, r.id, prov);
        });
        resP.rows.forEach((r) => {
            const k = chaveLot(r.centro_custo, r.lotacao);
            if (!nomesLot[k]) nomesLot[k] = { cc: r.centro_custo, lot: r.lotacao };
            const prov = parseFloat(r.provento) || 0;
            putMap(lotP, k, r.id, prov);
            putMap(ccP, r.centro_custo, r.id, prov);
            putTot(totP, r.id, prov);
        });

        const fator = 1 + (pctEncargos / 100);
        // Todas as métricas de um setor a partir dos mapas id->provento de M e P.
        const calcMetrica = (mapM, mapP) => {
            mapM = mapM || new Map();
            mapP = mapP || new Map();
            const hcFim = mapM.size;
            const hcIni = mapP.size;
            let adm = 0, deslig = 0, massa = 0, massaAnt = 0, provAdm = 0, provDes = 0;
            mapM.forEach((prov, id) => {
                massa += prov;
                if (!mapP.has(id)) { adm++; provAdm += prov; } // entrou (não estava no mês anterior)
            });
            mapP.forEach((prov, id) => {
                massaAnt += prov;
                if (!mapM.has(id)) { deslig++; provDes += prov; } // saiu (não está no mês atual)
            });
            const encargos = massa * (pctEncargos / 100);
            const custo = massa * fator;
            const custoAnterior = massaAnt * fator;
            const salMedio = hcFim > 0 ? custo / hcFim : 0;
            const custoAdmissoes = provAdm * fator;        // quanto as entradas somaram à folha
            const economiaDesligamentos = provDes * fator; // quanto as saídas tiraram da folha
            const saldoMovimentacao = custoAdmissoes - economiaDesligamentos; // efeito líquido da movimentação
            const variacaoCusto = custo - custoAnterior;   // variação total do custo (mês vs anterior)
            return {
                hcIni, hcFim, adm, deslig, massa, encargos, custo, salMedio,
                custoAnterior, custoAdmissoes, economiaDesligamentos, saldoMovimentacao, variacaoCusto
            };
        };

        const porCC = {};
        Object.keys(nomesLot).forEach((k) => {
            const { cc, lot } = nomesLot[k];
            if (!porCC[cc]) porCC[cc] = { centroCusto: cc, lotacoes: [] };
            porCC[cc].lotacoes.push(Object.assign({ nome: lot }, calcMetrica(lotM[k], lotP[k])));
        });

        const data = Object.values(porCC).map((cc) => {
            const resumo = calcMetrica(ccM[cc.centroCusto], ccP[cc.centroCusto]);
            cc.lotacoes.sort((a, b) => a.nome.localeCompare(b.nome));
            return { centroCusto: cc.centroCusto, resumo, lotacoes: cc.lotacoes };
        }).sort((a, b) => a.centroCusto.localeCompare(b.centroCusto));

        const total = calcMetrica(totM, totP);

        res.json({ year: filters.year, month: filters.month, percentualEncargos: pctEncargos, data, total });
    } catch (error) {
        handleError(res, error, 'Erro ao gerar o relatório de Impacto na Folha.');
    }
});

module.exports = router;
