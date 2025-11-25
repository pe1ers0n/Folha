// js/filters.js

// Estado local de controle para não recarregar filtros repetidamente sem necessidade
let reportsFiltersPopulated = false;

// --- FUNÇÕES UTILITÁRIAS GLOBAIS ---

window.getSelectedItems = function(panel) {
    if (!panel) return [];
    return Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

window.updateMultiSelectFilterText = function(panelElement) {
    // Encontra o botão de texto associado a este painel
    // A estrutura é: button > span(text) + panel
    // Ou: div.multi-select-dropdown > button + panel
    const dropdown = panelElement.closest('.multi-select-dropdown');
    if (!dropdown) return;
    
    const buttonText = dropdown.querySelector('button span');
    if (!buttonText) return;

    // Define o texto padrão baseado no ID do painel para saber o contexto
    let defaultText = "Selecionar";
    if (panelElement.id.includes('company')) defaultText = "Todas as Empresas";
    else if (panelElement.id.includes('cc')) defaultText = "Todos os Centros";
    else if (panelElement.id.includes('payroll')) defaultText = "Todos os Tipos";
    else if (panelElement.id.includes('lotation')) defaultText = "Todas as Lotações";
    else if (panelElement.id.includes('event')) defaultText = "Todos os Eventos";

    const selected = window.getSelectedItems(panelElement);
    const selectedCount = selected.length;
    
    // Lógica inteligente de texto
    const totalCheckboxes = panelElement.querySelectorAll('input[type="checkbox"]').length;
    
    if (selectedCount === 0) {
        buttonText.textContent = "Nenhum selecionado";
    } else if (selectedCount === totalCheckboxes) {
        buttonText.textContent = defaultText; // Se todos marcados, volta ao padrão (ex: Todas as Empresas)
    } else if (selectedCount === 1) {
        buttonText.textContent = selected[0];
    } else {
        buttonText.textContent = `${selectedCount} selecionados`;
    }
}

// --- LÓGICA DE EVENTOS (DELEGAÇÃO) ---
// Esta é a correção principal: Um único listener no corpo da página
document.addEventListener('click', function(e) {
    
    // 1. Clique em "Marcar Todos"
    if (e.target.classList.contains('select-all')) {
        e.preventDefault();
        e.stopPropagation();
        const panel = e.target.closest('.multi-select-dropdown-panel');
        if (panel) {
            const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                // Marca apenas se estiver visível (respeita busca)
                if (cb.parentElement.style.display !== 'none') {
                    cb.checked = true;
                }
            });
            window.updateMultiSelectFilterText(panel);
        }
    }

    // 2. Clique em "Desmarcar Todos"
    if (e.target.classList.contains('deselect-all')) {
        e.preventDefault();
        e.stopPropagation();
        const panel = e.target.closest('.multi-select-dropdown-panel');
        if (panel) {
            const checkboxes = panel.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                // Desmarca apenas se estiver visível
                if (cb.parentElement.style.display !== 'none') {
                    cb.checked = false;
                }
            });
            window.updateMultiSelectFilterText(panel);
        }
    }

    // 3. Clique dentro do painel (impede fechar ao clicar)
    if (e.target.closest('.multi-select-dropdown-panel')) {
        // Se não for um link (a), para a propagação
        if (e.target.tagName !== 'A') {
            e.stopPropagation(); 
        }
    }
});

// Listener para mudança nos checkboxes (atualiza texto)
document.addEventListener('change', function(e) {
    if (e.target.type === 'checkbox' && e.target.closest('.multi-select-dropdown-panel')) {
        const panel = e.target.closest('.multi-select-dropdown-panel');
        window.updateMultiSelectFilterText(panel);
    }
});

// Listener para busca (input)
document.addEventListener('input', function(e) {
    if (e.target.classList.contains('filter-search')) {
        const searchTerm = e.target.value.toLowerCase();
        const panel = e.target.closest('.multi-select-dropdown-panel');
        const labels = panel.querySelectorAll('label');
        
        labels.forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = text.includes(searchTerm) ? 'flex' : 'none';
        });
    }
});


// --- FUNÇÃO DE CARREGAMENTO ---

window.loadReportFilters = async function() {
    if (reportsFiltersPopulated) return;
    
    try {
        const data = await window.callApi('/reports/filters', 'GET');
        if (data.filterOptions) {
            window.populateReportFilters(data.filterOptions);
            reportsFiltersPopulated = true;
        }
    } catch (err) {
        window.showToast("Erro ao carregar filtros: " + err.message, 'error');
    }
}

window.populateReportFilters = function(filterOptions) {
    // Selects Simples
    const fillSelect = (id, options, defaultText) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<option value="Todos">${defaultText}</option>` + options.map(o => `<option>${o}</option>`).join('');
    };
    
    fillSelect('reports-filter-year', filterOptions.years, 'Todos os Anos');
    fillSelect('reports-filter-month', filterOptions.months, 'Todos os Meses');
    
    // Comparativo (sem opção 'Todos')
    const fillCompare = (id, options) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = options.map(o => `<option>${o}</option>`).join('');
    };
    fillCompare('compare-year1', filterOptions.years);
    fillCompare('compare-year2', filterOptions.years);
    fillCompare('compare-month1', filterOptions.months);
    fillCompare('compare-month2', filterOptions.months);

    // HTML Comum para os painéis
    const headerHtml = `
        <div class="p-2 border-b bg-white sticky top-0 z-10">
            <input type="text" class="w-full border rounded p-1 text-sm filter-search mb-2" placeholder="Buscar...">
            <div class="flex justify-between text-xs">
                <a href="#" class="text-blue-600 hover:underline select-all">Marcar Todos</a>
                <a href="#" class="text-blue-600 hover:underline deselect-all">Desmarcar Todos</a>
            </div>
        </div>
        <div class="max-h-40 overflow-y-auto p-1 list-container">
    `;

    const createItems = (items) => items.map(item => `
        <label class="flex items-center space-x-2 p-1 rounded hover:bg-gray-100 cursor-pointer">
            <input type="checkbox" value="${item}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked>
            <span class="text-sm text-gray-700 break-words">${item}</span>
        </label>
    `).join('');

    const footerHtml = `</div>`;

    // Função para preencher painel
    const fillPanel = (panelId, items) => {
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.innerHTML = headerHtml + createItems(items) + footerHtml;
            // Atualiza texto inicial
            window.updateMultiSelectFilterText(panel);
        }
    };

    // Preenche todos os painéis
    fillPanel('reports-company-panel', filterOptions.companies);
    fillPanel('reports-cc-panel', filterOptions.costCenters);
    fillPanel('reports-lotation-panel', filterOptions.lotations);
    fillPanel('reports-payroll-type-panel', filterOptions.payrollTypes);
    fillPanel('reports-event-panel', filterOptions.events);
    
    // Preenche também o painel do Dashboard Inicial (se existir na tela)
    fillPanel('payroll-type-filter-panel', filterOptions.payrollTypes);
}