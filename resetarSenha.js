// resetarSenha.js
const bcrypt = require('bcryptjs');
const { dbApp } = require('./database'); 

async function run() {
    console.log("🔄 Conectando ao banco para redefinir a senha...");
    
    // Gera o hash seguro para a senha '123456'
    const novaSenha = '123456';
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    
    try {
        // Tenta atualizar o usuário
        const [result] = await dbApp.query(
            'UPDATE usuarios SET senha = ? WHERE email = ?', 
            [senhaHash, 'admin@tijuca.com.br']
        );

        if (result.affectedRows > 0) {
            console.log('✅ SUCESSO! A senha do admin@tijuca.com.br foi alterada para: 123456');
        } else {
            console.log('❌ ERRO: O e-mail admin@tijuca.com.br não foi encontrado no banco.');
            console.log('   Verifique se há espaços ou erros de digitação no banco de dados.');
        }
        
    } catch (e) {
        console.error('❌ Erro técnico:', e.message);
    }
    process.exit();
}

run();