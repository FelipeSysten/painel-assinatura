# Painel de assinaturas · GeoMatch

Painel com as assinaturas do projeto (Google Workspace, Render, Claude Code…), status de vencimento calculado automaticamente, Pix com QR Code para cada uma e alertas por e-mail para **Samueljim19@hotmail.com**.

## O que funciona

- **Status automático**: em dia, vence em N dias, em atraso (com mensalidades em aberto e total), calculado no fuso de São Paulo.
- **Pix**: QR Code e copia e cola por assinatura. Dá para colar o código, ler o QR de uma imagem ou gerar um Pix novo a partir da sua chave. O painel confere o dígito verificador e avisa se o valor do Pix não bate com o valor a pagar.
- **Cadastro**: criar, editar e excluir assinaturas; marcar como pago (quita todos os meses em atraso) e desfazer.
- **Alertas por e-mail (SMTP)**: D-7, D-3, D-1 (9h + reforço às 18h), no dia, e todo dia enquanto estiver em atraso. O QR Code do Pix vai anexado no corpo do e-mail. Cada alerta é enviado uma vez só e aparece como "E-mail enviado" no painel.
- **Prévia** do e-mail (aba "Prévia dos alertas").
- Protegido por senha; dados pessoais ficam só no servidor.

## Subir na Vercel

1. Envie esta pasta para um repositório no GitHub e importe na Vercel (ou rode `vercel` na pasta). Não precisa configurar build: o `vercel.json` já define tudo.
2. **Banco de dados (gratuito)**: no projeto da Vercel, vá em *Storage → Create Database → Neon (Serverless Postgres)*, escolha o plano **Free** e a região São Paulo (`sa-east-1`) se disponível, e conecte ao projeto. A variável `DATABASE_URL` é criada sozinha e a tabela é criada automaticamente no primeiro acesso. Também funciona com uma conta direta em neon.tech: basta colar a connection string em `DATABASE_URL`. Sem isso o painel funciona em "modo local" (dados só no navegador e sem alertas automáticos).
3. **Variáveis de ambiente** (*Settings → Environment Variables*), veja `.env.example`:
   - `PAINEL_SENHA`: senha do painel (obrigatória).
   - `CRON_SECRET`: valor aleatório longo (obrigatório para os alertas automáticos).
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`: servidor que envia os e-mails. Opcional: `ALERT_EMAIL_FROM`.
4. Faça o redeploy, abra o painel e clique em **Enviar teste agora** em "Para onde vão os alertas". O e-mail de destino já vem como Samueljim19@hotmail.com e pode ser trocado ali.

Os crons rodam às 12:00 e 21:00 UTC (9h e 18h em Brasília). No plano Hobby a Vercel pode executar em qualquer minuto dentro dessa hora.

### Qual SMTP usar (gratuito)

Use uma conta **fora** do domínio geomatchbr.com: se o Google Workspace for suspenso, o alerta precisa continuar saindo.

| Serviço | SMTP_HOST | Porta | Observação |
|---|---|---|---|
| **Gmail** (recomendado) | `smtp.gmail.com` | 465 (`SMTP_SECURE=true`) | Ative a verificação em 2 etapas e crie uma *senha de app* em myaccount.google.com/apppasswords; use-a em `SMTP_PASS`. |
| **Brevo** | `smtp-relay.brevo.com` | 587 (`SMTP_SECURE=false`) | 300 e-mails/dia grátis. `SMTP_USER` e `SMTP_PASS` ficam em *SMTP & API*; verifique o remetente e defina `ALERT_EMAIL_FROM`. |

Contas pessoais do Outlook/Hotmail não aceitam mais envio por SMTP com senha, por isso o Hotmail fica só como destinatário. Se o primeiro alerta cair no lixo eletrônico, marque como "Não é lixo eletrônico" e adicione o remetente aos contatos.

## Rodar localmente

```bash
npm install
npm run dev     # http://localhost:3000, senha "teste", dados em .data/dev-store.json
npm test
```

Para testar o envio local, defina as variáveis `SMTP_*` antes do `npm run dev`.

## Estrutura

- `public/`: site estático (`index.html`, `app.js`, `styles.css`) e `core.js` com a lógica de datas, status, alertas, mensagens e Pix (usado também pelo servidor).
- `api/`: funções da Vercel. `state` (ler/salvar), `cron` (alertas), `test-alert`, `qr` (PNG do QR Code).
- `lib/`: armazenamento (Neon Postgres), envio de e-mail (SMTP via nodemailer), autenticação e dados iniciais.
- `Main.dc.html`, `Alertas.dc.html`, `canvas.json`, `qr/`: mockups originais (não vão para o deploy).

## Observações

- O Pix do **Render** foi gerado pelo painel com a mesma chave Pix dos QR Codes do Google e do Claude (recebedor "57.894.816 FELIPE DE SOUZ", Itabuna). Confira o recebedor no app do banco antes do primeiro pagamento.
- O atraso do Google está como R$ 280,00 pelas 5 mensalidades (jun a out/2026), no campo "Valor em atraso informado". O Pix usado é o QR Code original do Google (R$ 279,00), mantido por escolha.
