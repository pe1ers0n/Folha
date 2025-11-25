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
    else if (reportType === 'lotacao-colaborador-eventos') window.loadLotacaoColaboradorReport();
    else if (reportType === 'cc-lotacao-colaborador') window.loadCcLotacaoColaboradorReport();
    else if (reportType === 'folha-vs-colaboradores') window.loadFolhaVsColaboradoresReport();
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
    window.currentReportType = reportType;
    document.querySelectorAll('.report-content-area').forEach(area => area.classList.remove('active'));
    
    const activeArea = document.getElementById(`report-${reportType}`);
    if (activeArea) activeArea.classList.add('active');
    
    const mainReportsFilters = document.getElementById('main-reports-filters');
    if(mainReportsFilters) {
        mainReportsFilters.style.display = (reportType === 'comparativo-periodos') ? 'none' : 'block';
    }
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
        events: getItems(document.getElementById('reports-event-panel'))
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
    
    let html = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Analítico por Evento</h3><div class="max-h-96 overflow-y-auto">`;
    
    if (!data || Object.keys(data).length === 0) {
        html += `<p class="text-center text-gray-500">Sem dados.</p></div></div>`;
        container.innerHTML = html;
        return;
    }

    Object.keys(data).sort().forEach(event => {
        html += `<div class="mb-4 border-b pb-2"><h4 class="font-bold text-gray-700">${event}</h4>`;
        const types = data[event];
        Object.keys(types).forEach(type => {
            let typeTotal = 0;
            let detailsHtml = '<ul class="pl-4 text-sm text-gray-600">';
            Object.entries(types[type]).forEach(([lot, vals]) => {
                let val = 0;
                
                // --- CORREÇÃO 3.b (Inclusão do 'Informação') ---
                if(valueType === 'Proventos') {
                    val = vals.totalProventos;
                } else if(valueType === 'Descontos') {
                    val = vals.totalDescontos;
                } else if(valueType === 'Informação') {
                    val = vals.totalInformacao; // Puxa o valor de 'informacao' vindo da API
                } else {
                    val = vals.totalLiquido; // Fallback padrão é 'Líquido'
                }
                // --- FIM DA CORREÇÃO ---
                
                if(val !== 0) {
                    typeTotal += val;
                    detailsHtml += `<li>${lot}: <b>${window.formatCurrency(val)}</b></li>`;
                }
            });
            detailsHtml += '</ul>';
            if(typeTotal !== 0) {
                html += `<div class="ml-2 mt-1"><span class="font-semibold text-blue-800">${type}: ${window.formatCurrency(typeTotal)}</span>${detailsHtml}</div>`;
            }
        });
        html += `</div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
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
    
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Lotação x Colaborador</h3><p class="text-center text-gray-500 py-8">Nenhum dado encontrado para os filtros selecionados.</p></div>`;
        return;
    }

    let html = `<div class="report-card space-y-4">`;
    html += `<h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Lotação x Colaborador (Valor: ${valueType})</h3>`;

    data.forEach((lotacao, index) => {
        const lotacaoId = `lotacao-toggle-${index}`;
        const colaboradorCount = lotacao.colaboradores ? lotacao.colaboradores.length : 0;
        const lotaçãoHeaders = lotacao.lotaçãoHeaders || []; 
        
        const headerCells = lotaçãoHeaders.map(h_obj => 
            `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]" title="Cód: ${h_obj.id}">${h_obj.name}</th>`
        ).join('');
        
        let colaboradorRows = '';
        lotacao.colaboradores.forEach(colaborador => {
            const eventCells = lotaçãoHeaders.map(h_obj => {
                const value = colaborador.eventos[h_obj.id] || 0;
                return `<td class="px-4 py-2 text-sm text-gray-500 text-center">${value === 0 ? '-' : window.formatCurrency(value)}</td>`;
            }).join('');

            colaboradorRows += `
                <tr class="hover:bg-gray-50">
                    <td class="sticky left-0 bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[250px]">${colaborador.nome}</td>
                    ${eventCells}
                    <td class="px-4 py-2 text-sm font-bold text-gray-700 text-right min-w-[150px]">${window.formatCurrency(colaborador.totalColaborador)}</td>
                </tr>
            `;
        });

        html += `
            <div class="border rounded-lg bg-white shadow-sm overflow-hidden">
                <div class="collapsible-header p-4" data-target="${lotacaoId}">
                    <span class="font-bold text-lg text-gray-800">${lotacao.nome || 'Lotação não especificada'} (${colaboradorCount} Colaboradores)</span>
                    <div class="flex items-center gap-4">
                        <span class="font-bold text-lg text-blue-700">${window.formatCurrency(lotacao.totalLotação)}</span>
                        <i class="fas fa-chevron-down toggle-icon"></i>
                    </div>
                </div>
                <div id="${lotacaoId}" class="collapsible-content">
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50 table-header-sticky">
                                <tr>
                                    <th class="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[250px]">Colaborador</th>
                                    ${headerCells}
                                    <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">Total Colaborador</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200">
                                ${colaboradorRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

function renderCcLotacaoColaboradorReport(data, summary, valueType) {
    const container = document.getElementById('report-cc-lotacao-colaborador');
    
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="report-card"><h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Centro de Custo x Colaborador</h3><p class="text-center text-gray-500 py-8">Nenhum dado encontrado para os filtros selecionados.</p></div>`;
        return;
    }

    let html = `<div class="report-card space-y-4">`;
    html += `<h3 class="text-xl font-semibold text-gray-800 mb-4">Relatório Centro de Custo x Colaborador (Valor: ${valueType})</h3>`;

    data.forEach((cc, ccIndex) => {
        const ccId = `cc-toggle-${ccIndex}`;
        let lotacoesHtml = '';
        let totalColaboradoresCC = 0;

        cc.lotacoes.forEach((lotacao, lotIndex) => {
            const lotacaoId = `cc-${ccIndex}-lotacao-toggle-${lotIndex}`;
            const colaboradorCount = lotacao.colaboradores ? lotacao.colaboradores.length : 0;
            totalColaboradoresCC += colaboradorCount;
            const lotaçãoHeaders = lotacao.lotaçãoHeaders || []; 
            
            const headerCells = lotaçãoHeaders.map(h_obj => 
                `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]" title="Cód: ${h_obj.id}">${h_obj.name}</th>`
            ).join('');
            
            let colaboradorRows = '';
            lotacao.colaboradores.forEach(colaborador => {
                const eventCells = lotaçãoHeaders.map(h_obj => {
                    const value = colaborador.eventos[h_obj.id] || 0;
                    return `<td class="px-4 py-2 text-sm text-gray-500 text-center">${value === 0 ? '-' : window.formatCurrency(value)}</td>`;
                }).join('');

                colaboradorRows += `
                    <tr class="hover:bg-gray-50">
                        <td class="sticky left-0 bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[150px]">${colaborador.empresa}</td>
                        <td class="sticky left-[150px] bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 min-w-[200px]">${colaborador.nome}</td>
                        <td class="sticky left-[350px] bg-white hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-sm text-gray-500 min-w-[200px]">${colaborador.cargo}</td>
                        ${eventCells}
                        <td class="px-4 py-2 text-sm font-bold text-gray-700 text-right min-w-[150px]">${window.formatCurrency(colaborador.totalColaborador)}</td>
                    </tr>
                `;
            });

            lotacoesHtml += `
                <div class="border rounded-lg bg-white shadow-sm overflow-hidden ml-4 mt-2">
                    <div class="collapsible-header p-3 bg-gray-100" data-target="${lotacaoId}">
                        <span class="font-semibold text-md text-gray-700">${lotacao.nome} (${colaboradorCount} Colaboradores)</span>
                        <div class="flex items-center gap-4">
                            <span class="font-semibold text-md text-blue-600">${window.formatCurrency(lotacao.totalLotacao)}</span>
                            <i class="fas fa-chevron-down toggle-icon text-sm"></i>
                        </div>
                    </div>
                    <div id="${lotacaoId}" class="collapsible-content">
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50 table-header-sticky">
                                    <tr>
                                        <th class="sticky left-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Empresa</th>
                                        <th class="sticky left-[150px] bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">Funcionário</th>
                                        <th class="sticky left-[350px] bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">Cargo</th>
                                        ${headerCells}
                                        <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[150px]">Total Colaborador</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200">
                                    ${colaboradorRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
            <div class="border rounded-lg bg-gray-50 shadow-md overflow-hidden">
                <div class="collapsible-header p-4" data-target="${ccId}">
                    <span class="font-bold text-lg text-gray-800">${cc.nome} (${totalColaboradoresCC} Colaboradores)</span>
                    <div class="flex items-center gap-4">
                        <span class="font-bold text-lg text-blue-700">${window.formatCurrency(cc.totalCC)}</span>
                        <i class="fas fa-chevron-down toggle-icon"></i>
                    </div>
                </div>
                <div id="${ccId}" class="collapsible-content p-2">
                    ${lotacoesHtml}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;

    if (summary && summary.allEventHeaders) {
        const summaryHeaderCells = summary.allEventHeaders.map(h_obj => 
            `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]" title="Cód: ${h_obj.id}">${h_obj.name}</th>`
        ).join('');
        
        const summaryEventCells = summary.allEventHeaders.map(h_obj => {
            const value = summary.grandTotalEventos[h_obj.id] || 0;
            return `<td class="px-4 py-2 text-sm text-gray-600 text-center font-bold">${window.formatCurrency(value)}</td>`;
        }).join('');

        html += `
            <div class="report-card mt-6">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Resumo Geral</h3>
                <div class="overflow-x-auto border rounded-lg shadow">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-100">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Colaboradores</th>
                                ${summaryHeaderCells}
                                <th class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total Geral</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white">
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">${summary.totalColaboradores}</td>
                                ${summaryEventCells}
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-800 text-right font-bold">${window.formatCurrency(summary.grandTotalGeral)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}


// --- FUNÇÕES DE RENDERIZAÇÃO DE GRÁFICOS (Específicas) ---

function renderFolhaVsColaboradoresReport(data, valueType) {
    const container = document.getElementById('report-folha-vs-colaboradores');
    if (!container) return;

    // --- LÓGICA DE ORDENAÇÃO (NOVO) ---
    // Ordena os datasets pelo valor total acumulado (do Menor para o Maior).
    // Assim, os menores valores ficam na base da barra (índice 0 = base).
    if (data && data.datasets) {
        data.datasets.sort((a, b) => {
            const sumA = a.data.reduce((acc, val) => acc + val, 0);
            const sumB = b.data.reduce((acc, val) => acc + val, 0);
            return sumA - sumB;
        });
    }
    // ----------------------------------

    // 1. Cálculos Iniciais (baseados nos dados já ordenados)
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

    // Prepara datasets de Barra (Agora já ordenados)
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

    // Função para atualizar o card ao clicar na legenda
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
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: { 
                legend: { 
                    position: 'right', 
                    align: 'start',    
                    labels: {
                        boxWidth: 12,
                        padding: 15,
                        usePointStyle: true 
                    },
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
                            if (context.dataset.yAxisID === 'y1') {
                                return label + context.parsed.y;
                            } else {
                                return label + window.formatCurrency(context.parsed.y);
                            }
                        },
                        footer: function(tooltipItems) {
                            let totalFolha = 0;
                            tooltipItems.forEach(item => {
                                if (item.dataset.type === 'bar') {
                                    totalFolha += item.parsed.y;
                                }
                            });
                            if (totalFolha > 0) {
                                return 'Total Visível Mês: ' + window.formatCurrency(totalFolha);
                            }
                            return '';
                        }
                    }
                },
                datalabels: { display: true }
            },
            scales: {
                x: { stacked: true },
                y: { 
                    type: 'linear',
                    display: true,
                    position: 'left',
                    stacked: true,
                    title: { display: true, text: `Valor (${valueType})` },
                    ticks: { callback: window.formatAbbreviated }
                },
                y1: { 
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Qtd. Colaboradores' },
                    grid: { drawOnChartArea: false },
                    ticks: { beginAtZero: true },
                    suggestedMax: maxColaboradores * 1.5 
                }
            }
        },
        plugins: [ChartDataLabels] 
    });
}

function renderAnaliseEncargos(data) {
    // Esta é uma função de renderização complexa e separada.
    const tbody = document.getElementById('tbody-relatorio-encargos');
    const bnFolha = document.getElementById('bn-folha');
    const bnFgts = document.getElementById('bn-fgts');
    const bnInss = document.getElementById('bn-inss');
    const bnTotal = document.getElementById('bn-total');
    const bnRecolhimento = document.getElementById('bn-recolhimento');

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-gray-400 italic">Nenhum dado encontrado para os filtros selecionados.</td></tr>`;
        
        // --- LIMPA O TFOOT SE EXISTIR ---
        const table = tbody.parentElement;
        let tfoot = table.querySelector('tfoot');
        if (tfoot) tfoot.innerHTML = "";
        // --- FIM DA LIMPEZA ---
        
        bnFolha.textContent = window.formatCurrency(0);
        bnFgts.textContent = '0.00%';
        bnInss.textContent = '0.00%';
        bnTotal.textContent = window.formatCurrency(0);
        bnRecolhimento.textContent = window.formatCurrency(0);
        return;
    }

    let totalFolha = 0;
    let totalFgts = 0;
    let totalInss = 0;
    let totalEncargos = 0;
    let totalRecolhimento = 0;
    let totalCompensacao = 0;

    let tableHtml = '';
    
    // Agrupa por mês para o gráfico de barras
    const monthlyData = {};
    const pieData = { 'INSS': 0, 'FGTS': 0 };

    data.forEach(row => {
        totalFolha += row.folha;
        totalFgts += row.fgts;
        totalInss += row.inss;
        totalEncargos += row.total_encargos;
        totalCompensacao += row.compensacao;
        
        const recolhimento = row.recolhimento; 
        totalRecolhimento += recolhimento;

        const percInss = getPercText(row.inss, row.folha);
        const percFgts = getPercText(row.fgts, row.folha);
        const percEncargo = getPercText(row.total_encargos, row.folha);
        const percCompensacao = getPercText(row.compensacao, row.folha);
        const percRecolhimento = getPercText(recolhimento, row.folha);
        
        tableHtml += `
            <tr class="hover:bg-gray-50">
                <td class="py-3 px-4">${MONTH_NAME_MAP[row.mes]} / ${row.ano}</td>
                <td class="py-3 px-4 text-right">${window.formatCurrency(row.folha)}</td>
                <td class="py-3 px-4 text-right text-cyan-600">${window.formatCurrency(row.inss)}</td>
                <td class="py-3 px-4 text-right text-cyan-600 text-xs">${percInss}</td>
                <td class="py-3 px-4 text-right text-blue-600">${window.formatCurrency(row.fgts)}</td>
                <td class="py-3 px-4 text-right text-blue-600 text-xs">${percFgts}</td>
                <td class="py-3 px-4 text-right font-bold">${window.formatCurrency(row.total_encargos)}</td>
                <td class="py-3 px-4 text-right font-bold text-xs">${percEncargo}</td>
                <td class="py-3 px-4 text-right text-red-500">(${window.formatCurrency(row.compensacao)})</td>
                <td class="py-3 px-4 text-right text-red-500 text-xs">${percCompensacao}</td>
                <td class="py-3 px-4 text-right font-bold text-green-600">${window.formatCurrency(recolhimento)}</td>
                <td class="py-3 px-4 text-right font-bold text-green-600 text-xs">${percRecolhimento}</td>
            </tr>
        `;
        
        // Agrega para gráficos
        const mesNome = MONTH_NAME_MAP[row.mes];
        if(!monthlyData[mesNome]) monthlyData[mesNome] = { folha: 0, encargos: 0, recolhimento: 0 };
        monthlyData[mesNome].folha += row.folha;
        monthlyData[mesNome].encargos += row.total_encargos;
        monthlyData[mesNome].recolhimento += recolhimento;
        
        pieData['INSS'] += row.inss;
        pieData['FGTS'] += row.fgts;
    });
    
    tbody.innerHTML = tableHtml;

    // --- INÍCIO DA CORREÇÃO (ADICIONAR TFOOT) ---
    const table = tbody.parentElement;
    let tfoot = table.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        table.appendChild(tfoot);
    }

    // Calcular percentuais totais
    const percInssTotal = getPercText(totalInss, totalFolha);
    const percFgtsTotal = getPercText(totalFgts, totalFolha);
    const percEncargoTotal = getPercText(totalEncargos, totalFolha);
    const percCompensacaoTotal = getPercText(totalCompensacao, totalFolha);
    const percRecolhimentoTotal = getPercText(totalRecolhimento, totalFolha);
    
    // Estilo do TFOOT (pode ser cinza-claro como o header)
    tfoot.className = "bg-gray-100 font-bold border-t-2 border-gray-300";
    tfoot.innerHTML = `
        <tr>
            <td class="py-3 px-4 text-left uppercase text-xs text-gray-700">Total Geral</td>
            <td class="py-3 px-4 text-right">${window.formatCurrency(totalFolha)}</td>
            <td class="py-3 px-4 text-right text-cyan-600">${window.formatCurrency(totalInss)}</td>
            <td class="py-3 px-4 text-right text-cyan-600 text-xs">${percInssTotal}</td>
            <td class="py-3 px-4 text-right text-blue-600">${window.formatCurrency(totalFgts)}</td>
            <td class="py-3 px-4 text-right text-blue-600 text-xs">${percFgtsTotal}</td>
            <td class="py-3 px-4 text-right">${window.formatCurrency(totalEncargos)}</td>
            <td class="py-3 px-4 text-right text-xs">${percEncargoTotal}</td>
            <td class="py-3 px-4 text-right text-red-500">(${window.formatCurrency(totalCompensacao)})</td>
            <td class="py-3 px-4 text-right text-red-500 text-xs">${percCompensacaoTotal}</td>
            <td class="py-3 px-4 text-right text-green-600">${window.formatCurrency(totalRecolhimento)}</td>
            <td class="py-3 px-4 text-right text-green-600 text-xs">${percRecolhimentoTotal}</td>
        </tr>
    `;
    // --- FIM DA CORREÇÃO (TFOOT) ---


    // --- INÍCIO DA CORREÇÃO (CARDS) ---
    // Preenche Banners (Big Numbers)
    const numMeses = data.length > 0 ? data.length : 1; // Evita divisão por zero
    const mediaFolha = (totalFolha / numMeses);
    
    bnFolha.innerHTML = `
        ${window.formatCurrency(totalFolha)}
        <div class="text-sm font-medium text-indigo-500 mt-1">Média: ${window.formatCurrency(mediaFolha)}</div>
    `;
    
    bnFgts.textContent = totalFolha > 0 ? `${(totalFgts / totalFolha * 100).toFixed(2)}%` : '0.00%';
    bnInss.textContent = totalFolha > 0 ? `${(totalInss / totalFolha * 100).toFixed(2)}%` : '0.00%';
    
    // Card TOTAL ENCARGOS
    const percEncargoTotalNum = totalFolha > 0 ? (totalEncargos / totalFolha * 100).toFixed(2) : 0;
    bnTotal.innerHTML = `
        ${window.formatCurrency(totalEncargos)}
        <div class="text-sm font-medium text-gray-500 mt-1">${percEncargoTotalNum}% da Folha</div>
    `;
    
    // Card RECOLHIMENTO
    const percRecolhimentoTotalNum = totalFolha > 0 ? (totalRecolhimento / totalFolha * 100).toFixed(2) : 0;
    bnRecolhimento.innerHTML = `
        ${window.formatCurrency(totalRecolhimento)}
        <div class="text-sm font-medium text-green-500 mt-1">${percRecolhimentoTotalNum}% da Folha</div>
    `;
    // --- FIM DA CORREÇÃO (CARDS) ---

    // Renderiza Gráfico de Barras (Evolução)
    const barChartId = 'encargosBarChart';
    if (window.activeCharts[barChartId]) window.activeCharts[barChartId].destroy();
    const barCtx = document.getElementById(barChartId).getContext('2d');
    
    const barLabels = Object.keys(monthlyData);
    const barDataFolha = barLabels.map(m => monthlyData[m].folha);
    const barDataEncargos = barLabels.map(m => monthlyData[m].encargos);
    const barDataRecolhimento = barLabels.map(m => monthlyData[m].recolhimento);
    
    window.activeCharts[barChartId] = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: barLabels,
            datasets: [
                { label: 'Folha', data: barDataFolha, backgroundColor: '#c7d2fe' },
                { label: 'Encargos', data: barDataEncargos, backgroundColor: '#6366f1' },
                { label: 'Recolhimento', data: barDataRecolhimento, backgroundColor: '#16a34a' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    
    // Renderiza Gráfico de Pizza (Composição)
    const pieChartId = 'encargosPieChart';
    if (window.activeCharts[pieChartId]) window.activeCharts[pieChartId].destroy();
    const pieCtx = document.getElementById(pieChartId).getContext('2d');
    
    window.activeCharts[pieChartId] = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['INSS', 'FGTS'],
            datasets: [{
                data: [pieData['INSS'], pieData['FGTS']],
                backgroundColor: ['#06b6d4', '#3b82f6'],
                borderColor: '#ffffff',
                borderWidth: 2
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
                        if (sum === 0) return '0.0%'; // Evita divisão por zero
                        const percentage = (value * 100 / sum).toFixed(1) + '%';
                        return percentage;
                    },
                    color: '#fff',
                    font: { weight: 'bold', size: 14 }
                }
            } 
        }
    });
}