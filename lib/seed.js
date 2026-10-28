// Dados iniciais (vindos do mockup). Ficam no servidor para não expor dados pessoais no site público.
import { buildPix, parsePix } from '../public/core.js';

const PIX_GOOGLE = '00020126580014br.gov.bcb.pix0136282ba16c-5445-4ec7-bd30-7b30b0e6e6995204000053039865406279.005802BR592557.894.816 FELIPE DE SOUZ6007Itabuna610945604-2586229052501M61DSAXF05JPENC2RWD0MSQ630488EE';
const PIX_CLAUDE = '00020126580014br.gov.bcb.pix0136282ba16c-5445-4ec7-bd30-7b30b0e6e6995204000053039865406550.005802BR592557.894.816 FELIPE DE SOUZ6007Itabuna610945604-2586229052501M61DNW5F8M3HEZGJHWKGRDZ63042EAC';

export function seedState() {
  const { key, name, city, cep } = parsePix(PIX_GOOGLE);
  const pix = { key, name, city, cep };
  return {
    rev: 0,
    settings: {
      whatsapp: process.env.ALERT_WHATSAPP_TO || '',
      email: process.env.ALERT_EMAIL_TO || '',
      offsets: [7, 3, 1, 0],
      reforcoTarde: true,
      atrasoDiario: true,
      pix,
      card: { brand: 'Mastercard', last4: '6218', holder: 'FELIPE SOUZA ALVES', exp: '10/30' }
    },
    subs: [
      {
        id: 'google', mono: 'G', name: 'Google Workspace', category: 'E-mail e domínio', what: 'geomatchbr.com',
        amount: 27900, dueDay: 1, paidThrough: '2026-05', overdueOverride: 28000,
        risk: 'o e-mail de suporte para de funcionar, os e-mails de recuperação de senha não chegam e as contas ligadas a esse e-mail (lojas de apps, hospedagem) ficam sem como recuperar acesso. Depois de um tempo suspensa, o Google pode excluir a conta e os dados.',
        note: 'O Google informa R$ 280,00 em atraso pelas 5 mensalidades (jun a out/2026).',
        pixCode: PIX_GOOGLE, pixKeep: true
      },
      {
        id: 'render', mono: 'R', name: 'Render', category: 'Servidor', what: 'backend da GeoMatch',
        amount: 12000, dueDay: 1, paidThrough: '2026-10',
        risk: 'o servidor é suspenso e o app sai do ar: mapa, login, matches e mensagens param para todos os usuários.',
        note: 'Pix gerado pelo painel com a mesma chave das outras assinaturas. Confira o recebedor antes de pagar.',
        pixCode: buildPix({ ...pix, amount: 12000 })
      },
      {
        id: 'claude', mono: 'C', name: 'Claude Code', category: 'Ferramenta de desenvolvimento', what: 'Anthropic',
        amount: 55000, dueDay: 15, paidThrough: '2026-10',
        risk: 'o plano é interrompido e o Claude Code deixa de funcionar; o desenvolvimento do backend e dos apps iOS e Android fica sem a ferramenta.',
        note: '',
        pixCode: PIX_CLAUDE
      }
    ],
    history: []
  };
}
