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

// Função para alternar visibilidade das linhas filhas
window.toggleDashboardRow = function(id) {
    const children = document.querySelectorAll(`.child-row-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    
    let isHidden = false;
    children.forEach(row => {
        if (row.classList.contains('hidden')) {
            row.classList.remove('hidden');
            isHidden = true; // Estava escondido, agora mostrou
        } else {
            row.classList.add('hidden');
            isHidden = false;
        }
    });

    if (icon) {
        if (isHidden) {
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-down');
        } else {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-right');
        }
    }
};

function createDashboardTable(title, groupHeader, tableData, payrollHeaders, valueType, dashboardGrandTotal) {
    const container = document.createElement('div');
    if (Object.keys(tableData).length === 0) return container;

    let tableRows = [];
    let totals = { grandTotal: 0 };
    payrollHeaders.forEach(h => totals[h] = 0);

    Object.keys(tableData).map((key, index) => {
        // --- PAI: Separa Nome e ID ---
        const parts = key.split('|||');
        const rawName = parts[0];
        const rawId = parts[1];
        const displayName = rawId ? `${rawId} - ${rawName}` : rawName;
        
        const isHierarchy = tableData[key].isHierarchy === true;
        const valuesObj = isHierarchy ? tableData[key].totals : tableData[key];
        
        let rowTotal = 0;
        const rowData = { 
            id: index, 
            group: displayName, // Nome do Pai (ID - Nome)
            isHierarchy: isHierarchy,
            values: {},
            children: [] 
        };

        payrollHeaders.forEach(header => {
            const value = valuesObj[header] || 0;
            rowData.values[header] = value;
            rowTotal += value;
            totals[header] += value;
        });
        rowData.total = rowTotal;
        totals.grandTotal += rowTotal;

        // --- FILHOS: Separa Nome e ID ---
        if (isHierarchy && tableData[key].children) {
            Object.keys(tableData[key].children).sort().forEach(childKey => {
                
                // AQUI A MÁGICA: Separa o ID do filho também
                const cParts = childKey.split('|||');
                const cName = cParts[0];
                const cId = cParts[1];
                // Formata: "ID - Nome"
                const childDisplayName = cId ? `${cId} - ${cName}` : cName;

                let childRowTotal = 0;
                const childData = { group: childDisplayName, values: {} };
                
                payrollHeaders.forEach(header => {
                    const val = tableData[key].children[childKey][header] || 0;
                    childData.values[header] = val;
                    childRowTotal += val;
                });
                childData.total = childRowTotal;
                rowData.children.push(childData);
            });
        }

        tableRows.push(rowData);
    });

    // Ordena pais pelo ID/Nome
    tableRows.sort((a, b) => a.group.localeCompare(b.group));

    const renderRows = (rows) => {
        let html = '';
        rows.forEach(row => {
            const rowPercentage = dashboardGrandTotal > 0 ? (row.total / dashboardGrandTotal * 100).toFixed(2) : '0.00';
            
            let toggleIcon = '';
            let clickAction = '';
            let cursorClass = '';
            let nameColorClass = 'text-gray-800';
            
            if (row.isHierarchy && row.children.length > 0) {
                toggleIcon = `<i id="icon-${row.id}" class="fas fa-chevron-right text-gray-400 mr-2 w-4 transition-transform"></i>`;
                clickAction = `onclick="window.toggleDashboardRow(${row.id})"`;
                cursorClass = 'cursor-pointer hover:bg-gray-50';
                nameColorClass = 'text-blue-900'; 
            }

            // LINHA PAI
            html += `<tr class="border-b ${cursorClass}" ${clickAction}>`;
            html += `<td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${nameColorClass} text-left">
                        ${toggleIcon}${row.group}
                     </td>`;
            
            payrollHeaders.forEach(header => {
                html += `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center"><b>${window.formatCurrency(row.values[header] || 0)}</b></td>`;
            });
            html += `<td class="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-indigo-900 bg-indigo-50 text-center">${window.formatCurrency(row.total)} <span class="text-xs font-normal text-gray-500">(${rowPercentage}%)</span></td>`;
            html += `</tr>`;

            // LINHAS FILHAS
            if (row.children && row.children.length > 0) {
                row.children.forEach(child => {
                    html += `<tr class="child-row-${row.id} hidden bg-gray-50 border-b border-gray-100">`;
                    html += `<td class="px-6 py-2 whitespace-nowrap text-xs font-medium text-gray-600 text-left pl-10">
                                <i class="fas fa-level-up-alt rotate-90 text-gray-300 mr-2"></i>${child.group}
                             </td>`;
                    
                    payrollHeaders.forEach(header => {
                        html += `<td class="px-6 py-2 whitespace-nowrap text-xs text-gray-500 text-center">${window.formatCurrency(child.values[header] || 0)}</td>`;
                    });
                    
                    html += `<td class="px-6 py-2 whitespace-nowrap text-xs font-bold text-gray-600 text-center">${window.formatCurrency(child.total)}</td>`;
                    html += `</tr>`;
                });
            }
        });
        return html;
    };
    
    const headerStyle = "background-color: #002060; color: #FFC000;"; 
    const footerStyle = "background-color: #BDD7EE; color: #000000;"; 

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
                        <th class="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-yellow-400 pl-8">${groupHeader}</th>
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