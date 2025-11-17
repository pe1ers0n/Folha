// js/filters.js

// Estado local de controle para não recarregar filtros repetidamente sem necessidade
let reportsFiltersPopulated = false;

// ATUALIZADO: Adicionado 'window.'
window.getSelectedItems = function(panel) {
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

// ATUALIZADO: Adicionado 'window.'
window.updateMultiSelectFilterText = function(selected, textElement, defaultText) {
    const selectedCount = selected.length;
    textElement.textContent = selectedCount === 0 ? defaultText : 
                             (selectedCount === 1 ? selected[0] : `${selectedCount} selecionados`);
}

// ATUALIZADO: Adicionado 'window.'
window.setupMultiSelectFilter = function(panelElement, textElement, defaultText, searchSelector, selectAllSelector, deselectAllSelector, itemLabelSelector) {
    const searchInput = panelElement.querySelector(searchSelector);
    const selectAllLink = panelElement.querySelector(selectAllSelector);
    const deselectAllLink = panelElement.querySelector(deselectAllSelector);
    const itemListContainer = panelElement.querySelector('.max-h-40.overflow-y-auto'); // Garante que pega o container da lista

    updateMultiSelectFilterText(getSelectedItems(panelElement), textElement, defaultText);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            panelElement.querySelectorAll(itemLabelSelector).forEach(label => {
                const itemName = label.textContent.toLowerCase();
                label.style.display = itemName.includes(searchTerm) ? 'flex' : 'none';
            });
        });
    }

    if (selectAllLink) {
        selectAllLink.addEventListener('click', (e) => {
            e.preventDefault();
            panelElement.querySelectorAll(`${itemLabelSelector} input[type="checkbox"]`).forEach(cb => {
                if (cb.closest(itemLabelSelector).style.display !== 'none') cb.checked = true;
            });
            updateMultiSelectFilterText(getSelectedItems(panelElement), textElement, defaultText);
        });
    }

    if (deselectAllLink) {
        deselectAllLink.addEventListener('click', (e) => {
            e.preventDefault();
            panelElement.querySelectorAll(`${itemLabelSelector} input[type="checkbox"]`).forEach(cb => {
                if (cb.closest(itemLabelSelector).style.display !== 'none') cb.checked = false;
            });
            updateMultiSelectFilterText(getSelectedItems(panelElement), textElement, defaultText);
        });
    }

    if (itemListContainer) {
        itemListContainer.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                updateMultiSelectFilterText(getSelectedItems(panelElement), textElement, defaultText);
            }
        });
    }
}

// ATUALIZADO: Adicionado 'window.'
window.loadReportFilters = async function() {
    if (reportsFiltersPopulated) return;
    const reportsContainer = document.getElementById('reports-container');
    
    // Não mostre o loader principal se for apenas carregar filtros, 
    // senão pode piscar a tela. Use um indicador sutil se preferir.
    
    try {
        const data = await callApi('/reports/filters', 'GET');
        if (data.filterOptions) {
            populateReportFilters(data.filterOptions);
            reportsFiltersPopulated = true;
        }
    } catch (err) {
        showToast("Erro ao carregar filtros: " + err.message, 'error');
    }
}

// --- FUNÇÃO INTEIRA SUBSTITUÍDA ---
// ATUALIZADO: Adicionado 'window.'
window.populateReportFilters = function(filterOptions) {
    // Selects Simples (Ano e Mês)
    const reportsFilterYear = document.getElementById('reports-filter-year');
    const reportsFilterMonth = document.getElementById('reports-filter-month');
    
    // Painéis Multi-Select (Empresa e CC)
    const reportsCompanyPanel = document.getElementById('reports-company-panel');
    const reportsCompanyText = document.getElementById('reports-company-text');
    const reportsCostCenterPanel = document.getElementById('reports-cc-panel');
    const reportsCostCenterText = document.getElementById('reports-cc-text');
    
    // Comparativo Selects
    const compareYear1 = document.getElementById('compare-year1');
    const compareYear2 = document.getElementById('compare-year2');
    const compareMonth1 = document.getElementById('compare-month1');
    const compareMonth2 = document.getElementById('compare-month2');

    // Opções HTML (API agora envia dados puros)
    const yearOptions = filterOptions.years.map(y => `<option>${y}</option>`).join('');
    const monthOptions = filterOptions.months.map(m => `<option>${m}</option>`).join('');

    // Popula Selects de Ano/Mês (Adiciona "Todos" aqui)
    if(reportsFilterYear) reportsFilterYear.innerHTML = '<option value="Todos">Todos os Anos</option>' + yearOptions;
    if(reportsFilterMonth) reportsFilterMonth.innerHTML = '<option value="Todos">Todos os Meses</option>' + monthOptions;
    
    // Popula selects do Comparativo (não precisam de "Todos")
    if(compareYear1) compareYear1.innerHTML = yearOptions;
    if(compareYear2) compareYear2.innerHTML = yearOptions;
    if(compareMonth1) compareMonth1.innerHTML = monthOptions;
    if(compareMonth2) compareMonth2.innerHTML = monthOptions;

    // --- MULTI SELECTS ---
    const selectLinksHtml = `
        <div class="p-1 flex justify-between border-b">
            <a href="#" class="text-xs text-blue-600 hover:underline select-all">Marcar Todos</a>
            <a href="#" class="text-xs text-blue-600 hover:underline deselect-all">Desmarcar Todos</a>
        </div>
    `;

    // Função helper para criar HTML de checkbox
    const createCheckboxHtml = (items, itemClass) => {
        return items.map(item => `
            <label class="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 ${itemClass} cursor-pointer">
                <input type="checkbox" value="${item}" class="h-4 w-4 rounded border-gray-300 focus:ring-blue-700">
                <span class="text-sm text-gray-700">${item}</span>
            </label>
        `).join('');
    };
    
    // 1. Tipos de Folha
    const reportsPayrollTypePanel = document.getElementById('reports-payroll-type-panel');
    const reportsPayrollTypeText = document.getElementById('reports-payroll-type-text');
    if (reportsPayrollTypePanel) {
        const payrollHtml = createCheckboxHtml(filterOptions.payrollTypes || [], 'payroll-type-filter-label');
        const listContainer = reportsPayrollTypePanel.querySelector('.payroll-type-list');
        if(listContainer) {
            listContainer.innerHTML = selectLinksHtml.replaceAll('select-all', 'payroll-type-select-all').replaceAll('deselect-all', 'payroll-type-deselect-all') + payrollHtml;
        }
        setupMultiSelectFilter(reportsPayrollTypePanel, reportsPayrollTypeText, 'Todos os Tipos', null, '.payroll-type-select-all', '.payroll-type-deselect-all', '.payroll-type-filter-label');
    }

    // 2. Lotações
    const reportsLotationPanel = document.getElementById('reports-lotation-panel');
    const reportsLotationText = document.getElementById('reports-lotation-text');
    if (reportsLotationPanel) {
        const lotationHtml = createCheckboxHtml(filterOptions.lotations || [], 'lotation-filter-label');
        const listContainer = reportsLotationPanel.querySelector('.lotation-list');
        if(listContainer) {
            listContainer.insertAdjacentHTML('afterbegin', selectLinksHtml.replaceAll('select-all', 'lotation-select-all').replaceAll('deselect-all', 'lotation-deselect-all'));
            listContainer.insertAdjacentHTML('beforeend', lotationHtml);
        }
        setupMultiSelectFilter(reportsLotationPanel, reportsLotationText, 'Todas as Lotações', '.lotation-search', '.lotation-select-all', '.lotation-deselect-all', '.lotation-filter-label');
    }

    // 3. Eventos
    const reportsEventPanel = document.getElementById('reports-event-panel');
    const reportsEventText = document.getElementById('reports-event-text');
    if (reportsEventPanel) {
        const eventHtml = createCheckboxHtml(filterOptions.events || [], 'event-filter-label');
        const listContainer = reportsEventPanel.querySelector('.event-list');
        if(listContainer) {
            listContainer.insertAdjacentHTML('afterbegin', selectLinksHtml.replaceAll('select-all', 'event-select-all').replaceAll('deselect-all', 'event-deselect-all'));
            listContainer.insertAdjacentHTML('beforeend', eventHtml);
        }
        setupMultiSelectFilter(reportsEventPanel, reportsEventText, 'Todos os Eventos', '.event-search', '.event-select-all', '.event-deselect-all', '.event-filter-label');
    }

    // 4. ATUALIZADO: Empresas
    if (reportsCompanyPanel) {
        const companyHtml = createCheckboxHtml(filterOptions.companies || [], 'company-filter-label');
        const listContainer = reportsCompanyPanel.querySelector('.company-list');
        if(listContainer) {
            listContainer.insertAdjacentHTML('afterbegin', selectLinksHtml.replaceAll('select-all', 'company-select-all').replaceAll('deselect-all', 'company-deselect-all'));
            listContainer.insertAdjacentHTML('beforeend', companyHtml);
        }
        setupMultiSelectFilter(reportsCompanyPanel, reportsCompanyText, 'Todas as Empresas', '.company-search', '.company-select-all', '.company-deselect-all', '.company-filter-label');
    }

    // 5. ATUALIZADO: Centros de Custo
    if (reportsCostCenterPanel) {
        const ccHtml = createCheckboxHtml(filterOptions.costCenters || [], 'cc-filter-label');
        const listContainer = reportsCostCenterPanel.querySelector('.cc-list');
        if(listContainer) {
            listContainer.insertAdjacentHTML('afterbegin', selectLinksHtml.replaceAll('select-all', 'cc-select-all').replaceAll('deselect-all', 'cc-deselect-all'));
            listContainer.insertAdjacentHTML('beforeend', ccHtml);
        }
        setupMultiSelectFilter(reportsCostCenterPanel, reportsCostCenterText, 'Todos os Centros', '.cc-search', '.cc-select-all', '.cc-deselect-all', '.cc-filter-label');
    }
}