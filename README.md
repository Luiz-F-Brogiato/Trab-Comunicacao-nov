# Cobranças demonstrativas

Aplicação didática em Node.js, Express e MySQL para criar cobranças, consultar seus dados e simular atualizações de pagamento. Não processa pagamentos reais e não gera QR Code PIX pagável. Os pagamentos e eventos são persistidos no MySQL.

## Requisitos

- Node.js 18 ou superior e npm.
- MySQL 8 (ou versão compatível com `ENUM`, `InnoDB` e `utf8mb4`).
- Um banco de dados criado para a aplicação; as tabelas são criadas automaticamente na inicialização.

## Instalação e execução

1. Instale as dependências:

   ```sh
   npm install
   ```

2. Crie o banco e um usuário com permissão para criar e alterar tabelas. Exemplo no MySQL:

   ```sql
   CREATE DATABASE pagamentos_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'pagamentos_app'@'localhost' IDENTIFIED BY 'defina-uma-senha';
   GRANT ALL PRIVILEGES ON pagamentos_demo.* TO 'pagamentos_app'@'localhost';
   ```

3. Copie `.env.example` para `.env` e ajuste as configurações:

   ```sh
   cp .env.example .env
   ```

   | Variável | Obrigatória | Descrição |
   | --- | --- | --- |
   | `PORT` | não | Porta HTTP; padrão `5000`. |
   | `WEBHOOK_TOKEN` | sim | Segredo enviado no cabeçalho `x-webhook-token` das notificações. |
   | `DB_HOST` | sim | Endereço do servidor MySQL. |
   | `DB_PORT` | não | Porta MySQL; padrão `3306`. |
   | `DB_USER` | sim | Usuário MySQL. |
   | `DB_PASSWORD` | não | Senha MySQL; pode ficar vazia. |
   | `DB_NAME` | sim | Nome do banco já criado. |

4. Inicie o servidor:

   ```sh
   npm start
   ```

   Na primeira inicialização, o sistema cria as tabelas `payments` e `payment_events`. O conteúdo permanece no MySQL após reiniciar a aplicação.

## API

Todas as respostas são JSON. Os valores de `status` aceitos são `pending`, `approved`, `rejected` e `cancelled`.

### Criar cobrança

`POST /pagamentos` — retorna `201` na criação, `400` para dados inválidos.

```sh
curl -X POST http://localhost:5000/pagamentos \
  -H 'Content-Type: application/json' \
  -d '{"cliente":"Ana Silva","valor":50.00}'
```

O nome deve conter de 1 a 120 caracteres; o valor deve ser positivo, numérico e ter no máximo duas casas decimais.

### Consultar por identificador

`GET /pagamentos/:id` — retorna `200` ou `404`.

```sh
curl http://localhost:5000/pagamentos/ID_DA_COBRANCA
```

### Listar e filtrar cobranças

`GET /pagamentos` — lista todas as cobranças. Use `?status=pending` (ou outro status aceito) para filtrar. Um status desconhecido retorna `400`.

```sh
curl 'http://localhost:5000/pagamentos?status=pending'
```

### Receber atualização por webhook

`POST /webhook/pagamento` exige o token no cabeçalho. Cada `eventoId` pode ser processado apenas uma vez; notificações repetidas retornam `200` com `duplicado: true`, sem reaplicar a alteração. O identificador do pagamento deve ser um UUID existente.

```sh
curl -X POST http://localhost:5000/webhook/pagamento \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-token: troque-por-um-token-seguro' \
  -d '{"pagamentoId":"UUID_DA_COBRANCA","status":"approved","eventoId":"evento-001"}'
```

Retorna `401` para token inválido, `400` para campos inválidos e `404` para cobrança inexistente.

### Simular recebimento pela interface

Abra `http://localhost:5000`, crie uma cobrança e selecione **Simular recebimento**. A interface chama `POST /pagamentos/:id/simular`, que grava um evento demonstrativo e atualiza o status para `approved`. Esta rota é apenas para uso didático; não representa uma confirmação de pagamento real.

## Testes

Execute os testes automatizados com:

```sh
npm test
```

Os testes da API usam um armazenamento em memória isolado e não exigem uma instância MySQL; o servidor em execução usa exclusivamente o armazenamento MySQL.
