// js/dashboard.js

let dashboardFiltersPopulated = false;

window.loadInicioData = async function() {
    const dashboardContainer = document.getElementById('dashboard-container');
    window.showLoader(dashboardContainer);
    
    const filterYear = document.getElementById('filter-year');
    const filterMonth = document.getElementById('filter-month');
    const filterValueType = document.getElementById('filter-value-type');
    const payrollTypeFilterPanel = document.getElementById('payroll-type-filter-panel');

    const filters = {
        year: filterYear.value,
        month: filterMonth.value,
        payrollTypes: typeof window.getSelectedItems === 'function' ? window.getSelectedItems(payrollTypeFilterPanel) : [],
        valueType: filterValueType.value
    };

    try {
        const data = await window.callApi('/dashboard', 'POST', filters);
        renderDashboard(data);
    } catch (err) {
        window.showToast(err.message, 'error');
    } finally {
        window.hideLoader(dashboardContainer);
    }
};

function renderDashboard(data) {
    const dashboardContainer = document.getElementById('dashboard-container');
    const filterYear = document.getElementById('filter-year');
    const filterMonth = document.getElementById('filter-month');
    const payrollTypeFilterPanel = document.getElementById('payroll-type-filter-panel');
    const payrollTypeFilterText = document.getElementById('payroll-type-filter-text');

    if (!dashboardFiltersPopulated) {
        filterYear.innerHTML = data.availableYears.map(y => `<option>${y}</option>`).join('');
        filterMonth.innerHTML = data.availableMonths.map(m => `<option>${m}</option>`).join('');
        
        // Popula filtro de Tipo de Folha do Dashboard
        const payrollTypeOptionsHtml = data.availablePayrollTypes.map(t => `
            <label class="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 payroll-type-filter-label cursor-pointer">
                <input type="checkbox" value="${t}" class="payroll-type-cb h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-700">
                <span class="text-sm text-gray-700">${t}</span>
            </label>
        `).join('');
        
        const listContainer = payrollTypeFilterPanel.querySelector('.payroll-type-list');
        if(listContainer) listContainer.innerHTML = payrollTypeOptionsHtml;
        
        if (typeof window.setupMultiSelectFilter === 'function') {
            window.setupMultiSelectFilter(
                payrollTypeFilterPanel, 
                payrollTypeFilterText, 
                'Tipo de Folha',
                '.payroll-type-search',
                '.payroll-type-select-all',
                '.payroll-type-deselect-all',
                '.payroll-type-filter-label'
            );
        }
        dashboardFiltersPopulated = true;
    }

    dashboardContainer.innerHTML = '';
    if (Object.keys(data.empresaData).length === 0 && Object.keys(data.ccData).length === 0) {
        dashboardContainer.innerHTML = '<p class="text-center text-gray-500">Nenhum dado encontrado para os filtros selecionados.</p>';
        return;
    }

    const valueType = document.getElementById('filter-value-type').value;
    let dashboardGrandTotal = 0;
    Object.values(data.empresaData).forEach(c => Object.values(c).forEach(v => dashboardGrandTotal += v));

    dashboardContainer.appendChild(createDashboardTable('Resumo por Empresa', 'EMPRESA', data.empresaData, data.payrollHeaders, valueType, dashboardGrandTotal));
    dashboardContainer.appendChild(createDashboardTable('Resumo por Centro de Custo', 'CENTRO DE CUSTO', data.ccData, data.payrollHeaders, valueType, dashboardGrandTotal));
}

function createDashboardTable(title, groupHeader, tableData, payrollHeaders, valueType, dashboardGrandTotal) {
    const container = document.createElement('div');
    if (Object.keys(tableData).length === 0) return container;

    let tableRows = Object.keys(tableData).map(groupName => {
        let rowTotal = 0;
        const rowData = { group: groupName };
        payrollHeaders.forEach(header => {
            const value = tableData[groupName][header] || 0;
            rowData[header] = value;
            rowTotal += value;
        });
        rowData.total = rowTotal;
        return rowData;
    });
    
    const totals = tableRows.reduce((acc, curr) => {
        payrollHeaders.forEach(h => acc[h] = (acc[h] || 0) + (curr[h] || 0));
        acc.grandTotal = (acc.grandTotal || 0) + curr.total;
        return acc;
    }, {});

    const renderRows = (rows) => {
        return rows.map(rowData => {
            const rowPercentage = dashboardGrandTotal > 0 ? (rowData.total / dashboardGrandTotal * 100).toFixed(2) : '0.00';
            let rowHTML = `<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 bg-white text-left border-b">${rowData.group}</td>`;
            payrollHeaders.forEach(header => {
                rowHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center border-b"><b>${window.formatCurrency(rowData[header] || 0)}</b></td>`;
            });
            rowHTML += `<td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 bg-white text-center border-b">${window.formatCurrency(rowData.total)} (${rowPercentage}%)</td>`;
            return `<tr>${rowHTML}</tr>`;
        }).join('');
    };
    
    // Estilos específicos para ficar igual à sua imagem
    const headerStyle = "background-color: #002060; color: #FFC000;"; // Azul Tijuca e Amarelo
    const footerStyle = "background-color: #BDD7EE; color: #000000;"; // Azul claro

    let footerHTML = `<th class="px-6 py-3 text-left text-xs font-bold uppercase" style="${footerStyle}">Total geral</th>`;
    payrollHeaders.forEach(header => {
        footerHTML += `<th class="px-6 py-3 text-center text-xs font-bold uppercase" style="${footerStyle}">${window.formatCurrency(totals[header] || 0)}</th>`;
    });
    footerHTML += `<th class="px-6 py-3 text-center text-xs font-bold uppercase" style="${footerStyle}">${window.formatCurrency(totals.grandTotal || 0)} (100.00%)</th>`;

    container.innerHTML = `
        <div class="flex justify-between items-baseline mb-2">
            <h3 class="text-xl font-semibold text-gray-800">${title}</h3>
            <span class="text-sm font-medium text-gray-500">Valores em: ${valueType}</span>
        </div>
        <div class="overflow-x-auto shadow rounded-lg border mb-8">
            <table class="min-w-full divide-y divide-gray-200">
                <thead style="${headerStyle}">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-yellow-400">${groupHeader}</th>
                        ${payrollHeaders.map(h => `<th class="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider text-yellow-400">${h}</th>`).join('')}
                        <th class="px-6 py-3 text-center text-xs font-bold uppercase tracking-wider text-yellow-400">Total</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">${renderRows(tableRows)}</tbody>
                <tfoot><tr style="${footerStyle}">${footerHTML}</tr></tfoot>
            </table>
        </div>`;
    
    return container;
}

document.addEventListener('DOMContentLoaded', () => {
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    if(applyFiltersBtn) applyFiltersBtn.addEventListener('click', window.loadInicioData);
});