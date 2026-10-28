# Painel de assinaturas · GeoMatch

Painel com as assinaturas do projeto (Google Workspace, Render, Claude Code…), status de vencimento calculado automaticamente, Pix com QR Code para cada uma e alertas por WhatsApp e e-mail.

## O que funciona

- **Status automático**: em dia, vence em N dias, em atraso (com mensalidades em aberto e total estimado), calculado no fuso de São Paulo.
- **Pix**: QR Code e copia e cola por assinatura. Dá para colar o código, ler o QR de uma imagem ou gerar um Pix novo a partir da sua chave. O painel confere o dígito verificador e avisa se o valor do Pix não bate com a assinatura.
- **Cadastro**: criar, editar e excluir assinaturas; marcar como pago (quita todos os meses em atraso) e desfazer.
- **Alertas**: D-7, D-3, D-1 (9h + reforço às 18h), no dia, e todo dia enquanto estiver em atraso. Cada alerta é enviado uma vez só e aparece como "Enviado" no painel.
- **Prévia** das mensagens de WhatsApp e e-mail (aba "Prévia dos alertas").
- **Responder "PAGO"** no WhatsApp marca a assinatura como paga (só com Twilio).
- Protegido por senha; dados pessoais ficam só no servidor.

## Subir na Vercel

1. Envie esta pasta para um repositório no GitHub e importe na Vercel (ou rode `vercel` na pasta). Não precisa configurar build: o `vercel.json` já define tudo.
2. **Storage**: no projeto da Vercel, vá em *Storage → Upstash for Redis → Create/Connect*. As variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` são criadas sozinhas. Sem isso o painel funciona em "modo local" (dados só no navegador e sem alertas automáticos).
3. **Variáveis de ambiente** (*Settings → Environment Variables*), veja `.env.example`:
   - `PAINEL_SENHA`: senha do painel (obrigatória).
   - `CRON_SECRET`: valor aleatório longo (obrigatório para os alertas automáticos).
   - E-mail: `RESEND_API_KEY` e `ALERT_EMAIL_FROM` (remetente de um domínio verificado no Resend, **fora** do geomatchbr.com).
   - WhatsApp, uma das opções:
     - **CallMeBot** (grátis, para o seu próprio número): mande a mensagem de ativação descrita em callmebot.com, receba a apikey e defina `WHATSAPP_PROVIDER=callmebot` e `CALLMEBOT_APIKEY`.
     - **Twilio**: `WHATSAPP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`. Para responder "PAGO", configure o webhook de mensagens recebidas para `https://SEU-DOMINIO/api/whatsapp` e defina `PAINEL_URL`.
4. Faça o redeploy, abra o painel, cadastre seu WhatsApp e e-mail em "Para onde vão os alertas" e clique em **Enviar teste agora**.

Os crons rodam às 12:00 e 21:00 UTC (9h e 18h em Brasília). No plano Hobby a Vercel pode executar em qualquer minuto dentro dessa hora.

## Rodar localmente

```bash
npm install
npm run dev     # http://localhost:3000, senha "teste", dados em .data/dev-store.json
npm test
```

## Estrutura

- `public/`: site estático (`index.html`, `app.js`, `styles.css`) e `core.js` com a lógica de datas, status, alertas, mensagens e Pix (usado também pelo servidor).
- `api/`: funções da Vercel. `state` (ler/salvar), `cron` (alertas), `test-alert`, `qr` (PNG do QR Code), `whatsapp` (webhook do Twilio).
- `lib/`: armazenamento (Upstash Redis), envio (Resend, CallMeBot, Twilio), autenticação e dados iniciais.
- `Main.dc.html`, `Alertas.dc.html`, `canvas.json`, `qr/`: mockups originais (não vão para o deploy).

## Observações

- O Pix do **Render** foi gerado pelo painel com a mesma chave Pix dos QR Codes do Google e do Claude (recebedor "57.894.816 FELIPE DE SOUZ", Itabuna). Confira o recebedor no app do banco antes do primeiro pagamento.
- O atraso do Google é estimado em 5 mensalidades (jun a out/2026). Confirme o valor real no Google Admin.
