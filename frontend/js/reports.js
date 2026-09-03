// js/reports.js

// MAPA GLOBAL DE MESES (CORREÇÃO)
const MONTH_MAP = {
    'Janeiro': 1, 'Fevereiro': 2, 'Março': 3, 'Abril': 4, 'Maio': 5, 'Junho': 6,
    'Julho': 7, 'Agosto': 8, 'Setembro': 9, 'Outubro': 10, 'Novembro': 11, 'Dezembro': 12
};

const MONTH_NAME_MAP = {
    1: 'Jan', 2: 'Fev', 3: 'Mar', 4: 'Abr', 5: 'Mai', 6: 'Jun',
    7: 'Jul', 8: 'Ago', 9: 'Set', 10: 'Out', 11: 'Nov', 12: 'Dez'
};

// FUNÇÃO HELPER PARA CALCULAR PERCENTUAL
const getPercText = (valor, total) => {
    if (total === 0 || valor === 0) return '0.00%';
    // Retorna o percentual formatado, mesmo que 'valor' seja negativo
    return `${(valor / total * 100).toFixed(2)}%`;
};

document.addEventListener('DOMContentLoaded', () => {
    const reportsApplyFiltersBtn = document.getElementById('reports-apply-filters-btn');
    const reportsClearFiltersBtn = document.getElementById('reports-clear-filters-btn');
    
    if(reportsApplyFiltersBtn) {
        reportsApplyFiltersBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.handleReportGeneration();
        });
    }

    if(reportsClearFiltersBtn) reportsClearFiltersBtn.addEventListener('click', window.clearReportFilters);
    
    const runComparisonBtn = document.getElementById('run-comparison-btn');
    if(runComparisonBtn) runComparisonBtn.addEventListener('click', window.runPeriodComparison);
});

window.handleReportGeneration = function() {
    const reportType = window.currentReportType;
    console.log("Gerando relatório:", reportType);

    if (reportType === 'custo-folha') window.loadPayrollCostReport();
    else if (reportType === 'extrato') window.loadExtratoReport();
    else if (reportType === 'lotacao-colaborador-eventos') window.loadLotacaoColaboradorReport();
    else if (reportType === 'cc-lotacao-colaborador') window.loadCcLotacaoColaboradorReport();
    else if (reportType === 'folha-vs-colaboradores') window.loadFolhaVsColaboradoresReport();
    else if (reportType === 'colaboradores-por-setor') window.loadColaboradoresPorSetorReport();
    else if (reportType === 'impacto-headcount') window.loadImpactoHeadcountReport();
    else if (reportType === 'analise-encargos') window.loadAnaliseEncargosReport();
    else window.loadReportsData(); 
}

window.clearReportFilters = function() {
    document.getElementById('reports-filter-year').value = 'Todos';
    document.getElementById('reports-filter-month').value = 'Todos';
    
    // ATUALIZADO: Limpa os inputs de checkbox
    document.querySelectorAll('.multi-select-dropdown-panel input[type="checkbox"]').forEach(cb => cb.checked = false);
    
    if(typeof window.updateMultiSelectFilterText === 'function') {
        // ATUALIZADO: Reseta o texto de TODOS os filtros
        if(document.getElementById('reports-company-text')) window.updateMultiSelectFilterText([], document.getElementById('reports-company-text'), 'Todas as Empresas');
        if(document.getElementById('reports-cc-text')) window.updateMultiSelectFilterText([], document.getElementById('reports-cc-text'), 'Todos os Centros');
        if(document.getElementById('reports-payroll-type-text')) window.updateMultiSelectFilterText([], document.getElementById('reports-payroll-type-text'), 'Todos os Tipos');
        if(document.getElementById('reports-lotation-text')) window.updateMultiSelectFilterText([], document.getElementById('reports-lotation-text'), 'Todas as Lotações');
        if(document.getElementById('reports-event-text')) window.updateMultiSelectFilterText([], document.getElementById('reports-event-text'), 'Todos os Eventos');
    }
    window.handleReportGeneration();
}

window.showReport = function(reportType) {
    // Trava de segurança: mesmo que o link não apareça no menu para quem não
    // tem permissão, garantimos aqui também (defesa em profundidade).
    if (typeof window.hasReportAccess === 'function' && !window.hasReportAccess(reportType)) {
        if (window.showAccessBlocked) {
            window.showAccessBlocked('Você não tem permissão para ver este relatório. Fale com um administrador se precisar desse acesso.');
        }
        return;
    }

    window.currentReportType = reportType;
    document.querySelectorAll('.report-content-area').forEach(area => area.classList.remove('active'));
    
    const activeArea = document.getElementById(`report-${reportType}`);
    if (activeArea) activeArea.classList.add('active');
    
    // --- CORREÇÃO DE UI/UX (Filtros Avançados no Comparativo) ---
    const mainReportsFilters = document.getElementById('main-reports-filters');
    if(mainReportsFilters) {
        // 1. Garante que a barra principal de filtros SEMPRE apareça
        mainReportsFilters.style.display = 'block'; 

        // 2. Mapeia os elementos que conflitam com o Comparativo
        const filterYear = document.getElementById('reports-filter-year')?.parentElement;
        const filterMonth = document.getElementById('filter-container-month');
        const btnGerar = document.getElementById('reports-apply-filters-btn');
        // Filtro "Tipo de Valor" (Proventos/Descontos/Líquido/Informação): o Extrato
        // sempre mostra as três colunas juntas, então esse filtro não se aplica a ele.
        const filterValueType = document.getElementById('filter-container-value-type');

        if (reportType === 'comparativo-periodos') {
            // Se for o comparativo, esconde APENAS o Ano, Mês e o botão "Gerar" global.
            // Assim, os filtros de Tipo de Valor, Tipo de Folha e Empresas ficam disponíveis!
            if(filterYear) filterYear.style.display = 'none';
            if(filterMonth) filterMonth.style.display = 'none';
            if(btnGerar) btnGerar.style.display = 'none';
            if(filterValueType) filterValueType.style.display = 'block';
        } else {
            // Para os outros relatórios, mostra tudo de volta
            if(filterYear) filterYear.style.display = 'block';
            if(filterMonth) filterMonth.style.display = 'block';
            if(btnGerar) btnGerar.style.display = 'flex';
            // No Extrato, esconde o filtro de Tipo de Valor (não faz sentido nele).
            if(filterValueType) filterValueType.style.display = (reportType === 'extrato') ? 'none' : 'block';
        }

        // --- EXTRATO: não deixa escolher "Todos os Meses" (consulta fica pesada) ---
        const monthSelect = document.getElementById('reports-filter-month');
        const todosMesOption = monthSelect ? monthSelect.querySelector('option[value="Todos"]') : null;
        if (reportType === 'extrato') {
            if (todosMesOption) {
                todosMesOption.disabled = true;
                todosMesOption.hidden = true;
            }
            // Se "Todos os Meses" estava selecionado, força a escolha de um mês real
            if (monthSelect && monthSelect.value === 'Todos' && monthSelect.options.length > 1) {
                monthSelect.selectedIndex = 1;
            }
        } else if (todosMesOption) {
            todosMesOption.disabled = false;
            todosMesOption.hidden = false;
        }
    }

    // Atualiza a URL com o relatório aberto (ex.: #/relatorios/custo-folha).
    if (window.setRouteHash) window.setRouteHash('#/relatorios/' + reportType);
};

// --- FUNÇÕES DE CARREGAMENTO DE DADOS ---

window.loadReportsData = async function() {
    const reportsContainer = document.getElementById('reports-container');
    window.showLoader(reportsContainer);
    
    const getItems = (typeof window.getSelectedItems === 'function') ? window.getSelectedItems : (() => []);

    const filters = {
        year: document.getElementById('reports-filter-year').value,
        month: document.getElementById('reports-filter-month').value,
        // --- CORREÇÃO AQUI ---
        company: getItems(document.getElementById('reports-company-panel')),
        costCenter: getItems(document.getElementById('reports-cc-panel')),
        // --- FIM DA CORREÇÃO ---
        valueType: document.getElementById('reports-filter-value-type').value,
        payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
        lotations: getItems(document.getElementById('reports-lotation-panel')),
        events: getItems(document.getElementById('reports-event-panel')),
        // SEGURANÇA: /reports atende vários relatórios diferentes (Por Empresa,
        // Por Centro de Custo, Por Lotação, etc.). Mandamos qual relatório está
        // ativo para o backend poder checar a permissão (relatorios_permitidos)
        // desse relatório específico, não só do menu "Relatórios" como um todo.
        reportType: window.currentReportType
    };

    try {
        const data = await window.callApi('/reports', 'POST', filters);
        window.fullReportsData = data.processedData;
        
        renderYearMonthChart(data.processedData.byYear);
        renderSummaryChart('empresa', 'Por Empresa', data.processedData.byCompany);
        renderSummaryChart('centro-custo', 'Por Centro de Custo', data.processedData.byCostCenter);
        renderSummaryChart('lotacao', 'Por Lotação', data.processedData.byAllocation, true);
        renderSummaryChart('tipo-folha', 'Por Tipo de Folha', data.processedData.byPayrollType);
        renderEventosAnalyticalReport(data.processedData.byEventsByTypeAndLotation, filters.valueType);
        renderValueTypesByYearChart(data.processedData.byValuesOverYear);

    } catch (err) {
        window.showToast(err.message, 'error');
        reportsContainer.innerHTML = `<p class="text-center text-red-500 py-8">${err.message}</p>`;
    } finally {
        window.hideLoader(reportsContainer);
    }
};

// 1. Custo da Folha
window.loadPayrollCostReport = async function() {
    const container = document.getElementById('report-custo-folha');
    window.showLoader(container);
    try {
        const getItems = window.getSelectedItems || (() => []);
        const filters = {
            year: document.getElementById('reports-filter-year').value,
            month: document.getElementById('reports-filter-month').value,
            // --- CORREÇÃO AQUI ---
            company: getItems(document.getElementById('reports-company-panel')),
            costCenter: getItems(document.getElementById('reports-cc-panel')),
            // --- FIM DA CORREÇÃO ---
            lotations: getItems(document.getElementById('reports-lotation-panel')),
            payrollTypes: getItems(document.getElementById('reports-payroll-type-panel'))
        };
        const data = await window.callApi('/reports/payroll-cost', 'POST', filters);
        
        if (!data.rows || data.rows.length === 0) {
            container.innerHTML = `<div class="report-card"><p class="text-center py-8">Sem dados.</p></div>`;
            return;
        }
        
        let html = `<div class="report-card overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th>CC</th><th>Empresa</th>${data.headers.map(h=>`<th>${h}</th>`).join('')}<th>Total</th></tr></thead><tbody>`;
        data.rows.forEach(row => {
            let rowTotal = 0;
            html += `<tr><td class="px-4 py-2">${row.centroCusto}</td><td class="px-4 py-2">${row.empresa}</td>`;
            data.headers.forEach(h => {
                const val = row[h] || 0; rowTotal += val;
                html += `<td class="text-right px-4 py-2">${window.formatCurrency(val)}</td>`;
            });
            html += `<td class="text-right font-bold px-4 py-2">${window.formatCurrency(rowTotal)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;

    } catch (err) { window.showToast(err.message, 'error'); } finally { window.hideLoader(container); }
};

// 1.1 Extrato (Proventos, Descontos e Líquido por Evento)
window.loadExtratoReport = async function() {
    const container = document.getElementById('report-extrato');

    const year = document.getElementById('reports-filter-year').value;
    const month = document.getElementById('reports-filter-month').value;

    // Este relatório é pesado se rodar sem filtro de mês (varre a folha inteira).
    // Por isso exigimos Ano e Mês específicos - nada de "Todos os Anos"/"Todos os Meses".
    if (!year || year === 'Todos' || !month || month === 'Todos') {
        container.innerHTML = `
            <div class="report-card">
                <p class="text-center py-8 text-amber-600">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    Selecione um Ano e um Mês específicos para gerar o Extrato.
                    Este relatório não permite "Todos os Meses" para evitar consultas muito pesadas.
                </p>
            </div>`;
        if (window.showToast) window.showToast('Selecione um Ano e um Mês específicos para o Extrato.', 'error');
        return;
    }

    window.showLoader(container);
    try {
        const getItems = window.getSelectedItems || (() => []);
        const filters = {
            year,
            month,
            company: getItems(document.getElementById('reports-company-panel')),
            costCenter: getItems(document.getElementById('reports-cc-panel')),
            lotations: getItems(document.getElementById('reports-lotation-panel')),
            payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
            events: getItems(document.getElementById('reports-event-panel'))
        };
        const data = await window.callApi('/reports/extrato', 'POST', filters);

        if (!data.rows || data.rows.length === 0) {
            container.innerHTML = `<div class="report-card"><p class="text-center py-8">Sem dados.</p></div>`;
            return;
        }

        let html = `<div class="report-card overflow-x-auto"><table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-2 text-left">Evento</th>
                    <th class="px-4 py-2 text-right">Proventos</th>
                    <th class="px-4 py-2 text-right">Descontos</th>
                    <th class="px-4 py-2 text-right">Líquido</th>
                </tr>
            </thead>
            <tbody>`;

        data.rows.forEach(row => {
            html += `<tr>
                <td class="px-4 py-2">${row.codigo ? `${row.codigo} - ` : ''}${row.evento}</td>
                <td class="text-right px-4 py-2">${window.formatCurrency(row.proventos)}</td>
                <td class="text-right px-4 py-2">${window.formatCurrency(row.descontos)}</td>
                <td class="text-right px-4 py-2 font-bold">${window.formatCurrency(row.liquido)}</td>
            </tr>`;
        });

        const totals = data.totals || { proventos: 0, descontos: 0, liquido: 0 };
        html += `</tbody>
            <tfoot class="bg-gray-50 font-bold">
                <tr>
                    <td class="px-4 py-2">Total</td>
                    <td class="text-right px-4 py-2">${window.formatCurrency(totals.proventos)}</td>
                    <td class="text-right px-4 py-2">${window.formatCurrency(totals.descontos)}</td>
                    <td class="text-right px-4 py-2">${window.formatCurrency(totals.liquido)}</td>
                </tr>
            </tfoot>
            </table></div>`;

        container.innerHTML = html;

        // Para o Excel, o "codigo" vem do banco como "codEvento-codEmpresa" (ex: "051-0011").
        // Ao invés de exportar essa string junta, separamos em duas colunas.
        const dataForExcel = {
            rows: data.rows.map(row => {
                let codEvento = '';
                let codEmpresa = '';
                if (row.codigo) {
                    const partes = String(row.codigo).split('-');
                    codEvento = partes[0] || '';
                    codEmpresa = partes[1] || '';
                }
                return {
                    codEvento,
                    codEmpresa,
                    evento: row.evento,
                    proventos: row.proventos,
                    descontos: row.descontos,
                    liquido: row.liquido
                };
            }),
            totals
        };
        window.addExportButtons('report-extrato', 'Extrato_Folha', dataForExcel);

    } catch (err) {
        window.showToast(err.message, 'error');
        container.innerHTML = `<p class="text-center text-red-500 py-8">${err.message}</p>`;
    } finally {
        window.hideLoader(container);
    }
};

// 2. Lotação x Colaborador (ATUALIZADO)
window.loadLotacaoColaboradorReport = async function() {
    const container = document.getElementById('report-lotacao-colaborador-eventos');
    window.showLoader(container);
    const getItems = window.getSelectedItems || (() => []);
    const filters = {
        year: document.getElementById('reports-filter-year').value,
        month: document.getElementById('reports-filter-month').value,
        // --- CORREÇÃO AQUI ---
        company: getItems(document.getElementById('reports-company-panel')),
        costCenter: getItems(document.getElementById('reports-cc-panel')),
        // --- FIM DA CORREÇÃO ---
        valueType: document.getElementById('reports-filter-value-type').value,
        payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
        lotations: getItems(document.getElementById('reports-lotation-panel')),
        events: getItems(document.getElementById('reports-event-panel'))
    };
    
    try {
        const result = await window.callApi('/reports/lotacao-colaborador-eventos', 'POST', filters);
        renderLotacaoColaboradorReport(result.data, filters.valueType);
    } catch (err) { 
        window.showToast(err.message, 'error'); 
        container.innerHTML = `<div class="report-card"><p class="text-center text-red-500 py-8">${err.message}</p></div>`;
    } finally { 
        window.hideLoader(container); 
    }
};

// 3. CC x Lotação x Colaborador (ATUALIZADO)
window.loadCcLotacaoColaboradorReport = async function() {
    const container = document.getElementById('report-cc-lotacao-colaborador');
    window.showLoader(container);
    try {
        const getItems = window.getSelectedItems || (() => []);
        const filters = {
            year: document.getElementById('reports-filter-year').value,
            month: document.getElementById('reports-filter-month').value,
            // --- CORREÇÃO AQUI ---
            company: getItems(document.getElementById('reports-company-panel')),
            costCenter: getItems(document.getElementById('reports-cc-panel')),
            // --- FIM DA CORREÇÃO ---
            valueType: document.getElementById('reports-filter-value-type').value,
            payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
            lotations: getItems(document.getElementById('reports-lotation-panel')),
            events: getItems(document.getElementById('reports-event-panel'))
        };
        const result = await window.callApi('/reports/cc-lotacao-colaborador', 'POST', filters);
        renderCcLotacaoColaboradorReport(result.data, result.summary, filters.valueType);
    } catch (err) { 
        window.showToast(err.message, 'error'); 
        container.innerHTML = `<div class="report-card"><p class="text-center text-red-500 py-8">${err.message}</p></div>`;
    } finally { 
        window.hideLoader(container); 
    }
};

// 4. Folha vs Colaboradores
window.loadFolhaVsColaboradoresReport = async function() {
    const container = document.getElementById('report-folha-vs-colaboradores');
    window.showLoader(container);
    try {
        const getItems = window.getSelectedItems || (() => []);
        const filters = {
            year: document.getElementById('reports-filter-year').value,
            month: document.getElementById('reports-filter-month').value,
            // --- CORREÇÃO AQUI ---
            company: getItems(document.getElementById('reports-company-panel')),
            costCenter: getItems(document.getElementById('reports-cc-panel')),
            // --- FIM DA CORREÇÃO ---
            valueType: document.getElementById('reports-filter-value-type').value,
            payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
            lotations: getItems(document.getElementById('reports-lotation-panel')),
            events: getItems(document.getElementById('reports-event-panel'))
        };
        const result = await window.callApi('/reports/folha-vs-colaboradores', 'POST', filters);
        renderFolhaVsColaboradoresReport(result, filters.valueType);
    } catch (err) { 
        window.showToast(err.message, 'error'); 
        container.innerHTML = `<div class="report-card"><p class="text-center text-red-500 py-8">${err.message}</p></div>`;
    } finally { 
        window.hideLoader(container); 
    }
};

// --- RELATÓRIO: COLABORADORES POR SETOR (CC > Lotação, com variação %) ---
// Tabela drill-down: Centro de Custo (linha pai clicável) e, dentro dele, as
// Lotações, com a quantidade de colaboradores por período. Dois modos:
//   - Mensal: colunas por mês (ano específico Jan..Dez, ou "Todos" = linha do
//     tempo). Janeiro compara com Dezembro do ano anterior.
//   - Anual: colunas por ano, comparando ano a ano.
// A contagem vem do backend já sem duplicidade (um colaborador conta 1x por
// setor no período) e só inclui MESES JÁ ENCERRADOS.
window._setorExpandido = window._setorExpandido || {};
window._setorAnalise = window._setorAnalise || 'mensal';
window._setorFiltroTendencia = window._setorFiltroTendencia || 'todos'; // 'todos' | 'aumento' | 'queda'

// Filtra os setores por tendência (só aumentos / só quedas) sem refazer a
// consulta — re-renderiza a partir dos dados já carregados (window._setorDados).
window.setSetorTendencia = function(t) {
    window._setorFiltroTendencia = (t === 'aumento' || t === 'queda') ? t : 'todos';
    const body = document.getElementById('setor-report-body');
    if (window._setorDados && body) renderColaboradoresPorSetorReport(window._setorDados, body);
};

window.setSetorAnalise = function(modo) {
    window._setorAnalise = (modo === 'anual') ? 'anual' : 'mensal';
    window.loadColaboradoresPorSetorReport();
};

window.loadColaboradoresPorSetorReport = async function() {
    const container = document.getElementById('report-colaboradores-por-setor');
    const analise = window._setorAnalise || 'mensal';
    const ano = document.getElementById('reports-filter-year').value || 'Todos';

    // Cabeçalho fixo com o seletor Mensal/Anual (sempre visível, mesmo carregando).
    container.innerHTML = `
        <div class="report-card">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 class="text-xl font-bold text-gray-800">Colaboradores por Setor</h3>
                    <p class="text-sm text-gray-500">Quantidade de colaboradores por Centro de Custo e Lotação, contando cada um uma única vez por setor. Apenas meses já encerrados são exibidos.</p>
                </div>
                <div class="inline-flex rounded-lg border border-gray-300 overflow-hidden text-sm no-print shrink-0">
                    <button type="button" onclick="window.setSetorAnalise('mensal')" class="px-4 py-1.5 font-semibold ${analise === 'mensal' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}">Mensal</button>
                    <button type="button" onclick="window.setSetorAnalise('anual')" class="px-4 py-1.5 font-semibold ${analise === 'anual' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}">Anual</button>
                </div>
            </div>
            <div id="setor-report-body"></div>
        </div>`;

    const body = document.getElementById('setor-report-body');
    window.showLoader(body);
    try {
        const getItems = window.getSelectedItems || (() => []);
        const filters = {
            analise,
            year: ano, // ignorado no modo anual (compara todos os anos)
            company: getItems(document.getElementById('reports-company-panel')),
            costCenter: getItems(document.getElementById('reports-cc-panel')),
            payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
            lotations: getItems(document.getElementById('reports-lotation-panel')),
            events: getItems(document.getElementById('reports-event-panel'))
        };
        const result = await window.callApi('/reports/colaboradores-por-setor', 'POST', filters);
        window._setorDados = result; // guarda para re-render local (filtro aumento/queda, sem refazer a consulta)
        renderColaboradoresPorSetorReport(result, body);
    } catch (err) {
        window.showToast(err.message, 'error');
        body.innerHTML = `<p class="text-center text-red-500 py-8">${err.message}</p>`;
    } finally {
        window.hideLoader(body);
    }
};

window.toggleSetorCC = function(idx) {
    const linhas = document.querySelectorAll(`#report-colaboradores-por-setor tr[data-cc-idx="${idx}"]`);
    const chevron = document.getElementById(`setor-chevron-${idx}`);
    const aberto = window._setorExpandido[idx] !== false; // padrão: aberto
    const novoEstado = !aberto;
    window._setorExpandido[idx] = novoEstado;
    linhas.forEach(l => l.classList.toggle('hidden', !novoEstado));
    if (chevron) chevron.className = `fas fa-chevron-${novoEstado ? 'down' : 'right'} text-gray-500 mr-2`;
};

function renderColaboradoresPorSetorReport(data, target) {
    const body = target || document.getElementById('setor-report-body') || document.getElementById('report-colaboradores-por-setor');
    const periodos = Array.isArray(data.periodos) ? data.periodos : [];
    // Índices das colunas EXIBIDAS (ignora a coluna de referência, ex.: Dez/ano-1,
    // que existe só para o Janeiro calcular a variação).
    const displayIdx = periodos.map((p, i) => i).filter((i) => !periodos[i].ref);

    if (!data || !Array.isArray(data.data) || data.data.length === 0 || displayIdx.length === 0) {
        body.innerHTML = `<p class="text-center text-gray-500 py-8">Nenhum colaborador encontrado para os filtros selecionados.</p>`;
        return;
    }

    // Filtro de TENDÊNCIA: compara o ÚLTIMO período exibido com o anterior.
    // aumento = subiu; queda = caiu. Aplica-se ao nível do Centro de Custo.
    const filtro = window._setorFiltroTendencia || 'todos';
    const ultimoIdx = displayIdx[displayIdx.length - 1];
    // Tendência de uma série (CC ou lotação) no ÚLTIMO período exibido vs o anterior.
    const tendencia = (arr) => {
        const a = arr[ultimoIdx] || 0;
        const p = (ultimoIdx - 1 >= 0) ? (arr[ultimoIdx - 1] || 0) : null;
        if (p === null) return 0; // sem período anterior para comparar
        return a > p ? 1 : (a < p ? -1 : 0);
    };
    const bateFiltro = (arr) => filtro === 'todos'
        ? true
        : (filtro === 'aumento' ? tendencia(arr) > 0 : tendencia(arr) < 0);

    // Variação % em relação ao período ANTERIOR (índice i-1 na lista completa).
    // No mensal, o anterior de Janeiro é a referência Dez/ano-1; no anual, é o
    // ano anterior. Sem período anterior, não mostra badge.
    const badge = (arr, i, claras) => {
        if (i - 1 < 0) return '';
        const atual = arr[i] || 0, anterior = arr[i - 1] || 0;
        if (anterior === 0 && atual === 0) return '';
        if (anterior === 0 && atual > 0) {
            return `<span class="block text-[10px] font-semibold ${claras ? 'text-emerald-300' : 'text-emerald-600'}">novo</span>`;
        }
        if (atual === anterior) {
            return `<span class="block text-[10px] ${claras ? 'text-gray-300' : 'text-gray-400'}">0%</span>`;
        }
        const pct = ((atual - anterior) / anterior) * 100;
        const subiu = pct > 0;
        const cor = subiu ? (claras ? 'text-emerald-300' : 'text-emerald-600') : (claras ? 'text-red-300' : 'text-red-600');
        return `<span class="block text-[10px] font-semibold ${cor}">${subiu ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
    };

    const celula = (arr, i, destaque) => {
        const val = arr[i] || 0;
        const base = destaque ? 'font-bold text-gray-900' : 'text-gray-700';
        return `<td class="px-2 py-2 text-center border-b border-gray-100 whitespace-nowrap">
                    <span class="block ${base}">${val}</span>${badge(arr, i, false)}
                </td>`;
    };

    const cabecalhoPeriodos = displayIdx.map((i) =>
        `<th class="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase whitespace-nowrap">${periodos[i].label}</th>`
    ).join('');

    let linhas = '';
    let mostrados = 0;
    data.data.forEach((cc, idx) => {
        // Filtro de tendência aplicado no nível de LOTAÇÃO (setor): em "Só
        // aumentos"/"Só quedas" só entram os setores que subiram/caíram no
        // último período. O CC aparece se tiver ao menos um setor que bate.
        const lots = (filtro === 'todos') ? cc.lotacoes : cc.lotacoes.filter((l) => bateFiltro(l.counts));
        const ccVisivel = filtro === 'todos' || lots.length > 0 || (cc.lotacoes.length === 0 && bateFiltro(cc.total));
        if (!ccVisivel) return;
        mostrados++;
        const aberto = window._setorExpandido[idx] !== false;
        const chevronDir = aberto ? 'down' : 'right';

        // Cabeçalho do CC com os rótulos dos períodos (repetido em cada CC).
        linhas += `<tr class="bg-sky-100 cursor-pointer" onclick="window.toggleSetorCC(${idx})">
            <td class="px-3 py-2 text-left font-bold text-gray-800 border-y-2 border-sky-300 whitespace-nowrap sticky left-0 bg-sky-100">
                <i id="setor-chevron-${idx}" class="fas fa-chevron-${chevronDir} text-gray-500 mr-2"></i>${cc.centroCusto}
            </td>
            ${displayIdx.map((i) => `<th class="px-2 py-2 text-center text-[10px] font-bold text-sky-700 uppercase border-y-2 border-sky-300 whitespace-nowrap">${periodos[i].label}</th>`).join('')}
        </tr>`;

        linhas += `<tr class="bg-sky-50 font-semibold">
            <td class="px-3 py-2 pl-9 text-left text-gray-700 border-b border-gray-200 whitespace-nowrap sticky left-0 bg-sky-50">Total do centro de custo</td>
            ${displayIdx.map((i) => celula(cc.total, i, true)).join('')}
        </tr>`;

        lots.forEach((lot) => {
            linhas += `<tr data-cc-idx="${idx}" class="${aberto ? '' : 'hidden'} hover:bg-gray-50">
                <td class="px-3 py-2 pl-12 text-left text-gray-600 border-b border-gray-100 whitespace-nowrap sticky left-0 bg-white">${lot.nome}</td>
                ${displayIdx.map((i) => celula(lot.counts, i, false)).join('')}
            </tr>`;
        });
    });

    const totalGeral = Array.isArray(data.totalGeral) ? data.totalGeral : [];
    const linhaTotal = `<tr class="bg-gray-800 text-white font-bold">
        <td class="px-3 py-2 text-left border-b border-gray-700 whitespace-nowrap sticky left-0 bg-gray-800">TOTAL GERAL</td>
        ${displayIdx.map((i) => `<td class="px-2 py-2 text-center border-b border-gray-700 whitespace-nowrap"><span class="block">${totalGeral[i] || 0}</span>${badge(totalGeral, i, true)}</td>`).join('')}
    </tr>`;

    const legenda = data.analise === 'anual'
        ? 'Comparando <strong>ano a ano</strong> (variação % sobre o ano anterior). Cada colaborador conta uma única vez por ano em cada setor.'
        : (data.mode === 'todos'
            ? 'Linha do tempo — role na horizontal. A variação % é sobre o mês anterior; cada Janeiro compara com o Dezembro anterior.'
            : 'Variação % sobre o mês anterior; Janeiro compara com Dezembro do ano anterior.');

    // Botões de filtro por tendência (só aumentos / só quedas).
    const botoesFiltro = `
        <div class="flex flex-wrap items-center gap-2 mb-3 no-print">
            <span class="text-xs text-gray-500 mr-1">Mostrar setores:</span>
            <button type="button" onclick="window.setSetorTendencia('todos')" class="px-3 py-1 rounded-full text-xs font-semibold border ${filtro === 'todos' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}">Todos</button>
            <button type="button" onclick="window.setSetorTendencia('aumento')" class="px-3 py-1 rounded-full text-xs font-semibold border ${filtro === 'aumento' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'}">▲ Só aumentos</button>
            <button type="button" onclick="window.setSetorTendencia('queda')" class="px-3 py-1 rounded-full text-xs font-semibold border ${filtro === 'queda' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-50'}">▼ Só quedas</button>
        </div>`;

    const corpoTabela = (mostrados === 0)
        ? `<p class="text-center text-gray-500 py-8">Nenhum setor ${filtro === 'aumento' ? 'com aumento' : 'com queda'} no último período. Use "Todos" para ver todos os setores.</p>`
        : `<div class="overflow-x-auto border border-gray-200 rounded-lg">
                <table class="min-w-full text-sm border-collapse">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap sticky left-0 bg-gray-50">Centro de Custo / Lotação</th>
                            ${cabecalhoPeriodos}
                        </tr>
                    </thead>
                    <tbody>
                        ${linhas}
                        ${linhaTotal}
                    </tbody>
                </table>
            </div>`;

    body.innerHTML = `
        ${botoesFiltro}
        <p class="text-xs text-gray-500 mb-3">${legenda} O filtro de aumento/queda compara o último período com o anterior. A coluna da esquerda fica fixa ao rolar.</p>
        ${corpoTabela}`;

    const sufixo = data.analise === 'anual' ? 'Anual' : (data.year || 'Todos');
    window.addExportButtons('report-colaboradores-por-setor', `Colaboradores_por_Setor_${sufixo}`);
}

// --- RELATÓRIO: IMPACTO NA FOLHA POR MOVIMENTAÇÃO DE HEADCOUNT ---
// Para o mês selecionado: HC início/fim, Admissões, Desligamentos, Massa
// salarial, Encargos, Custo total e Salário médio, por CC > Lotação.
window._impactoExpandido = window._impactoExpandido || {};

window.toggleImpactoCC = function(idx) {
    const linhas = document.querySelectorAll(`#report-impacto-headcount tr[data-imp-idx="${idx}"]`);
    const chevron = document.getElementById(`impacto-chevron-${idx}`);
    const aberto = window._impactoExpandido[idx] !== false;
    const novo = !aberto;
    window._impactoExpandido[idx] = novo;
    linhas.forEach(l => l.classList.toggle('hidden', !novo));
    if (chevron) chevron.className = `fas fa-chevron-${novo ? 'down' : 'right'} text-gray-500 mr-2`;
};

window.loadImpactoHeadcountReport = async function() {
    const container = document.getElementById('report-impacto-headcount');
    const ano = document.getElementById('reports-filter-year').value;
    const mes = document.getElementById('reports-filter-month').value;

    if (!ano || ano === 'Todos' || !mes || mes === 'Todos') {
        container.innerHTML = `<div class="report-card"><p class="text-center text-amber-600 py-8"><i class="fas fa-info-circle mr-2"></i>Selecione um <strong>Ano</strong> e um <strong>Mês</strong> específicos — este relatório mostra a movimentação de quadro do mês em relação ao mês anterior.</p></div>`;
        return;
    }

    window.showLoader(container);
    try {
        const getItems = window.getSelectedItems || (() => []);
        const filters = {
            year: ano,
            month: mes,
            company: getItems(document.getElementById('reports-company-panel')),
            costCenter: getItems(document.getElementById('reports-cc-panel')),
            payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
            lotations: getItems(document.getElementById('reports-lotation-panel')),
            events: getItems(document.getElementById('reports-event-panel'))
        };
        const result = await window.callApi('/reports/impacto-headcount', 'POST', filters);
        renderImpactoHeadcountReport(result);
    } catch (err) {
        window.showToast(err.message, 'error');
        container.innerHTML = `<div class="report-card"><p class="text-center text-red-500 py-8">${err.message}</p></div>`;
    } finally {
        window.hideLoader(container);
    }
};

function renderImpactoHeadcountReport(data) {
    const container = document.getElementById('report-impacto-headcount');
    if (!data || !Array.isArray(data.data) || data.data.length === 0) {
        container.innerHTML = `<div class="report-card"><p class="text-center text-gray-500 py-8">Nenhum dado encontrado para o período selecionado.</p></div>`;
        return;
    }

    const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // --- Células (dark = true na linha TOTAL, que tem fundo escuro) ---
    // cellNum/cellMoney NÃO fixam cor: herdam a cor da linha (escura nas linhas
    // claras, branca na linha TOTAL) — assim nada fica invisível.
    const cellNum = (v) => `<td class="px-3 py-2 text-center whitespace-nowrap">${v}</td>`;
    const cellMoney = (v, bold) => `<td class="px-3 py-2 text-right whitespace-nowrap ${bold ? 'font-semibold' : ''}">${fmt(v)}</td>`;
    const cellAdm = (v, dark) => {
        const cor = v > 0 ? (dark ? 'text-emerald-300' : 'text-emerald-600') : (dark ? 'text-gray-300' : 'text-gray-400');
        return `<td class="px-3 py-2 text-center whitespace-nowrap ${v > 0 ? 'font-semibold' : ''} ${cor}">${v > 0 ? '+' + v : v}</td>`;
    };
    const cellDeslig = (v, dark) => {
        const cor = v > 0 ? (dark ? 'text-red-300' : 'text-red-600') : (dark ? 'text-gray-300' : 'text-gray-400');
        return `<td class="px-3 py-2 text-center whitespace-nowrap ${v > 0 ? 'font-semibold' : ''} ${cor}">${v > 0 ? '-' + v : v}</td>`;
    };
    const cellHcFim = (m, dark) => {
        const dif = m.hcFim - m.hcIni;
        let cor = '';
        if (dif > 0) cor = dark ? 'text-emerald-300' : 'text-emerald-600';
        else if (dif < 0) cor = dark ? 'text-red-300' : 'text-red-600';
        const seta = dif > 0 ? ' ▲' : (dif < 0 ? ' ▼' : '');
        return `<td class="px-3 py-2 text-center whitespace-nowrap font-bold ${cor}">${m.hcFim}<span class="text-[10px]">${seta}</span></td>`;
    };
    const linhaMetrica = (m, primeiraCel, dark) =>
        `${primeiraCel}${cellNum(m.hcIni)}${cellAdm(m.adm, dark)}${cellDeslig(m.deslig, dark)}${cellHcFim(m, dark)}${cellMoney(m.massa)}${cellMoney(m.encargos)}${cellMoney(m.custo, true)}${cellMoney(m.salMedio)}`;

    let linhas = '';
    data.data.forEach((cc, idx) => {
        const aberto = window._impactoExpandido[idx] !== false;
        const chevronDir = aberto ? 'down' : 'right';
        const primeiraCC = `<td class="px-3 py-2 text-left font-bold text-gray-800 whitespace-nowrap sticky left-0 bg-sky-100">
            <i id="impacto-chevron-${idx}" class="fas fa-chevron-${chevronDir} text-gray-500 mr-2"></i>${cc.centroCusto}
        </td>`;
        linhas += `<tr class="bg-sky-100 cursor-pointer border-y-2 border-sky-300" onclick="window.toggleImpactoCC(${idx})">${linhaMetrica(cc.resumo, primeiraCC, false)}</tr>`;
        cc.lotacoes.forEach((lot) => {
            const primeiraLot = `<td class="px-3 py-2 pl-10 text-left text-gray-600 whitespace-nowrap sticky left-0 bg-white">${lot.nome}</td>`;
            linhas += `<tr data-imp-idx="${idx}" class="${aberto ? '' : 'hidden'} hover:bg-gray-50 border-b border-gray-100">${linhaMetrica(lot, primeiraLot, false)}</tr>`;
        });
    });

    const primeiraTot = `<td class="px-3 py-2 text-left whitespace-nowrap sticky left-0 bg-gray-800">TOTAL GERAL</td>`;
    const linhaTotal = `<tr class="bg-gray-800 text-white font-bold">${linhaMetrica(data.total, primeiraTot, true)}</tr>`;

    // --- Painel de IMPACTO FINANCEIRO da movimentação (nível empresa) ---
    const t = data.total;
    const saldo = t.saldoMovimentacao || 0;
    const saldoCor = saldo > 0 ? 'text-red-600' : (saldo < 0 ? 'text-emerald-600' : 'text-gray-600');
    const saldoFrase = saldo > 0
        ? `As entradas custaram mais do que as saídas economizaram: a folha ficou <strong>${fmt(saldo)} mais cara</strong> pela movimentação.`
        : (saldo < 0
            ? `As saídas economizaram mais do que as entradas custaram: a folha ficou <strong>${fmt(Math.abs(saldo))} mais barata</strong> pela movimentação.`
            : 'As entradas e saídas se equilibraram no custo.');
    const varTot = t.variacaoCusto || 0;
    const varCor = varTot > 0 ? 'text-red-600' : (varTot < 0 ? 'text-emerald-600' : 'text-gray-600');
    const varSeta = varTot > 0 ? '▲' : (varTot < 0 ? '▼' : '');

    const painel = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div class="rounded-lg border border-gray-200 p-3 bg-white">
                <div class="text-xs text-gray-500 mb-1" title="Custo total (com encargos) dos colaboradores que ENTRARAM no mês — quanto as admissões somaram à folha.">Custo com admissões <i class="fas fa-circle-info text-gray-300"></i></div>
                <div class="flex items-baseline justify-between gap-2">
                    <div class="text-lg font-bold text-red-600">+ ${fmt(t.custoAdmissoes)}</div>
                    <div class="text-sm font-semibold text-emerald-600 whitespace-nowrap">${t.adm} ${t.adm === 1 ? 'admissão' : 'admissões'}</div>
                </div>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 bg-white">
                <div class="text-xs text-gray-500 mb-1" title="Custo total (com encargos) dos colaboradores que SAÍRAM — quanto os desligamentos tiraram da folha.">Economia c/ desligamentos <i class="fas fa-circle-info text-gray-300"></i></div>
                <div class="flex items-baseline justify-between gap-2">
                    <div class="text-lg font-bold text-emerald-600">− ${fmt(t.economiaDesligamentos)}</div>
                    <div class="text-sm font-semibold text-red-600 whitespace-nowrap">${t.deslig} ${t.deslig === 1 ? 'desligamento' : 'desligamentos'}</div>
                </div>
            </div>
            <div class="rounded-lg border-2 ${saldo > 0 ? 'border-red-200' : (saldo < 0 ? 'border-emerald-200' : 'border-gray-200')} p-3 bg-white">
                <div class="text-xs text-gray-500 mb-1" title="Custo das admissões menos economia dos desligamentos. Positivo = a movimentação encareceu a folha; negativo = baratear.">Saldo da movimentação <i class="fas fa-circle-info text-gray-300"></i></div>
                <div class="text-lg font-bold ${saldoCor}">${saldo > 0 ? '+ ' : (saldo < 0 ? '− ' : '')}${fmt(Math.abs(saldo))}</div>
            </div>
            <div class="rounded-lg border border-gray-200 p-3 bg-white">
                <div class="text-xs text-gray-500 mb-1" title="Diferença do custo total de pessoal deste mês em relação ao mês anterior (inclui também reajustes de quem permaneceu).">Variação total vs mês anterior <i class="fas fa-circle-info text-gray-300"></i></div>
                <div class="text-lg font-bold ${varCor}">${varSeta} ${fmt(Math.abs(varTot))}</div>
            </div>
        </div>
        <p class="text-sm ${saldoCor} bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">${saldoFrase}</p>`;

    // Cabeçalhos com explicação ao passar o mouse (title).
    const th = (texto, dica, extra) =>
        `<th title="${dica}" class="px-3 py-3 text-xs font-bold uppercase whitespace-nowrap cursor-help ${extra || 'text-gray-500'}">${texto} <i class="fas fa-circle-info text-gray-300"></i></th>`;

    container.innerHTML = `
        <div class="report-card">
            <div class="mb-4">
                <h3 class="text-xl font-bold text-gray-800">Movimentação de Quadro e Custo — ${data.month}/${data.year}</h3>
                <p class="text-sm text-gray-500">Movimentação de pessoal (headcount) cruzada com o custo da folha, por Centro de Custo e Lotação. Admissões e desligamentos são apurados em relação ao mês anterior (incluem transferências). Custo total = massa salarial (proventos) + encargos de <strong>${data.percentualEncargos}%</strong> (ajustável em Cadastros → Encargos). Passe o mouse nos cabeçalhos para ver a explicação de cada coluna.</p>
            </div>
            ${painel}
            <div class="overflow-x-auto border border-gray-200 rounded-lg">
                <table class="min-w-full text-sm border-collapse">
                    <thead class="bg-gray-50">
                        <tr>
                            <th title="Setor analisado. Clique num Centro de Custo para abrir/fechar as lotações dentro dele." class="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap cursor-help sticky left-0 bg-gray-50">Centro de Custo / Lotação</th>
                            ${th('HC início', 'Headcount inicial: número de colaboradores no setor no MÊS ANTERIOR.', 'text-center text-gray-500')}
                            ${th('Admissões', 'Entradas no setor no mês: novas contratações + transferidos PARA o setor (comparado ao mês anterior).', 'text-center text-emerald-600')}
                            ${th('Deslig.', 'Desligamentos: saídas do setor no mês — demissões/pedidos + transferidos para FORA (comparado ao mês anterior).', 'text-center text-red-600')}
                            ${th('HC fim', 'Headcount final: número de colaboradores no setor no MÊS SELECIONADO. ▲/▼ indica se o quadro cresceu ou reduziu.', 'text-center text-gray-500')}
                            ${th('Massa salarial', 'Soma dos proventos (salário bruto) do setor no mês.', 'text-right text-gray-500')}
                            ${th('Encargos', 'Estimativa de encargos = massa salarial × percentual configurado em Cadastros → Encargos.', 'text-right text-gray-500')}
                            ${th('Custo total', 'Massa salarial + encargos = custo total de pessoal do setor no mês.', 'text-right text-gray-500')}
                            ${th('Salário médio', 'Custo total ÷ headcount final = custo médio por colaborador no setor.', 'text-right text-gray-500')}
                        </tr>
                    </thead>
                    <tbody>${linhas}${linhaTotal}</tbody>
                </table>
            </div>
        </div>`;

    window.addExportButtons('report-impacto-headcount', `Movimentacao_Quadro_Custo_${data.month}_${data.year}`);
}

// 5. Análise de Encargos
window.loadAnaliseEncargosReport = async function() {
    const container = document.getElementById('report-analise-encargos');
    window.showLoader(container);
    const year = document.getElementById('reports-filter-year').value || new Date().getFullYear();
    
    const getItems = (typeof window.getSelectedItems === 'function') ? window.getSelectedItems : (() => []);
    
    const filters = {
        year: year,
        month: document.getElementById('reports-filter-month').value,
        company: getItems(document.getElementById('reports-company-panel')),
        costCenter: getItems(document.getElementById('reports-cc-panel')),
        payrollTypes: getItems(document.getElementById('reports-payroll-type-panel'))
    };
    
    try {
        // Busca os dados da API (já com filtros aplicados)
        const data = await window.callApi('/reports/analise-encargos', 'POST', filters);

        // --- INÍCIO DA CORREÇÃO ---
        // Bloco de código que buscava 'empresasManuais' e populava
        // o select 'encargos-empresa-select' foi REMOVIDO.
        // --- FIM DA CORREÇÃO ---

        // Renderiza os dados
        renderAnaliseEncargos(data); 

    } catch (err) { 
        window.showToast(err.message, 'error'); 
        // Limpa a tabela em caso de erro
        const tbody = document.getElementById('tbody-relatorio-encargos');
        if(tbody) tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-red-500 italic">${err.message}</td></tr>`;
    } finally { 
        window.hideLoader(container); 
    }
};

// --- FUNÇÕES DE RENDERIZAÇÃO DE GRÁFICOS (Gerais) ---

function renderYearMonthChart(data) {
    const container = document.getElementById('report-ano-mes');
    if (!container) return;
    container.innerHTML = `<div class="report-card"><h3 id="year-month-report-title" class="text-xl font-semibold text-gray-800 mb-4">Folha por Ano/Mês (Drill-Down)</h3><div class="h-96"><canvas id="yearMonthChart"></canvas></div></div>`;

    const chartId = 'yearMonthChart';
    const canvas = document.getElementById(chartId);
    
    if (!data || Object.keys(data).length === 0) {
        container.querySelector('.report-card').innerHTML += `<p class="text-center text-gray-500">Sem dados.</p>`;
        return;
    }

    const labels = Object.keys(data).sort((a,b) => a-b);
    const values = labels.map(label => data[label]);

    if (window.activeCharts[chartId]) window.activeCharts[chartId].destroy();
    const ctx = canvas.getContext('2d');
    window.activeCharts[chartId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: document.getElementById('reports-filter-value-type').value, data: values, backgroundColor: '#005caa' }] },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'top', formatter: window.formatDataLabel, color: '#4b5563', font: { weight: 'bold' } } }
        }
    });
}

function renderSummaryChart(type, title, data, isHorizontal = false) {
    const container = document.getElementById(`report-${type}`);
    if (!container) return;
    const chartId = `${type}Chart`;
    container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">${title}</h3><div class="h-96"><canvas id="${chartId}"></canvas></div></div>`;
    
    if (!data || Object.keys(data).length === 0) return;

    const sortedData = Object.entries(data).sort(([,a],[,b]) => b-a);
    const labels = sortedData.map(item => item[0]);
    const values = sortedData.map(item => item[1]);
    
    if (window.activeCharts[chartId]) window.activeCharts[chartId].destroy();
    const ctx = document.getElementById(chartId).getContext('2d');
    window.activeCharts[chartId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Valor', data: values, backgroundColor: '#005caa' }] },
        options: { 
            indexAxis: isHorizontal ? 'y' : 'x',
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: isHorizontal ? 'end' : 'top', formatter: window.formatDataLabel, color: isHorizontal ? 'white' : '#4b5563' } }
        }
    });
}

function renderEventosAnalyticalReport(data, valueType) {
    const container = document.getElementById('report-evento-analitico');
    if (!container) return;
    
    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Analítico por Evento</h3><p class="text-center text-gray-500 py-8">Sem dados.</p></div>`;
        return;
    }

    let html = `<div class="report-card space-y-4"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Analítico por Evento (${valueType})</h3>`;

    const sortedEvents = Object.keys(data).sort();

    sortedEvents.forEach((event, index) => {
        const types = data[event];
        let eventRows = [];
        let eventTotal = 0;

        Object.keys(types).forEach(type => {
            Object.entries(types[type]).forEach(([lot, vals]) => {
                let val = 0;
                if(valueType === 'Proventos') val = vals.totalProventos;
                else if(valueType === 'Descontos') val = vals.totalDescontos;
                else if(valueType === 'Informação') val = vals.totalInformacao;
                else val = vals.totalLiquido;

                if(val !== 0) {
                    eventTotal += val;
                    eventRows.push({ lotacao: lot, tipoFolha: type, valor: val });
                }
            });
        });

        if (eventRows.length > 0) {
            eventRows.sort((a, b) => b.valor - a.valor);
            const targetId = `event-content-${index}`;

            html += `
                <div class="border rounded-lg bg-white shadow-sm overflow-hidden">
                    <div class="collapsible-header p-4 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex justify-between items-center" data-target="${targetId}">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-chevron-right toggle-icon text-gray-400 w-4 transition-transform"></i>
                            <span class="font-bold text-gray-700 text-lg">${event}</span>
                        </div>
                        <span class="font-bold text-blue-800 text-lg">${window.formatCurrency(eventTotal)}</span>
                    </div>

                    <div id="${targetId}" class="collapsible-content hidden">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-100">
                                    <tr>
                                        <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/2">Lotação / Setor</th>
                                        <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo de Folha</th>
                                        <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Valor</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${eventRows.map(row => `
                                        <tr class="hover:bg-gray-50">
                                            <td class="px-6 py-3 text-sm font-medium text-gray-700">${row.lotacao}</td>
                                            <td class="px-6 py-3 text-sm text-gray-500">${row.tipoFolha}</td>
                                            <td class="px-6 py-3 text-sm font-bold text-gray-800 text-right">${window.formatCurrency(row.valor)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    html += `</div>`;
    container.innerHTML = html;

    // --- GOLD MODIFICATION: Inject Export Buttons ---
    if (Object.keys(data).length > 0) {
        window.addExportButtons('report-evento-analitico', 'Relatorio_Analitico_Eventos');
    }
}

function renderValueTypesByYearChart(data) {
    const container = document.getElementById('report-valores');
    if (!container) return;
    const chartId = 'valueTypesChart';
    container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório por Valores (Anual)</h3><div class="h-96"><canvas id="${chartId}"></canvas></div></div>`;

    if (!data || Object.keys(data).length === 0) return;

    const labels = Object.keys(data).sort((a,b) => a-b);
    const proventos = labels.map(y => data[y].proventos);
    const descontos = labels.map(y => data[y].descontos);
    const liquido = labels.map(y => data[y].liquido);

    if (window.activeCharts[chartId]) window.activeCharts[chartId].destroy();
    const ctx = document.getElementById(chartId).getContext('2d');
    window.activeCharts[chartId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Proventos', data: proventos, backgroundColor: '#22c55e' },
                { label: 'Descontos', data: descontos, backgroundColor: '#ef4444' },
                { label: 'Líquido', data: liquido, backgroundColor: '#3b82f6' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- NOVAS FUNÇÕES DE RENDERIZAÇÃO (MATRIZ) ---

function renderLotacaoColaboradorReport(data, valueType) {
    const container = document.getElementById('report-lotacao-colaborador-eventos');
    
    // 1. Validação de dados vazios
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Lotação x Colaborador</h3><p class="text-center text-gray-500 py-8">Nenhum dado encontrado para os filtros selecionados.</p></div>`;
        return;
    }

    // 2. Início da construção do HTML
    let html = `<div class="report-card space-y-4">`;
    html += `<h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Lotação x Colaborador (Valor: ${valueType})</h3>`;

    // 3. Loop pelas Lotações
    data.forEach((lotacao, index) => {
        const lotacaoId = `lotacao-toggle-${index}`;
        const colaboradorCount = lotacao.colaboradores ? lotacao.colaboradores.length : 0;
        const lotaçãoHeaders = lotacao.lotaçãoHeaders || []; 
        
        // Cabeçalhos das colunas de eventos (Dinâmico)
        const headerCells = lotaçãoHeaders.map(h_obj => 
            `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]" title="Cód: ${h_obj.id}">${h_obj.name}</th>`
        ).join('');
        
        // Linhas dos colaboradores
        let colaboradorRows = '';
        lotacao.colaboradores.forEach(colaborador => {
            const eventCells = lotaçãoHeaders.map(h_obj => {
                const value = colaborador.eventos[h_obj.id] || 0;
                return `<td class="px-4 py-2 text-sm text-gray-500 text-center">${value === 0 ? '-' : window.formatCurrency(value)}</td>`;
            }).join('');

            colaboradorRows += `
                <tr class="hover:bg-gray-50">
                    <td class="sticky left-0 bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[250px] font-bold border-r border-gray-200">
                        ${colaborador.nome}
                    </td>
                    ${eventCells}
                    <td class="px-4 py-2 text-sm font-bold text-gray-700 text-right min-w-[150px] border-l border-gray-200 bg-gray-50">
                        ${window.formatCurrency(colaborador.totalColaborador)}
                    </td>
                </tr>
            `;
        });

        // Montagem do Card da Lotação (Accordion)
        html += `
            <div class="border rounded-lg bg-white shadow-sm overflow-hidden">
                <div class="collapsible-header p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer flex justify-between items-center transition-colors" data-target="${lotacaoId}">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-chevron-right toggle-icon text-gray-400 w-4 transition-transform"></i>
                        <span class="font-bold text-lg text-gray-800">${lotacao.nome || 'Lotação não especificada'} <span class="text-sm font-normal text-gray-500 ml-2">(${colaboradorCount} Colaboradores)</span></span>
                    </div>
                    <span class="font-bold text-lg text-blue-700">${window.formatCurrency(lotacao.totalLotação)}</span>
                </div>
                
                <div id="${lotacaoId}" class="collapsible-content hidden">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-100">
                                <tr>
                                    <th class="sticky left-0 bg-gray-100 z-10 px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[250px] border-r border-gray-200">Colaborador</th>
                                    ${headerCells}
                                    <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px] border-l border-gray-200">Total</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 bg-white">
                                ${colaboradorRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    
    // 4. Injeção no DOM
    container.innerHTML = html;

    // 5. Injeção dos Botões de Exportação (Correção GOLD)
    if (data && data.length > 0) {
        window.addExportButtons('report-lotacao-colaborador-eventos', 'Relatorio_Lotacao_Colaborador');
    }
}

function renderCcLotacaoColaboradorReport(data, summary, valueType) {
    const container = document.getElementById('report-cc-lotacao-colaborador');
    
    // 1. Validação
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Centro de Custo x Colaborador</h3><p class="text-center text-gray-500 py-8">Nenhum dado encontrado para os filtros selecionados.</p></div>`;
        return;
    }

    // 2. Início do HTML
    let html = `<div class="report-card space-y-4">`;
    html += `<h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Centro de Custo x Colaborador (Valor: ${valueType})</h3>`;

    // 3. Loop Principal (Centros de Custo)
    data.forEach((cc, ccIndex) => {
        const ccId = `cc-toggle-${ccIndex}`;
        let lotacoesHtml = '';
        let totalColaboradoresCC = 0;

        // Loop Secundário (Lotações dentro do CC)
        cc.lotacoes.forEach((lotacao, lotIndex) => {
            const lotacaoId = `cc-${ccIndex}-lotacao-toggle-${lotIndex}`;
            const colaboradorCount = lotacao.colaboradores ? lotacao.colaboradores.length : 0;
            totalColaboradoresCC += colaboradorCount;
            const lotaçãoHeaders = lotacao.lotaçãoHeaders || []; 
            
            // Cabeçalhos Dinâmicos (Eventos)
            const headerCells = lotaçãoHeaders.map(h_obj => 
                `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]" title="Cód: ${h_obj.id}">${h_obj.name}</th>`
            ).join('');
            
            // Linhas de Colaboradores
            let colaboradorRows = '';
            lotacao.colaboradores.forEach(colaborador => {
                const eventCells = lotaçãoHeaders.map(h_obj => {
                    const value = colaborador.eventos[h_obj.id] || 0;
                    return `<td class="px-4 py-2 text-sm text-gray-500 text-center border-l border-gray-100">${value === 0 ? '-' : window.formatCurrency(value)}</td>`;
                }).join('');

                colaboradorRows += `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="sticky left-0 bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[150px] border-r border-gray-100 z-10">${colaborador.empresa}</td>
                        <td class="sticky left-[150px] bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[200px] border-r border-gray-100 z-10">${colaborador.nome}</td>
                        <td class="sticky left-[350px] bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm text-gray-500 min-w-[200px] border-r border-gray-200 z-10 shadow-sm">${colaborador.cargo}</td>
                        ${eventCells}
                        <td class="px-4 py-2 text-sm font-bold text-gray-700 text-right min-w-[150px] bg-gray-50 border-l border-gray-200">${window.formatCurrency(colaborador.totalColaborador)}</td>
                    </tr>
                `;
            });

            // HTML da Lotação (Nível 2)
            lotacoesHtml += `
                <div class="border rounded-lg bg-white shadow-sm overflow-hidden ml-4 mt-2">
                    <div class="collapsible-header p-3 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer flex justify-between items-center" data-target="${lotacaoId}">
                        <div class="flex items-center gap-2">
                             <i class="fas fa-layer-group text-gray-400 text-sm"></i>
                             <span class="font-semibold text-md text-gray-700">${lotacao.nome} <span class="text-xs font-normal text-gray-500">(${colaboradorCount} Colab.)</span></span>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="font-semibold text-md text-blue-600">${window.formatCurrency(lotacao.totalLotacao)}</span>
                            <i class="fas fa-chevron-down toggle-icon text-sm"></i>
                        </div>
                    </div>
                    <div id="${lotacaoId}" class="collapsible-content hidden">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="sticky left-0 bg-gray-50 z-20 px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">Empresa</th>
                                        <th class="sticky left-[150px] bg-gray-50 z-20 px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px]">Funcionário</th>
                                        <th class="sticky left-[350px] bg-gray-50 z-20 px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[200px] shadow-sm border-r border-gray-300">Cargo</th>
                                        ${headerCells}
                                        <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px] border-l border-gray-300">Total</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 bg-white">
                                    ${colaboradorRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        // HTML do Centro de Custo (Nível 1)
        html += `
            <div class="border rounded-lg bg-gray-50 shadow-md overflow-hidden">
                <div class="collapsible-header p-4 hover:bg-gray-200 transition-colors cursor-pointer flex justify-between items-center" data-target="${ccId}">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-chevron-right toggle-icon text-gray-600 w-4 transition-transform"></i>
                        <span class="font-bold text-lg text-gray-800">${cc.nome} <span class="text-sm font-normal text-gray-500">(${totalColaboradoresCC} Colab.)</span></span>
                    </div>
                    <span class="font-bold text-lg text-blue-700">${window.formatCurrency(cc.totalCC)}</span>
                </div>
                <div id="${ccId}" class="collapsible-content p-2 hidden">
                    ${lotacoesHtml}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;

    // 4. Resumo Geral (Rodapé)
    if (summary && summary.allEventHeaders) {
        const summaryHeaderCells = summary.allEventHeaders.map(h_obj => 
            `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]" title="Cód: ${h_obj.id}">${h_obj.name}</th>`
        ).join('');
        
        const summaryEventCells = summary.allEventHeaders.map(h_obj => {
            const value = summary.grandTotalEventos[h_obj.id] || 0;
            return `<td class="px-4 py-2 text-sm text-gray-600 text-center font-bold border-l border-gray-100">${window.formatCurrency(value)}</td>`;
        }).join('');

        html += `
            <div class="report-card mt-6 border-t-4 border-indigo-500">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Resumo Geral Consolidado</h3>
                <div class="overflow-x-auto border rounded-lg shadow">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Total Colaboradores</th>
                                ${summaryHeaderCells}
                                <th class="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider border-l border-gray-300">Total Geral</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white">
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">${summary.totalColaboradores}</td>
                                ${summaryEventCells}
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-800 text-right font-bold border-l border-gray-200 bg-blue-50">${window.formatCurrency(summary.grandTotalGeral)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 5. Injeção no DOM
    container.innerHTML = html;

    // 6. Injeção dos Botões (Hook GOLD)
    if (data && data.length > 0) {
        window.addExportButtons('report-cc-lotacao-colaborador', 'Relatorio_CC_Colaborador');
    }
}


// --- FUNÇÕES DE RENDERIZAÇÃO DE GRÁFICOS (Específicas) ---

function renderFolhaVsColaboradoresReport(data, valueType) {
    const container = document.getElementById('report-folha-vs-colaboradores');
    if (!container) return;

    // --- LÓGICA DE ORDENAÇÃO ---
    // Ordena os datasets pelo valor total acumulado (do Menor para o Maior).
    if (data && data.datasets) {
        data.datasets.sort((a, b) => {
            const sumA = a.data.reduce((acc, val) => acc + val, 0);
            const sumB = b.data.reduce((acc, val) => acc + val, 0);
            return sumA - sumB;
        });
    }

    // 1. Cálculos Iniciais
    let initialTotalValor = 0;
    let totalColaboradoresAccum = 0;
    let mesesComDados = 0;

    if (data && data.datasets) {
        data.datasets.forEach(ds => {
            initialTotalValor += ds.data.reduce((a, b) => a + b, 0);
        });
        
        const colabData = data.qtdData || []; 
        mesesComDados = colabData.filter(v => v > 0).length || 1;
        totalColaboradoresAccum = colabData.reduce((a, b) => a + b, 0);
    }
    
    const mediaColaboradores = Math.round(totalColaboradoresAccum / (mesesComDados > 0 ? mesesComDados : 1));

    // 2. HTML do Card
    container.innerHTML = `
        <div class="report-card">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h3 class="text-xl font-semibold text-gray-800">Relatório Valores Folha x Colaboradores (Por Tipo)</h3>
                    <p class="text-sm text-gray-500">Clique na legenda para filtrar os totais</p>
                </div>
                <div class="bg-indigo-50 px-6 py-3 rounded-xl border border-indigo-100 text-right shadow-sm transition-all duration-300">
                    <div class="text-xs font-bold text-indigo-500 uppercase tracking-wide">Total do Período (${valueType})</div>
                    <div class="text-2xl font-extrabold text-indigo-700" id="bn-folha-vs-colab-total">${window.formatCurrency(initialTotalValor)}</div>
                    <div class="text-xs text-gray-600 mt-1">Média de ${mediaColaboradores} colab./mês</div>
                </div>
            </div>
            <div class="h-96"><canvas id="folhaVsColaboradoresChart"></canvas></div>
        </div>`;
    
    const chartId = 'folhaVsColaboradoresChart';
    
    if (!data || !data.datasets || data.datasets.length === 0) {
        container.querySelector('.report-card').innerHTML = `<h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Valores Folha x Colaboradores</h3><p class="text-center text-gray-500 h-full flex items-center justify-center">Sem dados para os filtros selecionados.</p>`;
        if (window.activeCharts[chartId]) window.activeCharts[chartId].destroy();
        return;
    }
    
    if (window.activeCharts[chartId]) window.activeCharts[chartId].destroy();
    const ctx = document.getElementById(chartId).getContext('2d');

    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
        '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'
    ];

    // Prepara datasets de Barra
    const barDatasets = data.datasets.map((ds, index) => ({
        type: 'bar',
        label: ds.label,
        data: ds.data,
        backgroundColor: colors[index % colors.length],
        stack: 'folhaStack',
        order: 2,
        datalabels: {
            color: '#ffffff',
            font: { weight: 'bold', size: 10 },
            formatter: function(value) {
                return value > 0 ? window.formatAbbreviated(value) : '';
            },
            display: function(context) {
                return context.dataset.data[context.dataIndex] > 0; 
            }
        }
    }));

    // Prepara dataset de Linha
    const lineDataset = {
        type: 'line',
        label: 'Qtd. Colaboradores',
        data: data.qtdData,
        borderColor: '#b91c1c',
        backgroundColor: '#b91c1c',
        borderWidth: 3,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#b91c1c',
        pointRadius: 4,
        yAxisID: 'y1', 
        tension: 0.1,
        order: 1,
        datalabels: {
            align: 'top',
            anchor: 'start',
            offset: 6,
            color: '#b91c1c',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 4,
            font: { weight: 'bold', size: 11 },
            formatter: function(value) {
                return value > 0 ? value : '';
            }
        }
    };

    const maxColaboradores = Math.max(...data.qtdData);

    const updateCardTotal = (chart) => {
        let newTotal = 0;
        chart.data.datasets.forEach((dataset, index) => {
            if (chart.isDatasetVisible(index) && dataset.type === 'bar') {
                newTotal += dataset.data.reduce((a, b) => a + b, 0);
            }
        });
        const el = document.getElementById('bn-folha-vs-colab-total');
        if(el) el.textContent = window.formatCurrency(newTotal);
    };

    window.activeCharts[chartId] = new Chart(ctx, {
        data: {
            labels: data.labels,
            datasets: [lineDataset, ...barDatasets]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            layout: { padding: { top: 20, right: 20 } },
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                legend: { 
                    position: 'right', 
                    align: 'start',    
                    labels: { boxWidth: 12, padding: 15, usePointStyle: true },
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        if (ci.isDatasetVisible(index)) {
                            ci.hide(index);
                            legendItem.hidden = true;
                        } else {
                            ci.show(index);
                            legendItem.hidden = false;
                        }
                        updateCardTotal(ci);
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.yAxisID === 'y1') return label + context.parsed.y;
                            else return label + window.formatCurrency(context.parsed.y);
                        },
                        footer: function(tooltipItems) {
                            let totalFolha = 0;
                            tooltipItems.forEach(item => {
                                if (item.dataset.type === 'bar') totalFolha += item.parsed.y;
                            });
                            return totalFolha > 0 ? 'Total Visível Mês: ' + window.formatCurrency(totalFolha) : '';
                        }
                    }
                },
                datalabels: { display: true }
            },
            scales: {
                x: { stacked: true },
                y: { 
                    type: 'linear', display: true, position: 'left', stacked: true,
                    title: { display: true, text: `Valor (${valueType})` },
                    ticks: { callback: window.formatAbbreviated }
                },
                y1: { 
                    type: 'linear', display: true, position: 'right',
                    title: { display: true, text: 'Qtd. Colaboradores' },
                    grid: { drawOnChartArea: false },
                    ticks: { beginAtZero: true },
                    suggestedMax: maxColaboradores * 1.5 
                }
            }
        },
        plugins: [ChartDataLabels] 
    });

    // =========================================================================
    // --- ADIÇÃO GOLD: INJEÇÃO DOS BOTÕES DE EXPORTAÇÃO (EXCEL/PDF) ---
    // =========================================================================
    if (data && data.datasets && data.datasets.length > 0) {
        // Prepara objeto limpo para o Excel entender (já que gráfico não é tabela HTML)
        const dataForExcel = {
            labels: data.labels,
            datasets: data.datasets.map(ds => ({
                label: ds.label,
                data: ds.data,
                type: ds.type // Importante: 'line' vs 'bar'
            })),
            // Caso precise, passamos também a qtdData explicitamente
            qtdData: data.qtdData 
        };

        // Chama a função utilitária global
        window.addExportButtons('report-folha-vs-colaboradores', 'Relatorio_Valores_Vs_Colaboradores', dataForExcel);
    }
}

// --- SUBSTITUA A FUNÇÃO renderAnaliseEncargos POR ESTA VERSÃO OTIMIZADA ---

function renderAnaliseEncargos(data) {
    const tbody = document.getElementById('tbody-relatorio-encargos');
    const bnFolha = document.getElementById('bn-folha');
    const bnFgts = document.getElementById('bn-fgts');
    const bnInss = document.getElementById('bn-inss');
    const bnTotal = document.getElementById('bn-total');
    const bnRecolhimento = document.getElementById('bn-recolhimento');

    // 1. Tratamento de Dados Vazios
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-gray-400 italic">Nenhum dado encontrado para os filtros selecionados.</td></tr>`;
        
        // Limpa Rodapé se existir
        const table = tbody.parentElement;
        let tfoot = table.querySelector('tfoot');
        if (tfoot) tfoot.innerHTML = "";
        
        // Zera Cards
        if(bnFolha) bnFolha.textContent = window.formatCurrency(0);
        if(bnFgts) bnFgts.textContent = '0.00%';
        if(bnInss) bnInss.textContent = '0.00%';
        if(bnTotal) bnTotal.textContent = window.formatCurrency(0);
        if(bnRecolhimento) bnRecolhimento.textContent = window.formatCurrency(0);
        return;
    }

    // 2. Variáveis de Acumulação (Totais)
    let totalFolha = 0, totalFgts = 0, totalInss = 0, totalRetencao = 0;
    let totalEncargos = 0, totalCompensacao = 0, totalRecolhimento = 0;
    let tableHtml = '';
    
    // Dados para Gráficos
    const monthlyData = {};
    const pieData = { 'INSS': 0, 'FGTS': 0, 'Retencao': 0 };

    // 3. Loop de Renderização das Linhas
    data.forEach(row => {
        // Soma Totais Gerais
        totalFolha += row.folha;
        totalInss += row.inss;
        totalFgts += row.fgts;
        totalRetencao += (row.retencao || 0); // Proteção contra null
        totalEncargos += row.total_encargos;
        totalCompensacao += row.compensacao;
        totalRecolhimento += row.recolhimento;

        // Cálculos de Percentual da Linha (Contexto Relativo)
        const percInss = row.folha ? (row.inss / row.folha) * 100 : 0;
        const percFgts = row.folha ? (row.fgts / row.folha) * 100 : 0;
        const percTotal = row.folha ? (row.total_encargos / row.folha) * 100 : 0;
        const percComp = row.total_encargos ? (row.compensacao / row.total_encargos) * 100 : 0;
        const percRec = row.total_encargos ? (row.recolhimento / row.total_encargos) * 100 : 0;

        // Formatação Auxiliar
        const fmt = (v) => window.formatCurrency(v);
        const fmtP = (v) => v.toFixed(2) + '%';

        // Construção da Linha HTML (Layout Compacto GOLD)
        tableHtml += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100">
                <td class="py-3 px-4 text-left font-medium text-gray-700">
                    ${MONTH_NAME_MAP[row.mes] || row.mes}<br>
                    <span class="text-xs text-gray-400 font-normal">${row.ano}</span>
                </td>
                
                <td class="py-3 px-4 text-right font-mono text-gray-800">
                    ${fmt(row.folha)}
                </td>

                <td class="py-3 px-4 text-right">
                    <div class="font-mono text-cyan-700 font-medium">${fmt(row.inss)}</div>
                    <div class="text-xs text-cyan-500">${fmtP(percInss)}</div>
                </td>

                <td class="py-3 px-4 text-right">
                    <div class="font-mono text-blue-700 font-medium">${fmt(row.fgts)}</div>
                    <div class="text-xs text-blue-500">${fmtP(percFgts)}</div>
                </td>

                <td class="py-3 px-4 text-right">
                    <div class="font-mono text-orange-700 font-bold">${fmt(row.retencao || 0)}</div>
                    <div class="text-xs text-orange-400">Extra</div>
                </td>
                
                <td class="py-3 px-4 text-right bg-gray-50">
                    <div class="font-bold font-mono text-gray-800">${fmt(row.total_encargos)}</div>
                    <div class="text-xs text-gray-500" title="% sobre a Folha">${fmtP(percTotal)} da Folha</div>
                </td>

                <td class="py-3 px-4 text-right">
                    <div class="font-mono text-red-600">(${fmt(row.compensacao)})</div>
                    <div class="text-xs text-red-400" title="% abatido dos encargos">${fmtP(percComp)} abatido</div>
                </td>

                <td class="py-3 px-4 text-right border-l-2 border-green-200 bg-green-50">
                    <div class="font-bold font-mono text-green-700">${fmt(row.recolhimento)}</div>
                    <div class="text-xs text-green-600" title="% pago dos encargos totais">${fmtP(percRec)} pago</div>
                </td>
            </tr>
        `;
        
        // Agrega dados para Gráficos
        const mesNome = MONTH_NAME_MAP[row.mes] || row.mes;
        if(!monthlyData[mesNome]) monthlyData[mesNome] = { folha: 0, encargos: 0, recolhimento: 0 };
        monthlyData[mesNome].folha += row.folha;
        monthlyData[mesNome].encargos += row.total_encargos;
        monthlyData[mesNome].recolhimento += row.recolhimento;
        
        pieData['INSS'] += row.inss;
        pieData['FGTS'] += row.fgts;
        pieData['Retencao'] += (row.retencao || 0);
    });
    
    tbody.innerHTML = tableHtml;

    // 4. Rodapé da Tabela (TFOOT)
    const table = tbody.parentElement;
    let tfoot = table.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        table.appendChild(tfoot);
    }

    // Cálculos de Percentual Total
    const percInssTotal = totalFolha ? (totalInss / totalFolha * 100).toFixed(2) + '%' : '0.00%';
    const percFgtsTotal = totalFolha ? (totalFgts / totalFolha * 100).toFixed(2) + '%' : '0.00%';
    const percEncargoTotal = totalFolha ? (totalEncargos / totalFolha * 100).toFixed(2) + '%' : '0.00%';
    // % do Recolhimento Total em relação ao Custo Total (Encargos)
    const percRecolhimentoTotal = totalEncargos ? (totalRecolhimento / totalEncargos * 100).toFixed(2) + '%' : '0.00%';

    tfoot.className = "bg-gray-100 font-bold border-t-2 border-gray-300 shadow-inner";
    tfoot.innerHTML = `
        <tr>
            <td class="py-4 px-4 text-left uppercase text-xs text-gray-700 font-extrabold tracking-wider" colspan="1">Total Geral</td>
            <td class="py-4 px-4 text-right text-gray-900 font-mono">${window.formatCurrency(totalFolha)}</td>
            
            <td class="py-4 px-4 text-right">
                <div class="text-cyan-800">${window.formatCurrency(totalInss)}</div>
                <div class="text-[10px] text-cyan-600 font-normal">${percInssTotal}</div>
            </td>
            
            <td class="py-4 px-4 text-right">
                <div class="text-blue-800">${window.formatCurrency(totalFgts)}</div>
                <div class="text-[10px] text-blue-600 font-normal">${percFgtsTotal}</div>
            </td>

            <td class="py-4 px-4 text-right text-orange-800">${window.formatCurrency(totalRetencao)}</td>
            
            <td class="py-4 px-4 text-right bg-gray-200 text-gray-900 border-l border-gray-300">
                <div>${window.formatCurrency(totalEncargos)}</div>
                <div class="text-[10px] text-gray-600 font-normal">${percEncargoTotal} da Folha</div>
            </td>
            
            <td class="py-4 px-4 text-right text-red-600">(${window.formatCurrency(totalCompensacao)})</td>
            
            <td class="py-4 px-4 text-right bg-green-100 text-green-800 border-l border-green-300">
                <div>${window.formatCurrency(totalRecolhimento)}</div>
                <div class="text-[10px] text-green-700 font-normal">${percRecolhimentoTotal} pago</div>
            </td>
        </tr>
    `;

    // 5. Atualização dos Big Numbers (Cards)
    if(bnFolha) {
        const numMeses = data.length || 1;
        bnFolha.innerHTML = `${window.formatCurrency(totalFolha)}<div class="text-sm font-medium text-indigo-500 mt-1">Média: ${window.formatCurrency(totalFolha/numMeses)}</div>`;
    }
    if(bnFgts) bnFgts.textContent = percFgtsTotal;
    if(bnInss) bnInss.textContent = percInssTotal;
    
    if(bnTotal) {
        bnTotal.innerHTML = `${window.formatCurrency(totalEncargos)}<div class="text-sm font-medium text-gray-500 mt-1">${percEncargoTotal} da Folha</div>`;
    }
    if(bnRecolhimento) {
        const percRecolhimentoReal = totalFolha ? (totalRecolhimento / totalFolha * 100).toFixed(2) : '0.00';
        bnRecolhimento.innerHTML = `${window.formatCurrency(totalRecolhimento)}<div class="text-sm font-medium text-green-500 mt-1">${percRecolhimentoReal}% da Folha</div>`;
    }

    // 6. Atualização dos Gráficos
    // Gráfico de Barras
    const barChartId = 'encargosBarChart';
    if (window.activeCharts && window.activeCharts[barChartId]) window.activeCharts[barChartId].destroy();
    
    const barCtx = document.getElementById(barChartId)?.getContext('2d');
    if (barCtx) {
        const barLabels = Object.keys(monthlyData);
        window.activeCharts[barChartId] = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    { label: 'Folha', data: barLabels.map(m => monthlyData[m].folha), backgroundColor: '#c7d2fe', borderRadius: 4 },
                    { label: 'Encargos', data: barLabels.map(m => monthlyData[m].encargos), backgroundColor: '#6366f1', borderRadius: 4 },
                    { label: 'Recolhimento', data: barLabels.map(m => monthlyData[m].recolhimento), backgroundColor: '#16a34a', borderRadius: 4 }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { position: 'bottom' } },
                scales: {
                    y: { ticks: { callback: (value) => window.formatAbbreviated ? window.formatAbbreviated(value) : value } }
                }
            }
        });
    }
    
    // Gráfico de Pizza (Agora inclui Retenção)
    const pieChartId = 'encargosPieChart';
    if (window.activeCharts && window.activeCharts[pieChartId]) window.activeCharts[pieChartId].destroy();
    
    const pieCtx = document.getElementById(pieChartId)?.getContext('2d');
    if (pieCtx) {
        window.activeCharts[pieChartId] = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['INSS', 'FGTS', 'Retenção'],
                datasets: [{
                    data: [pieData['INSS'], pieData['FGTS'], pieData['Retencao']],
                    backgroundColor: ['#06b6d4', '#3b82f6', '#f97316'], // Ciano, Azul, Laranja
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { position: 'right' },
                    datalabels: {
                        formatter: (value, ctx) => {
                            const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            if (sum === 0 || value === 0) return '';
                            return (value * 100 / sum).toFixed(1) + '%';
                        },
                        color: '#fff',
                        font: { weight: 'bold', size: 12 }
                    }
                } 
            }
        });
    }

    // 7. Injeta Botões de Exportação
    window.addExportButtons('report-analise-encargos', 'Relatorio_Analise_Encargos');
}

// =============================================================
// --- UTILITÁRIOS DE EXPORTAÇÃO (OBRIGATÓRIO PARA OS BOTÕES) ---
// =============================================================

// 1. Injeta os botões no HTML
window.addExportButtons = function(containerId, reportTitle, dataForExcel = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Evita duplicar botões se a função for chamada 2x
    const oldToolbar = container.querySelector('.export-toolbar');
    if (oldToolbar) oldToolbar.remove();

    const toolbar = document.createElement('div');
    toolbar.className = 'export-toolbar flex justify-end gap-2 mb-4 no-print';
    toolbar.innerHTML = `
        <button type="button" onclick="window.exportToExcel('${containerId}', '${reportTitle}')" class="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 font-bold flex items-center transition-colors">
            <i class="fas fa-file-excel mr-2"></i> Excel
        </button>
        <button type="button" onclick="window.exportToPDF('${containerId}', '${reportTitle}')" class="bg-red-600 text-white px-4 py-2 rounded shadow hover:bg-red-700 font-bold flex items-center transition-colors">
            <i class="fas fa-file-pdf mr-2"></i> PDF
        </button>
    `;

    // Insere os botões no topo do relatório
    container.insertBefore(toolbar, container.firstChild);
    
    // Salva dados para gráfico (se houver)
    if (dataForExcel) {
        container.dataset.rawExcelData = JSON.stringify(dataForExcel);
    }
};

// 2. Exportar em PDF via IMPRESSÃO NATIVA do navegador.
// Trocamos o html2pdf (html2canvas) pela impressão nativa porque, na captura por
// imagem, as cores do Tailwind saíam fracas/quase transparentes e relatórios
// grandes eram cortados/estouravam a página. A impressão nativa renderiza as
// cores corretamente e pagina sozinha — o usuário escolhe "Salvar como PDF" no
// diálogo. Gráficos (canvas do Chart.js) são convertidos em imagem para aparecer.
window.exportToPDF = function(elementId, filename) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Remove qualquer área/estilo de impressão anterior.
    const antigaArea = document.getElementById('print-area');
    if (antigaArea) antigaArea.remove();
    const antigoStyle = document.getElementById('print-style');
    if (antigoStyle) antigoStyle.remove();

    // Clona o relatório para não alterar o DOM visível.
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.export-toolbar, .no-print').forEach(el => el.remove());

    // Canvas não é copiado pelo clone de HTML — converte cada gráfico em imagem.
    const canvasOrig = element.querySelectorAll('canvas');
    const canvasClone = clone.querySelectorAll('canvas');
    canvasClone.forEach((c, i) => {
        try {
            const img = document.createElement('img');
            img.src = canvasOrig[i].toDataURL('image/png', 1.0);
            img.style.maxWidth = '100%';
            c.replaceWith(img);
        } catch (e) { /* mantém o canvas se toDataURL falhar */ }
    });

    // Cabeçalho da impressão (título legível + data).
    const header = document.createElement('div');
    header.className = 'print-header';
    const hoje = new Date().toLocaleDateString('pt-BR');
    header.innerHTML = `<h1>${(filename || 'Relatório').replace(/_/g, ' ')}</h1><span>Gerado em ${hoje}</span>`;

    const area = document.createElement('div');
    area.id = 'print-area';
    area.appendChild(header);
    area.appendChild(clone);

    // CSS de impressão: mostra só o relatório, preserva as cores
    // (print-color-adjust: exact) e evita quebrar linhas/tabelas no meio.
    const style = document.createElement('style');
    style.id = 'print-style';
    style.textContent = `
        @media print {
            body * { visibility: hidden !important; }
            #print-area, #print-area * { visibility: visible !important; }
            #print-area {
                position: absolute; left: 0; top: 0; width: 100%;
                padding: 0; background: #ffffff;
            }
            #print-area * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .print-header { margin-bottom: 12px; border-bottom: 2px solid #0369a1; padding-bottom: 8px; }
            .print-header h1 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
            .print-header span { font-size: 11px; color: #64748b; }
            #print-area table { width: 100%; border-collapse: collapse; font-size: 10px; }
            #print-area thead { display: table-header-group; }
            #print-area tr, #print-area td, #print-area th { page-break-inside: avoid; }
            #print-area .overflow-x-auto, #print-area .overflow-auto { overflow: visible !important; }
            #print-area .sticky { position: static !important; }
            .report-card { box-shadow: none !important; }
            @page { size: A4 landscape; margin: 10mm; }
        }
    `;

    document.body.appendChild(style);
    document.body.appendChild(area);

    const limpar = () => {
        if (area) area.remove();
        if (style) style.remove();
        window.removeEventListener('afterprint', limpar);
    };
    window.addEventListener('afterprint', limpar);

    if (window.showToast) window.showToast('Abrindo impressão — escolha "Salvar como PDF".', 'info');
    // Pequena espera para as imagens dos gráficos carregarem antes de imprimir.
    setTimeout(() => window.print(), 300);
};

// 3. Lógica para gerar Excel
window.exportToExcel = function(elementId, filename) {
    // Verificação de segurança da biblioteca
    if (typeof XLSX === 'undefined') {
        alert("Erro: A biblioteca do Excel não foi carregada. Verifique sua conexão ou o index.html.");
        return;
    }

    const element = document.getElementById(elementId);

    // Lógica especial para o Extrato: separa o "codigo" (ex: "051-0011") em
    // duas colunas (Cód. Evento / Cód. Empresa) ao invés de exportar a string junta.
    if (elementId === 'report-extrato' && element.dataset.rawExcelData) {
        try {
            const raw = JSON.parse(element.dataset.rawExcelData);
            const wb = XLSX.utils.book_new();
            const wsData = [];

            wsData.push(['Cód. Evento', 'Cód. Empresa', 'Evento', 'Proventos', 'Descontos', 'Líquido']);
            raw.rows.forEach(r => {
                wsData.push([r.codEvento, r.codEmpresa, r.evento, r.proventos, r.descontos, r.liquido]);
            });
            if (raw.totals) {
                wsData.push(['', '', 'Total', raw.totals.proventos, raw.totals.descontos, raw.totals.liquido]);
            }

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
            XLSX.writeFile(wb, `${filename}.xlsx`);
            return;
        } catch (e) { console.error("Erro ao gerar Excel do Extrato:", e); }
    }

    // Lógica especial para Gráficos (Dataset Bruto)
    if (elementId === 'report-folha-vs-colaboradores' && element.dataset.rawExcelData) {
        try {
            const rawData = JSON.parse(element.dataset.rawExcelData);
            const wb = XLSX.utils.book_new();
            const wsData = [];
            
            // Cabeçalho
            const headers = ['Tipo', ...rawData.labels];
            wsData.push(headers);
            
            // Dados das Barras
            rawData.datasets.forEach(ds => {
                if (ds.type === 'bar') wsData.push([ds.label, ...ds.data]);
            });
            // Dados da Linha (Qtd)
            const qtdDs = rawData.datasets.find(ds => ds.type === 'line');
            if (qtdDs) wsData.push(['Qtd. Colaboradores', ...qtdDs.data]);

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, "Dados do Gráfico");
            XLSX.writeFile(wb, `${filename}.xlsx`);
            return;
        } catch (e) { console.error("Erro ao gerar Excel do gráfico:", e); }
    }

    // Lógica padrão para Tabelas HTML
    const tables = element.querySelectorAll('table');
    if (tables.length === 0) {
        alert("Nenhuma tabela encontrada para exportar.");
        return;
    }

    const wb = XLSX.utils.book_new();
    tables.forEach((table, index) => {
        let sheetName = `Planilha ${index + 1}`;
        // Tenta pegar o nome da lotação/evento do título do accordion
        const parentDiv = table.closest('.collapsible-content');
        if (parentDiv && parentDiv.previousElementSibling) {
            // Limpa o nome para ficar bonito na aba do Excel
            sheetName = parentDiv.previousElementSibling.innerText.split('(')[0].trim().substring(0, 30);
            // Remove caracteres inválidos para nomes de aba Excel
            sheetName = sheetName.replace(/[\[\]\*\/\\\?]/g, '');
        }
        
        const ws = XLSX.utils.table_to_sheet(table);
        
        // Adiciona aba (tratando nomes duplicados)
        try { 
            XLSX.utils.book_append_sheet(wb, ws, sheetName); 
        } catch (e) { 
            XLSX.utils.book_append_sheet(wb, ws, `Planilha ${index + 1}`); 
        }
    });

    XLSX.writeFile(wb, `${filename}.xlsx`);
};

// =============================================================
// --- RELATÓRIO: COMPARATIVO DE PERÍODOS (NOVO) ---
// =============================================================

window.runPeriodComparison = async function() {
    const container = document.getElementById('comparison-results-container');
    const getItems = (typeof window.getSelectedItems === 'function') ? window.getSelectedItems : (() => []);

    const p1Year = document.getElementById('compare-year1').value;
    const p1Month = document.getElementById('compare-month1').value;
    const p2Year = document.getElementById('compare-year2').value;
    const p2Month = document.getElementById('compare-month2').value;
    const valueType = document.getElementById('reports-filter-value-type').value;

    const payload = {
        period1: { year: p1Year, month: p1Month },
        period2: { year: p2Year, month: p2Month },
        company: getItems(document.getElementById('reports-company-panel')),
        costCenter: getItems(document.getElementById('reports-cc-panel')),
        lotations: getItems(document.getElementById('reports-lotation-panel')),
        payrollTypes: getItems(document.getElementById('reports-payroll-type-panel')),
        valueType: valueType
    };

    window.showLoader(container);

    try {
        const response = await window.callApi('/reports/comparison', 'POST', payload);
        renderComparisonReport(response, `${p1Month} ${p1Year}`, `${p2Month} ${p2Year}`, valueType);
    } catch (error) {
        window.showToast(error.message, 'error');
        container.innerHTML = `<p class="text-center text-red-500 py-4">Erro: ${error.message}</p>`;
    } finally {
        window.hideLoader(container);
    }
};

function renderComparisonReport(data, label1, label2, valueType) {
    const container = document.getElementById('comparison-results-container');
    
    // Calcula Variação do Total
    const v1 = data.period1.grandTotal;
    const v2 = data.period2.grandTotal;
    const diffTotal = v2 - v1;
    const percTotal = v1 === 0 ? (v2 > 0 ? 100 : 0) : ((diffTotal / v1) * 100);
    
    // LÓGICA DE CORES INVERTIDA (Custo: Subir é Ruim/Vermelho, Cair é Bom/Verde)
    const getBadge = (perc) => {
        if (perc > 0) return `<span class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold"><i class="fas fa-arrow-up"></i> ${perc.toFixed(2)}%</span>`;
        if (perc < 0) return `<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold"><i class="fas fa-arrow-down"></i> ${Math.abs(perc).toFixed(2)}%</span>`;
        return `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-bold">= 0.00%</span>`;
    };

    // Coleta todos os tipos de folha únicos dos dois períodos
    const allTypes = new Set([...Object.keys(data.period1.breakdown), ...Object.keys(data.period2.breakdown)]);
    
    let rowsHtml = '';
    Array.from(allTypes).sort().forEach(type => {
        const val1 = data.period1.breakdown[type] || 0;
        const val2 = data.period2.breakdown[type] || 0;
        const diff = val2 - val1;
        const perc = val1 === 0 ? (val2 > 0 ? 100 : 0) : ((diff / val1) * 100);

        // Define a cor do texto da diferença
        const diffColorClass = diff > 0 ? 'text-red-600' : (diff < 0 ? 'text-green-600' : 'text-gray-500');

        rowsHtml += `
            <tr class="hover:bg-gray-50 border-b border-gray-100">
                <td class="py-3 px-4 text-left font-medium text-gray-700">${type}</td>
                <td class="py-3 px-4 text-right font-mono text-gray-600">${window.formatCurrency(val1)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-gray-900">${window.formatCurrency(val2)}</td>
                <td class="py-3 px-4 text-right font-mono font-bold ${diffColorClass}">${diff > 0 ? '+' : ''}${window.formatCurrency(diff)}</td>
                <td class="py-3 px-4 text-center">${getBadge(perc)}</td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm text-center">
                <div class="text-xs text-gray-500 font-bold uppercase mb-1">${label1}</div>
                <div class="text-2xl font-extrabold text-gray-700">${window.formatCurrency(v1)}</div>
            </div>
            <div class="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm text-center">
                <div class="text-xs text-blue-600 font-bold uppercase mb-1">${label2}</div>
                <div class="text-2xl font-extrabold text-blue-800">${window.formatCurrency(v2)}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border shadow-sm text-center flex flex-col justify-center items-center">
                <div class="text-xs text-gray-500 font-bold uppercase mb-1">Variação Total</div>
                <div class="flex items-center gap-2">
                    <span class="text-xl font-bold ${diffTotal > 0 ? 'text-red-600' : (diffTotal < 0 ? 'text-green-600' : 'text-gray-600')}">${diffTotal > 0 ? '+' : ''}${window.formatCurrency(diffTotal)}</span>
                    ${getBadge(percTotal)}
                </div>
            </div>
        </div>

        <div class="overflow-x-auto border rounded-lg shadow-sm">
            <table class="min-w-full bg-white divide-y divide-gray-200">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="py-3 px-4 text-left text-xs font-bold text-gray-600 uppercase">Tipo de Folha</th>
                        <th class="py-3 px-4 text-right text-xs font-bold text-gray-600 uppercase">Período 1 (${label1})</th>
                        <th class="py-3 px-4 text-right text-xs font-bold text-blue-700 uppercase">Período 2 (${label2})</th>
                        <th class="py-3 px-4 text-right text-xs font-bold text-gray-600 uppercase">Diferença (R$)</th>
                        <th class="py-3 px-4 text-center text-xs font-bold text-gray-600 uppercase">Variação (%)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${rowsHtml.length > 0 ? rowsHtml : `<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum dado encontrado para as folhas.</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
}