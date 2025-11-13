/**
 * @OnlyCurrentDoc
 */
function doGet(e) {
  var htmlOutput = HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Sistema de Folha de Pagamento')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  return htmlOutput;
}

// --- Configuração de Cache ---
const CACHE_EXPIRATION_SECONDS = 900; // Armazena dados em cache por 15 minutos

/**
 * Limpa o cache do script. Execute manualmente se editar a folha diretamente.
 * Também é chamado automaticamente quando os dados são alterados através da aplicação.
 *
 * NOTA: Esta função é principalmente para ambientes Google Apps Script.
 * Se o seu backend principal for Node.js, esta função pode não ser diretamente utilizada pelo frontend.
 */
function clearCache() {
  CacheService.getScriptCache().removeAll(['cc_data', 'cc_map', 'companies_data', 'payroll_types_data', 'estabelecimentos_data']);
}

// As seguintes funções (getCachedSheetData_, getDirectSheetData_, getCcMap_,
// extractFilterOptionsFromData_, getOrCreateSheet_, saveData, getDashboardData,
// getReportsData, getPeriodComparisonData, getImportSessions, getImportSessionDetails,
// deleteImportSession, getCadastroData, getLotacoesComStatus, updateCadastroItem,
// deleteCadastroItem, getCentrosDeCusto, saveCentroDeCusto, deleteCentroDeCusto,
// getLotaçõesParaAssociacao) são agora tratadas pelo backend Node.js (routes.js)
// e, portanto, foram removidas deste ficheiro Google Apps Script para evitar redundância
// e clarificar a arquitetura.
