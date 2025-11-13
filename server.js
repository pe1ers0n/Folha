// server.js
// Ponto de entrada principal da sua aplicação Node.js.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const os = require('os');
const apiRoutes = require('./routes'); // Importa as rotas da API.

const app = express();
const PORT = process.env.PORT || 3000;
// ALTERAÇÃO: Mudado de um IP específico para '0.0.0.0'.
// Isso faz com que o servidor escute em todas as interfaces de rede disponíveis,
// permitindo que outras máquinas na mesma rede se conectem a ele.
const HOST = '0.0.0.0'; 

// --- Configuração dos Middlewares ---
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// --- Rotas da API ---
app.get('/', (req, res) => {
  res.send('API de Folha de Pagamento está no ar!');
});

app.use('/', apiRoutes);

// --- Função para obter o endereço IP local ---
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            const { address, family, internal } = iface;
            if (family === 'IPv4' && !internal) {
                return address;
            }
        }
    }
    return null;
}

// --- Inicialização do Servidor ---
app.listen(PORT, HOST, () => {
  const localIp = getLocalIpAddress();
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse localmente em: http://localhost:${PORT}`);
  if (localIp) {
    // Esta mensagem agora mostrará o endereço correto para acesso na rede.
    console.log(`Acesse na sua rede em: http://${localIp}:${PORT}`);
  }
});
