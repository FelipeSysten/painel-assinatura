// Dados iniciais (vindos do mockup). Ficam no servidor para não expor dados pessoais no site público.
import { buildPix, parsePix, analyze, todayISO } from '../public/core.js';
import { DEFAULT_EMAIL_TO } from './notify.js';

// QR Code "Meu QR Pix" do banco: chave aleatória, sem valor fixo (o valor é digitado na hora de pagar).
export const PIX_ATUAL = '00020126580014br.gov.bcb.pix0136282ba16c-5445-4ec7-bd30-7b30b0e6e6995204000053039865802BR592557.894.816 FELIPE DE SOUZ6007Itabuna6211050726f78796304E973';

// Códigos usados antes (com valor fixo). Assinaturas salvas com eles passam a usar PIX_ATUAL.
const PIX_GOOGLE = '00020126580014br.gov.bcb.pix0136282ba16c-5445-4ec7-bd30-7b30b0e6e6995204000053039865406279.005802BR592557.894.816 FELIPE DE SOUZ6007Itabuna610945604-2586229052501M61DSAXF05JPENC2RWD0MSQ630488EE';
const PIX_CLAUDE = '00020126580014br.gov.bcb.pix0136282ba16c-5445-4ec7-bd30-7b30b0e6e6995204000053039865406550.005802BR592557.894.816 FELIPE DE SOUZ6007Itabuna610945604-2586229052501M61DNW5F8M3HEZGJHWKGRDZ63042EAC';

const PIX_RENDER = buildPix({ ...parsePix(PIX_GOOGLE), amount: 12000 });
const PIX_ANTIGOS = new Set([PIX_GOOGLE, PIX_CLAUDE, PIX_RENDER]);

// Google Admin em 09/11/2026: saldo total R$ 345,54 (R$ 298,50 atrasado da fatura de out + uso de 1 a 9/nov).
const GOOGLE_ATRASO = {
  valor: 34554,
  ate: '2026-11',
  nota: 'Google Admin em 09/11/2026: saldo total R$ 345,54 (R$ 298,50 atrasados da fatura de out/2026 + uso de 1 a 9/nov). Último pagamento: R$ 50,00 em 04/06.'
};
// valores usados antes para o atraso do Google (R$ 280,00 e R$ 298,50)
const GOOGLE_ATRASO_ANTIGOS = [28000, 29850];

export function migrateState(state, today = todayISO()) {
  let changed = false;
  const subs = state.subs.map((s) => {
    let out = s;
    if (PIX_ANTIGOS.has(out.pixCode)) {
      const { pixKeep, ...rest } = out;
      out = { ...rest, pixCode: PIX_ATUAL, note: out.id === 'render' ? '' : out.note };
    }
    if (out.id === 'google' && GOOGLE_ATRASO_ANTIGOS.includes(out.overdueOverride)) {
      // valor antigo trocado pelo saldo que o Google Admin mostra
      out = { ...out, overdueOverride: GOOGLE_ATRASO.valor, overdueOverrideThrough: GOOGLE_ATRASO.ate, note: GOOGLE_ATRASO.nota };
    } else if (out.overdueOverride != null && !out.overdueOverrideThrough) {
      // valor em atraso salvo sem o mês até onde vale: passa a valer até o último mês já vencido
      out = { ...out, overdueOverrideThrough: analyze({ ...out, overdueOverride: null }, today).payThrough };
    }
    if (out !== s) changed = true;
    return out;
  });
  return changed ? { ...state, subs } : null;
}

export function seedState() {
  const { key, name, city, cep } = parsePix(PIX_ATUAL);
  const pix = { key, name, city, cep };
  return {
    rev: 0,
    settings: {
      email: process.env.ALERT_EMAIL_TO || DEFAULT_EMAIL_TO,
      offsets: [7, 3, 1, 0],
      reforcoTarde: true,
      atrasoDiario: true,
      pix,
      card: { brand: 'Mastercard', last4: '6218', holder: 'FELIPE SOUZA ALVES', exp: '10/30' }
    },
    subs: [
      {
        id: 'google', mono: 'G', name: 'Google Workspace', category: 'E-mail e domínio', what: 'geomatchbr.com',
        amount: 27900, dueDay: 1, paidThrough: '2026-05', overdueOverride: GOOGLE_ATRASO.valor, overdueOverrideThrough: GOOGLE_ATRASO.ate,
        risk: 'o e-mail de suporte para de funcionar, os e-mails de recuperação de senha não chegam e as contas ligadas a esse e-mail (lojas de apps, hospedagem) ficam sem como recuperar acesso. Depois de um tempo suspensa, o Google pode excluir a conta e os dados.',
        note: GOOGLE_ATRASO.nota,
        pixCode: PIX_ATUAL
      },
      {
        id: 'render', mono: 'R', name: 'Render', category: 'Servidor', what: 'backend da GeoMatch',
        amount: 12000, dueDay: 1, paidThrough: '2026-10',
        risk: 'o servidor é suspenso e o app sai do ar: mapa, login, matches e mensagens param para todos os usuários.',
        note: '',
        pixCode: PIX_ATUAL
      },
      {
        id: 'claude', mono: 'C', name: 'Claude Code', category: 'Ferramenta de desenvolvimento', what: 'Anthropic',
        amount: 55000, dueDay: 15, paidThrough: '2026-10',
        risk: 'o plano é interrompido e o Claude Code deixa de funcionar; o desenvolvimento do backend e dos apps iOS e Android fica sem a ferramenta.',
        note: '',
        pixCode: PIX_ATUAL
      }
    ],
    history: []
  };
}
